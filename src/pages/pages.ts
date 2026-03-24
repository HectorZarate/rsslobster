import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PageConfig, SiteConfig } from "../config/types.js";
import { resolveStyle, generateStylesheet } from "../styles/presets.js";
import { escHtml } from "../generator/html.js";
import type { PageInjections } from "../plugins/types.js";
import { outputDir } from "../config/paths.js";

/**
 * Static pages — About, Contact, Now, Uses, etc.
 *
 * Pages are defined in rsslobster.json under "pages".
 * They get their own HTML files and optionally appear in the site nav.
 * They are NOT included in RSS feeds or search index.
 */

/** Get pages sorted by navOrder for the navigation bar */
export function getNavPages(config: SiteConfig): PageConfig[] {
  if (!config.pages) return [];
  return config.pages
    .filter((p) => p.navOrder !== undefined)
    .sort((a, b) => (a.navOrder ?? 0) - (b.navOrder ?? 0));
}

/** Render page links only (no home link) — for use on the index page where <h1> is already the title */
export function renderPageLinks(config: SiteConfig): string {
  const pages = getNavPages(config);
  if (pages.length === 0) return "";
  const links = pages
    .map((p) => `<a href="/${escHtml(p.slug)}.html">${escHtml(p.title)}</a>`)
    .join("\n      ");
  return `<nav>${links}</nav>`;
}

/** Render the full nav with home link + page links — for sub-pages, posts, archive */
export function renderNav(config: SiteConfig): string {
  const pages = getNavPages(config);
  const links = pages
    .map((p) => `<a href="/${escHtml(p.slug)}.html">${escHtml(p.title)}</a>`)
    .join("\n      ");
  const separator = links ? "\n      " : "";
  return `<nav><a href="/">${escHtml(config.title)}</a>${separator}${links}</nav>`;
}

/** Generate HTML for a static page */
export function generatePageHtml(
  page: PageConfig,
  config: SiteConfig,
  injections?: PageInjections,
): string {
  const resolved = resolveStyle(config.style.preset, config.style.overrides);
  const css = generateStylesheet(resolved);
  const nav = renderNav(config);
  const extraHead = injections?.head ?? "";
  const bodyEnd = injections?.bodyEnd ?? "";

  return `<!DOCTYPE html>
<html lang="${escHtml(config.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(page.title)} — ${escHtml(config.title)}</title>
  <meta name="description" content="${escHtml(page.body.slice(0, 160))}">
  <meta name="author" content="${escHtml(config.author)}">
  <link rel="alternate" type="application/rss+xml" title="${escHtml(config.title)}" href="/feed.xml">
  <link rel="alternate" type="application/feed+json" title="${escHtml(config.title)}" href="/feed.json">
  <style>${css}</style>${extraHead}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header>
    ${nav}
  </header>
  <main id="main">
    <article>
      <h1>${escHtml(page.title)}</h1>
      <div>${escHtml(page.body)}</div>
    </article>
  </main>${bodyEnd}
</body>
</html>`;
}

/** Validate that a page slug is safe (no path traversal) */
function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug) && !slug.includes("..");
}

/** Write all static pages to disk */
export async function writePages(
  siteDir: string,
  config: SiteConfig,
  injections?: PageInjections,
): Promise<void> {
  if (!config.pages || config.pages.length === 0) return;

  for (const page of config.pages) {
    if (!isValidSlug(page.slug)) {
      console.error(`Skipping page with invalid slug: "${page.slug}"`);
      continue;
    }
    const html = generatePageHtml(page, config, injections);
    await writeFile(join(outputDir(siteDir), `${page.slug}.html`), html);
  }
}
