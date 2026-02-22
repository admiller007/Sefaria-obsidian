import {
	App,
	Editor,
	ItemView,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	WorkspaceLeaf,
	setIcon,
	moment,
} from "obsidian";

import {
	Extension,
	RangeSetBuilder,
	StateField,
	Transaction,
} from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginSpec,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";

import { parseRefs, ParsedRef, SEFARIA_BASE } from "./RefParser";
import { SefariaService, SefariaText, SefariaCalendarItem } from "./SefariaService";
import {
	SefariaSettings,
	DEFAULT_SETTINGS,
	SefariaSettingTab,
} from "./settings";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIDEBAR_VIEW_TYPE = "sefaria-daily-learning";

// ---------------------------------------------------------------------------
// CM6 Decoration plugin
// ---------------------------------------------------------------------------

class SefariaRefPlugin implements PluginValue {
	decorations: DecorationSet;

	constructor(view: EditorView, private settings: SefariaSettings) {
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			this.decorations = this.buildDecorations(update.view);
		}
	}

	destroy() {}

	private buildDecorations(view: EditorView): DecorationSet {
		const style = this.settings.decorationStyle;
		if (style === "none") return Decoration.none;

		const builder = new RangeSetBuilder<Decoration>();
		const cssClass =
			style === "highlight"
				? "sefaria-ref-highlight"
				: "sefaria-ref-underline";

		for (const { from, to } of view.visibleRanges) {
			const text = view.state.doc.sliceString(from, to);
			const refs = parseRefs(text);

			for (const r of refs) {
				const absFrom = from + r.start;
				const absTo = from + r.end;
				builder.add(
					absFrom,
					absTo,
					Decoration.mark({ class: cssClass, attributes: { "data-sefaria-ref": r.ref } })
				);
			}
		}

		return builder.finish();
	}
}

function buildRefExtension(settings: SefariaSettings): Extension {
	const pluginSpec: PluginSpec<SefariaRefPlugin> = {
		decorations: (v) => v.decorations,
	};
	return ViewPlugin.define(
		(view) => new SefariaRefPlugin(view, settings),
		pluginSpec
	);
}

// ---------------------------------------------------------------------------
// Hover Popover
// ---------------------------------------------------------------------------

