import type { ClassifiedContent, SiteConfig } from "../config/types.js";
import { resolveStyle, generateStylesheet } from "../styles/presets.js";
import { SEARCH_HTML, SEARCH_SCRIPT } from "./search.js";

/**
 * Generate an HTML page from classified content.
 *
 * UX standards:
 * - Semantic HTML5 (article, time, nav, header, main)
 * - Accessible: skip-link, lang attribute, alt text, ARIA where needed
 * - Mobile-first: viewport meta, responsive images, touch targets
 * - Performance: inline critical CSS, no external font requests
 * - Progressive: works without JavaScript entirely
 */

/** Options for injecting extra content into generated HTML pages. */
export interface HtmlPageOptions {
  /** Extra HTML to inject into <head> (after <style>) */
  extraHead?: string;
  /** HTML to inject at start of <body>, before skip-link */
  bodyPrefix?: string;
}

/** Return HtmlPageOptions for a preview page: noindex meta + banner. */
export function previewPageOptions(): HtmlPageOptions {
  return {
    extraHead: '<meta name="robots" content="noindex, nofollow">',
    bodyPrefix:
      '<div style="position:fixed;top:0;left:0;right:0;background:#1a1a2e;color:#e0e0e0;' +
      "text-align:center;padding:8px 16px;font:14px/1.4 system-ui,sans-serif;" +
      'z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.3)">' +
      "Preview — not yet published</div>" +
      '<div style="height:40px"></div>',
  };
}

export function generateHtmlPage(
  content: ClassifiedContent,
  config: SiteConfig,
  options?: HtmlPageOptions,
): string {
  const resolved = resolveStyle(config.style.preset, config.style.overrides);
  const css = generateStylesheet(resolved);
  const inner = renderContentBody(content);
  const extraHead = options?.extraHead ? `\n  ${options.extraHead}` : "";
  const bodyPrefix = options?.bodyPrefix ? `\n  ${options.bodyPrefix}` : "";

  return `<!DOCTYPE html>
<html lang="${escHtml(config.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(content.title ?? truncate(content.body, 60))} — ${escHtml(config.title)}</title>
  <meta name="description" content="${escAttr(truncate(content.body, 160))}">
  <meta name="author" content="${escAttr(config.author)}">
  <link rel="alternate" type="application/rss+xml" title="${escAttr(config.title)}" href="/feed.xml">
  <link rel="alternate" type="application/feed+json" title="${escAttr(config.title)}" href="/feed.json">
  <style>${css}</style>${extraHead}
</head>
<body>${bodyPrefix}
  <a class="skip-link" href="#main">Skip to content</a>
  <header>
    <nav><a href="/">${escHtml(config.title)}</a></nav>
  </header>
  <main id="main">
    <article>
      ${inner}
      <footer class="meta">
        <time datetime="${escAttr(content.createdAt)}">${formatDate(content.createdAt)}</time>
        ${renderTags(content.tags)}
      </footer>
    </article>
  </main>
</body>
</html>`;
}

/** Maximum posts shown on the index page before linking to archive */
const INDEX_PAGE_LIMIT = 30;

/** Render a list of post articles as HTML. */
function renderPostList(posts: ClassifiedContent[]): string {
  return posts
    .map(
      (p) => `    <article>
      <h2><a href="/${escAttr(p.slug)}.html">${escHtml(p.title ?? truncate(p.body, 80))}</a></h2>
      <p>${escHtml(truncate(p.body, 200))}</p>
      <time datetime="${escAttr(p.createdAt)}">${formatDate(p.createdAt)}</time>
    </article>`,
    )
    .join("\n");
}

