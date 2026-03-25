import { readFile } from "node:fs/promises";
import type { ParsedItem, StoredItem } from "./types.js";
import {
  ensureFeedDir,
  ensureReaderDir,
  feedItemsPath,
  feedSlug,
  listFeedSlugs,
  contentHash,
  writeJsonAtomic,
  unreadIndexPath,
} from "./paths.js";

/**
 * Item store for the RSS reader.
 *
 * Items are stored per-feed: {siteDir}/reader/feeds/{slug}/items.json
 * Each feed gets its own directory and items file.
 *
 * Dedup strategy (in priority order):
 *   1. Item id (guid in RSS, id in Atom)
 *   2. Item link
 *   3. SHA-256 hash of title + content
 *
 * Concurrency-safe per-feed — a per-slug promise-chain lock serialises all
 * write operations so concurrent callers on the same feed never interleave.
 */

// ---------------------------------------------------------------------------
// Per-feed mutex
// ---------------------------------------------------------------------------

const locks = new Map<string, Promise<void>>();

async function withFeedLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(slug) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(slug, next.then(() => {}, () => {}));
  return next;
}

// ---------------------------------------------------------------------------
// Per-feed I/O
// ---------------------------------------------------------------------------

/** Load items for a single feed. Throws on corrupt JSON; returns [] if file missing. */
async function loadFeedItems(
  siteDir: string,
  slug: string,
): Promise<StoredItem[]> {
  const path = feedItemsPath(siteDir, slug);
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return [];
  }
  try {
    return JSON.parse(raw) as StoredItem[];
  } catch (e) {
    throw new Error(
      `Corrupt items file at ${path}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** Save items for a single feed (atomic write). */
async function saveFeedItems(
  siteDir: string,
  slug: string,
  items: StoredItem[],
): Promise<void> {
  await ensureFeedDir(siteDir, slug);
  await writeJsonAtomic(feedItemsPath(siteDir, slug), items);
}

/** Load ALL items across all feeds. */
async function loadAllItems(siteDir: string): Promise<StoredItem[]> {
  const slugs = await listFeedSlugs(siteDir);
  const all: StoredItem[] = [];
  for (const slug of slugs) {
    const items = await loadFeedItems(siteDir, slug);
    all.push(...items);
  }
  return all;
}

// ---------------------------------------------------------------------------
// Unread index — lightweight cache for fast unread queries
// ---------------------------------------------------------------------------

interface UnreadEntry {
  feedUrl: string;
  dedupKey: string;
  publishedAt?: string;
  firstSeenAt: string;
}

async function loadUnreadIndex(siteDir: string): Promise<UnreadEntry[]> {
  try {
    const raw = await readFile(unreadIndexPath(siteDir), "utf-8");
    return JSON.parse(raw) as UnreadEntry[];
  } catch {
    return [];
  }
}

async function saveUnreadIndex(siteDir: string, entries: UnreadEntry[]): Promise<void> {
  await ensureReaderDir(siteDir);
  await writeJsonAtomic(unreadIndexPath(siteDir), entries);
}

/** Rebuild the unread index from scratch by scanning all feeds. */
export async function rebuildUnreadIndex(siteDir: string): Promise<number> {
  const all = await loadAllItems(siteDir);
  const entries: UnreadEntry[] = all
    .filter((i) => !i.read)
    .map((i) => ({
      feedUrl: i.feedUrl,
      dedupKey: i.dedupKey,
      publishedAt: i.publishedAt,
      firstSeenAt: i.firstSeenAt,
    }));
  await saveUnreadIndex(siteDir, entries);
  return entries.length;
}

// ---------------------------------------------------------------------------
// Internal DRY helper for item mutations
// ---------------------------------------------------------------------------

/**
 * Load items for the given feed slugs, apply `updater` to matching items,
 * and save back any changed files. Returns the number of items modified.
 *
 * `keys` — dedupKey(s) to match. Pass `"*"` to match every item.
 * `updater` — called for each matched item; return `true` if the item was changed.
 */
async function updateItems(
  siteDir: string,
  keys: string | string[],
  updater: (item: StoredItem) => boolean,
): Promise<number> {
  const matchAll = keys === "*";
  const keySet = matchAll ? null : new Set(Array.isArray(keys) ? keys : [keys]);
  const slugs = await listFeedSlugs(siteDir);
  let count = 0;

  for (const slug of slugs) {
    await withFeedLock(slug, async () => {
      const items = await loadFeedItems(siteDir, slug);
      let changed = false;
      for (const item of items) {
        if (!matchAll && !keySet!.has(item.dedupKey)) continue;
        if (updater(item)) {
          changed = true;
          count++;
        }
      }
      if (changed) await saveFeedItems(siteDir, slug, items);
    });
  }

  return count;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Generate a dedup key for an item: id > link > hash(title+content) */
export function dedupKey(item: ParsedItem): string {
  if (item.id) return `id:${item.id}`;
  if (item.link) return `link:${item.link}`;
  return `hash:${contentHash(item.title, item.content)}`;
}

/**
 * Ingest new items from a feed. Returns the count of new (non-duplicate) items added.
 * Existing items are detected by dedupKey and skipped.
 */
export async function ingestItems(
  siteDir: string,
  feedUrl: string,
  parsedItems: ParsedItem[],
): Promise<number> {
  const slug = feedSlug(feedUrl);

  return withFeedLock(slug, async () => {
    const existing = await loadFeedItems(siteDir, slug);
    const existingKeys = new Set(existing.map((i) => i.dedupKey));
    const now = new Date().toISOString();

    let added = 0;
    const newEntries: UnreadEntry[] = [];
    for (const item of parsedItems) {
      const key = dedupKey(item);
      if (existingKeys.has(key)) continue;

      const stored: StoredItem = {
        ...item,
        feedUrl,
        dedupKey: key,
        firstSeenAt: now,
        read: false,
        starred: false,
      };

      existing.push(stored);
      existingKeys.add(key);
      newEntries.push({
        feedUrl,
        dedupKey: key,
        publishedAt: item.publishedAt,
        firstSeenAt: now,
      });
      added++;
    }

    if (added > 0) {
      await saveFeedItems(siteDir, slug, existing);

      // Append to unread index
      const index = await loadUnreadIndex(siteDir);
      index.push(...newEntries);
      await saveUnreadIndex(siteDir, index);
    }

    return added;
  });
}

/** Item list filter options */
export interface ItemFilter {
  feedUrl?: string;
  read?: boolean;
  starred?: boolean;
  /** Only items ingested after this timestamp */
  since?: string;
}

/**
 * List items, newest first (by publishedAt, then firstSeenAt).
 * Supports filtering by feedUrl, read state, starred state, and time range.
 */
export async function listItems(
  siteDir: string,
  filter?: ItemFilter,
  limit?: number,
  offset?: number,
): Promise<StoredItem[]> {
  // Fast path: unread-only query without starred/since/feedUrl filters
  // Uses the unread index to avoid loading all items from all feeds.
  if (
    filter?.read === false &&
    filter.starred === undefined &&
    filter.since === undefined &&
    filter.feedUrl === undefined
  ) {
    const index = await loadUnreadIndex(siteDir);
    if (index.length > 0) {
      // Sort newest first
      index.sort((a, b) => {
        const dateA = a.publishedAt ?? a.firstSeenAt;
        const dateB = b.publishedAt ?? b.firstSeenAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      const off = (offset !== undefined && offset > 0) ? offset : 0;
      const sliced = limit !== undefined && limit > 0
        ? index.slice(off, off + limit)
        : index.slice(off);

      // Resolve full items — group by feed slug to minimize file reads
      const keysBySlug = new Map<string, Set<string>>();
      for (const entry of sliced) {
        const slug = feedSlug(entry.feedUrl);
        const set = keysBySlug.get(slug) ?? new Set();
        set.add(entry.dedupKey);
        keysBySlug.set(slug, set);
      }

      const results: StoredItem[] = [];
      for (const [slug, keys] of keysBySlug) {
        const items = await loadFeedItems(siteDir, slug);
        for (const item of items) {
          if (keys.has(item.dedupKey)) results.push(item);
        }
      }

      // Re-sort results (they came from multiple feeds)
      results.sort((a, b) => {
        const dateA = a.publishedAt ?? a.firstSeenAt;
        const dateB = b.publishedAt ?? b.firstSeenAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      return results;
    }
    // Index empty — fall through to full scan (handles first-run / no index)
  }

  let items: StoredItem[];

  // Optimization: if filtering by feedUrl, only load that feed
  if (filter?.feedUrl) {
    const slug = feedSlug(filter.feedUrl);
    items = await loadFeedItems(siteDir, slug);
  } else {
    items = await loadAllItems(siteDir);
  }

  if (filter?.feedUrl !== undefined) {
    items = items.filter((i) => i.feedUrl === filter.feedUrl);
  }
  if (filter?.read !== undefined) {
    items = items.filter((i) => i.read === filter.read);
  }
  if (filter?.starred !== undefined) {
    items = items.filter((i) => i.starred === filter.starred);
  }
  if (filter?.since) {
    const sinceMs = new Date(filter.since).getTime();
    items = items.filter(
      (i) => new Date(i.firstSeenAt).getTime() >= sinceMs,
    );
  }

  // Sort newest first
  items.sort((a, b) => {
    const dateA = a.publishedAt ?? a.firstSeenAt;
    const dateB = b.publishedAt ?? b.firstSeenAt;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  if (offset !== undefined && offset > 0) {
    items = items.slice(offset);
  }
  if (limit !== undefined && limit > 0) {
    items = items.slice(0, limit);
  }

  return items;
}

/** Get a single item by dedup key. Scans feeds one at a time, stops on first match. */
export async function getItem(
  siteDir: string,
  key: string,
): Promise<StoredItem | null> {
  const slugs = await listFeedSlugs(siteDir);
  for (const slug of slugs) {
    const items = await loadFeedItems(siteDir, slug);
    const found = items.find((i) => i.dedupKey === key);
    if (found) return found;
  }
  return null;
}

/** Mark items as read. Accepts a single key or array. */
export async function markRead(
  siteDir: string,
  keys: string | string[],
): Promise<number> {
  const count = await updateItems(siteDir, keys, (item) => {
    if (item.read) return false;
    item.read = true;
    return true;
  });

  if (count > 0) {
    // Remove from unread index
    const keySet = new Set(Array.isArray(keys) ? keys : [keys]);
    const index = await loadUnreadIndex(siteDir);
    const filtered = index.filter((e) => !keySet.has(e.dedupKey));
    if (filtered.length !== index.length) {
      await saveUnreadIndex(siteDir, filtered);
    }
  }

  return count;
}

/** Mark items as unread. Accepts a single key or array. */
export async function markUnread(
  siteDir: string,
  keys: string | string[],
): Promise<number> {
  const unmarkedItems: UnreadEntry[] = [];
  const count = await updateItems(siteDir, keys, (item) => {
    if (!item.read) return false;
    item.read = false;
    unmarkedItems.push({
      feedUrl: item.feedUrl,
      dedupKey: item.dedupKey,
      publishedAt: item.publishedAt,
      firstSeenAt: item.firstSeenAt,
    });
    return true;
  });

  if (count > 0) {
    const index = await loadUnreadIndex(siteDir);
    index.push(...unmarkedItems);
    await saveUnreadIndex(siteDir, index);
  }

  return count;
}

/** Mark all items from a feed (or all feeds) as read */
export async function markAllRead(
  siteDir: string,
  feedUrl?: string,
): Promise<number> {
  let count: number;

  if (feedUrl) {
    const slug = feedSlug(feedUrl);
    count = await withFeedLock(slug, async () => {
      const items = await loadFeedItems(siteDir, slug);
      let c = 0;
      let changed = false;
      for (const item of items) {
        if (!item.read) {
          item.read = true;
          c++;
          changed = true;
        }
      }
      if (changed) await saveFeedItems(siteDir, slug, items);
      return c;
    });
  } else {
    // All feeds — updateItems with wildcard
    count = await updateItems(siteDir, "*", (item) => {
      if (item.read) return false;
      item.read = true;
      return true;
    });
  }

  if (count > 0) {
    if (feedUrl) {
      // Remove entries for this feed from index
      const index = await loadUnreadIndex(siteDir);
      const filtered = index.filter((e) => e.feedUrl !== feedUrl);
      await saveUnreadIndex(siteDir, filtered);
    } else {
      // Clear the entire index
      await saveUnreadIndex(siteDir, []);
    }
  }

  return count;
}

/** Star an item (idempotent — skips write if already starred) */
export async function starItem(
  siteDir: string,
  key: string,
): Promise<boolean> {
  return setItemBoolByKey(siteDir, key, "starred", true);
}

/** Unstar an item (idempotent — skips write if already unstarred) */
export async function unstarItem(
  siteDir: string,
  key: string,
): Promise<boolean> {
  return setItemBoolByKey(siteDir, key, "starred", false);
}

/**
 * Find a single item by key across all feeds, set a boolean field,
 * and return true if the item exists (even if already at the target value).
 */
async function setItemBoolByKey(
  siteDir: string,
  key: string,
  field: "starred",
  value: boolean,
): Promise<boolean> {
  const slugs = await listFeedSlugs(siteDir);

  for (const slug of slugs) {
    const found = await withFeedLock(slug, async () => {
      const items = await loadFeedItems(siteDir, slug);
      const item = items.find((i) => i.dedupKey === key);
      if (!item) return false;
      if (item[field] !== value) {
        item[field] = value;
        await saveFeedItems(siteDir, slug, items);
      }
      return true;
    });
    if (found) return true;
  }

  return false;
}

/** Mark items as notified */
export async function markNotified(
  siteDir: string,
  keys: string[],
): Promise<number> {
  const now = new Date().toISOString();
  return updateItems(siteDir, keys, (item) => {
    if (item.notifiedAt) return false;
    item.notifiedAt = now;
    return true;
  });
}

/** Get counts: total, unread, starred — single pass per feed */
export async function getItemCounts(
  siteDir: string,
  feedUrl?: string,
): Promise<{ total: number; unread: number; starred: number }> {
  const slugs = feedUrl
    ? [feedSlug(feedUrl)]
    : await listFeedSlugs(siteDir);
  let total = 0;
  let unread = 0;
  let starred = 0;

  for (const slug of slugs) {
    const items = await loadFeedItems(siteDir, slug);
    for (const item of items) {
      if (feedUrl && item.feedUrl !== feedUrl) continue;
      total++;
      if (!item.read) unread++;
      if (item.starred) starred++;
    }
  }

  return { total, unread, starred };
}

/** Remove all items for a feed (used when unsubscribing) */
export async function removeItemsForFeed(
  siteDir: string,
  feedUrl: string,
): Promise<number> {
  const slug = feedSlug(feedUrl);

  const count = await withFeedLock(slug, async () => {
    const items = await loadFeedItems(siteDir, slug);
    if (items.length === 0) return 0;
    // Clear the file
    await saveFeedItems(siteDir, slug, []);
    return items.length;
  });

  if (count > 0) {
    // Clean up unread index for this feed
    const index = await loadUnreadIndex(siteDir);
    const filtered = index.filter((e) => e.feedUrl !== feedUrl);
    if (filtered.length !== index.length) {
      await saveUnreadIndex(siteDir, filtered);
    }
  }

  return count;
}
