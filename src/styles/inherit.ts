import type { StyleOverrides } from "../config/types.js";

/**
 * Extract style properties from an existing site's HTML.
 * Fetches the URL, parses computed-style-equivalent CSS custom properties
 * and common patterns to build a StyleOverrides object.
 *
 * This enables "inherit the look of my existing site" during onboarding.
 */
export async function inheritStyleFromUrl(
  url: string,
): Promise<StyleOverrides> {
  const response = await fetch(url, {
    headers: { "User-Agent": "rsslobster/0.1.0 (style-inherit)" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();
  return extractStylesFromHtml(html);
}

/** Parse HTML/CSS to extract dominant style properties */
export function extractStylesFromHtml(html: string): StyleOverrides {
  const overrides: StyleOverrides = {};

  // Extract from CSS custom properties in :root or html
  const rootVarsMatch = html.match(
    /:root\s*\{([^}]+)\}|html\s*\{([^}]+)\}/g,
  );
  if (rootVarsMatch) {
    const vars = rootVarsMatch.join(" ");
    overrides.fontFamily =
      extractCssVar(vars, "font-body") ??
      extractCssVar(vars, "font-family");
    overrides.fontFamilyHeading = extractCssVar(vars, "font-heading");
    overrides.fontSize = extractCssVar(vars, "font-size");
    overrides.lineHeight = extractCssVar(vars, "line-height");
    overrides.maxWidth = extractCssVar(vars, "max-width");
    overrides.colorText =
      extractCssVar(vars, "color-text") ?? extractCssVar(vars, "text-color");
    overrides.colorBackground =
      extractCssVar(vars, "color-bg") ??
      extractCssVar(vars, "background-color") ??
      extractCssVar(vars, "bg-color");
    overrides.colorAccent =
      extractCssVar(vars, "color-accent") ??
      extractCssVar(vars, "accent-color") ??
      extractCssVar(vars, "color-primary") ??
      extractCssVar(vars, "primary-color");
    overrides.colorLink =
      extractCssVar(vars, "color-link") ??
      extractCssVar(vars, "link-color");
    overrides.colorVisited =
      extractCssVar(vars, "color-visited") ??
      extractCssVar(vars, "visited-color");
    overrides.colorBorder =
      extractCssVar(vars, "color-border") ??
      extractCssVar(vars, "border-color");
  }

  // Extract from inline body styles
  const bodyMatch = html.match(/body\s*\{([^}]+)\}/);
  if (bodyMatch?.[1]) {
    const bodyStyles = bodyMatch[1];
    overrides.fontFamily ??= extractCssProp(bodyStyles, "font-family");
    overrides.fontSize ??= extractCssProp(bodyStyles, "font-size");
    overrides.lineHeight ??= extractCssProp(bodyStyles, "line-height");
    overrides.maxWidth ??= extractCssProp(bodyStyles, "max-width");
    overrides.colorText ??= extractCssProp(bodyStyles, "color");
    overrides.colorBackground ??=
      extractCssProp(bodyStyles, "background-color") ??
      extractCssProp(bodyStyles, "background");
  }

  // Strip undefined keys
  return Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== undefined),
  ) as StyleOverrides;
}

function extractCssVar(css: string, name: string): string | undefined {
  const re = new RegExp(`--${name}\\s*:\\s*([^;]+)`, "i");
  return re.exec(css)?.[1]?.trim();
}

function extractCssProp(css: string, prop: string): string | undefined {
  const re = new RegExp(`${prop}\\s*:\\s*([^;]+)`, "i");
  return re.exec(css)?.[1]?.trim();
}
