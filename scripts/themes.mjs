// Color themes for the pages. A theme only sets CSS variables; every page reads the same names:
// --accent/--accent2 (gradient), --soft (tinted backgrounds), --on-accent (text on accent),
// and for full themes also --bg, --fg, --muted, --card, --line.

const neutral = {
	light: { bg: "#f3f3f7", fg: "#16161a", muted: "#6c6c74", card: "#fff", line: "#e7e7ee" },
	dark: { bg: "#0e0e12", fg: "#f2f2f6", muted: "#9a9aa6", card: "#1a1a20", line: "#2a2a33" },
};

export const THEMES = {
	ocean: {
		light: { accent: "#2563eb", accent2: "#06b6d4", soft: "#e0f2fe", onAccent: "#fff", bg: "#f1f6fb", fg: "#0f172a", muted: "#64748b", card: "#fff", line: "#e2e8f0" },
		dark: { accent: "#60a5fa", accent2: "#22d3ee", soft: "#132a46", onAccent: "#0b1220", bg: "#0b1220", fg: "#e8eef8", muted: "#94a3b8", card: "#131c2e", line: "#1e293b" },
	},
	violet: {
		light: { accent: "#5a64e8", accent2: "#8b5cf6", soft: "#eef0ff", onAccent: "#fff", ...neutral.light },
		dark: { accent: "#8f97ff", accent2: "#b18cff", soft: "#23253d", onAccent: "#0e0e12", ...neutral.dark },
	},
	mint: {
		light: { accent: "#059669", accent2: "#14b8a6", soft: "#d1fae5", onAccent: "#fff", bg: "#f0f7f4", fg: "#0f1f1a", muted: "#5f706a", card: "#fff", line: "#dcebe4" },
		dark: { accent: "#34d399", accent2: "#2dd4bf", soft: "#0f2e25", onAccent: "#06140f", bg: "#0b1512", fg: "#e6f4ee", muted: "#8fa79e", card: "#12201b", line: "#1d2f28" },
	},
	sunset: {
		light: { accent: "#ea580c", accent2: "#db2777", soft: "#ffedd5", onAccent: "#fff", bg: "#fbf5f2", fg: "#1f1412", muted: "#7a6a66", card: "#fff", line: "#efe2dc" },
		dark: { accent: "#fb923c", accent2: "#f472b6", soft: "#3a1d14", onAccent: "#160e10", bg: "#160e10", fg: "#f8ece8", muted: "#b39d97", card: "#22161a", line: "#33242a" },
	},
	mono: {
		light: { accent: "#111111", accent2: "#3f3f46", soft: "#ececee", onAccent: "#fff", bg: "#f5f5f5", fg: "#111111", muted: "#6b6b6b", card: "#fff", line: "#e5e5e5" },
		dark: { accent: "#f5f5f5", accent2: "#d4d4d8", soft: "#262626", onAccent: "#0a0a0a", bg: "#0a0a0a", fg: "#f5f5f5", muted: "#a3a3a3", card: "#171717", line: "#262626" },
	},
};
export const DEFAULT_THEME = "ocean";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const expand = (h) => (h.length === 4 ? `#${[...h.slice(1)].map((c) => c + c).join("")}` : h).toLowerCase();
const luminance = (hex) => {
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Parses "#e11d48" or "#e11d48,#f59e0b" into a custom theme, or returns null. */
export function customTheme(value) {
	const parts = String(value || "").split(",").map((s) => s.trim()).filter(Boolean);
	if (!parts.length || parts.length > 2 || !parts.every((p) => HEX.test(p))) return null;
	const [accent, accent2 = accent] = parts.map(expand);
	const onAccent = luminance(accent) > 0.45 ? "#111111" : "#ffffff";
	const soft = `color-mix(in srgb, ${accent} 14%, transparent)`;
	return { light: { accent, accent2, soft, onAccent }, dark: { accent, accent2, soft, onAccent } };
}

/** Resolves a theme name or custom colors to a theme object (unknown names fall back to the default). */
export function resolveTheme(name, custom) {
	return customTheme(custom) || customTheme(name) || THEMES[String(name || "").toLowerCase()] || THEMES[DEFAULT_THEME];
}

const vars = (t, full) =>
	Object.entries({ accent: t.accent, accent2: t.accent2, soft: t.soft, "on-accent": t.onAccent, ...(full ? { bg: t.bg, fg: t.fg, muted: t.muted, card: t.card, line: t.line } : {}) })
		.filter(([, v]) => v)
		.map(([k, v]) => `--${k}:${v}`)
		.join(";");

/** CSS that applies a theme. `full` also sets background/text colors (phone pages); otherwise only accents. */
export function themeCss(theme, { full = true } = {}) {
	return `:root{${vars(theme.light, full)}}\n@media (prefers-color-scheme:dark){:root{${vars(theme.dark, full)}}}`;
}
