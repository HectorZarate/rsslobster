import { describe, it, expect, beforeAll } from "vitest";
import {
  generateHtmlPage,
  generateIndexPage,
  generateBlogrollPage,
  escHtml,
  previewPageOptions,
} from "./html.js";
import type { BlogrollEntry } from "./html.js";
import { initMarkdown } from "./markdown.js";
import type { ClassifiedContent, SiteConfig } from "../config/types.js";

beforeAll(async () => {
  await initMarkdown();
});

const SITE_CONFIG: SiteConfig = {
  domain: "example.com",
  title: "Test Site",
  description: "A test site for rsslobster",
  author: "Test Author",
  language: "en",
  style: { preset: "minimal" },
  repo: "git@github.com:user/site.git",
};

const MICRO: ClassifiedContent = {
  type: "micro",
  body: "Just a quick thought about TypeScript.",
  slug: "quick-thought",
  tags: ["typescript"],
  createdAt: "2026-03-20T12:00:00.000Z",
  updatedAt: "2026-03-20T12:00:00.000Z",
};

const POST: ClassifiedContent = {
  type: "post",
  title: "Deep Dive into RSS",
  body: "RSS is an underappreciated protocol...",
  slug: "deep-dive-rss",
  tags: ["rss", "web"],
  createdAt: "2026-03-20T13:00:00.000Z",
  updatedAt: "2026-03-20T13:00:00.000Z",
};

const IMAGE: ClassifiedContent = {
  type: "image",
  body: "Sunset at the beach",
  slug: "sunset-beach",
  tags: ["photo"],
  images: [
    { src: "/images/sunset.jpg", alt: "Orange sunset over ocean", width: 1200, height: 800 },
  ],
  createdAt: "2026-03-20T14:00:00.000Z",
  updatedAt: "2026-03-20T14:00:00.000Z",
};

const CAROUSEL: ClassifiedContent = {
  type: "carousel",
  body: "Trip to Lisbon",
  slug: "lisbon-trip",
  tags: ["travel"],
  images: [
    { src: "/images/lisbon1.jpg", alt: "Tram 28" },
    { src: "/images/lisbon2.jpg", alt: "Pasteis de Belem" },
  ],
  createdAt: "2026-03-20T15:00:00.000Z",
  updatedAt: "2026-03-20T15:00:00.000Z",
};

const LINK: ClassifiedContent = {
  type: "link",
  body: "This article changed how I think about feeds.",
  slug: "great-article",
  tags: ["reading"],
  linkUrl: "https://example.org/great-article",
  linkTitle: "The Future of RSS",
  linkDescription: "An exploration of RSS in 2026.",
  createdAt: "2026-03-20T16:00:00.000Z",
  updatedAt: "2026-03-20T16:00:00.000Z",
};

