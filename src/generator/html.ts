import type { ClassifiedContent, SiteConfig } from "../config/types.js";
import { resolveStyle, generateStylesheet } from "../styles/presets.js";
import { SEARCH_HTML, SEARCH_SCRIPT, SEARCH_CSS } from "./search.js";
import { generateFaviconSvg, faviconLinkTags } from "./favicon.js";
import { renderNav, renderPageLinks } from "../pages/pages.js";
import type { PageInjections } from "../plugins/types.js";
import { renderMarkdown, renderInline } from "./markdown.js";

/**
 * Generate an HTML page from classified content.
 *
 * UX standards:
 * - Semantic HTML5 (article, time, nav, header, main)
 * - Accessible: skip-link, lang attribute, alt text, ARIA where needed
 * - Mobile-first: viewport meta, responsive images, touch targets
 * - Performance: inline critical CSS, no external font requests
 * - Progressive: works without JavaScript entirely
 * - SEO: Open Graph, JSON-LD Article schema, semantic structure
 */

/** Options for injecting extra content into generated HTML pages. */
export interface HtmlPageOptions {
  /** Extra HTML to inject into <head> (after <style>) */
  extraHead?: string;
  /** HTML to inject at start of <body>, before skip-link */
  bodyPrefix?: string;
  /** Plugin-contributed injections */
  pluginInjections?: PageInjections;
  /** Override the URL for this page (used with permalink patterns) */
  pageUrl?: string;
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

/** Inline SVG RSS icon — standard broadcast symbol, no external requests */
const RSS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="6.18" cy="17.82" r="2.18"/><path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56z"/><path d="M4 10.1v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9z"/></svg>`;

/** Site-level footer with RSS link */
function renderSiteFooter(): string {
  return `  <footer class="site-footer">
    <a href="/feed.xml" aria-label="RSS Feed">${RSS_ICON} RSS</a>
  </footer>`;
}

/** Generate Open Graph meta tags */
function generateOgTags(
  content: ClassifiedContent,
  config: SiteConfig,
  pageUrl?: string,
): string {
  const url = pageUrl ?? `https://${config.domain}/posts/${content.slug}/index.html`;
  const title = content.title ?? truncate(content.body, 60);
  const description = truncate(content.body, 200);
  const ogType = content.type === "post" ? "article" : "website";

  const tags = [
    `<meta property="og:type" content="${escAttr(ogType)}">`,
    `<meta property="og:title" content="${escAttr(title)}">`,
    `<meta property="og:description" content="${escAttr(description)}">`,
    `<meta property="og:url" content="${escAttr(url)}">`,
    `<meta property="og:site_name" content="${escAttr(config.title)}">`,
    `<meta property="og:locale" content="${escAttr(config.language)}">`,
  ];

  // Twitter/X card
  tags.push(`<meta name="twitter:card" content="summary">`);
  tags.push(`<meta name="twitter:title" content="${escAttr(title)}">`);
  tags.push(`<meta name="twitter:description" content="${escAttr(description)}">`);

  // Image for OG (first image if available)
  if (content.images?.[0]) {
    const imgUrl = `https://${config.domain}${content.images[0].src}`;
    tags.push(`<meta property="og:image" content="${escAttr(imgUrl)}">`);
    tags.push(`<meta name="twitter:card" content="summary_large_image">`);
    if (content.images[0].alt) {
      tags.push(`<meta property="og:image:alt" content="${escAttr(content.images[0].alt)}">`);
    }
  }

  return tags.join("\n  ");
}

/** Generate JSON-LD structured data for a post */
function generateJsonLd(
  content: ClassifiedContent,
  config: SiteConfig,
  pageUrl?: string,
): string {
  const url = pageUrl ?? `https://${config.domain}/posts/${content.slug}/index.html`;

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: content.title ?? truncate(content.body, 110),
    url,
    datePublished: content.createdAt,
    dateModified: content.updatedAt,
    author: {
      "@type": "Person",
      name: config.author,
    },
    publisher: {
      "@type": "Person",
      name: config.author,
    },
    description: truncate(content.body, 200),
    inLanguage: config.language,
  };

  if (content.images?.[0]) {
    ld["image"] = `https://${config.domain}${content.images[0].src}`;
  }

  if (content.tags.length > 0) {
    ld["keywords"] = content.tags.join(", ");
  }

