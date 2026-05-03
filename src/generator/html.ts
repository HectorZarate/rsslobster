import type { ClassifiedContent, SiteConfig } from "../config/types.js";
import { resolveStyle, generateStylesheet } from "../styles/presets.js";
import { SEARCH_HTML, SEARCH_SCRIPT, SEARCH_CSS } from "./search.js";
import { generateFaviconSvg, faviconLinkTags } from "./favicon.js";
import { renderNav, renderPageLinks } from "../pages/pages.js";
import type { PageInjections } from "../plugins/types.js";
import { renderMarkdown, renderInline } from "./markdown.js";
import { type Comment, renderCommentList, renderCommentForm, renderCommentsSection, commentStyles } from "ziscus";
import { commentPageUrl } from "./pagination.js";

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
  /** Comments to bake into the page */
  comments?: Comment[];
  /** URL for the comment submission endpoint */
  commentsSubmitUrl?: string;
  /** Previous post (newer) for navigation */
  prevPost?: { title: string; url: string };
  /** Next post (older) for navigation */
  nextPost?: { title: string; url: string };
  /** Comment pagination info (when comments span multiple pages) */
  commentPagination?: CommentPaginationInfo;
}

export interface CommentPaginationInfo {
  currentPage: number;
  totalPages: number;
  totalComments: number;
  baseUrl: string;
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

/** Site-level footer with copyright, RSS link, and powered-by */
export function renderSiteFooter(config: SiteConfig): string {
  const year = new Date().getFullYear();
  return `  <footer class="site-footer">
    <div class="site-footer-top">
      <span>© ${year} ${escHtml(config.domain)}</span>
      <a href="/feed.xml" aria-label="RSS Feed">${RSS_ICON} RSS</a>
    </div>
    <div class="site-footer-powered">
      Powered by <a href="https://github.com/HectorZarate/rsslobster">RSS Lobster</a> 🦞
    </div>
  </footer>`;
}

/** Generate Open Graph meta tags */
function generateOgTags(
  content: ClassifiedContent,
  config: SiteConfig,
  pageUrl?: string,
): string {
  const url = pageUrl ?? `https://${config.domain}/posts/${content.slug}/index.html`;
  const plain = stripMarkdown(content.body);
  const title = content.title ?? truncate(plain, 60);
  const description = truncate(plain, 200);
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
  const plain = stripMarkdown(content.body);

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: content.title ?? truncate(plain, 110),
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
    description: truncate(plain, 200),
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

  const ogTags = generateOgTags(content, config, options?.pageUrl);
  const jsonLd = generateJsonLd(content, config, options?.pageUrl);
  const pluginHead = options?.pluginInjections?.head ?? "";
  const extraHead = options?.extraHead ? `\n  ${options.extraHead}` : "";

  const bodyPrefix = options?.bodyPrefix ? `\n  ${options.bodyPrefix}` : "";
  const articleFooter = options?.pluginInjections?.articleFooter ?? "";
  const bodyEnd = options?.pluginInjections?.bodyEnd ?? "";

  const postUrl = options?.pageUrl ?? `https://${config.domain}/posts/${content.slug}/`;
  const cp = options?.commentPagination;
  const formRedirectUrl = cp
    ? `https://${config.domain}${cp.baseUrl}`
    : postUrl;
  const commentsHtml = options?.commentsSubmitUrl
    ? `\n      ${renderPaginatedComments(options.comments ?? [], content.slug, options.commentsSubmitUrl, formRedirectUrl, cp)}`
    : "";
  const commentsCss = options?.commentsSubmitUrl ? commentStyles() + (cp && cp.totalPages > 1 ? COMMENT_PAGINATION_CSS : "") : "";
  const postNav = renderPostNav(options?.prevPost, options?.nextPost);

  return `<!DOCTYPE html>
<html lang="${escHtml(config.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(content.title ?? truncate(stripMarkdown(content.body), 60))} — ${escHtml(config.title)}</title>
  <meta name="description" content="${escAttr(truncate(stripMarkdown(content.body), 160))}">
  <meta name="author" content="${escAttr(config.author)}">
  ${ogTags}
  ${jsonLd}
  ${favicon}
  <link rel="alternate" type="application/rss+xml" title="${escAttr(config.title)}" href="/feed.xml">
  <link rel="alternate" type="application/feed+json" title="${escAttr(config.title)}" href="/feed.json">${renderRelPrevNext(cp)}
  <style>${css}${commentsCss}</style>${pluginHead}${extraHead}
</head>
<body>${bodyPrefix}
  <a class="skip-link" href="#main">Skip to content</a>
  <header>
    <div class="header-top">
      ${nav}
      <a href="/feed.xml" class="header-rss" aria-label="RSS Feed">${RSS_ICON} RSS</a>
    </div>
  </header>
  <main id="main">
    <article>
      ${inner}
      <footer class="meta">
        <time datetime="${escAttr(content.createdAt)}">${formatDate(content.createdAt)}</time>
        ${renderTags(content.tags)}
      </footer>${articleFooter}${commentsHtml}
    </article>${postNav}
  </main>
${renderSiteFooter(config)}
${bodyEnd}
</body>
</html>`;
}

/** Maximum posts shown on the index page before linking to archive */
const INDEX_PAGE_LIMIT = 30;

/** Render a thumbnail for image/carousel posts on the index. */
function renderPostThumbnail(p: ClassifiedContent, url: string): string {
  if ((p.type !== "image" && p.type !== "carousel") || !p.images?.[0]) return "";
  const first = p.images[0];
  const dims = `${first.width ? ` width="${first.width}"` : ""}${first.height ? ` height="${first.height}"` : ""}`;
  return `      <a href="${escAttr(url)}" class="post-thumb" aria-hidden="true" tabindex="-1"><img src="${escAttr(first.src)}" alt="${escAttr(first.alt)}" loading="lazy"${dims}></a>\n`;
}

/** Render a list of post articles as HTML. */
function renderPostList(posts: ClassifiedContent[], permalink?: string): string {
  return posts
    .map((p) => {
      const url = resolvePostUrl(p, permalink);
      const thumb = renderPostThumbnail(p, url);
      if (p.title) {
        return `    <article>
${thumb}      <h2><a href="${escAttr(url)}">${escHtml(p.title)}</a></h2>
      <p>${renderInline(truncate(firstSentence(p.body), 200))}</p>
      <time datetime="${escAttr(p.createdAt)}">${formatDate(p.createdAt)}</time>
    </article>`;
      }
      // Micro post — no title, body is the content
      return `    <article>
${thumb}      <p><a href="${escAttr(url)}">${escHtml(p.body)}</a></p>
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
  const css = generateStylesheet(resolved, { hasPosts: posts.length > 0 });
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
    <div class="header-top">
      <h1>${escHtml(config.title)}</h1>
      <a href="/feed.xml" class="header-rss" aria-label="RSS Feed">${RSS_ICON} RSS</a>
    </div>${pageLinks}
    <p>${config.authorUrl && config.author && config.description.includes(config.author)
      ? config.description.replace(config.author, `<a href="${escAttr(config.authorUrl)}">${escHtml(config.author)}</a>`)
      : escHtml(config.description)}</p>
  </header>
  <main id="main">
    ${SEARCH_HTML}
${items}${archiveLink}
  </main>
${renderSiteFooter(config)}
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
  const css = generateStylesheet(resolved, { hasPosts: posts.length > 0 });
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
    <div class="header-top">
      ${nav}
      <a href="/feed.xml" class="header-rss" aria-label="RSS Feed">${RSS_ICON} RSS</a>
    </div>
    <h1>Archive</h1>
  </header>
  <main id="main">
    ${SEARCH_HTML}
${items}
  </main>
${renderSiteFooter(config)}
${SEARCH_SCRIPT}${bodyEnd}
</body>
</html>`;
}

/** Minimal feed info for blogroll rendering — avoids coupling to reader types */
export interface BlogrollEntry {
  title: string;
  feedUrl: string;
  siteUrl?: string;
  folder?: string;
}

/** Generate a blogroll / following page listing subscribed feeds */
export function generateBlogrollPage(
  entries: BlogrollEntry[],
  config: SiteConfig,
): string {
  const resolved = resolveStyle(config.style.preset, config.style.overrides);
  const css = generateStylesheet(resolved);
  const nav = renderNav(config);
  const favicon = faviconLinkTags(generateFaviconSvg(config.title, config.style.preset, config.style.overrides), config.style.preset, config.style.overrides);

  const folders = new Map<string, BlogrollEntry[]>();
  for (const entry of entries) {
    const key = entry.folder ?? "";
    const list = folders.get(key) ?? [];
    list.push(entry);
    folders.set(key, list);
  }

  function renderEntries(items: BlogrollEntry[]): string {
    return items
      .map((e) => {
        const href = e.siteUrl ?? e.feedUrl;
        const feedLink = `<a href="${escAttr(e.feedUrl)}" aria-label="RSS feed for ${escAttr(e.title)}">${RSS_ICON}</a>`;
        return `      <li><a href="${escAttr(href)}" rel="noopener">${escHtml(e.title)}</a> ${feedLink}</li>`;
      })
      .join("\n");
  }

  let content: string;
  const sortedKeys = [...folders.keys()].sort();
  if (sortedKeys.length === 1 && sortedKeys[0] === "") {
    content = `    <ul class="blogroll">\n${renderEntries(folders.get("")!)}\n    </ul>`;
  } else {
    content = sortedKeys
      .map((key) => {
        const heading = key ? `    <h2>${escHtml(key)}</h2>` : `    <h2>Uncategorized</h2>`;
        return `${heading}\n    <ul class="blogroll">\n${renderEntries(folders.get(key)!)}\n    </ul>`;
      })
      .join("\n");
  }

  return `<!DOCTYPE html>
<html lang="${escHtml(config.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Following — ${escHtml(config.title)}</title>
  <meta name="description" content="Feeds I follow — ${escAttr(config.title)}">
  ${favicon}
  <link rel="alternate" type="application/rss+xml" title="${escAttr(config.title)}" href="/feed.xml">
  <style>${css}</style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header>
    <div class="header-top">
      ${nav}
      <a href="/feed.xml" class="header-rss" aria-label="RSS Feed">${RSS_ICON} RSS</a>
    </div>
    <h1>Following</h1>
    <p>${entries.length} feed${entries.length === 1 ? "" : "s"} I read</p>
  </header>
  <main id="main">
${content}
  </main>
${renderSiteFooter(config)}
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

function renderPostNav(
  prev?: { title: string; url: string },
  next?: { title: string; url: string },
): string {
  if (!prev && !next) return "";
  const parts: string[] = [];
  if (prev) {
    parts.push(
      `<a href="${escAttr(prev.url)}" class="post-nav-prev">&larr; ${escHtml(stripMarkdown(prev.title))}</a>`,
    );
  }
  if (next) {
    parts.push(
      `<a href="${escAttr(next.url)}" class="post-nav-next">${escHtml(stripMarkdown(next.title))} &rarr;</a>`,
    );
  }
  return `
    <nav class="post-nav" aria-label="Post navigation">
      ${parts.join("\n      ")}
    </nav>`;
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

/**
 * Extract the first sentence of a markdown body, for use as an index preview.
 * Takes the first non-blank paragraph (so tables, code blocks, and lists in
 * later paragraphs are ignored), strips markdown, and returns text up to the
 * first sentence-ending punctuation. Falls back to the full first paragraph
 * when no terminator is found.
 */
function firstSentence(body: string): string {
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const first = paragraphs[0];
  if (!first) return "";
  const stripped = stripMarkdown(first);
  const match = stripped.match(/^.*?[.!?](?=\s|$)/);
  return match ? match[0] : stripped;
}

/** Strip markdown formatting for use in plain-text contexts like meta tags. */
function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")   // bold
    .replace(/\*(.+?)\*/g, "$1")        // italic
    .replace(/__(.+?)__/g, "$1")        // bold alt
    .replace(/_(.+?)_/g, "$1")          // italic alt
    .replace(/`(.+?)`/g, "$1")          // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/^#{1,6}\s+/gm, "")        // headings
    .replace(/^[-*]\s+/gm, "")          // list items
    .replace(/\n{2,}/g, " ")            // collapse newlines
    .replace(/\n/g, " ")
    .trim();
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

function renderPaginatedComments(
  comments: Comment[],
  slug: string,
  submitUrl: string,
  redirectUrl: string,
  pagination?: CommentPaginationInfo,
): string {
  if (!pagination || pagination.totalPages <= 1) {
    return renderCommentsSection(comments, slug, submitUrl, { redirectUrl });
  }
  let list = renderCommentList(comments);
  list = list.replace(
    /<h2>.*?<\/h2>/,
    `<h2>${pagination.totalComments.toLocaleString()} Comments \u2014 Page ${pagination.currentPage} of ${pagination.totalPages}</h2>`,
  );
  const nav = renderCommentPaginationNav(pagination);
  const form = renderCommentForm(slug, submitUrl, { redirectUrl });
  return `${list}\n      ${nav}\n    ${form}`;
}

function renderCommentPaginationNav(info: CommentPaginationInfo): string {
  if (info.totalPages <= 1) return "";
  const parts: string[] = [];
  if (info.currentPage > 1) {
    const prevUrl = commentPageUrl(info.baseUrl, info.currentPage - 1);
    parts.push(`<a href="${escAttr(prevUrl)}">\u2190 Previous</a>`);
  }
  parts.push(`<span aria-current="page">Page ${info.currentPage} of ${info.totalPages}</span>`);
  if (info.currentPage < info.totalPages) {
    const nextUrl = commentPageUrl(info.baseUrl, info.currentPage + 1);
    parts.push(`<a href="${escAttr(nextUrl)}">Next \u2192</a>`);
  }
  return `<nav class="comment-pagination" aria-label="Comment pages">${parts.join(" ")}</nav>`;
}

function renderRelPrevNext(cp?: CommentPaginationInfo): string {
  if (!cp || cp.totalPages <= 1) return "";
  const links: string[] = [];
  if (cp.currentPage > 1) {
    links.push(`\n  <link rel="prev" href="${escAttr(commentPageUrl(cp.baseUrl, cp.currentPage - 1))}">`);
  }
  if (cp.currentPage < cp.totalPages) {
    links.push(`\n  <link rel="next" href="${escAttr(commentPageUrl(cp.baseUrl, cp.currentPage + 1))}">`);
  }
  return links.join("");
}

const COMMENT_PAGINATION_CSS = `
.comment-pagination { display: flex; gap: 1rem; align-items: center; margin: 1.5rem 0; padding: 0.75rem 0; border-top: 1px solid var(--color-border, #e0e0e0); }
.comment-pagination [aria-current="page"] { font-weight: bold; }
`;
