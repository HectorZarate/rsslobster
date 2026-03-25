import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { subscribe } from "./subscriptions.js";
import { ingestItems, listItems, starItem } from "./store.js";
import type { ParsedItem } from "./types.js";
import { handleReaderCommand } from "./skill.js";

let siteDir: string;

const FEED_URL = "https://example.com/feed.xml";
const ctx = {};

function makeItems(count: number): ParsedItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    title: `Article ${i + 1}`,
    link: `https://example.com/article-${i}`,
    content: `Content for article ${i + 1}`,
    publishedAt: new Date(Date.now() - i * 60000).toISOString(),
    categories: ["test"],
  }));
}

beforeEach(async () => {
  siteDir = await mkdtemp(join(tmpdir(), "skill-test-"));
  return async () => {
    await rm(siteDir, { recursive: true, force: true });
  };
});

describe("handleReaderCommand", () => {
  it("returns handled: false for non-reader messages", async () => {
    const result = await handleReaderCommand("hello world", siteDir, ctx);
    expect(result.handled).toBe(false);
  });

  // --- feeds ---
  it("lists subscriptions", async () => {
    await subscribe(siteDir, FEED_URL, "Test Feed");
    const result = await handleReaderCommand("feeds", siteDir, ctx);
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("Test Feed");
  });

  it("shows empty feeds message", async () => {
    const result = await handleReaderCommand("feeds", siteDir, ctx);
    expect(result.reply).toContain("No subscriptions");
  });

  // --- unread ---
  it("lists unread items with positional numbers", async () => {
    await subscribe(siteDir, FEED_URL, "Test Feed");
    await ingestItems(siteDir, FEED_URL, makeItems(3));

    const result = await handleReaderCommand("unread", siteDir, ctx);
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("1. Article 1");
    expect(result.reply).toContain("2. Article 2");
    expect(result.reply).toContain("3. Article 3");
  });

  it("shows empty unread message", async () => {
    const result = await handleReaderCommand("unread", siteDir, ctx);
    expect(result.reply).toContain("No unread");
  });

  // --- read <n> ---
  it("reads an item by position and marks read", async () => {
    await subscribe(siteDir, FEED_URL, "Test Feed");
    await ingestItems(siteDir, FEED_URL, makeItems(3));

    // First get a listing
    await handleReaderCommand("unread", siteDir, ctx);

    // Read item #2
    const result = await handleReaderCommand("read 2", siteDir, ctx);
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("Article 2");

    // Verify it's now read
    const items = await listItems(siteDir, { read: true });
    expect(items.some((i) => i.title === "Article 2")).toBe(true);
  });

  it("returns error for invalid position", async () => {
    const result = await handleReaderCommand("read 99", siteDir, ctx);
    expect(result.reply).toContain("No item #99");
  });

  // --- star/unstar ---
  it("stars an item by position", async () => {
    await subscribe(siteDir, FEED_URL, "Test Feed");
    await ingestItems(siteDir, FEED_URL, makeItems(2));
    await handleReaderCommand("unread", siteDir, ctx);

    const result = await handleReaderCommand("star 1", siteDir, ctx);
    expect(result.reply).toContain("Starred");

    const starred = await listItems(siteDir, { starred: true });
    expect(starred).toHaveLength(1);
  });

  it("unstars an item", async () => {
    await subscribe(siteDir, FEED_URL, "Test Feed");
    await ingestItems(siteDir, FEED_URL, makeItems(2));
    await handleReaderCommand("unread", siteDir, ctx);

    await handleReaderCommand("star 1", siteDir, ctx);
    const result = await handleReaderCommand("unstar 1", siteDir, ctx);
    expect(result.reply).toContain("Unstarred");
  });

  // --- starred ---
  it("lists starred items", async () => {
    await subscribe(siteDir, FEED_URL, "Test Feed");
    await ingestItems(siteDir, FEED_URL, makeItems(3));
    const items = await listItems(siteDir);
    await starItem(siteDir, items[0]!.dedupKey);

    const result = await handleReaderCommand("starred", siteDir, ctx);
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("1 starred");
  });

  // --- share ---
  it("returns content for share command", async () => {
    await subscribe(siteDir, FEED_URL, "Test Feed");
    await ingestItems(siteDir, FEED_URL, makeItems(2));
    await handleReaderCommand("unread", siteDir, ctx);

    const result = await handleReaderCommand("share 1", siteDir, ctx);
    expect(result.handled).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content!.type).toBe("link");
    expect(result.content!.linkUrl).toBe("https://example.com/article-0");
  });

  // --- mute/unmute ---
  it("mutes a feed", async () => {
    await subscribe(siteDir, FEED_URL, "Test Feed");

    const result = await handleReaderCommand(`mute ${FEED_URL}`, siteDir, ctx);
    expect(result.reply).toContain("Muted");
  });

  it("unmutes a feed", async () => {
    await subscribe(siteDir, FEED_URL, "Test Feed");

    await handleReaderCommand(`mute ${FEED_URL}`, siteDir, ctx);
    const result = await handleReaderCommand(`unmute ${FEED_URL}`, siteDir, ctx);
    expect(result.reply).toContain("Unmuted");
  });

  // --- notifications ---
  it("shows empty notifications", async () => {
    const result = await handleReaderCommand("notifications", siteDir, ctx);
    expect(result.reply).toContain("No pending");
  });

  // --- recap ---
  it("generates a plain recap", async () => {
    await subscribe(siteDir, FEED_URL, "Test Feed");
    await ingestItems(siteDir, FEED_URL, makeItems(3));

    const result = await handleReaderCommand("recap", siteDir, ctx);
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("RSS Recap");
  });

  // --- title fallback ---
  it("shows content as title when title is empty", async () => {
    await subscribe(siteDir, FEED_URL, "Test Feed");
    const items: ParsedItem[] = [
      {
        id: "no-title-1",
        title: "",
        link: "https://example.com/no-title",
        content: "<p>Wordpress is unc.</p>",
        categories: [],
      },
    ];
    await ingestItems(siteDir, FEED_URL, items);

    const result = await handleReaderCommand("unread", siteDir, ctx);
    expect(result.reply).toContain("Wordpress is unc.");
    expect(result.reply).not.toContain("(untitled)");
  });

  it("read shows content as title when title is empty", async () => {
    await subscribe(siteDir, FEED_URL, "Test Feed");
    const items: ParsedItem[] = [
      {
        id: "no-title-2",
        title: "",
        link: "https://example.com/no-title",
        content: "Short micro post content",
        categories: [],
      },
    ];
    await ingestItems(siteDir, FEED_URL, items);

    await handleReaderCommand("unread", siteDir, ctx);
    const result = await handleReaderCommand("read 1", siteDir, ctx);
    expect(result.reply).toContain("Short micro post content");
  });

  // --- chatId isolation ---
  it("isolates listings by chatId", async () => {
    await subscribe(siteDir, FEED_URL, "Test Feed");
    await ingestItems(siteDir, FEED_URL, makeItems(5));

    // User A gets a listing
    await handleReaderCommand("unread", siteDir, { chatId: "user-a" });
    // User B gets a listing
    await handleReaderCommand("unread", siteDir, { chatId: "user-b" });

    // User A reads item 1 — should get their own listing's item
    const resultA = await handleReaderCommand("read 1", siteDir, { chatId: "user-a" });
    expect(resultA.handled).toBe(true);
    expect(resultA.reply).toContain("Article 1");
  });

  // --- notify field preservation ---
  it("muting preserves existing filters", async () => {
    await subscribe(siteDir, FEED_URL, "Test Feed");
    const { updateSubscription, getSubscription } = await import("./subscriptions.js");
    await updateSubscription(siteDir, FEED_URL, {
      notify: { filter: ["important"], priority: "high" },
    });

    await handleReaderCommand(`mute ${FEED_URL}`, siteDir, ctx);

    const sub = await getSubscription(siteDir, FEED_URL);
    expect(sub!.notify!.muted).toBe(true);
    expect(sub!.notify!.filter).toEqual(["important"]);
    expect(sub!.notify!.priority).toBe("high");
  });

  // --- case insensitivity ---
  it("handles uppercase commands", async () => {
    const result = await handleReaderCommand("FEEDS", siteDir, ctx);
    expect(result.handled).toBe(true);
  });

  it("handles mixed case", async () => {
    const result = await handleReaderCommand("Unread", siteDir, ctx);
    expect(result.handled).toBe(true);
  });
});
