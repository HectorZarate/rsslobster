import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  subscribe,
  unsubscribe,
  listSubscriptions,
  getSubscription,
  updateSubscription,
  recordFetchSuccess,
  recordFetchError,
  listFolders,
  moveToFolder,
} from "./subscriptions.js";

let siteDir: string;

beforeEach(async () => {
  siteDir = await mkdtemp(join(tmpdir(), "rsslobster-reader-test-"));
});

afterEach(async () => {
  await rm(siteDir, { recursive: true, force: true });
});

describe("subscribe", () => {
  it("creates a new subscription", async () => {
    const sub = await subscribe(
      siteDir,
      "https://example.com/feed.xml",
      "Example Feed",
    );

    expect(sub.feedUrl).toBe("https://example.com/feed.xml");
    expect(sub.title).toBe("Example Feed");
    expect(sub.errorCount).toBe(0);
    expect(sub.addedAt).toBeTruthy();
  });

  it("stores optional siteUrl and folder", async () => {
    const sub = await subscribe(
      siteDir,
      "https://example.com/feed.xml",
      "Example",
      { siteUrl: "https://example.com", folder: "tech" },
    );

    expect(sub.siteUrl).toBe("https://example.com");
    expect(sub.folder).toBe("tech");
  });

  it("rejects duplicate feed URLs", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Example");
    await expect(
      subscribe(siteDir, "https://example.com/feed.xml", "Duplicate"),
    ).rejects.toThrow("Already subscribed");
  });

  it("allows different feed URLs", async () => {
    await subscribe(siteDir, "https://a.com/feed.xml", "Feed A");
    await subscribe(siteDir, "https://b.com/feed.xml", "Feed B");

    const subs = await listSubscriptions(siteDir);
    expect(subs).toHaveLength(2);
  });

  it("creates the reader directory if it does not exist", async () => {
    const sub = await subscribe(siteDir, "https://x.com/f.xml", "X");
    expect(sub).toBeTruthy();
  });
});

describe("unsubscribe", () => {
  it("removes an existing subscription", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Example");
    const removed = await unsubscribe(siteDir, "https://example.com/feed.xml");

    expect(removed).toBe(true);

    const found = await getSubscription(
      siteDir,
      "https://example.com/feed.xml",
    );
    expect(found).toBeNull();
  });

  it("returns false for non-existent URL", async () => {
    const removed = await unsubscribe(siteDir, "https://nope.com/feed.xml");
    expect(removed).toBe(false);
  });

  it("requires exact URL — no partial matching", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Example");
    const removed = await unsubscribe(siteDir, "https://example.com/");
    expect(removed).toBe(false);

    // Original still exists
    const found = await getSubscription(
      siteDir,
      "https://example.com/feed.xml",
    );
    expect(found).not.toBeNull();
  });
});

describe("listSubscriptions", () => {
  it("returns empty array when no subscriptions", async () => {
    const subs = await listSubscriptions(siteDir);
    expect(subs).toEqual([]);
  });

  it("returns all subscriptions sorted alphabetically by title", async () => {
    await subscribe(siteDir, "https://z.com/feed.xml", "Zebra Blog");
    await subscribe(siteDir, "https://a.com/feed.xml", "Alpha Feed");
    await subscribe(siteDir, "https://m.com/feed.xml", "Middle Ground");

    const subs = await listSubscriptions(siteDir);
    expect(subs.map((s) => s.title)).toEqual([
      "Alpha Feed",
      "Middle Ground",
      "Zebra Blog",
    ]);
  });

  it("filters by folder", async () => {
    await subscribe(siteDir, "https://a.com/feed.xml", "A", {
      folder: "tech",
    });
    await subscribe(siteDir, "https://b.com/feed.xml", "B", {
      folder: "news",
    });
    await subscribe(siteDir, "https://c.com/feed.xml", "C", {
      folder: "tech",
    });

    const tech = await listSubscriptions(siteDir, { folder: "tech" });
    expect(tech).toHaveLength(2);
    expect(tech.map((s) => s.title)).toEqual(["A", "C"]);
  });

  it("case-insensitive alphabetical sort", async () => {
    await subscribe(siteDir, "https://a.com/feed.xml", "alpha");
    await subscribe(siteDir, "https://b.com/feed.xml", "Beta");

    const subs = await listSubscriptions(siteDir);
    expect(subs[0]!.title).toBe("alpha");
    expect(subs[1]!.title).toBe("Beta");
  });
});

describe("getSubscription", () => {
  it("returns subscription by feed URL", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Example");
    const sub = await getSubscription(
      siteDir,
      "https://example.com/feed.xml",
    );

    expect(sub).not.toBeNull();
    expect(sub!.title).toBe("Example");
  });

  it("returns null for unknown URL", async () => {
    const sub = await getSubscription(siteDir, "https://nope.com/feed.xml");
    expect(sub).toBeNull();
  });
});

