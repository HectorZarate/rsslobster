import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pollFeed, pollAllFeeds } from "./poll.js";
import { subscribe } from "./subscriptions.js";

const RSS_FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <description>A test feed</description>
    <item>
      <title>Post One</title>
      <link>https://example.com/one</link>
      <description>First post</description>
      <guid>https://example.com/one</guid>
      <pubDate>Fri, 20 Mar 2026 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Post Two</title>
      <link>https://example.com/two</link>
      <description>Second post</description>
      <guid>https://example.com/two</guid>
      <pubDate>Thu, 19 Mar 2026 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>Atom Entry</title>
    <link href="https://example.com/atom-entry" rel="alternate"/>
    <id>urn:uuid:atom-1</id>
    <content>Atom content</content>
  </entry>
</feed>`;

function mockFetch(body: string, status = 200, headers: Record<string, string> = {}): typeof fetch {
  return async () =>
    new Response(body, {
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers: new Headers(headers),
    });
}

function mock304(): typeof fetch {
  return async () =>
    new Response(null, { status: 304, statusText: "Not Modified" });
}

function mockError(message: string): typeof fetch {
  return async () => {
    throw new Error(message);
  };
}

let siteDir: string;

beforeEach(async () => {
  siteDir = await mkdtemp(join(tmpdir(), "poll-test-"));
  return async () => {
    await rm(siteDir, { recursive: true, force: true });
  };
});

describe("pollFeed", () => {
  it("returns error when not subscribed", async () => {
    const result = await pollFeed(siteDir, "https://example.com/feed.xml");
    expect(result.error).toContain("Not subscribed");
    expect(result.newItems).toHaveLength(0);
  });

  it("fetches and ingests RSS feed items", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Test Feed");

    const result = await pollFeed(siteDir, "https://example.com/feed.xml", {
      fetchFn: mockFetch(RSS_FEED),
    });

    expect(result.error).toBeUndefined();
    expect(result.title).toBe("Test Feed");
    expect(result.newItems).toHaveLength(2);
    expect(result.newItems[0]!.title).toBe("Post One");
  });

  it("fetches and ingests Atom feed items", async () => {
    await subscribe(siteDir, "https://example.com/atom.xml", "Atom Feed");

    const result = await pollFeed(siteDir, "https://example.com/atom.xml", {
      fetchFn: mockFetch(ATOM_FEED),
    });

    expect(result.error).toBeUndefined();
    expect(result.newItems).toHaveLength(1);
    expect(result.newItems[0]!.title).toBe("Atom Entry");
  });

  it("deduplicates items on second poll", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Test Feed");
    const fetchFn = mockFetch(RSS_FEED);

    const first = await pollFeed(siteDir, "https://example.com/feed.xml", { fetchFn });
    expect(first.newItems).toHaveLength(2);

    const second = await pollFeed(siteDir, "https://example.com/feed.xml", { fetchFn });
    expect(second.newItems).toHaveLength(0);
  });

  it("handles 304 Not Modified", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Test Feed");

    const result = await pollFeed(siteDir, "https://example.com/feed.xml", {
      fetchFn: mock304(),
    });

    expect(result.error).toBeUndefined();
    expect(result.newItems).toHaveLength(0);
  });

  it("handles HTTP error status", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Test Feed");

    const result = await pollFeed(siteDir, "https://example.com/feed.xml", {
      fetchFn: mockFetch("Not Found", 404),
    });

    expect(result.error).toBe("HTTP 404 Error");
    expect(result.newItems).toHaveLength(0);
  });

  it("handles network error", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Test Feed");

    const result = await pollFeed(siteDir, "https://example.com/feed.xml", {
      fetchFn: mockError("ECONNREFUSED"),
    });

    expect(result.error).toBe("ECONNREFUSED");
    expect(result.newItems).toHaveLength(0);
  });

  it("handles malformed XML", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Test Feed");

    const result = await pollFeed(siteDir, "https://example.com/feed.xml", {
      fetchFn: mockFetch("this is not xml at all"),
    });

    expect(result.error).toContain("Unrecognized feed format");
    expect(result.newItems).toHaveLength(0);
  });

  it("stores ETag and Last-Modified from response headers", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Test Feed");

    await pollFeed(siteDir, "https://example.com/feed.xml", {
      fetchFn: mockFetch(RSS_FEED, 200, {
        ETag: '"abc123"',
        "Last-Modified": "Fri, 20 Mar 2026 12:00:00 GMT",
      }),
    });

    // Verify conditional headers are sent on second request
    let capturedHeaders: Headers | undefined;
    const capturingFetch: typeof fetch = async (input, init) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(RSS_FEED, { status: 200 });
    };

    await pollFeed(siteDir, "https://example.com/feed.xml", {
      fetchFn: capturingFetch,
    });

    expect(capturedHeaders!.get("If-None-Match")).toBe('"abc123"');
    expect(capturedHeaders!.get("If-Modified-Since")).toBe(
      "Fri, 20 Mar 2026 12:00:00 GMT",
    );
  });
});

describe("pollAllFeeds", () => {
  it("polls all due subscriptions", async () => {
    await subscribe(siteDir, "https://a.com/feed.xml", "Feed A");
    await subscribe(siteDir, "https://b.com/feed.xml", "Feed B");

    const fetchFn: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("a.com")) return new Response(RSS_FEED);
      return new Response(ATOM_FEED);
    };

    const results = await pollAllFeeds(siteDir, { fetchFn });

    expect(results).toHaveLength(2);
  });

  it("skips feeds not yet due", async () => {
    await subscribe(siteDir, "https://a.com/feed.xml", "Feed A");

    // First poll — should fetch
    const fetchFn = mockFetch(RSS_FEED);
    const first = await pollAllFeeds(siteDir, { fetchFn, defaultInterval: 15 });
    expect(first).toHaveLength(1);

    // Second poll immediately — should skip (not due yet)
    const second = await pollAllFeeds(siteDir, { fetchFn, defaultInterval: 15 });
    expect(second).toHaveLength(0);
  });

  it("returns empty array when no subscriptions", async () => {
    const results = await pollAllFeeds(siteDir);
    expect(results).toHaveLength(0);
  });
});
