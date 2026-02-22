/**
 * SefariaService — API client for sefaria.org with in-memory + persistent caching.
 *
 * Endpoints used:
 *   GET /api/texts/{ref}      — Hebrew + English text
 *   GET /api/links/{ref}      — cross references
 *   GET /api/calendars        — today's learning schedule
 *   GET /api/search-wrapper   — full-text search
 *   GET /api/name/{name}      — validate + autocomplete a reference name
 */

const API_BASE = "https://www.sefaria.org/api";

// How long calendar data is considered fresh (ms)
const CALENDAR_TTL = 12 * 60 * 60 * 1000; // 12 hours

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SefariaText {
	ref: string;
	heRef: string;
	/** Hebrew text — may be string or nested string arrays depending on the ref */
	he: string | string[] | string[][];
	/** English translation — same shape as `he` */
	text: string | string[] | string[][];
	type: string;
	book: string;
	categories: string[];
	toSections: number[];
	sectionRef: string;
}

export interface SefariaLink {
	ref: string;
	anchorRef: string;
	sourceRef: string;
	sourceHeRef: string;
	category: string;
	type: string;
	collectiveTitle?: { en: string; he: string };
}

export interface SefariaCalendarItem {
	title: { en: string; he: string };
	displayValue: { en: string; he: string };
	url: string;
	ref: string;
	order: number;
	category: string;
}

export interface SefariaCalendar {
	date: string;
	timezone: string;
	calendar_items: SefariaCalendarItem[];
}

export interface SefariaSearchResult {
	hits: {
		hits: Array<{
			_id: string;
			_source: {
				ref: string;
				exact: string;
				version: string;
				lang: string;
			};
		}>;
	};
}

export interface SefariaNameResult {
	completions: string[];
	lang: string;
	is_ref: boolean;
	ref?: string;
	heRef?: string;
	type?: string;
	error?: string;
}

interface CacheEntry<T> {
	value: T;
	ts: number;
	ttl?: number; // ms; undefined = never expires
}

// ---------------------------------------------------------------------------
// SefariaService
// ---------------------------------------------------------------------------

export class SefariaService {
	private cache = new Map<string, CacheEntry<unknown>>();
	/** Storage key prefix for Obsidian plugin data (injected from main.ts) */
	private saveData?: () => Promise<void>;
	private loadedData: Record<string, CacheEntry<unknown>> = {};

	// -----------------------------------------------------------------------
	// Cache helpers
	// -----------------------------------------------------------------------

	private cacheGet<T>(key: string): T | null {
		// Check in-memory first
		const mem = this.cache.get(key);
		if (mem) {
			if (mem.ttl === undefined || Date.now() - mem.ts < mem.ttl) {
				return mem.value as T;
			}
			this.cache.delete(key);
		}
		// Check persistent (loaded at startup)
		const persisted = this.loadedData[key];
		if (persisted) {
			if (
				persisted.ttl === undefined ||
				Date.now() - persisted.ts < (persisted.ttl ?? Infinity)
			) {
				this.cache.set(key, persisted); // promote to in-memory
				return persisted.value as T;
			}
			delete this.loadedData[key];
		}
		return null;
	}

	private cacheSet<T>(key: string, value: T, ttl?: number): void {
		const entry: CacheEntry<T> = { value, ts: Date.now(), ttl };
		this.cache.set(key, entry);
		this.loadedData[key] = entry;
		this.saveData?.();
	}

	/** Called from main.ts after loading plugin data from disk */
	loadPersistedCache(data: Record<string, CacheEntry<unknown>>): void {
		this.loadedData = data ?? {};
	}

	/** Returns serialisable cache snapshot for Obsidian saveData() */
	getPersistableCache(): Record<string, CacheEntry<unknown>> {
		return this.loadedData;
	}

	/** Register the save callback from the plugin lifecycle */
	registerSaveCallback(fn: () => Promise<void>): void {
		this.saveData = fn;
	}

	// -----------------------------------------------------------------------
	// API methods
	// -----------------------------------------------------------------------

