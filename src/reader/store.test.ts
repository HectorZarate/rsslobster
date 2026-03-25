import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ParsedItem } from "./types.js";
import {
  dedupKey,
  ingestItems,
  listItems,
  getItem,
  markRead,
  markUnread,
  markAllRead,
  starItem,
  unstarItem,
  getItemCounts,
  removeItemsForFeed,
} from "./store.js";

let siteDir: string;

const FEED_A = "https://a.com/feed.xml";
const FEED_B = "https://b.com/feed.xml";

function makeItem(overrides: Partial<ParsedItem> = {}): ParsedItem {
  return {
    id: "item-1",
    title: "Test Item",
    link: "https://example.com/item-1",
    content: "Test content",
    publishedAt: "2026-03-20T12:00:00.000Z",
    categories: [],
    ...overrides,
  };
}

beforeEach(async () => {
  siteDir = await mkdtemp(join(tmpdir(), "rsslobster-store-test-"));
});

afterEach(async () => {
  await rm(siteDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// dedupKey
// ---------------------------------------------------------------------------

describe("dedupKey", () => {
  it("uses id when available", () => {
    const key = dedupKey(makeItem({ id: "guid-123" }));
    expect(key).toBe("id:guid-123");
  });

  it("falls back to link when id is empty", () => {
    const key = dedupKey(
      makeItem({ id: "", link: "https://example.com/post" }),
    );
    expect(key).toBe("link:https://example.com/post");
  });

  it("falls back to content hash when both id and link are missing", () => {
    const key = dedupKey(makeItem({ id: "", link: undefined }));
    expect(key).toMatch(/^hash:[0-9a-f]{16}$/);
  });

  it("content hash is deterministic", () => {
    const item = makeItem({ id: "", link: undefined });
    expect(dedupKey(item)).toBe(dedupKey(item));
  });

  it("content hash differs for different content", () => {
    const item1 = makeItem({
      id: "",
      link: undefined,
      title: "A",
      content: "X",
    });
    const item2 = makeItem({
      id: "",
      link: undefined,
      title: "B",
      content: "Y",
    });
    expect(dedupKey(item1)).not.toBe(dedupKey(item2));
  });
});

// ---------------------------------------------------------------------------
// ingestItems
// ---------------------------------------------------------------------------

describe("ingestItems", () => {
  it("ingests new items and returns count", async () => {
    const items = [
      makeItem({ id: "1", title: "Item 1" }),
      makeItem({ id: "2", title: "Item 2" }),
    ];

    const added = await ingestItems(siteDir, FEED_A, items);
    expect(added).toBe(2);

    const stored = await listItems(siteDir);
    expect(stored).toHaveLength(2);
  });

  it("deduplicates items by id", async () => {
    const items = [makeItem({ id: "1" })];
    await ingestItems(siteDir, FEED_A, items);
    const added = await ingestItems(siteDir, FEED_A, items);

    expect(added).toBe(0);

    const stored = await listItems(siteDir);
    expect(stored).toHaveLength(1);
  });

  it("deduplicates within a single batch", async () => {
    const items = [
      makeItem({ id: "same" }),
      makeItem({ id: "same" }),
    ];
    const added = await ingestItems(siteDir, FEED_A, items);
    expect(added).toBe(1);
  });

  it("tracks which feed an item came from", async () => {
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "a1" })]);
    await ingestItems(siteDir, FEED_B, [makeItem({ id: "b1" })]);

    const aItems = await listItems(siteDir, { feedUrl: FEED_A });
    const bItems = await listItems(siteDir, { feedUrl: FEED_B });

    expect(aItems).toHaveLength(1);
    expect(bItems).toHaveLength(1);
    expect(aItems[0]!.feedUrl).toBe(FEED_A);
    expect(bItems[0]!.feedUrl).toBe(FEED_B);
  });

  it("new items default to unread and unstarred", async () => {
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "1" })]);
    const item = (await listItems(siteDir))[0]!;

    expect(item.read).toBe(false);
    expect(item.starred).toBe(false);
  });

  it("sets firstSeenAt on ingest", async () => {
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "1" })]);
    const item = (await listItems(siteDir))[0]!;
    expect(item.firstSeenAt).toBeTruthy();
  });

  it("returns 0 when all items are duplicates", async () => {
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "1" })]);
    const added = await ingestItems(siteDir, FEED_A, [makeItem({ id: "1" })]);
    expect(added).toBe(0);
  });

  it("handles empty items array", async () => {
    const added = await ingestItems(siteDir, FEED_A, []);
    expect(added).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// listItems
// ---------------------------------------------------------------------------

describe("listItems", () => {
  it("returns items newest first by publishedAt", async () => {
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "old", publishedAt: "2026-03-19T00:00:00.000Z" }),
      makeItem({ id: "new", publishedAt: "2026-03-21T00:00:00.000Z" }),
    ]);

    const items = await listItems(siteDir);
    expect(items[0]!.id).toBe("new");
    expect(items[1]!.id).toBe("old");
  });

  it("falls back to firstSeenAt for sorting when no publishedAt", async () => {
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1", publishedAt: undefined }),
    ]);
    const items = await listItems(siteDir);
    expect(items).toHaveLength(1);
  });

  it("filters by feedUrl", async () => {
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "a1" })]);
    await ingestItems(siteDir, FEED_B, [makeItem({ id: "b1" })]);

    const items = await listItems(siteDir, { feedUrl: FEED_A });
    expect(items).toHaveLength(1);
    expect(items[0]!.feedUrl).toBe(FEED_A);
  });

  it("filters by read state", async () => {
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1" }),
      makeItem({ id: "2" }),
    ]);
    await markRead(siteDir, "id:1");

    const unread = await listItems(siteDir, { read: false });
    expect(unread).toHaveLength(1);
    expect(unread[0]!.id).toBe("2");

    const read = await listItems(siteDir, { read: true });
    expect(read).toHaveLength(1);
    expect(read[0]!.id).toBe("1");
  });

  it("filters by starred state", async () => {
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1" }),
      makeItem({ id: "2" }),
    ]);
    await starItem(siteDir, "id:1");

    const starred = await listItems(siteDir, { starred: true });
    expect(starred).toHaveLength(1);
    expect(starred[0]!.id).toBe("1");
  });

  it("supports combined filters", async () => {
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1" }),
      makeItem({ id: "2" }),
    ]);
    await ingestItems(siteDir, FEED_B, [makeItem({ id: "3" })]);
    await markRead(siteDir, "id:1");

    const unreadFromA = await listItems(siteDir, {
      feedUrl: FEED_A,
      read: false,
    });
    expect(unreadFromA).toHaveLength(1);
    expect(unreadFromA[0]!.id).toBe("2");
  });

  it("supports limit parameter", async () => {
    await ingestItems(
      siteDir,
      FEED_A,
      Array.from({ length: 10 }, (_, i) =>
        makeItem({ id: `item-${i}` }),
      ),
    );

    const items = await listItems(siteDir, undefined, 3);
    expect(items).toHaveLength(3);
  });

  it("returns empty array when no items", async () => {
    const items = await listItems(siteDir);
    expect(items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getItem
// ---------------------------------------------------------------------------

describe("getItem", () => {
  it("returns item by dedup key", async () => {
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "test-id" })]);
    const item = await getItem(siteDir, "id:test-id");

    expect(item).not.toBeNull();
    expect(item!.id).toBe("test-id");
  });

  it("returns null for non-existent key", async () => {
    const item = await getItem(siteDir, "id:nonexistent");
    expect(item).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// markRead / markUnread
// ---------------------------------------------------------------------------

describe("markRead / markUnread", () => {
  it("marks a single item as read", async () => {
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "1" })]);
    const count = await markRead(siteDir, "id:1");

    expect(count).toBe(1);

    const item = await getItem(siteDir, "id:1");
    expect(item!.read).toBe(true);
  });

  it("marks multiple items as read", async () => {
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1" }),
      makeItem({ id: "2" }),
      makeItem({ id: "3" }),
    ]);

    const count = await markRead(siteDir, ["id:1", "id:2"]);
    expect(count).toBe(2);

    const item3 = await getItem(siteDir, "id:3");
    expect(item3!.read).toBe(false);
  });

  it("marks item as unread", async () => {
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "1" })]);
    await markRead(siteDir, "id:1");
    await markUnread(siteDir, "id:1");

    const item = await getItem(siteDir, "id:1");
    expect(item!.read).toBe(false);
  });

  it("is idempotent — marking read item as read returns 0", async () => {
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "1" })]);
    await markRead(siteDir, "id:1");
    const count = await markRead(siteDir, "id:1");
    expect(count).toBe(0);
  });

  it("returns 0 for non-existent keys", async () => {
    const count = await markRead(siteDir, "id:nonexistent");
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// markAllRead
// ---------------------------------------------------------------------------

describe("markAllRead", () => {
  it("marks all items as read", async () => {
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1" }),
      makeItem({ id: "2" }),
    ]);
    await ingestItems(siteDir, FEED_B, [makeItem({ id: "3" })]);

    const count = await markAllRead(siteDir);
    expect(count).toBe(3);

    const counts = await getItemCounts(siteDir);
    expect(counts.unread).toBe(0);
  });

  it("marks all items from a specific feed as read", async () => {
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1" }),
      makeItem({ id: "2" }),
    ]);
    await ingestItems(siteDir, FEED_B, [makeItem({ id: "3" })]);

    const count = await markAllRead(siteDir, FEED_A);
    expect(count).toBe(2);

    const bCounts = await getItemCounts(siteDir, FEED_B);
    expect(bCounts.unread).toBe(1); // Feed B untouched
  });

  it("returns 0 when all already read", async () => {
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "1" })]);
    await markAllRead(siteDir);
    const count = await markAllRead(siteDir);
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// starItem / unstarItem
// ---------------------------------------------------------------------------

