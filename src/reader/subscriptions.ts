import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Subscription } from "./types.js";

const SUBS_FILE = "subscriptions.json";

/**
 * Subscription management for the RSS reader.
 *
 * Subscriptions are stored in {siteDir}/reader/subscriptions.json
 * as a JSON array. All operations are atomic (read-modify-write).
 *
 * UX principles:
 * - Subscribe returns the subscription for confirmation
 * - Unsubscribe requires exact feedUrl (no fuzzy matching for safety)
 * - List is sorted alphabetically by title
 * - Duplicate URLs are rejected with a clear error
 */

function readerDir(siteDir: string): string {
  return join(siteDir, "reader");
}

function subsPath(siteDir: string): string {
  return join(readerDir(siteDir), SUBS_FILE);
}

async function ensureReaderDir(siteDir: string): Promise<void> {
  await mkdir(readerDir(siteDir), { recursive: true });
}

/** Load all subscriptions from disk */
async function loadSubs(siteDir: string): Promise<Subscription[]> {
  try {
    const raw = await readFile(subsPath(siteDir), "utf-8");
    return JSON.parse(raw) as Subscription[];
  } catch {
    return [];
  }
}

/** Save subscriptions to disk */
async function saveSubs(
  siteDir: string,
  subs: Subscription[],
): Promise<void> {
  await ensureReaderDir(siteDir);
  await writeFile(subsPath(siteDir), JSON.stringify(subs, null, 2));
}

/** Subscribe to a new feed */
export async function subscribe(
  siteDir: string,
  feedUrl: string,
  title: string,
  opts?: { siteUrl?: string; folder?: string },
): Promise<Subscription> {
  const subs = await loadSubs(siteDir);

  const existing = subs.find((s) => s.feedUrl === feedUrl);
  if (existing) {
    throw new Error(`Already subscribed to ${feedUrl}`);
  }

  const sub: Subscription = {
    feedUrl,
    title,
    siteUrl: opts?.siteUrl,
    folder: opts?.folder,
    addedAt: new Date().toISOString(),
    errorCount: 0,
  };

  subs.push(sub);
  await saveSubs(siteDir, subs);
  return sub;
}

/** Unsubscribe from a feed by exact URL */
export async function unsubscribe(
  siteDir: string,
  feedUrl: string,
): Promise<boolean> {
  const subs = await loadSubs(siteDir);
  const index = subs.findIndex((s) => s.feedUrl === feedUrl);
  if (index === -1) return false;

  subs.splice(index, 1);
  await saveSubs(siteDir, subs);
  return true;
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
  const subs = await loadSubs(siteDir);
  return subs.find((s) => s.feedUrl === feedUrl) ?? null;
}

/** Update subscription metadata (title, folder, fetch state) */
export async function updateSubscription(
  siteDir: string,
  feedUrl: string,
  updates: Partial<Omit<Subscription, "feedUrl" | "addedAt">>,
): Promise<Subscription | null> {
  const subs = await loadSubs(siteDir);
  const index = subs.findIndex((s) => s.feedUrl === feedUrl);
  if (index === -1) return null;

  const existing = subs[index]!;
  const updated: Subscription = {
    ...existing,
    ...updates,
    feedUrl: existing.feedUrl, // immutable
    addedAt: existing.addedAt, // immutable
  };

  subs[index] = updated;
  await saveSubs(siteDir, subs);
  return updated;
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

/** Record a fetch failure */
export async function recordFetchError(
  siteDir: string,
  feedUrl: string,
  error: string,
): Promise<void> {
  const sub = await getSubscription(siteDir, feedUrl);
  if (!sub) return;

  await updateSubscription(siteDir, feedUrl, {
    errorCount: sub.errorCount + 1,
    lastError: error,
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