	/**
	 * Fetch Hebrew + English text for a Sefaria ref.
	 * Texts are immutable → cached indefinitely.
	 */
	async getText(ref: string): Promise<SefariaText> {
		const key = `text:${ref}`;
		const cached = this.cacheGet<SefariaText>(key);
		if (cached) return cached;

		const url = `${API_BASE}/texts/${encodeURIComponent(ref)}?commentary=0&context=0&pad=0`;
		const resp = await this.fetch(url);
		const data: SefariaText = await resp.json();

		if ((data as unknown as { error?: string }).error) {
			throw new Error((data as unknown as { error: string }).error);
		}

		this.cacheSet(key, data); // no TTL = forever
		return data;
	}

	/**
	 * Fetch cross-references for a ref.
	 * Treated as immutable → cached indefinitely.
	 */
	async getLinks(ref: string): Promise<SefariaLink[]> {
		const key = `links:${ref}`;
		const cached = this.cacheGet<SefariaLink[]>(key);
		if (cached) return cached;

		const url = `${API_BASE}/links/${encodeURIComponent(ref)}`;
		const resp = await this.fetch(url);
		const data: SefariaLink[] = await resp.json();

		this.cacheSet(key, data);
		return data;
	}

	/**
	 * Fetch today's learning calendar (Daf Yomi, Parsha, etc.).
	 * Refreshes every 12 h.
	 */
	async getCalendar(): Promise<SefariaCalendar> {
		const key = "calendar:today";
		const cached = this.cacheGet<SefariaCalendar>(key);
		if (cached) return cached;

		const url = `${API_BASE}/calendars`;
		const resp = await this.fetch(url);
		const data: SefariaCalendar = await resp.json();

		this.cacheSet(key, data, CALENDAR_TTL);
		return data;
	}

	/**
	 * Full-text search.
	 */
	async search(query: string): Promise<SefariaSearchResult> {
		const key = `search:${query}`;
		const cached = this.cacheGet<SefariaSearchResult>(key);
		if (cached) return cached;

		const url = `${API_BASE}/search-wrapper?query=${encodeURIComponent(query)}&type=text&slop=10`;
		const resp = await this.fetch(url);
		const data: SefariaSearchResult = await resp.json();

		// Cache search for 1 hour (results could change as corpus grows)
		this.cacheSet(key, data, 60 * 60 * 1000);
		return data;
	}

	/**
	 * Validate / autocomplete a name.  Used before getText() to catch typos.
	 */
	async getName(name: string): Promise<SefariaNameResult> {
		const key = `name:${name}`;
		const cached = this.cacheGet<SefariaNameResult>(key);
		if (cached) return cached;

		const url = `${API_BASE}/name/${encodeURIComponent(name)}`;
		const resp = await this.fetch(url);
		const data: SefariaNameResult = await resp.json();

		this.cacheSet(key, data);
		return data;
	}

	// -----------------------------------------------------------------------
	// Fetch wrapper with timeout
	// -----------------------------------------------------------------------

	private async fetch(url: string, timeoutMs = 8000): Promise<Response> {
		const controller = new AbortController();
		const id = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const resp = await fetch(url, { signal: controller.signal });
			if (!resp.ok) {
				throw new Error(`Sefaria API error ${resp.status}: ${url}`);
			}
			return resp;
		} finally {
			clearTimeout(id);
		}
	}

	// -----------------------------------------------------------------------
	// Formatting helpers
	// -----------------------------------------------------------------------

	/** Flatten nested text arrays into a single HTML string */
	static flattenText(raw: string | string[] | string[][]): string {
		if (typeof raw === "string") return raw;
		if (Array.isArray(raw)) {
			return (raw as (string | string[])[])
				.map((item) =>
					Array.isArray(item)
						? (item as string[]).join(" ")
						: item
				)
				.join(" ");
		}
		return "";
	}

	/** Strip HTML tags from Sefaria text (they return <i>, <b> etc.) */
	static stripHtml(html: string): string {
		return html.replace(/<[^>]*>/g, "");
	}

	/** Build the sefaria.org URL for a ref */
	static sefariaUrl(ref: string): string {
		return `https://www.sefaria.org/${encodeURIComponent(ref)}`;
	}
}