describe("starItem / unstarItem", () => {
  it("stars an item", async () => {
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "1" })]);
    const result = await starItem(siteDir, "id:1");

    expect(result).toBe(true);

    const item = await getItem(siteDir, "id:1");
    expect(item!.starred).toBe(true);
  });

  it("star is idempotent", async () => {
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "1" })]);
    await starItem(siteDir, "id:1");
    const result = await starItem(siteDir, "id:1");
    expect(result).toBe(true);
  });

  it("unstars an item", async () => {
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "1" })]);
    await starItem(siteDir, "id:1");
    await unstarItem(siteDir, "id:1");

    const item = await getItem(siteDir, "id:1");
    expect(item!.starred).toBe(false);
  });

  it("returns false for non-existent item", async () => {
    const result = await starItem(siteDir, "id:nonexistent");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getItemCounts
// ---------------------------------------------------------------------------

describe("getItemCounts", () => {
  it("returns correct counts", async () => {
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1" }),
      makeItem({ id: "2" }),
      makeItem({ id: "3" }),
    ]);
    await markRead(siteDir, "id:1");
    await starItem(siteDir, "id:2");

    const counts = await getItemCounts(siteDir);
    expect(counts.total).toBe(3);
    expect(counts.unread).toBe(2);
    expect(counts.starred).toBe(1);
  });

  it("returns per-feed counts when feedUrl provided", async () => {
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "a1" }),
      makeItem({ id: "a2" }),
    ]);
    await ingestItems(siteDir, FEED_B, [makeItem({ id: "b1" })]);

    const aCounts = await getItemCounts(siteDir, FEED_A);
    expect(aCounts.total).toBe(2);

    const bCounts = await getItemCounts(siteDir, FEED_B);
    expect(bCounts.total).toBe(1);
  });

  it("returns zeros when no items", async () => {
    const counts = await getItemCounts(siteDir);
    expect(counts).toEqual({ total: 0, unread: 0, starred: 0 });
  });
});