describe("updateSubscription", () => {
  it("updates title", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Old Title");
    const updated = await updateSubscription(
      siteDir,
      "https://example.com/feed.xml",
      { title: "New Title" },
    );

    expect(updated!.title).toBe("New Title");
    expect(updated!.feedUrl).toBe("https://example.com/feed.xml"); // immutable
  });

  it("does not allow feedUrl mutation", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Example");
    const updated = await updateSubscription(
      siteDir,
      "https://example.com/feed.xml",
      { title: "Updated" },
    );

    expect(updated!.feedUrl).toBe("https://example.com/feed.xml");
  });

  it("returns null for non-existent subscription", async () => {
    const result = await updateSubscription(siteDir, "https://nope.com/f", {
      title: "X",
    });
    expect(result).toBeNull();
  });

  it("deep-merges notify — muting preserves filter and priority", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Example");
    // Set filter and priority
    await updateSubscription(siteDir, "https://example.com/feed.xml", {
      notify: { filter: ["important", "breaking"], priority: "high" },
    });
    // Mute — should NOT clobber filter/priority
    await updateSubscription(siteDir, "https://example.com/feed.xml", {
      notify: { muted: true },
    });

    const sub = await getSubscription(siteDir, "https://example.com/feed.xml");
    expect(sub!.notify!.muted).toBe(true);
    expect(sub!.notify!.filter).toEqual(["important", "breaking"]);
    expect(sub!.notify!.priority).toBe("high");
  });

  it("deep-merges notify — updating filter preserves muted state", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Example");
    await updateSubscription(siteDir, "https://example.com/feed.xml", {
      notify: { muted: true },
    });
    await updateSubscription(siteDir, "https://example.com/feed.xml", {
      notify: { filter: ["crypto"] },
    });

    const sub = await getSubscription(siteDir, "https://example.com/feed.xml");
    expect(sub!.notify!.muted).toBe(true);
    expect(sub!.notify!.filter).toEqual(["crypto"]);
  });
});

describe("recordFetchSuccess", () => {
  it("records successful fetch with conditional GET headers", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Example");
    await recordFetchSuccess(siteDir, "https://example.com/feed.xml", {
      etag: '"abc123"',
      lastModified: "Thu, 19 Mar 2026 10:00:00 GMT",
    });

    const sub = await getSubscription(
      siteDir,
      "https://example.com/feed.xml",
    );
    expect(sub!.lastFetchedAt).toBeTruthy();
    expect(sub!.etag).toBe('"abc123"');
    expect(sub!.lastModified).toBe("Thu, 19 Mar 2026 10:00:00 GMT");
    expect(sub!.errorCount).toBe(0);
  });

  it("resets error count on success", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Example");
    await recordFetchError(siteDir, "https://example.com/feed.xml", "timeout");
    await recordFetchError(siteDir, "https://example.com/feed.xml", "timeout");

    const before = await getSubscription(
      siteDir,
      "https://example.com/feed.xml",
    );
    expect(before!.errorCount).toBe(2);

    await recordFetchSuccess(siteDir, "https://example.com/feed.xml");

    const after = await getSubscription(
      siteDir,
      "https://example.com/feed.xml",
    );
    expect(after!.errorCount).toBe(0);
  });
});

describe("recordFetchError", () => {
  it("increments error count", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Example");
    await recordFetchError(siteDir, "https://example.com/feed.xml", "500");

    const sub = await getSubscription(
      siteDir,
      "https://example.com/feed.xml",
    );
    expect(sub!.errorCount).toBe(1);
    expect(sub!.lastError).toBe("500");
  });

  it("increments consecutively", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Example");
    await recordFetchError(siteDir, "https://example.com/feed.xml", "err1");
    await recordFetchError(siteDir, "https://example.com/feed.xml", "err2");
    await recordFetchError(siteDir, "https://example.com/feed.xml", "err3");

    const sub = await getSubscription(
      siteDir,
      "https://example.com/feed.xml",
    );
    expect(sub!.errorCount).toBe(3);
    expect(sub!.lastError).toBe("err3");
  });

  it("silently ignores unknown feed URLs", async () => {
    // Should not throw
    await recordFetchError(siteDir, "https://nope.com/feed.xml", "err");
  });
});

