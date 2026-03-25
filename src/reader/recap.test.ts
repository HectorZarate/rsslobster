import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { subscribe } from "./subscriptions.js";
import { ingestItems } from "./store.js";
import type { ParsedItem } from "./types.js";
import {
  gatherRecapItems,
  formatRecapContext,
  formatPlainRecap,
  generatePlainRecap,
  getRecapRange,
  loadRecap,
} from "./recap.js";

let siteDir: string;

beforeEach(async () => {
  siteDir = await mkdtemp(join(tmpdir(), "recap-test-"));
  return async () => {
    await rm(siteDir, { recursive: true, force: true });
  };
});

function makeItems(count: number, feedUrl: string): ParsedItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${feedUrl}-item-${i}`,
    title: `Item ${i} from ${feedUrl}`,
    link: `${feedUrl}/item-${i}`,
    content: `Content for item ${i}. This is a test article about various topics.`,
    publishedAt: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(), // 1 hour apart
    categories: ["test"],
  }));
}

describe("getRecapRange", () => {
  it("returns daily range with date filename", () => {
    const range = getRecapRange("daily");
    expect(range.filename).toMatch(/^\d{4}-\d{2}-\d{2}\.md$/);
    expect(range.label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns weekly range with week filename", () => {
    const range = getRecapRange("weekly");
    expect(range.filename).toMatch(/^\d{4}-W\d{2}\.md$/);
  });
});

describe("gatherRecapItems", () => {
  it("gathers items grouped by feed", async () => {
    await subscribe(siteDir, "https://a.com/feed.xml", "Feed A");
    await subscribe(siteDir, "https://b.com/feed.xml", "Feed B");
    await ingestItems(siteDir, "https://a.com/feed.xml", makeItems(3, "https://a.com"));
    await ingestItems(siteDir, "https://b.com/feed.xml", makeItems(2, "https://b.com"));

    const result = await gatherRecapItems(siteDir, "daily");
    expect(result.totalItems).toBe(5);
    expect(result.feeds).toHaveLength(2);
    // Most active first
    expect(result.feeds[0]!.title).toBe("Feed A");
    expect(result.feeds[0]!.items).toHaveLength(3);
  });

  it("returns empty when no items", async () => {
    const result = await gatherRecapItems(siteDir, "daily");
    expect(result.totalItems).toBe(0);
    expect(result.feeds).toHaveLength(0);
  });
});

describe("formatRecapContext", () => {
  it("formats feeds with items for LLM context", () => {
    const feeds = [
      {
        title: "Test Feed",
        items: [
          {
            id: "1",
            title: "Great Article",
            link: "https://example.com/article",
            content: "<p>This is about AI</p>",
            categories: [],
            feedUrl: "https://example.com/feed",
            dedupKey: "id:1",
            firstSeenAt: new Date().toISOString(),
            read: false,
            starred: false,
          },
        ],
      },
    ];

    const context = formatRecapContext(feeds);
    expect(context).toContain("## Test Feed");
    expect(context).toContain("Great Article");
    expect(context).toContain("https://example.com/article");
    expect(context).toContain("This is about AI"); // HTML stripped
  });
});

describe("formatPlainRecap", () => {
  it("formats a readable plain-text recap", () => {
    const range = getRecapRange("daily");
    const feeds = [
      {
        title: "Feed A",
        items: makeItems(3, "https://a.com").map((item) => ({
          ...item,
          feedUrl: "https://a.com/feed.xml",
          dedupKey: `id:${item.id}`,
          firstSeenAt: new Date().toISOString(),
          read: false,
          starred: false,
        })),
      },
    ];

    const recap = formatPlainRecap(range, feeds, 3);
    expect(recap).toContain("# RSS Recap:");
    expect(recap).toContain("3 new items across 1 feed(s)");
    expect(recap).toContain("## Feed A (3)");
  });
});

describe("generatePlainRecap", () => {
  it("generates and saves a recap file", async () => {
    await subscribe(siteDir, "https://a.com/feed.xml", "Feed A");
    await ingestItems(siteDir, "https://a.com/feed.xml", makeItems(2, "https://a.com"));

    const recap = await generatePlainRecap(siteDir, "daily");
    expect(recap).toContain("# RSS Recap:");
    expect(recap).toContain("Feed A");

    // Verify it was saved
    const range = getRecapRange("daily");
    const loaded = await loadRecap(siteDir, range.filename);
    expect(loaded).toBe(recap);
  });

  it("handles empty recap", async () => {
    const recap = await generatePlainRecap(siteDir, "daily");
    expect(recap).toContain("0 new items");
  });
});

describe("loadRecap", () => {
  it("returns null for missing recap", async () => {
    const result = await loadRecap(siteDir, "2026-01-01.md");
    expect(result).toBeNull();
  });
});