// ---------------------------------------------------------------------------
// removeItemsForFeed
// ---------------------------------------------------------------------------

describe("removeItemsForFeed", () => {
  it("removes all items for a feed", async () => {
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "a1" }),
      makeItem({ id: "a2" }),
    ]);
    await ingestItems(siteDir, FEED_B, [makeItem({ id: "b1" })]);

    const removed = await removeItemsForFeed(siteDir, FEED_A);
    expect(removed).toBe(2);

    const remaining = await listItems(siteDir);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.feedUrl).toBe(FEED_B);
  });

  it("returns 0 when no items for feed", async () => {
    const removed = await removeItemsForFeed(siteDir, "https://nope.com/f");
    expect(removed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// UX: read state and star workflows
// ---------------------------------------------------------------------------

describe("UX: workflows", () => {
  it("typical read workflow: ingest -> list unread -> mark read", async () => {
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1", title: "Breaking News" }),
      makeItem({ id: "2", title: "Old Story" }),
    ]);

    // User sees unread items
    const unread = await listItems(siteDir, { read: false });
    expect(unread).toHaveLength(2);

    // User reads one
    await markRead(siteDir, unread[0]!.dedupKey);

    // Now only one unread
    const stillUnread = await listItems(siteDir, { read: false });
    expect(stillUnread).toHaveLength(1);
  });

  it("star workflow: star -> list starred -> unstar", async () => {
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1" }),
      makeItem({ id: "2" }),
      makeItem({ id: "3" }),
    ]);

    await starItem(siteDir, "id:1");
    await starItem(siteDir, "id:3");

    const starred = await listItems(siteDir, { starred: true });
    expect(starred).toHaveLength(2);

    await unstarItem(siteDir, "id:1");

    const stillStarred = await listItems(siteDir, { starred: true });
    expect(stillStarred).toHaveLength(1);
    expect(stillStarred[0]!.id).toBe("3");
  });

  it("mark all read then new items arrive unread", async () => {
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "1" })]);
    await markAllRead(siteDir);

    // New items arrive
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "2" })]);

    const counts = await getItemCounts(siteDir);
    expect(counts.total).toBe(2);
    expect(counts.unread).toBe(1); // only the new one
  });
});

// ---------------------------------------------------------------------------
// Corrupt data handling
// ---------------------------------------------------------------------------

describe("corrupt data", () => {
  it("throws with clear message when items.json contains invalid JSON", async () => {
    // Write corrupt data into a per-feed items file
    const { feedSlug } = await import("./paths.js");
    const slug = feedSlug(FEED_A);
    const dir = join(siteDir, "reader", "feeds", slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "items.json"), "NOT VALID JSON{{{");

    await expect(listItems(siteDir)).rejects.toThrow("Corrupt items file");
  });

  it("returns empty array when items.json does not exist (not corrupt)", async () => {
    const items = await listItems(siteDir);
    expect(items).toEqual([]);
  });
});