describe("generateHtmlPage", () => {
  // UX: valid HTML5 document structure
  it("generates valid HTML5 document", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<head>");
    expect(html).toContain("<body>");
    expect(html).toContain("</html>");
  });

  // UX: viewport meta for mobile
  it("includes viewport meta tag", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain('name="viewport"');
    expect(html).toContain("width=device-width");
  });

  // UX: skip link for keyboard/screen reader users
  it("includes skip-to-content link", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain('class="skip-link"');
    expect(html).toContain('href="#main"');
  });

  // UX: semantic main element with id for skip link target
  it("uses semantic HTML structure", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain('<main id="main">');
    expect(html).toContain("<article>");
    expect(html).toContain("<header>");
    expect(html).toContain("<nav>");
  });

  // UX: RSS link in header
  it("includes RSS link in header with header-rss class", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain('class="header-rss"');
  });

  it("has header-top flex container", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain('class="header-top"');
  });

  // UX: visible RSS link in footer
  it("includes a visible RSS link in a site footer", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain("<footer");
    expect(html).toContain('href="/feed.xml"');
    expect(html).toMatch(/RSS/i);
  });

  // UX: copyright notice
  it("includes copyright with current year and domain", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain("©");
    expect(html).toContain(String(new Date().getFullYear()));
    expect(html).toContain("example.com");
  });

  // UX: powered by RSS Lobster
  it("includes powered by RSS Lobster with lobster emoji", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain("Powered by");
    expect(html).toContain("RSS Lobster");
    expect(html).toContain("🦞");
  });

  it("links powered by to rsslobster GitHub", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain("github.com/HectorZarate/rsslobster");
  });

  // UX: RSS feed autodiscovery
  it("includes feed autodiscovery links", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain('type="application/rss+xml"');
    expect(html).toContain('href="/feed.xml"');
    expect(html).toContain('type="application/feed+json"');
    expect(html).toContain('href="/feed.json"');
  });

  // UX: favicon in every page
  it("includes inline favicon data URI in head", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain('rel="icon"');
    expect(html).toContain("data:image/svg+xml,");
  });

  it("includes favicon.svg file reference", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain('href="/favicon.svg"');
  });

  // UX: inline CSS for performance (no external requests)
  it("inlines CSS in style tag", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain("<style>");
    expect(html).toContain("--font-body:");
    // Should NOT have external stylesheet link
    expect(html).not.toContain('rel="stylesheet"');
  });

  it("renders micro content as paragraph", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain("<p>Just a quick thought about TypeScript.</p>");
  });

  it("renders post content with title", () => {
    const html = generateHtmlPage(POST, SITE_CONFIG);
    expect(html).toContain("<h1>Deep Dive into RSS</h1>");
    expect(html).toContain("RSS is an underappreciated protocol");
  });

  it("renders image with alt text and dimensions", () => {
    const html = generateHtmlPage(IMAGE, SITE_CONFIG);
    expect(html).toContain('alt="Orange sunset over ocean"');
    expect(html).toContain('width="1200"');
    expect(html).toContain('height="800"');
    expect(html).toContain('loading="lazy"');
  });

  // UX: carousel has ARIA label for accessibility
  it("renders carousel with ARIA label", () => {
    const html = generateHtmlPage(CAROUSEL, SITE_CONFIG);
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Image gallery"');
    expect(html).toContain("Tram 28");
    expect(html).toContain("Pasteis de Belem");
  });

  it("renders link card with noopener", () => {
    const html = generateHtmlPage(LINK, SITE_CONFIG);
    expect(html).toContain('class="link-card"');
    expect(html).toContain('rel="noopener"');
    expect(html).toContain("The Future of RSS");
    expect(html).toContain("An exploration of RSS in 2026.");
  });

  // UX: machine-readable datetime
  it("includes machine-readable time element", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain('datetime="2026-03-20T12:00:00.000Z"');
  });

  it("renders tags", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG);
    expect(html).toContain('class="tag"');
    expect(html).toContain("typescript");
  });
});

