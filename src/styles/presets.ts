import type { StyleOverrides, StylePreset } from "../config/types.js";

/**
 * Style presets designed by UX principles:
 * - Typography-first: readable line lengths (45-75ch), comfortable line-height
 * - Progressive disclosure: content dominates, chrome recedes
 * - Accessibility: WCAG AA contrast ratios, focus indicators, responsive
 * - Performance: zero external fonts by default, system font stacks
 * - Mobile-first: touch targets ≥44px, no hover-dependent interactions
 */

const SYSTEM_SANS = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const SYSTEM_SERIF = `Georgia, "Times New Roman", Times, serif`;
const SYSTEM_MONO = `"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace`;

export const PRESETS: Record<StylePreset, StyleOverrides> = {
  minimal: {
    fontFamily: SYSTEM_SANS,
    fontSize: "18px",
    lineHeight: "1.6",
    maxWidth: "640px",
    colorText: "#1a1a1a",
    colorBackground: "#ffffff",
    colorAccent: "#0066cc",
    colorMuted: "#666666",
    borderRadius: "4px",
  },
  brutalist: {
    fontFamily: SYSTEM_MONO,
    fontSize: "16px",
    lineHeight: "1.5",
    maxWidth: "720px",
    colorText: "#000000",
    colorBackground: "#ffffff",
    colorAccent: "#ff0000",
    colorMuted: "#555555",
    borderRadius: "0px",
  },
  magazine: {
    fontFamily: SYSTEM_SERIF,
    fontSize: "20px",
    lineHeight: "1.7",
    maxWidth: "600px",
    colorText: "#2d2d2d",
    colorBackground: "#faf9f6",
    colorAccent: "#8b0000",
    colorMuted: "#777777",
    borderRadius: "2px",
  },
  terminal: {
    fontFamily: SYSTEM_MONO,
    fontSize: "15px",
    lineHeight: "1.5",
    maxWidth: "720px",
    colorText: "#00ff00",
    colorBackground: "#0a0a0a",
    colorAccent: "#00ccff",
    colorMuted: "#00aa00",
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
    | "fontSize"
    | "lineHeight"
    | "maxWidth"
    | "colorText"
    | "colorBackground"
    | "colorAccent"
    | "colorMuted"
    | "borderRadius"
  >
> & { customCss: string } {
  const base = PRESETS[preset ?? "minimal"];
  return {
    fontFamily: overrides?.fontFamily ?? base.fontFamily ?? SYSTEM_SANS,
    fontSize: overrides?.fontSize ?? base.fontSize ?? "18px",
    lineHeight: overrides?.lineHeight ?? base.lineHeight ?? "1.6",
    maxWidth: overrides?.maxWidth ?? base.maxWidth ?? "640px",
    colorText: overrides?.colorText ?? base.colorText ?? "#1a1a1a",
    colorBackground:
      overrides?.colorBackground ?? base.colorBackground ?? "#ffffff",
    colorAccent: overrides?.colorAccent ?? base.colorAccent ?? "#0066cc",
    colorMuted: overrides?.colorMuted ?? base.colorMuted ?? "#666666",
    borderRadius: overrides?.borderRadius ?? base.borderRadius ?? "4px",
    customCss: overrides?.customCss ?? "",
  };
}

/** Generate CSS custom properties from resolved styles */
export function styleToCssVars(
  resolved: ReturnType<typeof resolveStyle>,
): string {
  return `:root {
  --font-family: ${resolved.fontFamily};
  --font-size: ${resolved.fontSize};
  --line-height: ${resolved.lineHeight};
  --max-width: ${resolved.maxWidth};
  --color-text: ${resolved.colorText};
  --color-bg: ${resolved.colorBackground};
  --color-accent: ${resolved.colorAccent};
  --color-muted: ${resolved.colorMuted};
  --border-radius: ${resolved.borderRadius};
}`;
}

/** Generate a full base stylesheet from resolved styles */
export function generateStylesheet(
  resolved: ReturnType<typeof resolveStyle>,
): string {
  const vars = styleToCssVars(resolved);
  return `${vars}

/* Reset */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* Base */
html {
  font-size: var(--font-size);
  -webkit-text-size-adjust: 100%;
}

body {
  font-family: var(--font-family);
  line-height: var(--line-height);
  color: var(--color-text);
  background: var(--color-bg);
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 1rem;
  overflow-wrap: break-word;
  word-break: break-word;
}

/* Typography */
h1, h2, h3 {
  line-height: 1.2;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

h1 { font-size: 2rem; }
h2 { font-size: 1.5rem; }
h3 { font-size: 1.25rem; }

p { margin-bottom: 1em; }

/* Links — accessible focus indicators */
a {
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

a:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: var(--border-radius);
}

/* Images — responsive by default */
img {
  max-width: 100%;
  height: auto;
  display: block;
  border-radius: var(--border-radius);
}

/* Article */
article {
  margin-bottom: 2rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--color-muted);
}

article:last-child {
  border-bottom: none;
}

/* Time/meta — muted, smaller */
time, .meta {
  color: var(--color-muted);
  font-size: 0.875rem;
}

/* Tags */
.tag {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  border: 1px solid var(--color-muted);
  border-radius: var(--border-radius);
  color: var(--color-muted);
  text-decoration: none;
  margin-right: 0.25rem;
}

/* Carousel */
.carousel {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 0.5rem;
}

.carousel img {
  scroll-snap-align: start;
  flex-shrink: 0;
  width: 80vw;
  max-width: 480px;
}

/* Link card */
.link-card {
  border: 1px solid var(--color-muted);
  border-radius: var(--border-radius);
  padding: 1rem;
  text-decoration: none;
  display: block;
  color: inherit;
}

.link-card:hover {
  border-color: var(--color-accent);
}

.link-card h3 {
  margin-top: 0;
  color: var(--color-accent);
}

.link-card p {
  color: var(--color-muted);
  margin-bottom: 0;
}

/* Accessibility: skip link */
.skip-link {
  position: absolute;
  top: -100%;
  left: 0;
  padding: 0.5rem 1rem;
  background: var(--color-accent);
  color: var(--color-bg);
  z-index: 100;
}

.skip-link:focus {
  top: 0;
}

/* Touch targets — minimum 44x44px */
nav a, button, .tag {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}

/* Responsive */
@media (max-width: 480px) {
  html { font-size: calc(var(--font-size) - 1px); }
  body { padding: 0.75rem; }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Dark mode auto-detect (for minimal/magazine presets) */
@media (prefers-color-scheme: dark) {
  :root.auto-dark {
    --color-text: #e0e0e0;
    --color-bg: #1a1a1a;
    --color-muted: #999999;
  }
}

${resolved.customCss}`;
}
