/**
 * RefParser — Torah reference detection + normalization to Sefaria dot notation.
 *
 * Supports:
 *   - Tanakh:  Genesis 1:1 / Gen. 1:1 / Bereishit 1:1
 *   - Talmud:  Shabbat 31a / Berakhot 2a-2b
 *   - Mishnah: Mishnah Avot 1:1 / Pirkei Avot 1:1
 */

export interface ParsedRef {
	/** Original matched string in the note */
	raw: string;
	/** Sefaria dot-notation reference (e.g. Genesis.1.1) */
	ref: string;
	/** Position in source string */
	start: number;
	end: number;
}

// ---------------------------------------------------------------------------
// Book name aliases → canonical Sefaria names
// ---------------------------------------------------------------------------

const TANAKH_ALIASES: Record<string, string> = {
	// Torah
	genesis: "Genesis",
	bereishit: "Genesis",
	bereshit: "Genesis",
	"gen.": "Genesis",
	gen: "Genesis",
	exodus: "Exodus",
	shemot: "Exodus",
	"ex.": "Exodus",
	ex: "Exodus",
	leviticus: "Leviticus",
	vayikra: "Leviticus",
	"lev.": "Leviticus",
	lev: "Leviticus",
	numbers: "Numbers",
	bamidbar: "Numbers",
	"num.": "Numbers",
	num: "Numbers",
	deuteronomy: "Deuteronomy",
	devarim: "Deuteronomy",
	"deut.": "Deuteronomy",
	deut: "Deuteronomy",
	dvarim: "Deuteronomy",
	// Nevi'im
	joshua: "Joshua",
	yehoshua: "Joshua",
	"josh.": "Joshua",
	josh: "Joshua",
	judges: "Judges",
	shoftim: "Judges",
	samuel: "I Samuel",
	"i samuel": "I Samuel",
	"ii samuel": "II Samuel",
	"1 samuel": "I Samuel",
	"2 samuel": "II Samuel",
	shmuel: "I Samuel",
	kings: "I Kings",
	"i kings": "I Kings",
	"ii kings": "II Kings",
	"1 kings": "I Kings",
	"2 kings": "II Kings",
	melachim: "I Kings",
	isaiah: "Isaiah",
	yeshayahu: "Isaiah",
	"isa.": "Isaiah",
	isa: "Isaiah",
	jeremiah: "Jeremiah",
	yirmiyahu: "Jeremiah",
	"jer.": "Jeremiah",
	jer: "Jeremiah",
	ezekiel: "Ezekiel",
	yechezkel: "Ezekiel",
	"ezek.": "Ezekiel",
	ezek: "Ezekiel",
	hosea: "Hosea",
	hoshea: "Hosea",
	joel: "Joel",
	yoel: "Joel",
	amos: "Amos",
	obadiah: "Obadiah",
	ovadyah: "Obadiah",
	jonah: "Jonah",
	yonah: "Jonah",
	micah: "Micah",
	michah: "Micah",
	nahum: "Nahum",
	habakkuk: "Habakkuk",
	zephaniah: "Zephaniah",
	haggai: "Haggai",
	zechariah: "Zechariah",
	malachi: "Malachi",
	// Ketuvim
	psalms: "Psalms",
	tehillim: "Psalms",
	"ps.": "Psalms",
	ps: "Psalms",
	proverbs: "Proverbs",
	mishlei: "Proverbs",
	"prov.": "Proverbs",
	prov: "Proverbs",
	job: "Job",
	iyov: "Job",
	"song of songs": "Song of Songs",
	"shir hashirim": "Song of Songs",
	"song of solomon": "Song of Songs",
	ruth: "Ruth",
	lamentations: "Lamentations",
	eichah: "Lamentations",
	ecclesiastes: "Ecclesiastes",
	kohelet: "Ecclesiastes",
	esther: "Esther",
	daniel: "Daniel",
	ezra: "Ezra",
	nehemiah: "Nehemiah",
	chronicles: "I Chronicles",
	"i chronicles": "I Chronicles",
	"ii chronicles": "II Chronicles",
	"1 chronicles": "I Chronicles",
	"2 chronicles": "II Chronicles",
	divrei: "I Chronicles",
};

const TALMUD_ALIASES: Record<string, string> = {
	// Order Zeraim
	berakhot: "Berakhot",
	brachot: "Berakhot",
	berachot: "Berakhot",
	peah: "Peah",
	demai: "Demai",
	kilayim: "Kilayim",
	sheviit: "Sheviit",
	terumot: "Terumot",
	maasrot: "Maasrot",
	"maaser sheni": "Maaser Sheni",
	challah: "Challah",
	orlah: "Orlah",
	bikkurim: "Bikkurim",
	// Order Moed
	shabbat: "Shabbat",
	shabat: "Shabbat",
	eruvin: "Eruvin",
	pesachim: "Pesachim",
	shekalim: "Shekalim",
	yoma: "Yoma",
	sukkah: "Sukkah",
	beitzah: "Beitzah",
	rosh: "Rosh Hashanah",
	"rosh hashanah": "Rosh Hashanah",
	"rosh hashana": "Rosh Hashanah",
	taanit: "Taanit",
	megillah: "Megillah",
	"moed katan": "Moed Katan",
	chagigah: "Chagigah",
	hagigah: "Chagigah",
	// Order Nashim
	yevamot: "Yevamot",
	ketubot: "Ketubot",
	nedarim: "Nedarim",
	nazir: "Nazir",
	sotah: "Sotah",
	gittin: "Gittin",
	kiddushin: "Kiddushin",
	// Order Nezikin
	"bava kamma": "Bava Kamma",
	"bava kama": "Bava Kamma",
	"bava metzia": "Bava Metzia",
	"bava batra": "Bava Batra",
	sanhedrin: "Sanhedrin",
	makkot: "Makkot",
	shevuot: "Shevuot",
	"avodah zarah": "Avodah Zarah",
	horayot: "Horayot",
	// Order Kodashim
	zevachim: "Zevachim",
	menachot: "Menachot",
	chullin: "Chullin",
	hullin: "Chullin",
	bekhorot: "Bekhorot",
	arakhin: "Arakhin",
	temurah: "Temurah",
	keritot: "Keritot",
	meilah: "Meilah",
	tamid: "Tamid",
	// Order Taharot
	niddah: "Niddah",
};