class SefariaHoverPopover {
	private el: HTMLElement;
	private visible = false;
	private currentRef = "";
	private hideTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private service: SefariaService,
		private settings: SefariaSettings,
		private containerEl: HTMLElement
	) {
		this.el = containerEl.createDiv({ cls: "sefaria-popover" });
		this.el.style.display = "none";
		this.el.style.position = "fixed";
		this.el.addEventListener("mouseenter", () => this.cancelHide());
		this.el.addEventListener("mouseleave", () => this.scheduleHide());
	}

	async show(ref: string, x: number, y: number) {
		this.cancelHide();
		if (this.currentRef === ref && this.visible) return;

		this.currentRef = ref;
		this.visible = true;
		this.el.style.display = "block";
		this.el.empty();
		this.position(x, y);
		this.renderLoading(ref);

		try {
			// Validate first
			const nameResult = await this.service.getName(ref);
			const resolvedRef = nameResult.ref ?? ref;

			const textData = await this.service.getText(resolvedRef);
			if (this.currentRef !== ref) return; // stale
			this.renderText(textData);
		} catch (err) {
			if (this.currentRef !== ref) return;
			this.renderError(ref, err instanceof Error ? err.message : String(err));
		}
	}

	hide() {
		this.visible = false;
		this.currentRef = "";
		this.el.style.display = "none";
		this.el.empty();
	}

	scheduleHide() {
		this.hideTimer = setTimeout(() => this.hide(), 300);
	}

	cancelHide() {
		if (this.hideTimer) {
			clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}
	}

	private position(x: number, y: number) {
		const margin = 12;
		const popW = 480;
		const popH = 250; // rough estimate before render

		let left = x + margin;
		let top = y + margin;

		if (left + popW > window.innerWidth) left = x - popW - margin;
		if (top + popH > window.innerHeight) top = y - popH - margin;

		this.el.style.left = `${Math.max(0, left)}px`;
		this.el.style.top = `${Math.max(0, top)}px`;
	}

	private renderLoading(ref: string) {
		const header = this.el.createDiv({ cls: "sefaria-popover-header" });
		header.createSpan({ cls: "sefaria-popover-ref", text: ref });
		this.el.createDiv({
			cls: "sefaria-popover-loading",
			text: "Loading…",
		});
	}

	private renderText(data: SefariaText) {
		this.el.empty();

		// Header
		const header = this.el.createDiv({ cls: "sefaria-popover-header" });
		header.createSpan({ cls: "sefaria-popover-ref", text: data.ref });
		if (data.heRef) {
			header.createSpan({ cls: "sefaria-popover-he-ref", text: data.heRef });
		}

		// Hebrew
		if (this.settings.showHebrew && data.he) {
			const heText = SefariaService.flattenText(data.he);
			if (heText.trim()) {
				this.el.createDiv({
					cls: "sefaria-popover-hebrew",
					text: SefariaService.stripHtml(heText),
				});
			}
		}

		// English
		if (this.settings.showEnglish && data.text) {
			const enText = SefariaService.flattenText(data.text);
			if (enText.trim()) {
				this.el.createDiv({
					cls: "sefaria-popover-english",
					text: SefariaService.stripHtml(enText),
				});
			}
		}

		// Footer
		const footer = this.el.createDiv({ cls: "sefaria-popover-footer" });
		footer.createSpan({
			cls: "sefaria-popover-attribution",
			text: "Powered by Sefaria",
		});
		const link = footer.createEl("a", {
			cls: "sefaria-popover-link",
			text: "Open on Sefaria ↗",
			href: SefariaService.sefariaUrl(data.ref),
		});
		link.setAttr("target", "_blank");
		link.setAttr("rel", "noopener");
	}

	private renderError(ref: string, message: string) {
		this.el.empty();

		const header = this.el.createDiv({ cls: "sefaria-popover-header" });
		header.createSpan({ cls: "sefaria-popover-ref", text: ref });

		this.el.createDiv({
			cls: "sefaria-popover-error",
			text: `Could not load: ${message}`,
		});

		const footer = this.el.createDiv({ cls: "sefaria-popover-footer" });
		const link = footer.createEl("a", {
			cls: "sefaria-popover-link",
			text: "Search on Sefaria ↗",
			href: `${SEFARIA_BASE}search?q=${encodeURIComponent(ref)}`,
		});
		link.setAttr("target", "_blank");
		link.setAttr("rel", "noopener");
	}

	destroy() {
		this.el.remove();
	}
}

// ---------------------------------------------------------------------------
// Sidebar view — Daily Learning
// ---------------------------------------------------------------------------

class SefariaLearningSidebar extends ItemView {
	private service: SefariaService;

	constructor(leaf: WorkspaceLeaf, service: SefariaService) {
		super(leaf);
		this.service = service;
	}

	getViewType(): string {
		return SIDEBAR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Sefaria Daily Learning";
	}

	getIcon(): string {
		return "book-open";
	}

	async onOpen() {
		await this.render();
	}

	async onClose() {}

	async render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sefaria-sidebar");

		contentEl.createEl("h3", {
			cls: "sefaria-sidebar-title",
			text: "Today's Learning",
		});
		contentEl.createDiv({
			cls: "sefaria-sidebar-date",
			text: moment().format("dddd, MMMM D, YYYY"),
		});

		const loadingEl = contentEl.createDiv({
			cls: "sefaria-sidebar-loading",
			text: "Loading calendar…",
		});

