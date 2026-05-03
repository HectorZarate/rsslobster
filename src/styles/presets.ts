import type { StyleOverrides, StylePreset } from "../config/types.js";

/**
 * Retro web presets with modern UX rigor.
 *
 * Design philosophy: the early web was handmade, text-first, and full of
 * personality. Links were blue and underlined. Visited links turned purple.
 * Horizontal rules separated sections. Pages had visible structure. Content
 * was king because bandwidth was scarce.
 *
 * We bring that warmth and clarity back — but with WCAG AA contrast,
 * responsive layout, system font performance, and touch-target compliance.
 *
 * Each preset evokes a specific era/aesthetic of the personal web:
 * - homepage: the classic personal site (circa 1999-2003)
 * - brutalist: raw HTML energy, no decoration, maximum signal
 * - magazine: the literary webzine / early blog
 * - terminal: BBS, shell, green/amber phosphor
 */

// System font stacks — no external requests, instant rendering
const SYSTEM_SERIF = `Charter, "Bitstream Charter", "Sitka Text", Cambria, serif`;
const SYSTEM_MONO = `"SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace`;
const SYSTEM_SANS = `system-ui, -apple-system, "Segoe UI", sans-serif`;

// The browser default. Times. The font of the raw web.
const TIMES = `"Times New Roman", "Times", "Nimbus Roman", serif`;

export const PRESETS: Record<StylePreset, StyleOverrides> = {
  /**
   * MINIMAL → "personal homepage"
   *
   * Inspired by: danluu.com, gwern.net, early WordPress defaults, Movable Type.
   * Charter serif for body (warm, readable on screens), system sans for headings
   * (contrast creates hierarchy without size abuse). Classic #0000EE link blue
   * with #551A8B visited purple — the colors the web trained us on. Cream
   * background (#FFFFF0) takes the clinical edge off pure white. Generous
   * line-height for scanning. Visible HRs. The page breathes.
   */
  minimal: {
    fontFamily: SYSTEM_SERIF,
    fontFamilyHeading: SYSTEM_SANS,
    fontSize: "18px",
    lineHeight: "1.6",
    maxWidth: "640px",
    colorText: "#222222",
    colorBackground: "#FFFFF0",
    colorAccent: "#0000EE",
    colorLink: "#0000EE",
    colorVisited: "#551A8B",
    colorMuted: "#666666",
    colorBorder: "#CCCCCC",
    borderRadius: "0px",
  },

  /**
   * BRUTALIST → "view source"
   *
   * Inspired by: motherfuckingwebsite.com, berkshirehathaway.com, craigslist.
   * Times New Roman — the browser default, the font you get when you write
   * zero CSS. Pure black on pure white. Red for accents (errors, warnings,
   * things that demand attention). No border-radius (rectangles are honest).
   * Wider max-width because monospace meta needs room. This preset says:
   * "I spent zero time on styling because the content is what matters."
   * But secretly, every value is deliberate.
   */
  brutalist: {
    fontFamily: TIMES,
    fontFamilyHeading: TIMES,
    fontSize: "18px",
    lineHeight: "1.5",
    maxWidth: "720px",
    colorText: "#000000",
    colorBackground: "#FFFFFF",
    colorAccent: "#CC0000",
    colorLink: "#0000EE",
    colorVisited: "#551A8B",
    colorMuted: "#666666",
    colorBorder: "#000000",
    borderRadius: "0px",
  },

  /**
   * MAGAZINE → "the webzine"
   *
   * Inspired by: kottke.org, The Morning News, A List Apart (2005 era),
   * early Blogger literary blogs. Charter serif for body (designed for
   * screen reading), slightly larger type. Warm linen background (#FAF6F1)
   * like aged paper. Dark red accents (#8B0000) — editorial, authoritative.
   * Tighter max-width (580px) for optimal serif line length. This is for
   * people who write long and want it read carefully.
   */
  magazine: {
    fontFamily: SYSTEM_SERIF,
    fontFamilyHeading: SYSTEM_SERIF,
    fontSize: "20px",
    lineHeight: "1.7",
    maxWidth: "580px",
    colorText: "#1A1A1A",
    colorBackground: "#FAF6F1",
    colorAccent: "#8B0000",
    colorLink: "#8B0000",
    colorVisited: "#5B2C3E",
    colorMuted: "#7A7A7A",
    colorBorder: "#D4C5B9",
    borderRadius: "0px",
  },

  /**
   * TERMINAL → "BBS/shell"
   *
   * Inspired by: actual VT220 terminals, BBS systems, htop, vim.
   * Amber phosphor on near-black (#0D0D0D — not pure black, CRTs
   * never were). Amber (#FFB000) is warmer and more readable than
   * green for extended reading. Cyan (#00CCCC) for accents/links —
   * the classic terminal hyperlink color. Dimmed amber (#AA7700) for
   * muted text. Monospace everything. No border-radius (terminals
   * are rectangles). Tighter line-height (monospace needs less).
   */
  terminal: {
    fontFamily: SYSTEM_MONO,
    fontFamilyHeading: SYSTEM_MONO,
    fontSize: "15px",
    lineHeight: "1.5",
    maxWidth: "720px",
    colorText: "#FFB000",
    colorBackground: "#0D0D0D",
    colorAccent: "#00CCCC",
    colorLink: "#00CCCC",
    colorVisited: "#009999",
    colorMuted: "#AA7700",
    colorBorder: "#333333",
    borderRadius: "0px",
  },
};