const MISHNAH_ALIASES: Record<string, string> = {
	avot: "Pirkei_Avot",
	"pirkei avot": "Pirkei_Avot",
	"pirkei avot": "Pirkei_Avot",
	"pirke avot": "Pirkei_Avot",
	"avot derabbi natan": "Avot_DeRabbi_Natan",
};

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

// Talmud daf:  31a, 2b, 10a-10b
const DAF_PATTERN = /\d+[ab](?:-\d+[ab])?/;

// Chapter:verse or chapter:verse-verse
const VERSE_PATTERN = /\d+:\d+(?:-\d+)?/;

// Multi-word book names that need special handling (must come before single-word check)
const MULTI_WORD_BOOKS = [
	"song of songs",
	"song of solomon",
	"shir hashirim",
	"i samuel",
	"ii samuel",
	"1 samuel",
	"2 samuel",
	"i kings",
	"ii kings",
	"1 kings",
	"2 kings",
	"i chronicles",
	"ii chronicles",
	"1 chronicles",
	"2 chronicles",
	"rosh hashanah",
	"rosh hashana",
	"bava kamma",
	"bava kama",
	"bava metzia",
	"bava batra",
	"moed katan",
	"avodah zarah",
	"maaser sheni",
	"pirkei avot",
	"pirke avot",
	"avot derabbi natan",
];

// Build the overall reference detection regex dynamically.
// Matches: [optional "Mishnah "] <book name> <space> <daf-or-verse>
function buildRefRegex(): RegExp {
	const allAliases = [
		...Object.keys(TANAKH_ALIASES),
		...Object.keys(TALMUD_ALIASES),
		...Object.keys(MISHNAH_ALIASES),
	];

	// Sort by length descending so longer aliases match first
	const sorted = [...new Set(allAliases)].sort((a, b) => b.length - a.length);

	const escaped = sorted.map((s) =>
		s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	);

	const bookPat = escaped.join("|");

	// Full pattern:
	// Optional "Mishnah " prefix, book name, whitespace, then daf OR verse locator
	return new RegExp(
		`(?:Mishnah\\s+)?(${bookPat})\\.?\\s+(${DAF_PATTERN.source}|${VERSE_PATTERN.source})`,
		"gi"
	);
}

const REF_REGEX = buildRefRegex();

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizeBook(raw: string): string | null {
	const key = raw.toLowerCase().trim();
	return (
		TANAKH_ALIASES[key] ??
		TALMUD_ALIASES[key] ??
		MISHNAH_ALIASES[key] ??
		null
	);
}

function normalizeLoc(book: string, loc: string): string {
	// Talmud daf notation — keep as-is (e.g. 31a)
	if (/^\d+[ab]/.test(loc)) {
		return loc.replace(/\s/g, "");
	}

	// Tanakh / Mishnah chapter:verse → chapter.verse
	return loc.replace(":", ".").replace(/-/g, "-");
}

function buildSefariaRef(book: string, loc: string, isMishnah: boolean): string {
	let canonBook = normalizeBook(book) ?? book;

	// If it's explicitly Mishnah-prefixed and not already a Mishnah alias, prepend
	if (isMishnah && !canonBook.startsWith("Pirkei") && !canonBook.includes("_")) {
		canonBook = `Mishnah_${canonBook}`;
	}

	const canonBook2 = canonBook.replace(/\s+/g, "_");
	const canonLoc = normalizeLoc(canonBook2, loc);

	return `${canonBook2}.${canonLoc}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseRefs(text: string): ParsedRef[] {
	const results: ParsedRef[] = [];
	const regex = new RegExp(REF_REGEX.source, REF_REGEX.flags); // fresh lastIndex

	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		const full = match[0];
		const bookRaw = match[1];
		const loc = match[2];

		const isMishnah = /^Mishnah\s/i.test(full);
		const canonBook = normalizeBook(bookRaw);

		if (!canonBook) continue; // skip unrecognised books

		const ref = buildSefariaRef(bookRaw, loc, isMishnah);

		results.push({
			raw: full,
			ref,
			start: match.index,
			end: match.index + full.length,
		});
	}

	return results;
}

/**
 * Converts a raw reference string into a Sefaria URL path segment.
 * e.g. "Genesis.1.1" → "Genesis.1.1"
 *      "Shabbat.31a"  → "Shabbat.31a"
 */
export function refToUrl(ref: string): string {
	return encodeURIComponent(ref);
}

export const SEFARIA_BASE = "https://www.sefaria.org/";
