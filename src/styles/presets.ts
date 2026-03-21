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
> & { fontFamilyCode: string; customCss: string } {
  const base = PRESETS[preset ?? "minimal"];
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
  };
}

/** Generate CSS custom properties from resolved styles */
export function styleToCssVars(
  resolved: ReturnType<typeof resolveStyle>,
): string {
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
}`;
}

/** Generate a full base stylesheet from resolved styles */
export function generateStylesheet(
  resolved: ReturnType<typeof resolveStyle>,
): string {
  const vars = styleToCssVars(resolved);
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

/* === Footer — site-level, quiet === */
footer {
  margin-top: 0.75rem;
}

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
