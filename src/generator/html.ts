import type { ClassifiedContent, SiteConfig } from "../config/types.js";
import { resolveStyle, generateStylesheet } from "../styles/presets.js";

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

export function generateHtmlPage(
  content: ClassifiedContent,
  config: SiteConfig,
): string {
  const resolved = resolveStyle(config.style.preset, config.style.overrides);
  const css = generateStylesheet(resolved);
  const inner = renderContentBody(content);

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
  <style>${css}</style>
</head>
<body>
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

/** Generate the index page listing all posts */
export function generateIndexPage(
  posts: ClassifiedContent[],
  config: SiteConfig,
): string {
  const resolved = resolveStyle(config.style.preset, config.style.overrides);
  const css = generateStylesheet(resolved);

  const items = posts
    .map(
      (p) => `    <article>
      <h2><a href="/${escAttr(p.slug)}.html">${escHtml(p.title ?? truncate(p.body, 80))}</a></h2>
      <p>${escHtml(truncate(p.body, 200))}</p>
      <time datetime="${escAttr(p.createdAt)}">${formatDate(p.createdAt)}</time>
    </article>`,
    )
    .join("\n");

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
${items}
  </main>
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