describe("listFolders", () => {
  it("returns unique folder names sorted", async () => {
    await subscribe(siteDir, "https://a.com/f", "A", { folder: "tech" });
    await subscribe(siteDir, "https://b.com/f", "B", { folder: "news" });
    await subscribe(siteDir, "https://c.com/f", "C", { folder: "tech" });
    await subscribe(siteDir, "https://d.com/f", "D"); // no folder

    const folders = await listFolders(siteDir);
    expect(folders).toEqual(["news", "tech"]);
  });

  it("returns empty array when no folders", async () => {
    await subscribe(siteDir, "https://a.com/f", "A");
    const folders = await listFolders(siteDir);
    expect(folders).toEqual([]);
  });
});

describe("moveToFolder", () => {
  it("moves a subscription to a folder", async () => {
    await subscribe(siteDir, "https://a.com/f", "A");
    const moved = await moveToFolder(siteDir, "https://a.com/f", "tech");

    expect(moved!.folder).toBe("tech");
  });

  it("removes folder when set to undefined", async () => {
    await subscribe(siteDir, "https://a.com/f", "A", { folder: "tech" });
    const moved = await moveToFolder(siteDir, "https://a.com/f", undefined);

    expect(moved!.folder).toBeUndefined();
  });

  it("returns null for non-existent subscription", async () => {
    const result = await moveToFolder(siteDir, "https://nope.com/f", "x");
    expect(result).toBeNull();
  });
});

// UX safety tests
describe("UX: safety and consistency", () => {
  it("subscribe returns the full subscription for user confirmation", async () => {
    const sub = await subscribe(
      siteDir,
      "https://example.com/feed.xml",
      "Example",
      { folder: "tech" },
    );

    expect(sub.feedUrl).toBeTruthy();
    expect(sub.title).toBeTruthy();
    expect(sub.addedAt).toBeTruthy();
    expect(sub.folder).toBe("tech");
    expect(sub.errorCount).toBe(0);
  });

  it("list order is deterministic", async () => {
    await subscribe(siteDir, "https://c.com/f", "C");
    await subscribe(siteDir, "https://a.com/f", "A");
    await subscribe(siteDir, "https://b.com/f", "B");

    const list1 = await listSubscriptions(siteDir);
    const list2 = await listSubscriptions(siteDir);

    expect(list1.map((s) => s.feedUrl)).toEqual(
      list2.map((s) => s.feedUrl),
    );
  });
});

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

describe("URL validation", () => {
  it("rejects empty feed URL", async () => {
    await expect(subscribe(siteDir, "", "Empty")).rejects.toThrow(
      "Invalid feed URL",
    );
  });

  it("rejects non-URL strings", async () => {
    await expect(
      subscribe(siteDir, "not-a-url", "Bad"),
    ).rejects.toThrow("Invalid feed URL");
  });

  it("rejects ftp:// URLs", async () => {
    await expect(
      subscribe(siteDir, "ftp://example.com/feed", "FTP"),
    ).rejects.toThrow("Invalid feed URL");
  });

  it("accepts http:// URLs and normalizes to https", async () => {
    const sub = await subscribe(
      siteDir,
      "http://example.com/feed.xml",
      "HTTP Feed",
    );
    expect(sub.feedUrl).toBe("https://example.com/feed.xml");
  });

  it("accepts https:// URLs", async () => {
    const sub = await subscribe(
      siteDir,
      "https://example.com/feed.xml",
      "HTTPS Feed",
    );
    expect(sub.feedUrl).toBe("https://example.com/feed.xml");
  });

  it("strips trailing slashes from feed URLs", async () => {
    const sub = await subscribe(
      siteDir,
      "https://example.com/feed/",
      "Trailing Slash",
    );
    expect(sub.feedUrl).toBe("https://example.com/feed");
  });

  it("lowercases hostname", async () => {
    const sub = await subscribe(
      siteDir,
      "https://EXAMPLE.COM/Feed.xml",
      "Upper Host",
    );
    expect(sub.feedUrl).toBe("https://example.com/Feed.xml");
  });

  it("detects duplicates after normalization", async () => {
    await subscribe(siteDir, "https://example.com/feed.xml", "Original");
    await expect(
      subscribe(siteDir, "http://example.com/feed.xml/", "Duplicate"),
    ).rejects.toThrow("Already subscribed");
  });
});

// ---------------------------------------------------------------------------
// Corrupt data handling
// ---------------------------------------------------------------------------

describe("corrupt data", () => {
  it("throws with clear message when subscriptions.json is corrupt", async () => {
    const dir = join(siteDir, "reader");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "subscriptions.json"), "{{{BROKEN");

    await expect(listSubscriptions(siteDir)).rejects.toThrow(
      "Corrupt subscriptions file",
    );
  });

  it("returns empty array when file does not exist", async () => {
    const subs = await listSubscriptions(siteDir);
    expect(subs).toEqual([]);
  });
});
