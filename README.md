# Sefaria Integration — Obsidian Plugin

Detect Torah references in your Markdown notes with live inline highlights, hover previews (Hebrew + English), and a daily learning sidebar — all powered by [Sefaria's](https://www.sefaria.org) open corpus.

---

## Features

### Reference Detection
Automatically detects Torah references as you type and highlights them in the editor. Supported formats:

| You write | Resolves to |
|---|---|
| `Genesis 1:1` | `Genesis.1.1` |
| `Bereishit 1:1` | `Genesis.1.1` |
| `Gen. 1:1` | `Genesis.1.1` |
| `Shabbat 31a` | `Shabbat.31a` |
| `Berakhot 2a-2b` | `Berakhot.2a-2b` |
| `Mishnah Avot 1:1` | `Pirkei_Avot.1.1` |
| `Deut. 5:6` | `Deuteronomy.5.6` |

Supports Tanakh (Torah, Nevi'im, Ketuvim), Talmud Bavli tractates, and Mishnah.

### Hover Previews
Hover over any detected reference to instantly see:
- Hebrew source text (RTL, styled correctly)
- English translation
- "Open on Sefaria" link

### Daily Learning Sidebar
A sidebar panel showing today's:
- Daf Yomi
- Weekly Parsha
- Additional calendar items from Sefaria

Click any item to open it on sefaria.org.

### Commands
| Command | Description |
|---|---|
| **Insert Sefaria Text** | Search for a reference and paste it as a formatted blockquote |
| **Link Selection as Sefaria Reference** | Convert selected text into an external or internal link |
| **Open Today's Learning** | Open the daily learning sidebar |
| **Pull Sefaria Text Into Vault** | Create a new note pre-populated with Hebrew, English, and frontmatter |

### Vault Integration
When pulling a text into your vault, notes are created with YAML frontmatter for backlinks and graph view:

```yaml
---
source: Sefaria
ref: Genesis.1.1
categories: [Torah, Bereishit]
date_studied: 2026-02-22
---
```

---

## Installation

### Manual (Development)

1. Clone this repo:
   ```bash
   git clone https://github.com/admiller007/Sefaria-obsidian.git
   cd Sefaria-obsidian
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Copy the plugin files into your vault:
   ```bash
   mkdir -p /path/to/your/vault/.obsidian/plugins/sefaria-integration
   cp main.js manifest.json styles.css /path/to/your/vault/.obsidian/plugins/sefaria-integration/
   ```

4. In Obsidian: **Settings → Community Plugins → Installed Plugins** → enable **Sefaria Integration**.

### Development (hot reload)

```bash
npm run dev
```

Then symlink the plugin folder into your vault's `.obsidian/plugins/` directory and enable it.

---

## Settings

Open **Settings → Sefaria Integration** to configure:

| Setting | Default | Description |
|---|---|---|
| Show Hebrew text | On | Display Hebrew in hover previews |
| Show English translation | On | Display English in hover previews |
| Decoration style | Underline | How refs are highlighted: `underline`, `highlight`, or `none` |
| Auto-link references | Off | Convert plain refs to links in reading view |
| Link target | External | Auto-links point to sefaria.org or internal vault notes |
| Open sidebar on startup | Off | Show daily learning panel when Obsidian opens |
| Note template | (see below) | Template for pulled vault notes |

### Default note template

```
---
source: Sefaria
ref: {{ref}}
categories: {{categories}}
date_studied: {{date}}
---

## {{title}}

### Hebrew

{{hebrew}}

### English

{{english}}
```

Available template variables: `{{ref}}`, `{{title}}`, `{{hebrew}}`, `{{english}}`, `{{categories}}`, `{{date}}`

---

## Architecture

```
main.ts            Plugin entry point — lifecycle, CM6 extension, commands, sidebar
RefParser.ts       Regex-based reference detection + normalization to Sefaria dot notation
SefariaService.ts  API client — getText, getLinks, getCalendar, search, getName + caching
settings.ts        User preferences + Obsidian SettingTab
styles.css         Hover popover, inline decorations, sidebar, search modal
```

### API & Caching

- Base URL: `https://www.sefaria.org/api/`
- No API key required
- Torah texts are immutable → cached indefinitely (in-memory + persisted to plugin data)
- Calendar data refreshes every 12 hours
- Previously cached texts render offline

---

## Requirements

- Obsidian ≥ 1.4.0
- Node.js ≥ 16 (for building)

---

## License

MIT