/** Resolve a style config to concrete CSS overrides */
export function resolveStyle(
  preset?: StylePreset,
  overrides?: StyleOverrides,
): Required<
  Pick<
    StyleOverrides,
    | "fontFamily"
    | "fontFamilyHeading"
    | "fontSize"
    | "lineHeight"
    | "maxWidth"
    | "colorText"
    | "colorBackground"
    | "colorAccent"
    | "colorLink"
    | "colorVisited"
    | "colorMuted"
    | "colorBorder"
    | "borderRadius"
  >
> & { fontFamilyCode: string; customCss: string; preset: StylePreset } {
  const resolvedPreset = preset ?? "minimal";
  const base = PRESETS[resolvedPreset];
  const fontFamily =
    overrides?.fontFamily ?? base.fontFamily ?? SYSTEM_SERIF;
  const isMonoBody =
    fontFamily.includes("Consolas") || fontFamily.includes("Mono");
  return {
    fontFamily,
    fontFamilyHeading:
      overrides?.fontFamilyHeading ??
      base.fontFamilyHeading ??
      overrides?.fontFamily ??
      base.fontFamily ??
      SYSTEM_SANS,
    fontFamilyCode: isMonoBody ? fontFamily : SYSTEM_MONO,
    fontSize: overrides?.fontSize ?? base.fontSize ?? "18px",
    lineHeight: overrides?.lineHeight ?? base.lineHeight ?? "1.6",
    maxWidth: overrides?.maxWidth ?? base.maxWidth ?? "640px",
    colorText: overrides?.colorText ?? base.colorText ?? "#222222",
    colorBackground:
      overrides?.colorBackground ?? base.colorBackground ?? "#FFFFF0",
    colorAccent: overrides?.colorAccent ?? base.colorAccent ?? "#0000EE",
    colorLink: overrides?.colorLink ?? base.colorLink ?? "#0000EE",
    colorVisited: overrides?.colorVisited ?? base.colorVisited ?? "#551A8B",
    colorMuted: overrides?.colorMuted ?? base.colorMuted ?? "#666666",
    colorBorder: overrides?.colorBorder ?? base.colorBorder ?? "#CCCCCC",
    borderRadius: overrides?.borderRadius ?? base.borderRadius ?? "0px",
    customCss: overrides?.customCss ?? "",
    preset: resolvedPreset,
  };
}

/**
 * Shiki CSS variable palettes per preset.
 *
 * These map to shiki's `css-variables` theme tokens:
 * --shiki-foreground, --shiki-background, --shiki-token-keyword, etc.
 * Each preset gets syntax highlighting that matches its aesthetic.
 */