/** Generate the index page listing recent posts */
export function generateIndexPage(
  posts: ClassifiedContent[],
  config: SiteConfig,
): string {
  const resolved = resolveStyle(config.style.preset, config.style.overrides);
  const css = generateStylesheet(resolved);

  const recentPosts = posts.slice(0, INDEX_PAGE_LIMIT);
  const hasArchive = posts.length > INDEX_PAGE_LIMIT;
  const items = renderPostList(recentPosts);
  const archiveLink = hasArchive
    ? `\n    <nav class="pagination"><a href="/archive.html">Older posts (${posts.length - INDEX_PAGE_LIMIT} more)</a></nav>`
    : "";

  return `<!DOCTYPE html>
<html lang="${escHtml(config.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(config.title)}</title>
  <meta name="description" content="${escAttr(config.description)}">
  <link rel="alternate" type="application/rss+xml" title="${escAttr(config.title)}" href="/feed.xml">
  <link rel="alternate" type="application/feed+json" title="${escAttr(config.title)}" href="/feed.json">
  <style>${css}</style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header>
    <h1>${escHtml(config.title)}</h1>
    <p>${escHtml(config.description)}</p>
  </header>
  <main id="main">
    ${SEARCH_HTML}
${items}${archiveLink}
  </main>
${SEARCH_SCRIPT}
</body>
</html>`;
}

/** Generate the archive page listing ALL posts */
export function generateArchivePage(
  posts: ClassifiedContent[],
  config: SiteConfig,
): string {
  const resolved = resolveStyle(config.style.preset, config.style.overrides);
  const css = generateStylesheet(resolved);
  const items = renderPostList(posts);

  return `<!DOCTYPE html>
<html lang="${escHtml(config.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Archive — ${escHtml(config.title)}</title>
  <meta name="description" content="All posts on ${escAttr(config.title)}">
  <style>${css}</style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header>
    <nav><a href="/">${escHtml(config.title)}</a></nav>
    <h1>Archive</h1>
  </header>
  <main id="main">
    ${SEARCH_HTML}
${items}
  </main>
${SEARCH_SCRIPT}
</body>
</html>`;
}

function renderContentBody(content: ClassifiedContent): string {
  switch (content.type) {
    case "micro":
      return `<p>${escHtml(content.body)}</p>`;

    case "post":
      return `${content.title ? `<h1>${escHtml(content.title)}</h1>` : ""}
      <div>${escHtml(content.body)}</div>`;

    case "image":
      return `${content.images?.map((img) => `<img src="${escAttr(img.src)}" alt="${escAttr(img.alt)}" loading="lazy"${img.width ? ` width="${img.width}"` : ""}${img.height ? ` height="${img.height}"` : ""}>`).join("\n      ") ?? ""}
      <p>${escHtml(content.body)}</p>`;

    case "carousel":
      return `<div class="carousel" role="region" aria-label="Image gallery">
        ${content.images?.map((img) => `<img src="${escAttr(img.src)}" alt="${escAttr(img.alt)}" loading="lazy">`).join("\n        ") ?? ""}
      </div>
      <p>${escHtml(content.body)}</p>`;

    case "link":
      return `<a class="link-card" href="${escAttr(content.linkUrl ?? "")}" rel="noopener">
        <h3>${escHtml(content.linkTitle ?? content.linkUrl ?? "")}</h3>
        ${content.linkDescription ? `<p>${escHtml(content.linkDescription)}</p>` : ""}
      </a>
      <p>${escHtml(content.body)}</p>`;

    case "video":
      return `${content.media?.map((m) => `<video controls preload="metadata" playsinline>
        <source src="${escAttr(m.src)}" type="${escAttr(m.mimeType)}">
        Your browser does not support the video element.
      </video>`).join("\n      ") ?? ""}
      <p>${escHtml(content.body)}</p>`;

    case "audio":
      return `${content.media?.map((m) => `<audio controls preload="metadata">
        <source src="${escAttr(m.src)}" type="${escAttr(m.mimeType)}">
        Your browser does not support the audio element.
      </audio>`).join("\n      ") ?? ""}
      <p>${escHtml(content.body)}</p>`;
  }
}

function renderTags(tags: string[]): string {
  if (tags.length === 0) return "";
  return tags
    .map((t) => `<span class="tag">${escHtml(t)}</span>`)
    .join(" ");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  return s.slice(0, len - 1) + "\u2026";
}

export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s: string): string {
  return escHtml(s).replace(/'/g, "&#39;");
}