  // Escape < as \u003c in JSON-LD to prevent XSS breakout from script context
  const jsonStr = JSON.stringify(ld).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${jsonStr}</script>`;
}

export function generateHtmlPage(
  content: ClassifiedContent,
  config: SiteConfig,
  options?: HtmlPageOptions,
): string {
  const resolved = resolveStyle(config.style.preset, config.style.overrides);
  const css = generateStylesheet(resolved);
  const inner = renderContentBody(content);
  const nav = renderNav(config);
  const favicon = faviconLinkTags(generateFaviconSvg(config.title, config.style.preset, config.style.overrides), config.style.preset, config.style.overrides);

  // Combine all head injections
  const ogTags = generateOgTags(content, config, options?.pageUrl);
  const jsonLd = generateJsonLd(content, config, options?.pageUrl);
  const pluginHead = options?.pluginInjections?.head ?? "";
  const extraHead = options?.extraHead ? `\n  ${options.extraHead}` : "";

  const bodyPrefix = options?.bodyPrefix ? `\n  ${options.bodyPrefix}` : "";
  const articleFooter = options?.pluginInjections?.articleFooter ?? "";
  const bodyEnd = options?.pluginInjections?.bodyEnd ?? "";

  return `<!DOCTYPE html>
<html lang="${escHtml(config.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(content.title ?? truncate(content.body, 60))} — ${escHtml(config.title)}</title>
  <meta name="description" content="${escAttr(truncate(content.body, 160))}">
  <meta name="author" content="${escAttr(config.author)}">
  ${ogTags}
  ${jsonLd}
  ${favicon}
  <link rel="alternate" type="application/rss+xml" title="${escAttr(config.title)}" href="/feed.xml">
  <link rel="alternate" type="application/feed+json" title="${escAttr(config.title)}" href="/feed.json">
  <style>${css}</style>${pluginHead}${extraHead}
</head>
<body>${bodyPrefix}
  <a class="skip-link" href="#main">Skip to content</a>
  <header>
    ${nav}
  </header>
  <main id="main">
    <article>
      ${inner}
      <footer class="meta">
        <time datetime="${escAttr(content.createdAt)}">${formatDate(content.createdAt)}</time>
        ${renderTags(content.tags)}
      </footer>${articleFooter}
    </article>
  </main>
${renderSiteFooter()}
${bodyEnd}
</body>
</html>`;
}

/** Maximum posts shown on the index page before linking to archive */
const INDEX_PAGE_LIMIT = 30;

/** Render a list of post articles as HTML. */
function renderPostList(posts: ClassifiedContent[], permalink?: string): string {
  return posts
    .map((p) => {
      const url = resolvePostUrl(p, permalink);
      return `    <article>
      <h2><a href="${escAttr(url)}">${escHtml(p.title ?? truncate(p.body, 80))}</a></h2>
      <p>${escHtml(truncate(p.body, 200))}</p>
      <time datetime="${escAttr(p.createdAt)}">${formatDate(p.createdAt)}</time>
    </article>`;
    })
    .join("\n");
}

/** Resolve the relative URL for a post based on permalink pattern */
function resolvePostUrl(content: ClassifiedContent, permalink?: string): string {
  if (!permalink) return `/posts/${content.slug}/index.html`;
  const d = new Date(content.createdAt);
  const year = String(d.getFullYear());
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return permalink
    .replace(/:slug/g, content.slug)
    .replace(/:year/g, year)
    .replace(/:month/g, month)
    .replace(/:day/g, day)
    .replace(/:type/g, content.type);
}

/** Generate the index page listing recent posts */
export function generateIndexPage(
  posts: ClassifiedContent[],
  config: SiteConfig,
  injections?: PageInjections,
): string {
  const resolved = resolveStyle(config.style.preset, config.style.overrides);
  const css = generateStylesheet(resolved);
  const pageLinksHtml = renderPageLinks(config);
  const pageLinks = pageLinksHtml ? `\n    ${pageLinksHtml}` : "";

  const recentPosts = posts.slice(0, INDEX_PAGE_LIMIT);
  const hasArchive = posts.length > INDEX_PAGE_LIMIT;
  const items = renderPostList(recentPosts, config.permalink);
  const archiveLink = hasArchive
    ? `\n    <nav class="pagination"><a href="/archive.html">Older posts (${posts.length - INDEX_PAGE_LIMIT} more)</a></nav>`
    : "";

  const ogImageUrl = `https://${config.domain}/og-image.png`;
  const ogTags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escAttr(config.title)}">`,
    `<meta property="og:description" content="${escAttr(config.description)}">`,
    `<meta property="og:url" content="https://${escAttr(config.domain)}/">`,
    `<meta property="og:site_name" content="${escAttr(config.title)}">`,
    `<meta property="og:locale" content="${escAttr(config.language)}">`,
    `<meta property="og:image" content="${escAttr(ogImageUrl)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escAttr(config.title)}">`,
    `<meta name="twitter:description" content="${escAttr(config.description)}">`,
    `<meta name="twitter:image" content="${escAttr(ogImageUrl)}">`,
  ].join("\n  ");

  const pluginHead = injections?.head ?? "";
  const bodyEnd = injections?.bodyEnd ?? "";
  const favicon = faviconLinkTags(generateFaviconSvg(config.title, config.style.preset, config.style.overrides), config.style.preset, config.style.overrides);

  return `<!DOCTYPE html>
<html lang="${escHtml(config.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(config.title)}</title>
  <meta name="description" content="${escAttr(config.description)}">
  ${favicon}
  ${ogTags}
  <link rel="alternate" type="application/rss+xml" title="${escAttr(config.title)}" href="/feed.xml">
  <link rel="alternate" type="application/feed+json" title="${escAttr(config.title)}" href="/feed.json">
  <style>${css}${SEARCH_CSS}</style>${pluginHead}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header>
    <h1>${escHtml(config.title)}</h1>${pageLinks}
    <p>${escHtml(config.description)}</p>
  </header>
  <main id="main">
    ${SEARCH_HTML}
${items}${archiveLink}
  </main>
${renderSiteFooter()}
${SEARCH_SCRIPT}${bodyEnd}
</body>
</html>`;
}