const SHIKI_PALETTES: Record<StylePreset, Record<string, string>> = {
  /** Minimal: muted earth tones on cream — gentle, readable. */
  minimal: {
    "--shiki-foreground": "#383a42",
    "--shiki-background": "color-mix(in srgb, #222222 5%, transparent)",
    "--shiki-token-constant": "#986801",
    "--shiki-token-string": "#50a14f",
    "--shiki-token-comment": "#a0a1a7",
    "--shiki-token-keyword": "#a626a4",
    "--shiki-token-parameter": "#383a42",
    "--shiki-token-function": "#4078f2",
    "--shiki-token-string-expression": "#50a14f",
    "--shiki-token-punctuation": "#383a42",
    "--shiki-token-link": "#0000EE",
  },
  /** Brutalist: stark, high-contrast — red keywords on white. */
  brutalist: {
    "--shiki-foreground": "#000000",
    "--shiki-background": "color-mix(in srgb, #000000 5%, transparent)",
    "--shiki-token-constant": "#0000CC",
    "--shiki-token-string": "#008800",
    "--shiki-token-comment": "#888888",
    "--shiki-token-keyword": "#CC0000",
    "--shiki-token-parameter": "#000000",
    "--shiki-token-function": "#0000CC",
    "--shiki-token-string-expression": "#008800",
    "--shiki-token-punctuation": "#000000",
    "--shiki-token-link": "#0000EE",
  },
  /** Magazine: warm editorial palette on linen — literary, refined. */
  magazine: {
    "--shiki-foreground": "#2e3440",
    "--shiki-background": "color-mix(in srgb, #1A1A1A 5%, transparent)",
    "--shiki-token-constant": "#b48ead",
    "--shiki-token-string": "#a3be8c",
    "--shiki-token-comment": "#939ba8",
    "--shiki-token-keyword": "#8B0000",
    "--shiki-token-parameter": "#2e3440",
    "--shiki-token-function": "#5e81ac",
    "--shiki-token-string-expression": "#a3be8c",
    "--shiki-token-punctuation": "#2e3440",
    "--shiki-token-link": "#8B0000",
  },
  /** Terminal: phosphor glow — green/amber/cyan on near-black. */
  terminal: {
    "--shiki-foreground": "#FFB000",
    "--shiki-background": "#1A1A1A",
    "--shiki-token-constant": "#00CCCC",
    "--shiki-token-string": "#33CC33",
    "--shiki-token-comment": "#AA7700",
    "--shiki-token-keyword": "#FF6600",
    "--shiki-token-parameter": "#FFB000",
    "--shiki-token-function": "#00CCCC",
    "--shiki-token-string-expression": "#33CC33",
    "--shiki-token-punctuation": "#AA7700",
    "--shiki-token-link": "#00CCCC",
  },
};

