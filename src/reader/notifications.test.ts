import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  StoredItem,
  Subscription,
  InboxEntry,
} from "./types.js";
import {
  defaultNotificationConfig,
  loadConfig,
  saveConfig,
  updateConfig,
  loadInbox,
  addToInbox,
  drainInbox,
  inboxCount,
  shouldNotify,
  isDeliveryTime,
  formatNotification,
  formatDigest,
} from "./notifications.js";

let siteDir: string;

beforeEach(async () => {
  siteDir = await mkdtemp(join(tmpdir(), "notify-test-"));
  return async () => {
    await rm(siteDir, { recursive: true, force: true });
  };
});

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    feedUrl: "https://example.com/feed.xml",
    title: "Example Feed",
    addedAt: "2026-03-20T00:00:00.000Z",
    errorCount: 0,
    ...overrides,
  };
}

function makeItem(overrides: Partial<StoredItem> = {}): StoredItem {
  return {
    id: "item-1",
    title: "Test Item",
    link: "https://example.com/item-1",
    content: "Test content about programming",
    publishedAt: "2026-03-20T12:00:00.000Z",
    categories: [],
    feedUrl: "https://example.com/feed.xml",
    dedupKey: "id:item-1",
    firstSeenAt: "2026-03-20T12:00:00.000Z",
    read: false,
    starred: false,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<InboxEntry> = {}): InboxEntry {
  return {
    feedUrl: "https://example.com/feed.xml",
    feedTitle: "Example Feed",
    itemDedupKey: "id:item-1",
    title: "Test Item",
    link: "https://example.com/item-1",
    summary: "Test content",
    receivedAt: "2026-03-20T12:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

describe("notification config", () => {
  it("returns defaults when no config file exists", async () => {
    const config = await loadConfig(siteDir);
    expect(config.enabled).toBe(true);
    expect(config.schedule).toBe("immediate");
    expect(config.recap.enabled).toBe(false);
  });

  it("saves and loads config", async () => {
    const config = defaultNotificationConfig();
    config.schedule = "daily";
    config.deliverAt = "10:00";
    await saveConfig(siteDir, config);

    const loaded = await loadConfig(siteDir);
    expect(loaded.schedule).toBe("daily");
    expect(loaded.deliverAt).toBe("10:00");
  });

  it("merges partial updates", async () => {
    await saveConfig(siteDir, defaultNotificationConfig());

    const updated = await updateConfig(siteDir, {
      schedule: "weekly",
      dayOfWeek: 5,
    });

    expect(updated.schedule).toBe("weekly");
    expect(updated.dayOfWeek).toBe(5);
    expect(updated.enabled).toBe(true); // preserved
  });

  it("rejects invalid time format", async () => {
    await expect(
      updateConfig(siteDir, { deliverAt: "25:99" }),
    ).rejects.toThrow("Invalid time format");
  });

  it("rejects invalid day of week", async () => {
    await expect(
      updateConfig(siteDir, { dayOfWeek: 7 }),
    ).rejects.toThrow("Invalid day of week");
  });

  it("rejects invalid schedule", async () => {
    await expect(
      updateConfig(siteDir, { schedule: "biweekly" as never }),
    ).rejects.toThrow("Invalid schedule");
  });

  it("accepts valid time formats", async () => {
    const config = await updateConfig(siteDir, { deliverAt: "09:00" });
    expect(config.deliverAt).toBe("09:00");
  });

  it("merges recap config independently", async () => {
    await saveConfig(siteDir, defaultNotificationConfig());

    const updated = await updateConfig(siteDir, {
      recap: { enabled: true, frequency: "weekly", deliverAt: "08:00", style: "brief" },
    });

    expect(updated.recap.enabled).toBe(true);
    expect(updated.recap.frequency).toBe("weekly");
  });
});

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

describe("inbox", () => {
  it("starts empty", async () => {
    const entries = await loadInbox(siteDir);
    expect(entries).toEqual([]);
  });

  it("adds entries", async () => {
    await addToInbox(siteDir, [makeEntry(), makeEntry({ title: "Second" })]);

    const entries = await loadInbox(siteDir);
    expect(entries).toHaveLength(2);
  });

  it("accumulates across calls", async () => {
    await addToInbox(siteDir, [makeEntry()]);
    await addToInbox(siteDir, [makeEntry({ title: "Second" })]);

    expect(await inboxCount(siteDir)).toBe(2);
  });

  it("drains returns all and clears", async () => {
    await addToInbox(siteDir, [makeEntry(), makeEntry({ title: "Second" })]);

    const drained = await drainInbox(siteDir);
    expect(drained).toHaveLength(2);

    const remaining = await loadInbox(siteDir);
    expect(remaining).toHaveLength(0);
  });

  it("drain on empty inbox returns empty", async () => {
    const drained = await drainInbox(siteDir);
    expect(drained).toEqual([]);
  });

  it("caps inbox at max size, dropping oldest", async () => {
    // Add more than MAX_INBOX_SIZE (1000) entries
    const entries = Array.from({ length: 1050 }, (_, i) =>
      makeEntry({ title: `Item ${i}`, itemDedupKey: `id:item-${i}` }),
    );
    await addToInbox(siteDir, entries);

    const loaded = await loadInbox(siteDir);
    expect(loaded).toHaveLength(1000);
    // Oldest entries should be dropped — first item should be #50
    expect(loaded[0]!.title).toBe("Item 50");
  });
});

// ---------------------------------------------------------------------------
// shouldNotify
// ---------------------------------------------------------------------------

describe("shouldNotify", () => {
  const config = defaultNotificationConfig();

  it("returns entry for normal item", () => {
    const result = shouldNotify(makeItem(), makeSub(), config, "Test Feed");
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Test Item");
    expect(result!.feedTitle).toBe("Test Feed");
  });

  it("returns null when globally disabled", () => {
    const disabled = { ...config, enabled: false };
    const result = shouldNotify(makeItem(), makeSub(), disabled, "Test Feed");
    expect(result).toBeNull();
  });

  it("returns null when feed is muted", () => {
    const sub = makeSub({ notify: { muted: true } });
    const result = shouldNotify(makeItem(), sub, config, "Test Feed");
    expect(result).toBeNull();
  });

  it("filters by keyword — match", () => {
    const sub = makeSub({ notify: { filter: ["programming"] } });
    const item = makeItem({ content: "An article about programming languages" });
    const result = shouldNotify(item, sub, config, "Test Feed");
    expect(result).not.toBeNull();
  });

  it("filters by keyword — no match", () => {
    const sub = makeSub({ notify: { filter: ["cooking"] } });
    const item = makeItem({ content: "An article about programming" });
    const result = shouldNotify(item, sub, config, "Test Feed");
    expect(result).toBeNull();
  });

  it("keyword filter is case-insensitive", () => {
    const sub = makeSub({ notify: { filter: ["PROGRAMMING"] } });
    const item = makeItem({ content: "about programming" });
    const result = shouldNotify(item, sub, config, "Test Feed");
    expect(result).not.toBeNull();
  });

  it("checks title and content for keyword match", () => {
    const sub = makeSub({ notify: { filter: ["breaking"] } });
    const item = makeItem({ title: "Breaking news", content: "details here" });
    const result = shouldNotify(item, sub, config, "Test Feed");
    expect(result).not.toBeNull();
  });

  it("truncates summary to 300 chars", () => {
    const longContent = "x".repeat(500);
    const item = makeItem({ content: longContent });
    const result = shouldNotify(item, makeSub(), config, "Test Feed");
    expect(result!.summary).toHaveLength(300);
  });
});

// ---------------------------------------------------------------------------
// isDeliveryTime
// ---------------------------------------------------------------------------

describe("isDeliveryTime", () => {
  it("immediate always returns true", () => {
    const config = { ...defaultNotificationConfig(), schedule: "immediate" as const };
    expect(isDeliveryTime(config)).toBe(true);
  });

  it("respects lastDeliveredAt for hourly", () => {
    const config = { ...defaultNotificationConfig(), schedule: "hourly" as const };
    const recentlyDelivered = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
    expect(isDeliveryTime(config, recentlyDelivered)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

describe("formatNotification", () => {
  it("formats a single notification", () => {
    const msg = formatNotification(makeEntry());
    expect(msg).toContain("Example Feed");
    expect(msg).toContain("Test Item");
    expect(msg).toContain("https://example.com/item-1");
  });

  it("handles entries without link", () => {
    const msg = formatNotification(makeEntry({ link: undefined }));
    expect(msg).toBe("Example Feed: Test Item");
  });
});

describe("formatDigest", () => {
  it("formats multiple entries grouped by feed", () => {
    const entries = [
      makeEntry({ feedTitle: "Feed A", title: "Item 1" }),
      makeEntry({ feedTitle: "Feed A", title: "Item 2" }),
      makeEntry({ feedTitle: "Feed B", title: "Item 3" }),
    ];
    const digest = formatDigest(entries);
    expect(digest).toContain("3 new items");
    expect(digest).toContain("Feed A:");
    expect(digest).toContain("Feed B:");
    expect(digest).toContain("Item 1");
    expect(digest).toContain("Item 3");
  });

  it("returns empty string for empty entries", () => {
    expect(formatDigest([])).toBe("");
  });

  it("truncates long feed lists", () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ feedTitle: "Big Feed", title: `Item ${i}` }),
    );
    const digest = formatDigest(entries);
    expect(digest).toContain("...and 3 more");
  });
});

// ---------------------------------------------------------------------------
// Quiet hours
// ---------------------------------------------------------------------------

describe("shouldNotify — quiet hours", () => {
  const baseConfig = defaultNotificationConfig();

  afterEach(() => {
    vi.useRealTimers();
  });

  function setSystemTime(hours: number, minutes: number): void {
    const date = new Date(2026, 2, 25, hours, minutes, 0);
    vi.useFakeTimers();
    vi.setSystemTime(date);
  }

  // Same-day quiet hours (10:00 - 14:00)

  it("suppresses notification during same-day quiet hours", () => {
    setSystemTime(12, 0); // noon — inside 10:00-14:00
    const config = { ...baseConfig, quietHours: { start: "10:00", end: "14:00" } };
    const result = shouldNotify(makeItem(), makeSub(), config, "Test Feed");
    expect(result).toBeNull();
  });

  it("allows notification outside same-day quiet hours", () => {
    setSystemTime(15, 0); // 15:00 — outside 10:00-14:00
    const config = { ...baseConfig, quietHours: { start: "10:00", end: "14:00" } };
    const result = shouldNotify(makeItem(), makeSub(), config, "Test Feed");
    expect(result).not.toBeNull();
  });

  // Overnight quiet hours (22:00 - 08:00)

  it("suppresses notification at 23:00 during overnight quiet hours", () => {
    setSystemTime(23, 0);
    const config = { ...baseConfig, quietHours: { start: "22:00", end: "08:00" } };
    const result = shouldNotify(makeItem(), makeSub(), config, "Test Feed");
    expect(result).toBeNull();
  });

  it("allows notification at 09:00 outside overnight quiet hours", () => {
    setSystemTime(9, 0);
    const config = { ...baseConfig, quietHours: { start: "22:00", end: "08:00" } };
    const result = shouldNotify(makeItem(), makeSub(), config, "Test Feed");
    expect(result).not.toBeNull();
  });

  it("suppresses notification at 07:00 during overnight quiet hours", () => {
    setSystemTime(7, 0);
    const config = { ...baseConfig, quietHours: { start: "22:00", end: "08:00" } };
    const result = shouldNotify(makeItem(), makeSub(), config, "Test Feed");
    expect(result).toBeNull();
  });

  // Boundary conditions

  it("suppresses notification exactly at quiet hours start", () => {
    setSystemTime(10, 0); // exactly 10:00 — start of 10:00-14:00
    const config = { ...baseConfig, quietHours: { start: "10:00", end: "14:00" } };
    const result = shouldNotify(makeItem(), makeSub(), config, "Test Feed");
    expect(result).toBeNull();
  });

  it("allows notification exactly at quiet hours end", () => {
    setSystemTime(14, 0); // exactly 14:00 — end of 10:00-14:00 (exclusive)
    const config = { ...baseConfig, quietHours: { start: "10:00", end: "14:00" } };
    const result = shouldNotify(makeItem(), makeSub(), config, "Test Feed");
    expect(result).not.toBeNull();
  });

  // High-priority bypass

  it("high-priority feed bypasses quiet hours", () => {
    setSystemTime(12, 0); // inside 10:00-14:00
    const config = { ...baseConfig, quietHours: { start: "10:00", end: "14:00" } };
    const sub = makeSub({ notify: { priority: "high" } });
    const result = shouldNotify(makeItem(), sub, config, "Test Feed");
    expect(result).not.toBeNull();
  });

  // No quiet hours configured

  it("allows notification at any time when no quiet hours configured", () => {
    setSystemTime(3, 0); // 03:00 — would be quiet if configured
    const result = shouldNotify(makeItem(), makeSub(), baseConfig, "Test Feed");
    expect(result).not.toBeNull();
  });
});
