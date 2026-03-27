import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  feedsCommand,
  shortFeedName,
  relativeDate,
  saveLastListing,
  loadLastListing,
} from "./feeds.js";
import { subscribe } from "../reader/subscriptions.js";
import { ingestItems, listItems, getItem, markRead, starItem } from "../reader/store.js";
import type { ParsedItem, StoredItem } from "../reader/types.js";
import { ensureReaderDir } from "../reader/paths.js";
import { scaffoldSite } from "../generator/site.js";
import type { SiteConfig } from "../config/types.js";

let siteDir: string;

beforeEach(async () => {
  siteDir = await mkdtemp(join(tmpdir(), "rsslobster-feeds-test-"));
});

afterEach(async () => {
  await rm(siteDir, { recursive: true, force: true });
});

const FEED_A = "https://a.com/feed.xml";
const FEED_B = "https://b.com/feed.xml";

function makeItem(overrides: Partial<ParsedItem> = {}): ParsedItem {
  return {
    id: "item-1",
    title: "Test Item",
    link: "https://example.com/item-1",
    content: "<p>Test content</p>",
    publishedAt: "2026-03-20T12:00:00.000Z",
    categories: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// shortFeedName
// ---------------------------------------------------------------------------

describe("shortFeedName", () => {
  it("returns short titles unchanged", () => {
    expect(shortFeedName("Simon Willison")).toBe("Simon Willison");
  });

  it("returns titles at 25 chars unchanged", () => {
    expect(shortFeedName("A".repeat(25))).toBe("A".repeat(25));
  });

  it("truncates at separator: em dash", () => {
    expect(shortFeedName("Julia Evans — Wizard Zines Blog")).toBe("Julia Evans");
  });

  it("truncates at separator: pipe", () => {
    expect(shortFeedName("TechCrunch | Startup and Technology News")).toBe("TechCrunch");
  });

  it("truncates at separator: dash", () => {
    expect(shortFeedName("Hacker News - Best Stories")).toBe("Hacker News");
  });

  it("truncates at separator: colon", () => {
    expect(shortFeedName("The Verge Blog: All Posts and Updates")).toBe("The Verge Blog");
  });

  it("takes first word for very long sentence-like titles", () => {
    const long = "Lobsters is a technology-focused community centered around link aggregation and discussion";
    expect(shortFeedName(long)).toBe("Lobsters");
  });

  it("truncates at word boundary for medium-long titles", () => {
    expect(shortFeedName("A Really Good Blog About Things")).toBe("A Really Good Blog About");
  });

  it("ignores separators past position 40", () => {
    const title = "A".repeat(41) + " — tagline";
    // No separator before pos 40, falls through to word boundary logic
    expect(shortFeedName(title).length).toBeLessThanOrEqual(25);
  });
});

// ---------------------------------------------------------------------------
// relativeDate
// ---------------------------------------------------------------------------

describe("relativeDate", () => {
  it("shows minutes for recent items", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(relativeDate(fiveMinAgo)).toBe("5m");
  });

  it("shows hours for items less than a day old", () => {
    const threeHrsAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(relativeDate(threeHrsAgo)).toBe("3h");
  });

  it("shows day name for items less than a week old", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
    const result = relativeDate(threeDaysAgo.toISOString());
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    expect(days).toContain(result);
  });

  it("shows month and date for older items", () => {
    const result = relativeDate("2026-01-15T12:00:00.000Z");
    expect(result).toBe("Jan 15");
  });

  it("handles 0 minutes ago", () => {
    const now = new Date().toISOString();
    expect(relativeDate(now)).toBe("0m");
  });
});

// ---------------------------------------------------------------------------
// Last listing persistence
// ---------------------------------------------------------------------------