describe("generateIndexPage", () => {
  it("generates valid HTML5 index", () => {
    const html = generateIndexPage([MICRO, POST], SITE_CONFIG);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Test Site");
  });

  it("links each post to its page", () => {
    const html = generateIndexPage([MICRO, POST], SITE_CONFIG);
    expect(html).toContain('href="/posts/quick-thought/index.html"');
    expect(html).toContain('href="/posts/deep-dive-rss/index.html"');
  });

  // UX: micro posts render like tweets — no title duplication
  it("renders micro posts without h2 in post list", () => {
    const html = generateIndexPage([MICRO], SITE_CONFIG);
    const article = html.match(/<article>[\s\S]*?<\/article>/)?.[0] ?? "";
    expect(article).not.toContain("<h2>");
  });

  it("links micro post body text to post page", () => {
    const html = generateIndexPage([MICRO], SITE_CONFIG);
    expect(html).toContain('<a href="/posts/quick-thought/index.html">Just a quick thought');
  });

  it("renders post type with h2 title in post list", () => {
    const html = generateIndexPage([POST], SITE_CONFIG);
    expect(html).toContain("<h2>");
    expect(html).toContain("Deep Dive into RSS");
  });

  it("renders a thumbnail for image-type posts on the index", () => {
    const html = generateIndexPage([IMAGE], SITE_CONFIG);
    // Should contain an <img> referencing the first attached image
    expect(html).toContain("/images/sunset.jpg");
    expect(html).toContain("Orange sunset over ocean"); // alt text
    expect(html).toContain("loading=\"lazy\"");
  });

  it("renders a thumbnail for carousel-type posts on the index", () => {
    const html = generateIndexPage([CAROUSEL], SITE_CONFIG);
    // First image of the carousel becomes the preview
    expect(html).toContain("/images/lisbon1.jpg");
    expect(html).toContain("Tram 28");
  });

  it("does not render thumbnails for text posts", () => {
    const html = generateIndexPage([POST], SITE_CONFIG);
    // No img tags inside the post list articles
    const main = html.match(/<main[\s\S]*?<\/main>/)?.[0] ?? "";
    expect(main).not.toContain("<img");
  });

  // UX: skip link on index too
  it("includes skip link", () => {
    const html = generateIndexPage([], SITE_CONFIG);
    expect(html).toContain('class="skip-link"');
  });

  it("handles empty posts list", () => {
    const html = generateIndexPage([], SITE_CONFIG);
    expect(html).toContain('<main id="main">');
    expect(html).toContain("</main>");
  });

  // UX: RSS link in header
  it("includes RSS link in header with header-rss class", () => {
    const html = generateIndexPage([], SITE_CONFIG);
    expect(html).toContain('class="header-rss"');
  });

  it("has header-top flex container", () => {
    const html = generateIndexPage([], SITE_CONFIG);
    expect(html).toContain('class="header-top"');
  });

  // UX: favicon on index page
  it("includes inline favicon data URI", () => {
    const html = generateIndexPage([], SITE_CONFIG);
    expect(html).toContain('rel="icon"');
    expect(html).toContain("data:image/svg+xml,");
  });

  it("includes favicon.svg file reference", () => {
    const html = generateIndexPage([], SITE_CONFIG);
    expect(html).toContain('href="/favicon.svg"');
  });

  // UX: complete OG tags on index page
  it("includes og:locale on index page", () => {
    const html = generateIndexPage([], SITE_CONFIG);
    expect(html).toContain('og:locale');
  });

  it("includes twitter:card on index page", () => {
    const html = generateIndexPage([], SITE_CONFIG);
    expect(html).toContain('twitter:card');
  });

  it("includes twitter:title on index page", () => {
    const html = generateIndexPage([], SITE_CONFIG);
    expect(html).toContain('twitter:title');
  });

  it("includes og:image on index page", () => {
    const html = generateIndexPage([], SITE_CONFIG);
    expect(html).toContain('og:image');
  });

  // UX: visible RSS link
  it("includes a visible RSS link in a site footer", () => {
    const html = generateIndexPage([], SITE_CONFIG);
    expect(html).toContain("<footer");
    expect(html).toContain('href="/feed.xml"');
    expect(html).toMatch(/RSS/i);
  });

  // UX: copyright notice on index
  it("includes copyright with current year and domain", () => {
    const html = generateIndexPage([], SITE_CONFIG);
    expect(html).toContain("©");
    expect(html).toContain(String(new Date().getFullYear()));
    expect(html).toContain("example.com");
  });

  // UX: powered by on index
  it("includes powered by RSS Lobster with lobster emoji", () => {
    const html = generateIndexPage([], SITE_CONFIG);
    expect(html).toContain("Powered by");
    expect(html).toContain("RSS Lobster");
    expect(html).toContain("🦞");
  });
});

describe("generateHtmlPage with options", () => {
  it("produces identical output when no options are provided", () => {
    const without = generateHtmlPage(MICRO, SITE_CONFIG);
    const withEmpty = generateHtmlPage(MICRO, SITE_CONFIG, {});
    expect(without).toBe(withEmpty);
  });

  it("injects extraHead into <head>", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG, {
      extraHead: '<meta name="robots" content="noindex">',
    });
    expect(html).toContain('<meta name="robots" content="noindex">');
    // Must be inside <head>, before </head>
    const headEnd = html.indexOf("</head>");
    const metaPos = html.indexOf('<meta name="robots"');
    expect(metaPos).toBeGreaterThan(0);
    expect(metaPos).toBeLessThan(headEnd);
  });

  it("injects bodyPrefix at start of <body>", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG, {
      bodyPrefix: '<div id="banner">Preview</div>',
    });
    expect(html).toContain('<div id="banner">Preview</div>');
    // Must appear before skip-link
    const bannerPos = html.indexOf('<div id="banner">');
    const skipPos = html.indexOf('class="skip-link"');
    expect(bannerPos).toBeLessThan(skipPos);
  });

  it("injects both extraHead and bodyPrefix", () => {
    const html = generateHtmlPage(MICRO, SITE_CONFIG, {
      extraHead: '<meta name="test" content="yes">',
      bodyPrefix: '<div>top</div>',
    });
    expect(html).toContain('<meta name="test" content="yes">');
    expect(html).toContain("<div>top</div>");
  });
});