		try {
			const calendar = await this.service.getCalendar();
			loadingEl.remove();

			for (const item of calendar.calendar_items) {
				this.renderCalendarItem(contentEl, item);
			}
		} catch (err) {
			loadingEl.setText("Failed to load calendar. Check your connection.");
			loadingEl.addClass("sefaria-sidebar-error");
		}
	}

	private renderCalendarItem(
		container: HTMLElement,
		item: SefariaCalendarItem
	) {
		const el = container.createDiv({ cls: "sefaria-calendar-item" });
		el.createDiv({
			cls: "sefaria-calendar-item-category",
			text: item.category,
		});
		el.createDiv({
			cls: "sefaria-calendar-item-title",
			text: item.displayValue.en,
		});
		if (item.displayValue.he) {
			el.createDiv({
				cls: "sefaria-calendar-item-he",
				text: item.displayValue.he,
			});
		}
		el.createDiv({
			cls: "sefaria-calendar-item-ref",
			text: item.ref,
		});

		el.addEventListener("click", () => {
			window.open(`${SEFARIA_BASE}${item.url}`, "_blank", "noopener");
		});
	}
}

// ---------------------------------------------------------------------------
// Search Modal
// ---------------------------------------------------------------------------

class SefariaSearchModal extends Modal {
	private service: SefariaService;
	private onSelect: (ref: string, textData: SefariaText) => void;