describe("saveLastListing / loadLastListing", () => {
  it("round-trips listing data", async () => {
    await ensureReaderDir(siteDir);
    await subscribe(siteDir, FEED_A, "Feed A");
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1", title: "First" }),
      makeItem({ id: "2", title: "Second" }),
    ]);

    const items = await listItems(siteDir);
    await saveLastListing(siteDir, items);

    const loaded = await loadLastListing(siteDir);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].title).toBe("First");
    expect(loaded[0].dedupKey).toBe("id:1");
    expect(loaded[0].feedUrl).toBe(FEED_A);
  });

  it("returns empty array when no listing exists", async () => {
    const loaded = await loadLastListing(siteDir);
    expect(loaded).toEqual([]);
  });

  it("preserves content and categories", async () => {
    await ensureReaderDir(siteDir);
    await subscribe(siteDir, FEED_A, "Feed A");
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1", title: "Test", content: "<p>Hello</p>", categories: ["tech", "rss"] }),
    ]);

    const items = await listItems(siteDir);
    await saveLastListing(siteDir, items);
    const loaded = await loadLastListing(siteDir);

    expect(loaded[0].content).toBe("<p>Hello</p>");
    expect(loaded[0].categories).toEqual(["tech", "rss"]);
  });
});

// ---------------------------------------------------------------------------
// feedsCommand structure
// ---------------------------------------------------------------------------

describe("feedCommand", () => {
  it("is named feed", () => {
    expect(feedsCommand.name()).toBe("feed");
  });

  it("has list as default subcommand", () => {
    const list = feedsCommand.commands.find((c) => c.name() === "list");
    expect(list).toBeTruthy();
  });

  it("registers all expected subcommands", () => {
    const names = feedsCommand.commands.map((c) => c.name());
    expect(names).toContain("list");
    expect(names).toContain("add");
    expect(names).toContain("remove");
    expect(names).toContain("poll");
    expect(names).toContain("items");
    expect(names).toContain("read");
    expect(names).toContain("star");
    expect(names).toContain("unstar");
    expect(names).toContain("reblog");
    expect(names).toContain("share");
    expect(names).toContain("mark-read");
    expect(names).toContain("mute");
    expect(names).toContain("unmute");
    expect(names).toContain("filter");
    expect(names).toContain("notify");
    expect(names).toContain("recap");
    expect(names).toContain("import");
    expect(names).toContain("export");
  });
});

// ---------------------------------------------------------------------------
// Integration: list command behavior
// ---------------------------------------------------------------------------

