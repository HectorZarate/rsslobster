import { describe, it, expect } from "vitest";
import { discoverFeed } from "./discover.js";

const RSS_FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Simon Willison's Weblog</title>
    <link>https://simonwillison.net</link>
    <description>A great blog</description>
    <item>
      <title>Post</title>
      <link>https://simonwillison.net/post</link>
      <description>Content</description>
      <guid>https://simonwillison.net/post</guid>
    </item>
  </channel>
</rss>`;

const HTML_NO_FEED = `<!DOCTYPE html>
<html>
<head><title>No feeds here</title></head>
<body><p>No RSS</p></body>
</html>`;

function mockFetch(responses: Record<string, { body: string; contentType: string; status?: number }>): typeof fetch {
  return async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, resp] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return new Response(resp.body, {
          status: resp.status ?? 200,
          headers: { "Content-Type": resp.contentType },
        });
      }
    }
    return new Response("Not Found", { status: 404 });
  };
}

describe("discoverFeed", () => {
  it("detects a direct feed URL", async () => {
    const fetchFn = mockFetch({
      "example.com/feed.xml": { body: RSS_FEED, contentType: "application/rss+xml" },
    });

    const result = await discoverFeed("https://example.com/feed.xml", { fetchFn });
    expect(result.feedUrl).toBe("https://example.com/feed.xml");
    expect(result.title).toBe("Simon Willison's Weblog");
    expect(result.siteUrl).toBe("https://simonwillison.net");
  });

  it("discovers feed from HTML link tag (RSS)", async () => {
    const htmlWithFeed = `<!DOCTYPE html>
<html><head>
  <link rel="alternate" type="application/rss+xml" href="https://blog.example.com/feed.xml">
</head><body></body></html>`;

    const fetchFn: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://blog.example.com/") {
        return new Response(htmlWithFeed, { headers: { "Content-Type": "text/html" } });
      }
      if (url === "https://blog.example.com/feed.xml") {
        return new Response(RSS_FEED, { headers: { "Content-Type": "application/rss+xml" } });
      }
      return new Response("Not Found", { status: 404 });
    };

    const result = await discoverFeed("https://blog.example.com/", { fetchFn });
    expect(result.feedUrl).toBe("https://blog.example.com/feed.xml");
    expect(result.title).toBe("Simon Willison's Weblog");
    expect(result.siteUrl).toBe("https://blog.example.com/");
  });

  it("throws when HTML has no feed links", async () => {
    const fetchFn = mockFetch({
      "nofeed.com": { body: HTML_NO_FEED, contentType: "text/html" },
    });

    await expect(
      discoverFeed("https://nofeed.com", { fetchFn }),
    ).rejects.toThrow("No RSS/Atom feed found");
  });

  it("throws on HTTP error", async () => {
    const fetchFn = mockFetch({
      "example.com": { body: "Not Found", contentType: "text/plain", status: 404 },
    });

    await expect(
      discoverFeed("https://example.com/feed.xml", { fetchFn }),
    ).rejects.toThrow("HTTP 404");
  });

  it("detects XML feed without explicit content-type", async () => {
    const fetchFn = mockFetch({
      "example.com/feed": { body: RSS_FEED, contentType: "text/plain" },
    });

    const result = await discoverFeed("https://example.com/feed", { fetchFn });
    expect(result.title).toBe("Simon Willison's Weblog");
  });

  it("resolves relative feed URLs against base", async () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="/blog/feed.xml">
    </head><body></body></html>`;

    const fetchFn: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://example.com/") {
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      }
      if (url === "https://example.com/blog/feed.xml") {
        return new Response(RSS_FEED, { headers: { "Content-Type": "application/rss+xml" } });
      }
      return new Response("Not Found", { status: 404 });
    };

    const result = await discoverFeed("https://example.com/", { fetchFn });
    expect(result.feedUrl).toBe("https://example.com/blog/feed.xml");
  });
});