/** Generate CSS custom properties from resolved styles */
export function styleToCssVars(
  resolved: ReturnType<typeof resolveStyle>,
): string {
  const preset = resolved.preset ?? "minimal";
  const shikiVars = SHIKI_PALETTES[preset];
  const shikiLines = Object.entries(shikiVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");

  return `:root {
  --font-body: ${resolved.fontFamily};
  --font-heading: ${resolved.fontFamilyHeading};
  --font-size: ${resolved.fontSize};
  --line-height: ${resolved.lineHeight};
  --max-width: ${resolved.maxWidth};
  --color-text: ${resolved.colorText};
  --color-bg: ${resolved.colorBackground};
  --color-accent: ${resolved.colorAccent};
  --color-link: ${resolved.colorLink};
  --color-visited: ${resolved.colorVisited};
  --color-muted: ${resolved.colorMuted};
  --color-border: ${resolved.colorBorder};
  --border-radius: ${resolved.borderRadius};
${shikiLines}
}`;
}

export interface StylesheetOptions {
  /**
   * When false, post-only CSS rules (.post-thumb, .post-nav, .post-nav-prev,
   * .post-nav-next) are omitted. Use on static landing pages with zero posts
   * to avoid shipping dead CSS. Defaults to true (include everything).
   */
  hasPosts?: boolean;
}

/** Generate a full base stylesheet from resolved styles */
export function generateStylesheet(
  resolved: ReturnType<typeof resolveStyle>,
  options?: StylesheetOptions,
): string {
  const hasPosts = options?.hasPosts ?? true;
  const vars = styleToCssVars(resolved);
  const postCss = hasPosts
    ? `
/* === Post thumbnails on index === */
.post-thumb {
  display: block;
  margin-bottom: 0.75rem;
  line-height: 0;
}

.post-thumb img {
  width: 100%;
  max-height: 280px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--color-border);
}

/* === Post navigation === */
.post-nav {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
  font-size: 0.9rem;
}

.post-nav a {
  color: var(--color-link);
  text-decoration: none;
  max-width: 45%;
}

.post-nav a:hover {
  text-decoration: underline;
}

.post-nav-next {
  text-align: right;
  margin-left: auto;
}
`
    : "";
  return `${vars}

/*
 * rsslobster — retro web, modern rigor.
 *
 * This stylesheet is the product. Every rule earns its place.
 * No framework. No utility classes. Just considered CSS for
 * pages that are meant to be read.
 */

/* === Reset === */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* === Document === */
html {
  font-size: var(--font-size);
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  hanging-punctuation: first last;
}

body {
  font-family: var(--font-body);
  line-height: var(--line-height);
  color: var(--color-text);
  background: var(--color-bg);
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 2rem 1rem;
  overflow-wrap: break-word;
  word-break: break-word;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* === Typography === */
h1, h2, h3 {
  font-family: var(--font-heading);
  line-height: 1.2;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  text-wrap: balance;
}

h1 { font-size: 1.8rem; letter-spacing: -0.02em; }
h2 { font-size: 1.4rem; letter-spacing: -0.01em; }
h3 { font-size: 1.15rem; }

p {
  margin-bottom: 1em;
  text-wrap: pretty;
}

/* === Links — the soul of the web === */
a {
  color: var(--color-link);
  text-decoration: underline;
  text-underline-offset: 0.15em;
  text-decoration-thickness: 1px;
}

a:visited {
  color: var(--color-visited);
}

a:hover {
  text-decoration-thickness: 2px;
}

a:focus-visible {
  outline: 2px solid var(--color-link);
  outline-offset: 2px;
  border-radius: var(--border-radius);
}

/* === Horizontal rule — the great separator === */
hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 2rem 0;
}

/* === Images — responsive, no-nonsense === */
img {
  max-width: 100%;
  height: auto;
  display: block;
  border-radius: var(--border-radius);
}

/* === Blockquotes — indented, distinct === */
blockquote {
  border-left: 3px solid var(--color-border);
  padding-left: 1em;
  margin: 1em 0;
  color: var(--color-muted);
  font-style: italic;
}

/* === Code — monospace stands out === */
code {
  font-family: ${resolved.fontFamilyCode};
  font-size: 0.9em;
  background: var(--color-border);
  background: color-mix(in srgb, var(--color-text) 8%, transparent);
  padding: 0.1em 0.3em;
  border-radius: var(--border-radius);
}

pre {
  overflow-x: auto;
  padding: 1em;
  margin: 1em 0;
  background: var(--color-border);
  background: color-mix(in srgb, var(--color-text) 5%, transparent);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
}

pre code {
  background: none;
  padding: 0;
}

/* === Tables === */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
  font-size: 0.9rem;
}

th, td {
  text-align: left;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
}

th {
  font-weight: 600;
  color: var(--color-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

tr:last-child td {
  border-bottom: none;
}

@media (max-width: 480px) {
  table { font-size: 0.8rem; }
  th, td { padding: 0.4rem 0.5rem; }
}

/* === Shiki code blocks — override pre defaults with shiki vars === */
pre.shiki {
  background: var(--shiki-background) !important;
  border: 1px solid var(--color-border);
}

/* === Math (MathML) === */
math {
  font-size: 1.1em;
}

math[display="block"] {
  display: block;
  text-align: center;
  margin: 1em 0;
  overflow-x: auto;
}

/* === Lists — properly indented === */
ul, ol {
  padding-left: 1.5em;
  margin-bottom: 1em;
}

li { margin-bottom: 0.25em; }

li::marker {
  color: var(--color-muted);
}

/* === Article — the atomic unit of a feed === */
article {
  margin-bottom: 2.5rem;
  padding-bottom: 2.5rem;
  border-bottom: 1px solid var(--color-border);
}

article:last-child {
  border-bottom: none;
}

/* === Meta — timestamps, bylines === */
time, .meta {
  color: var(--color-muted);
  font-size: 0.85rem;
  font-family: var(--font-heading);
  letter-spacing: 0.02em;
}

/* === Tags — small, quiet, clickable === */
.tag {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  font-size: 0.75rem;
  font-family: var(--font-heading);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  color: var(--color-muted);
  text-decoration: none;
  margin-right: 0.25rem;
  margin-top: 0.25rem;
}

/* === Carousel — horizontal scroll, snap === */
.carousel {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 0.75rem;
  margin: 1rem 0;
}

.carousel img {
  scroll-snap-align: start;
  flex-shrink: 0;
  width: 80vw;
  max-width: 480px;
}

/* === Link card — the bookmark === */
.link-card {
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  padding: 1rem;
  text-decoration: none;
  display: block;
  color: inherit;
  margin: 1rem 0;
}

.link-card:visited { color: inherit; }

.link-card:hover, .link-card:focus-visible {
  border-color: var(--color-link);
}

.link-card h3 {
  margin-top: 0;
  margin-bottom: 0.25em;
  color: var(--color-link);
  font-size: 1.1rem;
}

.link-card p {
  color: var(--color-muted);
  margin-bottom: 0;
  font-size: 0.9rem;
}

/* === Header / nav — minimal, functional === */
header {
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
}

header h1 {
  margin-top: 0;
  margin-bottom: 0.25em;
}

header p {
  color: var(--color-muted);
  margin-bottom: 0;
}

nav a {
  font-family: var(--font-heading);
  font-weight: 700;
  text-decoration: none;
  color: var(--color-text);
  font-size: 1.1rem;
}

nav a:hover {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.15em;
}

nav a:visited { color: var(--color-text); }

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.header-rss {
  font-family: var(--font-heading);
  font-size: 0.85rem;
  color: var(--color-muted);
  text-decoration: none;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.header-rss:hover {
  color: var(--color-link);
}

.header-rss:visited {
  color: var(--color-muted);
}

/* === Footer — site-level, quiet === */
footer {
  margin-top: 0.75rem;
}

.site-footer {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
  font-family: var(--font-heading);
  font-size: 0.85rem;
  color: var(--color-muted);
}

.site-footer a {
  color: var(--color-muted);
  text-decoration: none;
}

.site-footer a:hover {
  color: var(--color-link);
  text-decoration: underline;
}

.site-footer-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.site-footer-powered {
  margin-top: 0.5rem;
  font-size: 0.75rem;
}
${postCss}
/* === Selection — intentional === */
::selection {
  background: var(--color-link);
  color: var(--color-bg);
}

/* === Accessibility: skip link === */
.skip-link {
  position: absolute;
  top: -100%;
  left: 0;
  padding: 0.5rem 1rem;
  background: var(--color-link);
  color: var(--color-bg);
  z-index: 100;
  text-decoration: none;
  font-family: var(--font-heading);
}

.skip-link:focus {
  top: 0;
}

/* === Touch targets — minimum 44x44px (WCAG 2.5.8) === */
nav a, button, .tag {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}

/* === Responsive === */
@media (max-width: 480px) {
  html { font-size: calc(var(--font-size) - 1px); }
  body { padding: 1.5rem 0.75rem; }
  h1 { font-size: 1.5rem; }
}

/* === Reduced motion === */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* === Print — because retro web people print things === */
@media print {
  body {
    max-width: 100%;
    padding: 0;
    color: #000;
    background: #fff;
  }
  a { color: #000; }
  a[href]::after { content: " (" attr(href) ")"; font-size: 0.8em; }
  .skip-link, nav { display: none; }
  article { border-bottom: none; page-break-inside: avoid; }
}

${resolved.customCss}`;
}

/**
 * Load a custom CSS file if configured.
 * Returns the CSS content or empty string if not configured/not found.
 */
export async function loadCustomCss(
  siteDir: string,
  cssFile?: string,
): Promise<string> {
  if (!cssFile) return "";
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    return await readFile(join(siteDir, cssFile), "utf-8");
  } catch {
    console.error(`Custom CSS file "${cssFile}" not found, skipping`);
    return "";
  }
}