	constructor(
		app: App,
		service: SefariaService,
		onSelect: (ref: string, textData: SefariaText) => void
	) {
		super(app);
		this.service = service;
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("sefaria-modal");
		contentEl.createEl("h2", { text: "Insert Sefaria Text" });

		const input = contentEl.createEl("input", {
			type: "text",
			cls: "sefaria-search-input",
			placeholder: "Search: Genesis 1:1, Shabbat 31a…",
		});
		input.focus();

		const resultsEl = contentEl.createDiv({ cls: "sefaria-search-results" });

		let debounce: ReturnType<typeof setTimeout>;
		input.addEventListener("input", () => {
			clearTimeout(debounce);
			debounce = setTimeout(() => this.doSearch(input.value, resultsEl), 400);
		});

		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				clearTimeout(debounce);
				this.doSearch(input.value, resultsEl);
			}
		});
	}

	private async doSearch(query: string, resultsEl: HTMLElement) {
		if (!query.trim()) return;
		resultsEl.empty();
		resultsEl.createDiv({ text: "Searching…", cls: "sefaria-sidebar-loading" });

		try {
			// Try as direct ref first via /api/name/
			const nameResult = await this.service.getName(query.trim());

			resultsEl.empty();

			if (nameResult.is_ref && nameResult.ref) {
				this.renderResultItem(resultsEl, nameResult.ref, nameResult.heRef ?? "");
			} else if (nameResult.completions?.length) {
				for (const comp of nameResult.completions.slice(0, 10)) {
					this.renderResultItem(resultsEl, comp, "");
				}
			} else {
				// Fall back to full-text search
				const searchResult = await this.service.search(query);
				const hits = searchResult?.hits?.hits ?? [];
				if (!hits.length) {
					resultsEl.createDiv({ text: "No results found." });
					return;
				}
				for (const hit of hits.slice(0, 10)) {
					const ref = hit._source.ref;
					const excerpt = SefariaService.stripHtml(hit._source.exact ?? "");
					this.renderResultItem(resultsEl, ref, excerpt);
				}
			}
		} catch (err) {
			resultsEl.empty();
			resultsEl.createDiv({
				cls: "sefaria-sidebar-error",
				text: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	}

	private renderResultItem(
		container: HTMLElement,
		ref: string,
		subtitle: string
	) {
		const item = container.createDiv({ cls: "sefaria-search-result-item" });
		item.createDiv({ cls: "sefaria-search-result-ref", text: ref });
		if (subtitle) {
			item.createDiv({
				cls: "sefaria-search-result-excerpt",
				text: SefariaService.stripHtml(subtitle),
			});
		}

		item.addEventListener("click", async () => {
			try {
				const textData = await this.service.getText(ref);
				this.onSelect(ref, textData);
				this.close();
			} catch (err) {
				new Notice(`Could not load ${ref}: ${err instanceof Error ? err.message : String(err)}`);
			}
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---------------------------------------------------------------------------
// Main plugin
// ---------------------------------------------------------------------------

export default class SefariaPlugin extends Plugin {
	settings: SefariaSettings;
	service: SefariaService;
	private popover: SefariaHoverPopover | null = null;
	private refExtension: Extension | null = null;

	async onload() {
		await this.loadSettings();

		this.service = new SefariaService();

		// Load persisted cache
		const saved = (await this.loadData()) ?? {};
		if (saved.cache) {
			this.service.loadPersistedCache(saved.cache);
		}

		// Register save callback
		this.service.registerSaveCallback(async () => {
			const current = (await this.loadData()) ?? {};
			current.cache = this.service.getPersistableCache();
			await this.saveData(current);
		});

		// Load stylesheet
		this.loadStyles();

		// Register CM6 extension
		this.refExtension = buildRefExtension(this.settings);
		this.registerEditorExtension(this.refExtension);

		// Register hover source
		this.registerHoverListeners();

		// Register sidebar view
		this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new SefariaLearningSidebar(leaf, this.service));

		// Register commands
		this.addCommand({
			id: "insert-sefaria-text",
			name: "Insert Sefaria Text",
			editorCallback: (editor: Editor) => {
				new SefariaSearchModal(
					this.app,
					this.service,
					(ref, textData) => this.insertText(editor, ref, textData)
				).open();
			},
		});

		this.addCommand({
			id: "link-selection-as-ref",
			name: "Link Selection as Sefaria Reference",
			editorCallback: (editor: Editor) => {
				this.linkSelection(editor);
			},
		});

		this.addCommand({
			id: "open-daily-learning",
			name: "Open Today's Learning",
			callback: () => this.openSidebar(),
		});

		this.addCommand({
			id: "pull-text-to-vault",
			name: "Pull Sefaria Text Into Vault",
			editorCallback: (editor: Editor) => {
				const sel = editor.getSelection().trim();
				const refs = sel ? parseRefs(sel) : [];
				const ref = refs[0]?.ref ?? sel;
				if (!ref) {
					new Notice("Select a Torah reference first.");
					return;
				}
				this.pullTextToVault(ref);
			},
		});

		// Settings tab
		this.addSettingTab(new SefariaSettingTab(this.app, this));

		// Sidebar on startup
		if (this.settings.openSidebarOnStartup) {
			this.app.workspace.onLayoutReady(() => this.openSidebar());
		}

		// Ribbon icon
		this.addRibbonIcon("book-open", "Sefaria Daily Learning", () =>
			this.openSidebar()
		);

		console.log("Sefaria Integration plugin loaded.");
	}

	async onunload() {
		this.popover?.destroy();
		console.log("Sefaria Integration plugin unloaded.");
	}

	// -----------------------------------------------------------------------
	// Style loading
	// -----------------------------------------------------------------------

	private loadStyles() {
		// In production the bundler inlines the CSS — this is a fallback
		// for development where styles.css is loaded separately.
	}

	// -----------------------------------------------------------------------
	// Hover listeners (attached to editor DOM)
	// -----------------------------------------------------------------------

	private registerHoverListeners() {
		// Attach to all open markdown editors + any that open in the future
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (!leaf) return;
				const view = leaf.view;
				if (view instanceof MarkdownView) {
					this.attachHoverToView(view);
				}
			})
		);

		// Attach to currently open leaves
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (view instanceof MarkdownView) {
				this.attachHoverToView(view);
			}
		});
	}

	private attachHoverToView(view: MarkdownView) {
		const editorEl = view.editor.containerEl;
		if (editorEl.dataset.sefariaHover) return; // already attached
		editorEl.dataset.sefariaHover = "1";

		// Lazily create popover attached to body
		if (!this.popover) {
			this.popover = new SefariaHoverPopover(
				this.service,
				this.settings,
				document.body
			);
		}

		const popover = this.popover;

		editorEl.addEventListener("mouseover", async (e) => {
			const target = e.target as HTMLElement;
			if (!target) return;
			const ref = target.getAttribute("data-sefaria-ref");
			if (!ref) return;
			popover.cancelHide();
			await popover.show(ref, e.clientX, e.clientY);
		});

		editorEl.addEventListener("mouseout", (e) => {
			const target = e.target as HTMLElement;
			if (!target?.getAttribute("data-sefaria-ref")) return;
			popover.scheduleHide();
		});
	}

	// -----------------------------------------------------------------------
	// Commands
	// -----------------------------------------------------------------------

	/** Insert fetched Sefaria text at editor cursor */
	private insertText(editor: Editor, ref: string, data: SefariaText) {
		const heText = SefariaService.stripHtml(SefariaService.flattenText(data.he));
		const enText = SefariaService.stripHtml(SefariaService.flattenText(data.text));

		const lines: string[] = [];
		lines.push(`> **${data.ref}** | ${data.heRef ?? ""}`);
		lines.push(">");
		if (this.settings.showHebrew && heText) {
			lines.push(`> <div dir="rtl">${heText}</div>`);
			lines.push(">");
		}
		if (this.settings.showEnglish && enText) {
			lines.push(`> ${enText}`);
			lines.push(">");
		}
		lines.push(`> — [Open on Sefaria](${SefariaService.sefariaUrl(ref)})`);

		editor.replaceSelection(lines.join("\n"));
	}

	/** Convert selected text (if it's a ref) into a link */
	private async linkSelection(editor: Editor) {
		const sel = editor.getSelection().trim();
		if (!sel) {
			new Notice("Select a Torah reference first.");
			return;
		}

		const refs = parseRefs(sel);
		if (!refs.length) {
			new Notice(`No Torah reference found in selection: "${sel}"`);
			return;
		}

		const { ref } = refs[0];
		let replacement: string;

		if (this.settings.autoLinkTarget === "external") {
			replacement = `[${sel}](${SefariaService.sefariaUrl(ref)})`;
		} else {
			replacement = `[[${ref}]]`;
		}

		editor.replaceSelection(replacement);
	}

	/** Pull a Sefaria text into a new vault note */
	private async pullTextToVault(ref: string) {
		try {
			const data = await this.service.getText(ref);

			const heText = SefariaService.stripHtml(SefariaService.flattenText(data.he));
			const enText = SefariaService.stripHtml(SefariaService.flattenText(data.text));
			const categories = data.categories?.join(", ") ?? "";
			const date = moment().format("YYYY-MM-DD");

			let content = this.settings.noteTemplate
				.replace(/\{\{ref\}\}/g, ref)
				.replace(/\{\{title\}\}/g, data.ref)
				.replace(/\{\{hebrew\}\}/g, heText)
				.replace(/\{\{english\}\}/g, enText)
				.replace(/\{\{categories\}\}/g, `[${categories}]`)
				.replace(/\{\{date\}\}/g, date);

			const filename = `${ref.replace(/\./g, " ")}.md`;
			const existing = this.app.vault.getAbstractFileByPath(filename);
			if (existing) {
				new Notice(`Note already exists: ${filename}`);
				return;
			}

			const file = await this.app.vault.create(filename, content);
			await this.app.workspace.getLeaf(false).openFile(file);
			new Notice(`Created note: ${filename}`);
		} catch (err) {
			new Notice(
				`Failed to pull ${ref}: ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}

	/** Open (or reveal) the daily learning sidebar */
	async openSidebar() {
		const existing = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
		if (existing.length) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	// -----------------------------------------------------------------------
	// Settings persistence
	// -----------------------------------------------------------------------

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings ?? {});
	}

	async saveSettings() {
		const current = (await this.loadData()) ?? {};
		current.settings = this.settings;
		await this.saveData(current);
	}
}
