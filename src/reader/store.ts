import { readFile, writeFile } from "node:fs/promises";
import type { ParsedItem, StoredItem } from "./types.js";
import {
  ensureFeedDir,
  feedItemsPath,
  feedSlug,
  listFeedSlugs,
  contentHash,
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
 * NOT concurrency-safe — callers must serialize access.
 */

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

/** Save items for a single feed. */
async function saveFeedItems(
  siteDir: string,
  slug: string,
  items: StoredItem[],
): Promise<void> {
  await ensureFeedDir(siteDir, slug);
  await writeFile(feedItemsPath(siteDir, slug), JSON.stringify(items, null, 2));
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
  const existing = await loadFeedItems(siteDir, slug);
  const existingKeys = new Set(existing.map((i) => i.dedupKey));
  const now = new Date().toISOString();

  let added = 0;
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
    added++;
  }

  if (added > 0) {
    await saveFeedItems(siteDir, slug, existing);
  }

  return added;
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
): Promise<StoredItem[]> {
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
  return setItemField(
    siteDir,
    Array.isArray(keys) ? keys : [keys],
    "read",
    true,
  );
}

/** Mark items as unread. Accepts a single key or array. */
export async function markUnread(
  siteDir: string,
  keys: string | string[],
): Promise<number> {
  return setItemField(
    siteDir,
    Array.isArray(keys) ? keys : [keys],
    "read",
    false,
  );
}

/** Mark all items from a feed (or all feeds) as read */
export async function markAllRead(
  siteDir: string,
  feedUrl?: string,
): Promise<number> {
  const slugs = feedUrl
    ? [feedSlug(feedUrl)]
    : await listFeedSlugs(siteDir);
  let count = 0;

  for (const slug of slugs) {
    const items = await loadFeedItems(siteDir, slug);
    let changed = false;
    for (const item of items) {
      if (!item.read) {
        item.read = true;
        count++;
        changed = true;
      }
    }
    if (changed) await saveFeedItems(siteDir, slug, items);
  }

  return count;
}

/** Star an item (idempotent — skips write if already starred) */
export async function starItem(
  siteDir: string,
  key: string,
): Promise<boolean> {
  return setItemBool(siteDir, key, "starred", true);
}

/** Unstar an item (idempotent — skips write if already unstarred) */
export async function unstarItem(
  siteDir: string,
  key: string,
): Promise<boolean> {
  return setItemBool(siteDir, key, "starred", false);
}

/** Mark an item as notified */
export async function markNotified(
  siteDir: string,
  keys: string[],
): Promise<number> {
  const now = new Date().toISOString();
  // Group keys by feed slug, then update each file
  const slugs = await listFeedSlugs(siteDir);
  let count = 0;
  const keySet = new Set(keys);

  for (const slug of slugs) {
    const items = await loadFeedItems(siteDir, slug);
    let changed = false;
    for (const item of items) {
      if (keySet.has(item.dedupKey) && !item.notifiedAt) {
        item.notifiedAt = now;
        count++;
        changed = true;
      }
    }
    if (changed) await saveFeedItems(siteDir, slug, items);
  }

  return count;
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
  const items = await loadFeedItems(siteDir, slug);
  if (items.length === 0) return 0;
  // Clear the file
  await saveFeedItems(siteDir, slug, []);
  return items.length;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Set a boolean field on items matching keys, across all feed files */
async function setItemField(
  siteDir: string,
  keys: string[],
  field: "read",
  value: boolean,
): Promise<number> {
  const keySet = new Set(keys);
  const slugs = await listFeedSlugs(siteDir);
  let count = 0;

  for (const slug of slugs) {
    const items = await loadFeedItems(siteDir, slug);
    let changed = false;
    for (const item of items) {
      if (keySet.has(item.dedupKey) && item[field] !== value) {
        item[field] = value;
        count++;
        changed = true;
      }
    }
    if (changed) await saveFeedItems(siteDir, slug, items);
  }

  return count;
}

/** Set a boolean field on a single item, return success */
async function setItemBool(
  siteDir: string,
  key: string,
  field: "starred",
  value: boolean,
): Promise<boolean> {
  const slugs = await listFeedSlugs(siteDir);

  for (const slug of slugs) {
    const items = await loadFeedItems(siteDir, slug);
    const item = items.find((i) => i.dedupKey === key);
    if (!item) continue;
    if (item[field] === value) return true;
    item[field] = value;
    await saveFeedItems(siteDir, slug, items);
    return true;
  }

  return false;
}
