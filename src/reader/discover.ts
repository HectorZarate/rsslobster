import { parseFeed } from "./parser.js";

/** Result of feed discovery */
export interface DiscoverResult {
  /** The feed URL (may be different from input if discovered from HTML) */
  feedUrl: string;
  /** Feed title from the feed itself */
  title: string;
  /** Site URL (from feed metadata or the original URL) */
  siteUrl?: string;
}

/**
 * Discover a feed from a URL. Handles three cases:
 * 1. URL is already a feed (RSS/Atom XML) → parse and return
 * 2. URL is HTML with <link rel="alternate"> → follow to feed URL
 * 3. URL is neither → throw
 *
 * Uses the real title from the feed, not the hostname.
 */
export async function discoverFeed(
  url: string,
  opts?: { fetchFn?: typeof fetch; timeout?: number },
): Promise<DiscoverResult> {
  const fetchFn = opts?.fetchFn ?? fetch;
  const timeout = opts?.timeout ?? 10_000;

  const response = await fetchFn(url, {
    headers: {
      "User-Agent": "RSSLobster/0.1 (+https://github.com/HectorZarate/rsslobster)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, application/json",
    },
    signal: AbortSignal.timeout(timeout),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  // Try to parse as a feed first
  if (looksLikeFeed(contentType, body)) {
    try {
      const feed = parseFeed(body);
      return {
        feedUrl: url,
        title: feed.title,
        siteUrl: feed.link,
      };
    } catch {
      // Not a valid feed, fall through to HTML discovery
    }
  }

  // Try HTML discovery
  if (contentType.includes("html") || body.trimStart().startsWith("<!") || body.trimStart().startsWith("<html")) {
    const feedUrl = findFeedLink(body, url);
    if (!feedUrl) {
      throw new Error(
        `No RSS/Atom feed found at ${url}. Try passing the feed URL directly.`,
      );
    }

    // Fetch the discovered feed URL to get the real title
    const feedResponse = await fetchFn(feedUrl, {
      headers: {
        "User-Agent": "RSSLobster/0.1",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(timeout),
      redirect: "follow",
    });

    if (!feedResponse.ok) {
      throw new Error(`Feed at ${feedUrl} returned HTTP ${feedResponse.status}`);
    }

    const feedBody = await feedResponse.text();
    const feed = parseFeed(feedBody);

    return {
      feedUrl,
      title: feed.title,
      siteUrl: url,
    };
  }

  throw new Error(
    `Could not detect a feed at ${url}. The content doesn't appear to be RSS, Atom, or HTML.`,
  );
}

/** Check if content looks like a feed based on content-type or body. */
function looksLikeFeed(contentType: string, body: string): boolean {
  if (
    contentType.includes("xml") ||
    contentType.includes("rss") ||
    contentType.includes("atom")
  ) {
    return true;
  }
  const trimmed = body.trimStart();
  return (
    trimmed.startsWith("<?xml") ||
    trimmed.startsWith("<rss") ||
    trimmed.startsWith("<feed") ||
    trimmed.startsWith("<rdf:RDF")
  );
}

/**
 * Find a feed URL from HTML <link> tags.
 * Looks for: <link rel="alternate" type="application/rss+xml" href="...">
 * and similar patterns for Atom feeds.
 */
function findFeedLink(html: string, baseUrl: string): string | null {
  const feedTypes = [
    "application/rss+xml",
    "application/atom+xml",
    "application/rss",
    "application/atom",
    "application/xml",
    "text/xml",
  ];

  // Match <link> tags with rel="alternate" and a feed type
  const linkRe = /<link\s[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRe.exec(html)) !== null) {
    const tag = match[0];

    // Must have rel="alternate"
    if (!/rel\s*=\s*["']alternate["']/i.test(tag)) continue;

    // Must have a feed type
    const typeMatch = /type\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (!typeMatch) continue;
    const type = typeMatch[1]!.toLowerCase();
    if (!feedTypes.some((ft) => type.includes(ft))) continue;

    // Extract href
    const hrefMatch = /href\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (!hrefMatch) continue;

    const href = hrefMatch[1]!;
    return resolveUrl(href, baseUrl);
  }

  return null;
}

/** Resolve a possibly-relative URL against a base. */
function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}