/** Generate the archive page listing ALL posts */
export function generateArchivePage(
  posts: ClassifiedContent[],
  config: SiteConfig,
  injections?: PageInjections,
): string {
  const resolved = resolveStyle(config.style.preset, config.style.overrides);
  const css = generateStylesheet(resolved);
  const nav = renderNav(config);
  const items = renderPostList(posts, config.permalink);
  const pluginHead = injections?.head ?? "";
  const bodyEnd = injections?.bodyEnd ?? "";
  const favicon = faviconLinkTags(generateFaviconSvg(config.title, config.style.preset, config.style.overrides), config.style.preset, config.style.overrides);

  return `<!DOCTYPE html>
<html lang="${escHtml(config.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Archive — ${escHtml(config.title)}</title>
  <meta name="description" content="All posts on ${escAttr(config.title)}">
  ${favicon}
  <style>${css}${SEARCH_CSS}</style>${pluginHead}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header>
    ${nav}
    <h1>Archive</h1>
  </header>
  <main id="main">
    ${SEARCH_HTML}
${items}
  </main>
${renderSiteFooter()}
${SEARCH_SCRIPT}${bodyEnd}
</body>
</html>`;
}

function renderContentBody(content: ClassifiedContent): string {
  switch (content.type) {
    case "micro":
      return renderMarkdown(content.body);

    case "post":
      return `${content.title ? `<h1>${escHtml(content.title)}</h1>` : ""}
      <div>${renderMarkdown(content.body, !!content.title)}</div>`;

    case "image":
      return `${content.images?.map((img) => `<img src="${escAttr(img.src)}" alt="${escAttr(img.alt)}" loading="lazy"${img.width ? ` width="${img.width}"` : ""}${img.height ? ` height="${img.height}"` : ""}>`).join("\n      ") ?? ""}
      <p>${renderInline(content.body)}</p>`;

    case "carousel":
      return `<div class="carousel" role="region" aria-label="Image gallery">
        ${content.images?.map((img) => `<img src="${escAttr(img.src)}" alt="${escAttr(img.alt)}" loading="lazy">`).join("\n        ") ?? ""}
      </div>
      <p>${renderInline(content.body)}</p>`;

    case "link":
      return `<a class="link-card" href="${escAttr(content.linkUrl ?? "")}" rel="noopener">
        <h3>${escHtml(content.linkTitle ?? content.linkUrl ?? "")}</h3>
        ${content.linkDescription ? `<p>${escHtml(content.linkDescription)}</p>` : ""}
      </a>
      <p>${renderInline(content.body)}</p>`;

    case "video":
      return `${content.media?.map((m) => `<video controls preload="metadata" playsinline>
        <source src="${escAttr(m.src)}" type="${escAttr(m.mimeType)}">
        Your browser does not support the video element.
      </video>`).join("\n      ") ?? ""}
      <p>${renderInline(content.body)}</p>`;

    case "audio":
      return `${content.media?.map((m) => `<audio controls preload="metadata">
        <source src="${escAttr(m.src)}" type="${escAttr(m.mimeType)}">
        Your browser does not support the audio element.
      </audio>`).join("\n      ") ?? ""}
      <p>${renderInline(content.body)}</p>`;
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
