import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ParsedItem, StoredItem } from "./types.js";
import { readerDir, ensureReaderDir, contentHash } from "./paths.js";

const ITEMS_FILE = "items.json";

/**
 * Item store for the RSS reader.
 *
 * Items are stored in {siteDir}/reader/items.json as a JSON array.
 * Dedup strategy (in priority order):
 *   1. Item id (guid in RSS, id in Atom)
 *   2. Item link
 *   3. SHA-256 hash of title + content
 *
 * NOT concurrency-safe — callers must serialize access.
 *
 * UX principles:
 * - New items default to unread
 * - Star/unstar is idempotent
 * - markRead/markUnread accept arrays for bulk operations
 * - List operations support filtering by feed, read state, starred
 */

function itemsPath(siteDir: string): string {
  return join(readerDir(siteDir), ITEMS_FILE);
}

/** Load all items from disk. Throws on corrupt JSON; returns [] if file missing. */
async function loadItems(siteDir: string): Promise<StoredItem[]> {
  const path = itemsPath(siteDir);
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

/** Save items to disk */
async function saveItems(
  siteDir: string,
  items: StoredItem[],
): Promise<void> {
  await ensureReaderDir(siteDir);
  await writeFile(itemsPath(siteDir), JSON.stringify(items, null, 2));
}

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
  const existing = await loadItems(siteDir);
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
    await saveItems(siteDir, existing);
  }

  return added;
}

/** Item list filter options */
export interface ItemFilter {
  feedUrl?: string;
  read?: boolean;
  starred?: boolean;
}

/**
 * List items, newest first (by publishedAt, then firstSeenAt).
 * Supports filtering by feedUrl, read state, and starred state.
 */
export async function listItems(
  siteDir: string,
  filter?: ItemFilter,
  limit?: number,
): Promise<StoredItem[]> {
  let items = await loadItems(siteDir);

  if (filter?.feedUrl !== undefined) {
    items = items.filter((i) => i.feedUrl === filter.feedUrl);
  }
  if (filter?.read !== undefined) {
    items = items.filter((i) => i.read === filter.read);
  }
  if (filter?.starred !== undefined) {
    items = items.filter((i) => i.starred === filter.starred);
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

/** Get a single item by dedup key */
export async function getItem(
  siteDir: string,
  key: string,
): Promise<StoredItem | null> {
  const items = await loadItems(siteDir);
  return items.find((i) => i.dedupKey === key) ?? null;
}

/** Mark items as read. Accepts a single key or array. */
export async function markRead(
  siteDir: string,
  keys: string | string[],
): Promise<number> {
  return setReadState(siteDir, Array.isArray(keys) ? keys : [keys], true);
}

/** Mark items as unread. Accepts a single key or array. */
export async function markUnread(
  siteDir: string,
  keys: string | string[],
): Promise<number> {
  return setReadState(siteDir, Array.isArray(keys) ? keys : [keys], false);
}

/** Mark all items from a feed as read */
export async function markAllRead(
  siteDir: string,
  feedUrl?: string,
): Promise<number> {
  const items = await loadItems(siteDir);
  let count = 0;

  for (const item of items) {
    if (feedUrl && item.feedUrl !== feedUrl) continue;
    if (!item.read) {
      item.read = true;
      count++;
    }
  }

  if (count > 0) {
    await saveItems(siteDir, items);
  }
  return count;
}

/** Star an item (idempotent — skips write if already starred) */
export async function starItem(
  siteDir: string,
  key: string,
): Promise<boolean> {
  const items = await loadItems(siteDir);
  const item = items.find((i) => i.dedupKey === key);
  if (!item) return false;
  if (item.starred) return true;

  item.starred = true;
  await saveItems(siteDir, items);
  return true;
}

/** Unstar an item (idempotent — skips write if already unstarred) */
export async function unstarItem(
  siteDir: string,
  key: string,
): Promise<boolean> {
  const items = await loadItems(siteDir);
  const item = items.find((i) => i.dedupKey === key);
  if (!item) return false;
  if (!item.starred) return true;

  item.starred = false;
  await saveItems(siteDir, items);
  return true;
}

/** Get counts: total, unread, starred — single O(n) pass */
export async function getItemCounts(
  siteDir: string,
  feedUrl?: string,
): Promise<{ total: number; unread: number; starred: number }> {
  const items = await loadItems(siteDir);
  let total = 0;
  let unread = 0;
  let starred = 0;

  for (const item of items) {
    if (feedUrl && item.feedUrl !== feedUrl) continue;
    total++;
    if (!item.read) unread++;
    if (item.starred) starred++;
  }

  return { total, unread, starred };
}

/** Remove all items for a feed (used when unsubscribing) */
export async function removeItemsForFeed(
  siteDir: string,
  feedUrl: string,
): Promise<number> {
  const items = await loadItems(siteDir);
  const before = items.length;
  const remaining = items.filter((i) => i.feedUrl !== feedUrl);

  if (remaining.length < before) {
    await saveItems(siteDir, remaining);
  }

  return before - remaining.length;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function setReadState(
  siteDir: string,
  keys: string[],
  read: boolean,
): Promise<number> {
  const items = await loadItems(siteDir);
  const keySet = new Set(keys);
  let count = 0;

  for (const item of items) {
    if (keySet.has(item.dedupKey) && item.read !== read) {
      item.read = read;
      count++;
    }
  }

  if (count > 0) {
    await saveItems(siteDir, items);
  }
  return count;
}