describe("feeds list behavior", () => {
  it("shows no subscriptions message when empty", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const list = feedsCommand.commands.find((c) => c.name() === "list")!;
    await list.parseAsync(["node", "test", siteDir]);

    expect(logs.some((l) => l.includes("No subscriptions"))).toBe(true);
    vi.restoreAllMocks();
  });

  it("shows all caught up when no unread items", async () => {
    await subscribe(siteDir, FEED_A, "Feed A");
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "1" })]);
    await markRead(siteDir, "id:1");

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const list = feedsCommand.commands.find((c) => c.name() === "list")!;
    await list.parseAsync(["node", "test", siteDir]);

    expect(logs.some((l) => l.includes("All caught up"))).toBe(true);
    vi.restoreAllMocks();
  });

  it("shows unread items with numbering", async () => {
    await subscribe(siteDir, FEED_A, "Feed A");
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1", title: "First Post" }),
      makeItem({ id: "2", title: "Second Post", publishedAt: "2026-03-21T12:00:00.000Z" }),
    ]);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const list = feedsCommand.commands.find((c) => c.name() === "list")!;
    await list.parseAsync(["node", "test", siteDir]);

    // Should show items with numbers (strip ANSI for content check)
    const stripped = logs.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    expect(stripped.some((l) => l.includes("1.") && l.includes("Second Post"))).toBe(true);
    expect(stripped.some((l) => l.includes("2.") && l.includes("First Post"))).toBe(true);
    vi.restoreAllMocks();
  });

  it("saves listing for later read/star commands", async () => {
    await subscribe(siteDir, FEED_A, "Feed A");
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1", title: "Test Item" }),
    ]);

    vi.spyOn(console, "log").mockImplementation(() => {});
    const list = feedsCommand.commands.find((c) => c.name() === "list")!;
    await list.parseAsync(["node", "test", siteDir]);
    vi.restoreAllMocks();

    const listing = await loadLastListing(siteDir);
    expect(listing).toHaveLength(1);
    expect(listing[0].title).toBe("Test Item");
  });

  it("--subs shows subscriptions with counts", async () => {
    await subscribe(siteDir, FEED_A, "Feed A");
    await ingestItems(siteDir, FEED_A, [makeItem({ id: "1" })]);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const list = feedsCommand.commands.find((c) => c.name() === "list")!;
    await list.parseAsync(["node", "test", "--subs", siteDir]);

    const stripped = logs.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    expect(stripped.some((l) => l.includes("Feed A") && l.includes("1/1"))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Integration: items command behavior
// ---------------------------------------------------------------------------

describe("feeds items behavior", () => {
  it("shows no unread items message when empty", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const items = feedsCommand.commands.find((c) => c.name() === "items")!;
    await items.parseAsync(["node", "test", siteDir]);

    expect(logs.some((l) => l.includes("No") && l.includes("items"))).toBe(true);
    vi.restoreAllMocks();
  });

  it("shows starred items with --starred flag", async () => {
    await subscribe(siteDir, FEED_A, "Feed A");
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1", title: "Starred Item" }),
    ]);
    await starItem(siteDir, "id:1");

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const items = feedsCommand.commands.find((c) => c.name() === "items")!;
    await items.parseAsync(["node", "test", "--starred", siteDir]);

    const stripped = logs.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    expect(stripped.some((l) => l.includes("Starred Item"))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Integration: read command behavior
// ---------------------------------------------------------------------------

describe("feeds read behavior", () => {
  it("displays item content and marks as read", async () => {
    await subscribe(siteDir, FEED_A, "Feed A");
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1", title: "Read Me", content: "<p>Hello world content</p>", author: "Author Name" }),
    ]);

    // First create a listing
    const items = await listItems(siteDir);
    await saveLastListing(siteDir, items);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const read = feedsCommand.commands.find((c) => c.name() === "read")!;
    await read.parseAsync(["node", "test", "1", siteDir]);

    const stripped = logs.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    expect(stripped.some((l) => l.includes("Read Me"))).toBe(true);
    expect(stripped.some((l) => l.includes("Hello world content"))).toBe(true);
    expect(stripped.some((l) => l.includes("by Author Name"))).toBe(true);

    // Verify marked as read
    const item = await getItem(siteDir, "id:1");
    expect(item!.read).toBe(true);
    vi.restoreAllMocks();
  });

  it("errors on invalid item number", async () => {
    await ensureReaderDir(siteDir);
    // Create empty listing
    await saveLastListing(siteDir, []);

    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    const read = feedsCommand.commands.find((c) => c.name() === "read")!;
    await expect(read.parseAsync(["node", "test", "1", siteDir])).rejects.toThrow("exit");

    expect(errors.some((e) => e.includes("No item #1"))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Integration: star / unstar behavior
// ---------------------------------------------------------------------------

describe("feeds star/unstar behavior", () => {
  it("stars and unstars items by listing number", async () => {
    await subscribe(siteDir, FEED_A, "Feed A");
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1", title: "Star This" }),
    ]);
    const items = await listItems(siteDir);
    await saveLastListing(siteDir, items);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const star = feedsCommand.commands.find((c) => c.name() === "star")!;
    await star.parseAsync(["node", "test", "1", siteDir]);
    expect(logs.some((l) => l.includes("Starred"))).toBe(true);

    const item = await getItem(siteDir, "id:1");
    expect(item!.starred).toBe(true);

    logs.length = 0;
    const unstar = feedsCommand.commands.find((c) => c.name() === "unstar")!;
    await unstar.parseAsync(["node", "test", "1", siteDir]);
    expect(logs.some((l) => l.includes("Unstarred"))).toBe(true);

    const item2 = await getItem(siteDir, "id:1");
    expect(item2!.starred).toBe(false);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Integration: mark-read behavior
// ---------------------------------------------------------------------------

describe("feeds mark-read behavior", () => {
  it("marks all items as read with --all", async () => {
    await subscribe(siteDir, FEED_A, "Feed A");
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1" }),
      makeItem({ id: "2" }),
    ]);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const markReadCmd = feedsCommand.commands.find((c) => c.name() === "mark-read")!;
    await markReadCmd.parseAsync(["node", "test", "--all", siteDir]);

    expect(logs.some((l) => l.includes("Marked 2 item(s) as read"))).toBe(true);

    const unread = await listItems(siteDir, { read: false });
    expect(unread).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it("errors when neither --all nor --feed provided", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    const markReadCmd = feedsCommand.commands.find((c) => c.name() === "mark-read")!;
    await expect(markReadCmd.parseAsync(["node", "test", siteDir])).rejects.toThrow("exit");

    expect(errors.some((e) => e.includes("Provide --all or --feed"))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Integration: mute / unmute behavior
// ---------------------------------------------------------------------------

describe("feeds mute/unmute behavior", () => {
  it("mutes a subscription", async () => {
    await subscribe(siteDir, FEED_A, "Feed A");

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const mute = feedsCommand.commands.find((c) => c.name() === "mute")!;
    await mute.parseAsync(["node", "test", FEED_A, siteDir]);

    expect(logs.some((l) => l.includes("Muted"))).toBe(true);
    vi.restoreAllMocks();
  });

  it("errors when muting non-existent subscription", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    const mute = feedsCommand.commands.find((c) => c.name() === "mute")!;
    await expect(mute.parseAsync(["node", "test", "https://nonexistent.com/feed", siteDir])).rejects.toThrow("exit");

    expect(errors.some((e) => e.includes("Not subscribed"))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Integration: filter behavior
// ---------------------------------------------------------------------------

describe("feeds filter behavior", () => {
  it("sets keyword filters on a feed", async () => {
    await subscribe(siteDir, FEED_A, "Feed A");

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const filter = feedsCommand.commands.find((c) => c.name() === "filter")!;
    await filter.parseAsync(["node", "test", FEED_A, siteDir, "--keywords", "rust", "typescript"]);

    expect(logs.some((l) => l.includes("rust") && l.includes("typescript"))).toBe(true);
    vi.restoreAllMocks();
  });

  it("clears filters with --clear", async () => {
    await subscribe(siteDir, FEED_A, "Feed A");

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const filter = feedsCommand.commands.find((c) => c.name() === "filter")!;
    await filter.parseAsync(["node", "test", FEED_A, siteDir, "--clear"]);

    expect(logs.some((l) => l.includes("Cleared filters"))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Integration: share behavior
// ---------------------------------------------------------------------------

const REBLOG_SITE_CONFIG: SiteConfig = {
  domain: "example.com",
  title: "Test Blog",
  description: "A test blog",
  author: "Tester",
  language: "en",
  style: { preset: "minimal" },
  repo: "",
};

describe("feeds reblog", () => {
  it("is registered as a subcommand", () => {
    const reblog = feedsCommand.commands.find((c) => c.name() === "reblog");
    expect(reblog).toBeDefined();
  });

  it("publishes link post and marks item as read", async () => {
    await scaffoldSite(siteDir, REBLOG_SITE_CONFIG);
    await subscribe(siteDir, FEED_A, "Feed A");
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1", title: "Share This", link: "https://example.com/post" }),
    ]);
    const items = await listItems(siteDir);
    await saveLastListing(siteDir, items);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const reblog = feedsCommand.commands.find((c) => c.name() === "reblog")!;
    await reblog.parseAsync(["node", "test", "1", siteDir]);

    expect(logs.some((l) => l.includes("Reblogged"))).toBe(true);
    expect(logs.some((l) => l.includes("Share This"))).toBe(true);

    const item = await getItem(siteDir, "id:1");
    expect(item!.read).toBe(true);
    vi.restoreAllMocks();
  });

  it("includes commentary when -m is provided", async () => {
    await scaffoldSite(siteDir, REBLOG_SITE_CONFIG);
    await subscribe(siteDir, FEED_A, "Feed A");
    await ingestItems(siteDir, FEED_A, [
      makeItem({ id: "1", title: "Share This", link: "https://example.com/post" }),
    ]);
    const items = await listItems(siteDir);
    await saveLastListing(siteDir, items);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const reblog = feedsCommand.commands.find((c) => c.name() === "reblog")!;
    await reblog.parseAsync(["node", "test", "1", "-m", "Great read!", siteDir]);

    expect(logs.some((l) => l.includes("Reblogged"))).toBe(true);

    // Verify the post was created with commentary
    const postsRaw = await readFile(join(siteDir, "posts.json"), "utf-8");
    const posts = JSON.parse(postsRaw);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0].body).toContain("Great read!");

    vi.restoreAllMocks();
  });

  it("rejects invalid item number", async () => {
    await scaffoldSite(siteDir, REBLOG_SITE_CONFIG);
    await ensureReaderDir(siteDir);
    await saveLastListing(siteDir, []);

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const reblog = feedsCommand.commands.find((c) => c.name() === "reblog")!;
    await expect(
      reblog.parseAsync(["node", "test", "99", siteDir]),
    ).rejects.toThrow("process.exit");

    vi.restoreAllMocks();
  });
});

describe("feeds share is aliased to reblog", () => {
  it("share still exists as an alias", () => {
    const share = feedsCommand.commands.find((c) => c.name() === "share");
    expect(share).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Integration: import / export behavior
// ---------------------------------------------------------------------------

describe("feeds export behavior", () => {
  it("exports subscriptions as OPML", async () => {
    await subscribe(siteDir, FEED_A, "Feed A");
    await subscribe(siteDir, FEED_B, "Feed B");

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const exp = feedsCommand.commands.find((c) => c.name() === "export")!;
    await exp.parseAsync(["node", "test", siteDir]);

    const output = logs.join("\n");
    expect(output).toContain("<opml");
    expect(output).toContain("Feed A");
    expect(output).toContain("Feed B");
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Integration: notify behavior
// ---------------------------------------------------------------------------

describe("feeds notify behavior", () => {
  it("shows notification config when no flags", async () => {
    await ensureReaderDir(siteDir);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const notify = feedsCommand.commands.find((c) => c.name() === "notify")!;
    await notify.parseAsync(["node", "test", siteDir]);

    expect(logs.some((l) => l.includes("Notification settings"))).toBe(true);
    expect(logs.some((l) => l.includes("Enabled"))).toBe(true);
    expect(logs.some((l) => l.includes("Schedule"))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Integration: recap behavior
// ---------------------------------------------------------------------------

describe("feeds recap behavior", () => {
  it("shows recap config when no flags", async () => {
    await ensureReaderDir(siteDir);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const recap = feedsCommand.commands.find((c) => c.name() === "recap")!;
    await recap.parseAsync(["node", "test", siteDir]);

    expect(logs.some((l) => l.includes("Recap settings"))).toBe(true);
    expect(logs.some((l) => l.includes("Enabled"))).toBe(true);
    expect(logs.some((l) => l.includes("Frequency"))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe("pagination", () => {
  it("respects --limit and --page for list command", async () => {
    await subscribe(siteDir, FEED_A, "Feed A");
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({
        id: `item-${i}`,
        title: `Item ${i}`,
        publishedAt: new Date(Date.now() - i * 3600000).toISOString(),
      }),
    );
    await ingestItems(siteDir, FEED_A, items);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const list = feedsCommand.commands.find((c) => c.name() === "list")!;
    await list.parseAsync(["node", "test", "-n", "3", "-p", "1", siteDir]);

    // Should show page info and pagination hint
    const stripped = logs.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    expect(stripped.some((l) => l.includes("page 1/"))).toBe(true);
    expect(stripped.some((l) => l.includes("Next:"))).toBe(true);

    // Should have saved 3 items to listing
    const listing = await loadLastListing(siteDir);
    expect(listing).toHaveLength(3);
    vi.restoreAllMocks();
  });
});