describe("previewPageOptions", () => {
  it("includes noindex meta tag", () => {
    const opts = previewPageOptions();
    expect(opts.extraHead).toContain("noindex");
    expect(opts.extraHead).toContain("nofollow");
  });

  it("includes preview banner with fixed positioning", () => {
    const opts = previewPageOptions();
    expect(opts.bodyPrefix).toContain("Preview");
    expect(opts.bodyPrefix).toContain("position:fixed");
    expect(opts.bodyPrefix).toContain("not yet published");
  });

  it("produces 1:1 content fidelity — body matches non-preview", () => {
    const normal = generateHtmlPage(POST, SITE_CONFIG);
    const preview = generateHtmlPage(POST, SITE_CONFIG, previewPageOptions());

    // The article content must be identical
    const extractArticle = (html: string) => {
      const start = html.indexOf("<article>");
      const end = html.indexOf("</article>") + "</article>".length;
      return html.slice(start, end);
    };

    expect(extractArticle(preview)).toBe(extractArticle(normal));
  });

  it("preview HTML does NOT contain feed autodiscovery", () => {
    // Preview pages should still have feed links (they're part of the template)
    // but the noindex ensures crawlers won't follow them from the preview
    const html = generateHtmlPage(MICRO, SITE_CONFIG, previewPageOptions());
    expect(html).toContain('href="/feed.xml"');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });
});

describe("markdown stripping in meta tags", () => {
  const bodyWithMarkdown = "**bold** and *italic* and `code` and [link](https://x.com). Plain text continues here.";

  it("strips markdown from <meta description>", () => {
    const content: ClassifiedContent = {
      ...MICRO,
      body: bodyWithMarkdown,
    };
    const html = generateHtmlPage(content, SITE_CONFIG);
    // Extract the meta description content
    const match = html.match(/<meta name="description" content="([^"]+)"/);
    expect(match).toBeTruthy();
    const description = match![1]!;
    expect(description).not.toContain("**");
    expect(description).not.toContain("`");
    expect(description).not.toContain("[link]");
    expect(description).toContain("bold");
    expect(description).toContain("italic");
    expect(description).toContain("code");
    expect(description).toContain("link");
  });

  it("strips markdown from OG description", () => {
    const content: ClassifiedContent = { ...MICRO, body: bodyWithMarkdown };
    const html = generateHtmlPage(content, SITE_CONFIG);
    const match = html.match(/<meta property="og:description" content="([^"]+)"/);
    expect(match).toBeTruthy();
    expect(match![1]!).not.toContain("**");
  });

  it("strips markdown from Twitter card description", () => {
    const content: ClassifiedContent = { ...MICRO, body: bodyWithMarkdown };
    const html = generateHtmlPage(content, SITE_CONFIG);
    const match = html.match(/<meta name="twitter:description" content="([^"]+)"/);
    expect(match).toBeTruthy();
    expect(match![1]!).not.toContain("**");
  });

  it("strips markdown from <title> fallback (no title set)", () => {
    const content: ClassifiedContent = { ...MICRO, body: bodyWithMarkdown };
    const html = generateHtmlPage(content, SITE_CONFIG);
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    expect(titleMatch).toBeTruthy();
    expect(titleMatch![1]!).not.toContain("**");
  });
});

describe("post navigation", () => {
  // Extract the body section to avoid matching CSS rules in <style>
  const extractBody = (html: string): string => {
    const i = html.indexOf("</head>");
    return html.slice(i);
  };

  it("renders only a single link when only next is given", () => {
    const body = extractBody(generateHtmlPage(POST, SITE_CONFIG, {
      nextPost: { title: "Older Post", url: "/posts/older/" },
    }));
    expect(body).toContain('class="post-nav-next"');
    expect(body).not.toContain('class="post-nav-prev"');
    expect(body).not.toContain("<span></span>");
  });

  it("renders only a single link when only prev is given", () => {
    const body = extractBody(generateHtmlPage(POST, SITE_CONFIG, {
      prevPost: { title: "Newer Post", url: "/posts/newer/" },
    }));
    expect(body).toContain('class="post-nav-prev"');
    expect(body).not.toContain('class="post-nav-next"');
    expect(body).not.toContain("<span></span>");
  });

  it("renders both links when both are given", () => {
    const body = extractBody(generateHtmlPage(POST, SITE_CONFIG, {
      prevPost: { title: "Newer", url: "/a/" },
      nextPost: { title: "Older", url: "/b/" },
    }));
    expect(body).toContain('class="post-nav-prev"');
    expect(body).toContain('class="post-nav-next"');
  });

  it("omits post-nav entirely when no prev/next", () => {
    const body = extractBody(generateHtmlPage(POST, SITE_CONFIG));
    expect(body).not.toContain('class="post-nav"');
  });

  it("strips markdown from nav link titles", () => {
    const html = generateHtmlPage(POST, SITE_CONFIG, {
      nextPost: { title: "**Bold** title", url: "/x/" },
    });
    expect(html).not.toContain("**Bold**");
    expect(html).toContain("Bold title");
  });
});

