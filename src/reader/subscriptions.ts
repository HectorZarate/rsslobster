import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subscription } from "./types.js";
import { readerDir, ensureReaderDir, writeJsonAtomic, normalizeUrl } from "./paths.js";

const SUBS_FILE = "subscriptions.json";

// Per-siteDir lock to serialize all subscription file access
const subsLocks = new Map<string, Promise<void>>();
async function withSubsLock<T>(siteDir: string, fn: () => Promise<T>): Promise<T> {
  const prev = subsLocks.get(siteDir) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  subsLocks.set(siteDir, next.then(() => {}, () => {}));
  return next;
}

/**
 * Subscription management for the RSS reader.
 *
 * Subscriptions are stored in {siteDir}/reader/subscriptions.json
 * as a JSON array. Concurrency-safe via per-siteDir promise-chain lock.
 *
 * UX principles:
 * - Subscribe returns the subscription for confirmation
 * - Unsubscribe requires exact feedUrl (no fuzzy matching for safety)
 * - List is sorted alphabetically by title
 * - Duplicate URLs are rejected with a clear error
 */

function subsPath(siteDir: string): string {
  return join(readerDir(siteDir), SUBS_FILE);
}

/** Load all subscriptions from disk. Throws on corrupt JSON; returns [] if file missing. */
async function loadSubs(siteDir: string): Promise<Subscription[]> {
  const path = subsPath(siteDir);
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return [];
  }
  try {
    return JSON.parse(raw) as Subscription[];
  } catch (e) {
    throw new Error(
      `Corrupt subscriptions file at ${path}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** Save subscriptions to disk */
async function saveSubs(
  siteDir: string,
  subs: Subscription[],
): Promise<void> {
  await ensureReaderDir(siteDir);
  await writeJsonAtomic(subsPath(siteDir), subs);
}

/** Subscribe to a new feed */
export async function subscribe(
  siteDir: string,
  feedUrl: string,
  title: string,
  opts?: { siteUrl?: string; folder?: string },
): Promise<Subscription> {
  if (!feedUrl || !/^https?:\/\//i.test(feedUrl)) {
    throw new Error(
      `Invalid feed URL: ${feedUrl || "(empty)"}. Must start with http:// or https://`,
    );
  }

  const normalized = normalizeUrl(feedUrl);

  return withSubsLock(siteDir, async () => {
    const subs = await loadSubs(siteDir);

    const existing = subs.find((s) => s.feedUrl === normalized);
    if (existing) {
      throw new Error(`Already subscribed to ${normalized}`);
    }

    const sub: Subscription = {
      feedUrl: normalized,
      title,
      siteUrl: opts?.siteUrl,
      folder: opts?.folder,
      addedAt: new Date().toISOString(),
      errorCount: 0,
    };

    subs.push(sub);
    await saveSubs(siteDir, subs);
    return sub;
  });
}

/** Unsubscribe from a feed by exact URL */
export async function unsubscribe(
  siteDir: string,
  feedUrl: string,
): Promise<boolean> {
  const normalized = normalizeUrl(feedUrl);
  return withSubsLock(siteDir, async () => {
    const subs = await loadSubs(siteDir);
    const index = subs.findIndex((s) => s.feedUrl === normalized);
    if (index === -1) return false;

    subs.splice(index, 1);
    await saveSubs(siteDir, subs);
    return true;
  });
}

/** List all subscriptions, sorted alphabetically by title */
export async function listSubscriptions(
  siteDir: string,
  filter?: { folder?: string },
): Promise<Subscription[]> {
  const subs = await loadSubs(siteDir);

  const filtered = filter?.folder
    ? subs.filter((s) => s.folder === filter.folder)
    : subs;

  return filtered.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );
}

/** Get a single subscription by feed URL */
export async function getSubscription(
  siteDir: string,
  feedUrl: string,
): Promise<Subscription | null> {
  const normalized = normalizeUrl(feedUrl);
  const subs = await loadSubs(siteDir);
  return subs.find((s) => s.feedUrl === normalized) ?? null;
}

/** Update subscription metadata (title, folder, fetch state) */
export async function updateSubscription(
  siteDir: string,
  feedUrl: string,
  updates: Partial<Omit<Subscription, "feedUrl" | "addedAt">>,
): Promise<Subscription | null> {
  const normalized = normalizeUrl(feedUrl);
  return withSubsLock(siteDir, async () => {
    const subs = await loadSubs(siteDir);
    const index = subs.findIndex((s) => s.feedUrl === normalized);
    if (index === -1) return null;

    const existing = subs[index]!;
    const updated: Subscription = {
      ...existing,
      ...updates,
      // Deep-merge notify to preserve existing filter/priority/schedule when only muting
      notify: updates.notify
        ? { ...existing.notify, ...updates.notify }
        : existing.notify,
      feedUrl: existing.feedUrl, // immutable
      addedAt: existing.addedAt, // immutable
    };

    subs[index] = updated;
    await saveSubs(siteDir, subs);
    return updated;
  });
}

/** Record a successful fetch */
export async function recordFetchSuccess(
  siteDir: string,
  feedUrl: string,
  opts?: { etag?: string; lastModified?: string },
): Promise<void> {
  await updateSubscription(siteDir, feedUrl, {
    lastFetchedAt: new Date().toISOString(),
    etag: opts?.etag,
    lastModified: opts?.lastModified,
    errorCount: 0,
    lastError: undefined,
  });
}

/** Record a fetch failure — single load+save instead of two */
export async function recordFetchError(
  siteDir: string,
  feedUrl: string,
  error: string,
): Promise<void> {
  const normalized = normalizeUrl(feedUrl);
  return withSubsLock(siteDir, async () => {
    const subs = await loadSubs(siteDir);
    const sub = subs.find((s) => s.feedUrl === normalized);
    if (!sub) return;

    sub.errorCount++;
    sub.lastError = error;
    sub.lastFetchedAt = new Date().toISOString(); // Enable backoff timing
    await saveSubs(siteDir, subs);
  });
}

/** Get all unique folder names */
export async function listFolders(siteDir: string): Promise<string[]> {
  const subs = await loadSubs(siteDir);
  const folders = new Set<string>();
  for (const s of subs) {
    if (s.folder) folders.add(s.folder);
  }
  return [...folders].sort();
}

/** Move a subscription to a different folder */
export async function moveToFolder(
  siteDir: string,
  feedUrl: string,
  folder: string | undefined,
): Promise<Subscription | null> {
  return updateSubscription(siteDir, feedUrl, { folder });
}
