import { App, PluginSettingTab, Setting } from "obsidian";
import type SefariaPlugin from "./main";

// ---------------------------------------------------------------------------
// Settings shape
// ---------------------------------------------------------------------------

export interface SefariaSettings {
	/** Show Hebrew text in hover previews */
	showHebrew: boolean;
	/** Show English translation in hover previews */
	showEnglish: boolean;
	/** Inline decoration style for detected refs */
	decorationStyle: "underline" | "highlight" | "none";
	/** Auto-link plain references in reading view */
	autoLink: boolean;
	/** Auto-link target: external Sefaria URL or internal vault note */
	autoLinkTarget: "external" | "internal";
	/** Template for vault notes pulled from Sefaria */
	noteTemplate: string;
	/** Show the daily-learning sidebar on startup */
	openSidebarOnStartup: boolean;
	/** YAML frontmatter fields to include when pulling a text into vault */
	frontmatterFields: {
		source: boolean;
		ref: boolean;
		categories: boolean;
		commentators: boolean;
		dateStudied: boolean;
	};
}

export const DEFAULT_SETTINGS: SefariaSettings = {
	showHebrew: true,
	showEnglish: true,
	decorationStyle: "underline",
	autoLink: false,
	autoLinkTarget: "external",
	noteTemplate:
		"---\n" +
		"source: Sefaria\n" +
		"ref: {{ref}}\n" +
		"categories: {{categories}}\n" +
		"date_studied: {{date}}\n" +
		"---\n\n" +
		"## {{title}}\n\n" +
		"### Hebrew\n\n{{hebrew}}\n\n" +
		"### English\n\n{{english}}\n",
	openSidebarOnStartup: false,
	frontmatterFields: {
		source: true,
		ref: true,
		categories: true,
		commentators: false,
		dateStudied: true,
	},
};

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

export class SefariaSettingTab extends PluginSettingTab {
	plugin: SefariaPlugin;

	constructor(app: App, plugin: SefariaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Sefaria Integration" });

		// --- Hover Preview ---
		containerEl.createEl("h3", { text: "Hover Preview" });

		new Setting(containerEl)
			.setName("Show Hebrew text")
			.setDesc("Display the Hebrew source text in hover previews.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.showHebrew)
					.onChange(async (v) => {
						this.plugin.settings.showHebrew = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show English translation")
			.setDesc("Display the English translation in hover previews.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.showEnglish)
					.onChange(async (v) => {
						this.plugin.settings.showEnglish = v;
						await this.plugin.saveSettings();
					})
			);

		// --- Inline Decorations ---
		containerEl.createEl("h3", { text: "Inline Decorations" });

		new Setting(containerEl)
			.setName("Decoration style")
			.setDesc(
				"How detected Torah references are highlighted in the editor."
			)
			.addDropdown((d) =>
				d
					.addOption("underline", "Underline")
					.addOption("highlight", "Highlight")
					.addOption("none", "None")
					.setValue(this.plugin.settings.decorationStyle)
					.onChange(async (v) => {
						this.plugin.settings.decorationStyle = v as
							| "underline"
							| "highlight"
							| "none";
						await this.plugin.saveSettings();
					})
			);

		// --- Auto-linking ---
		containerEl.createEl("h3", { text: "Auto-linking" });

		new Setting(containerEl)
			.setName("Auto-link references")
			.setDesc(
				"Automatically convert plain Torah references into links in reading view."
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.autoLink)
					.onChange(async (v) => {
						this.plugin.settings.autoLink = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Link target")
			.setDesc(
				"Where auto-links point: the Sefaria website, or an internal vault note."
			)
			.addDropdown((d) =>
				d
					.addOption("external", "Sefaria website")
					.addOption("internal", "Internal vault note")
					.setValue(this.plugin.settings.autoLinkTarget)
					.onChange(async (v) => {
						this.plugin.settings.autoLinkTarget = v as
							| "external"
							| "internal";
						await this.plugin.saveSettings();
					})
			);

		// --- Sidebar ---
		containerEl.createEl("h3", { text: "Daily Learning Sidebar" });

		new Setting(containerEl)
			.setName("Open sidebar on startup")
			.setDesc(
				"Show the daily learning schedule (Daf Yomi, Parsha, etc.) when Obsidian opens."
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.openSidebarOnStartup)
					.onChange(async (v) => {
						this.plugin.settings.openSidebarOnStartup = v;
						await this.plugin.saveSettings();
					})
			);

		// --- Note template ---
		containerEl.createEl("h3", { text: "Pull-to-Vault Template" });

		new Setting(containerEl)
			.setName("Note template")
			.setDesc(
				"Template used when pulling a Sefaria text into your vault.\n" +
					"Available variables: {{ref}}, {{title}}, {{hebrew}}, {{english}}, {{categories}}, {{date}}"
			)
			.addTextArea((t) => {
				t.inputEl.rows = 10;
				t.inputEl.style.width = "100%";
				t.inputEl.style.fontFamily = "monospace";
				t	.setValue(this.plugin.settings.noteTemplate)
					.onChange(async (v) => {
						this.plugin.settings.noteTemplate = v;
						await this.plugin.saveSettings();
					});
			});

		// --- Frontmatter fields ---
		containerEl.createEl("h3", { text: "Frontmatter Fields" });

		const fmFields: Array<{
			key: keyof SefariaSettings["frontmatterFields"];
			name: string;
			desc: string;
		}> = [
			{ key: "source", name: "source", desc: 'Always "Sefaria"' },
			{ key: "ref", name: "ref", desc: "Sefaria dot-notation reference" },
			{
				key: "categories",
				name: "categories",
				desc: "Torah, Mishnah, Talmud, etc.",
			},
			{
				key: "commentators",
				name: "commentators",
				desc: "Rashi, Ramban, etc. (requires fetching links)",
			},
			{ key: "dateStudied", name: "date_studied", desc: "Today's date" },
		];

		for (const { key, name, desc } of fmFields) {
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addToggle((t) =>
					t
						.setValue(this.plugin.settings.frontmatterFields[key])
						.onChange(async (v) => {
							this.plugin.settings.frontmatterFields[key] = v;
							await this.plugin.saveSettings();
						})
				);
		}
	}
}