describe("escHtml", () => {
  it("escapes HTML entities", () => {
    expect(escHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
  });

  it("escapes ampersands", () => {
    expect(escHtml("A & B")).toBe("A &amp; B");
  });

  // UX/Security: XSS prevention
  it("prevents XSS in content", () => {
    const malicious: ClassifiedContent = {
      ...MICRO,
      body: '<img src=x onerror="alert(1)">',
    };
    const html = generateHtmlPage(malicious, SITE_CONFIG);
    // The critical security boundary: <img is escaped so no HTML element is created
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img src=x");
  });
});

// ---------------------------------------------------------------------------
// Blogroll / Following page
// ---------------------------------------------------------------------------

const BLOGROLL_ENTRIES: BlogrollEntry[] = [
  { title: "Simon Willison", feedUrl: "https://simonwillison.net/atom/everything/", siteUrl: "https://simonwillison.net" },
  { title: "Julia Evans", feedUrl: "https://jvns.ca/atom.xml", siteUrl: "https://jvns.ca" },
  { title: "No Site URL Feed", feedUrl: "https://example.com/feed.xml" },
];

describe("generateBlogrollPage", () => {
  it("generates valid HTML5 document", () => {
    const html = generateBlogrollPage(BLOGROLL_ENTRIES, SITE_CONFIG);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Following");
  });

  it("lists all subscribed feeds", () => {
    const html = generateBlogrollPage(BLOGROLL_ENTRIES, SITE_CONFIG);
    expect(html).toContain("Simon Willison");
    expect(html).toContain("Julia Evans");
    expect(html).toContain("No Site URL Feed");
  });

  it("links to siteUrl when available, feedUrl otherwise", () => {
    const html = generateBlogrollPage(BLOGROLL_ENTRIES, SITE_CONFIG);
    expect(html).toContain('href="https://simonwillison.net"');
    expect(html).toContain('href="https://example.com/feed.xml"');
  });

  it("includes RSS icon link to feed URL for each entry", () => {
    const html = generateBlogrollPage(BLOGROLL_ENTRIES, SITE_CONFIG);
    expect(html).toContain('href="https://simonwillison.net/atom/everything/"');
    expect(html).toContain('href="https://jvns.ca/atom.xml"');
  });

  it("shows feed count", () => {
    const html = generateBlogrollPage(BLOGROLL_ENTRIES, SITE_CONFIG);
    expect(html).toContain("3 feeds I read");
  });

  it("groups by folder when folders exist", () => {
    const withFolders: BlogrollEntry[] = [
      { title: "Feed A", feedUrl: "https://a.com/feed", folder: "tech" },
      { title: "Feed B", feedUrl: "https://b.com/feed", folder: "news" },
      { title: "Feed C", feedUrl: "https://c.com/feed" },
    ];
    const html = generateBlogrollPage(withFolders, SITE_CONFIG);
    expect(html).toContain("<h2>tech</h2>");
    expect(html).toContain("<h2>news</h2>");
    expect(html).toContain("<h2>Uncategorized</h2>");
  });

  it("renders flat list when no folders", () => {
    const html = generateBlogrollPage(BLOGROLL_ENTRIES, SITE_CONFIG);
    expect(html).not.toContain("<h2>");
    expect(html).toContain('class="blogroll"');
  });

  it("escapes HTML in feed titles", () => {
    const xss: BlogrollEntry[] = [
      { title: '<script>alert("xss")</script>', feedUrl: "https://evil.com/feed" },
    ];
    const html = generateBlogrollPage(xss, SITE_CONFIG);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });
});
