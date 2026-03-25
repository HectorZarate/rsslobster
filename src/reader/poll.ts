import type { ParsedItem, StoredItem } from "./types.js";
import { parseFeed } from "./parser.js";
import {
  getSubscription,
  listSubscriptions,
  recordFetchSuccess,
  recordFetchError,
} from "./subscriptions.js";
import { ingestItems, dedupKey, listItems } from "./store.js";
import { loadConfig, shouldNotify, addToInbox } from "./notifications.js";
import type { Subscription } from "./types.js";

/** Result of polling a single feed */
export interface PollResult {
  feedUrl: string;
  title: string;
  newItems: ParsedItem[];
  /** Number of new notifications queued */
  notified: number;
  error?: string;
}

/** Options for pollFeed */
export interface PollOptions {
  /** Timeout in milliseconds. Default: 10_000 */
  timeout?: number;
  /** Custom fetch function (for testing) */
  fetchFn?: typeof fetch;
  /** Skip notification processing (for testing or CLI-only use) */
  skipNotify?: boolean;
}

/**
 * Fetch and parse a single feed. Returns new items (not yet ingested).
 * Uses conditional GET (ETag / If-Modified-Since) when available.
 * Automatically queues notifications for new items based on config.
 */
export async function pollFeed(
  siteDir: string,
  feedUrl: string,
  opts?: PollOptions,
): Promise<PollResult> {
  const fetchFn = opts?.fetchFn ?? fetch;
  const timeout = opts?.timeout ?? 10_000;

  const sub = await getSubscription(siteDir, feedUrl);
  if (!sub) {
    return { feedUrl, title: "", newItems: [], notified: 0, error: `Not subscribed to ${feedUrl}` };
  }

  // Build conditional GET headers
  const headers: Record<string, string> = {
    "User-Agent": "RSSLobster/0.1 (+https://github.com/HectorZarate/rsslobster)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json",
  };
  if (sub.etag) headers["If-None-Match"] = sub.etag;
  if (sub.lastModified) headers["If-Modified-Since"] = sub.lastModified;

  let response: Response;
  try {
    response = await fetchFn(feedUrl, {
      headers,
      signal: AbortSignal.timeout(timeout),
      redirect: "follow",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordFetchError(siteDir, feedUrl, msg);
    return { feedUrl, title: sub.title, newItems: [], notified: 0, error: msg };
  }

  // 304 Not Modified
  if (response.status === 304) {
    await recordFetchSuccess(siteDir, feedUrl, {
      etag: sub.etag,
      lastModified: sub.lastModified,
    });
    return { feedUrl, title: sub.title, newItems: [], notified: 0 };
  }

  if (!response.ok) {
    const msg = `HTTP ${response.status} ${response.statusText}`;
    await recordFetchError(siteDir, feedUrl, msg);
    return { feedUrl, title: sub.title, newItems: [], notified: 0, error: msg };
  }

  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to read response body";
    await recordFetchError(siteDir, feedUrl, msg);
    return { feedUrl, title: sub.title, newItems: [], notified: 0, error: msg };
  }

  // Parse feed
  let items: ParsedItem[];
  let feedTitle: string;
  try {
    const feed = parseFeed(body);
    items = feed.items;
    feedTitle = feed.title;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Parse error";
    await recordFetchError(siteDir, feedUrl, msg);
    return { feedUrl, title: sub.title, newItems: [], notified: 0, error: msg };
  }

  // Snapshot existing dedup keys before ingestion
  const existingItems = await listItems(siteDir, { feedUrl });
  const existingKeys = new Set(existingItems.map((i) => i.dedupKey));

  // Ingest into store
  const newCount = await ingestItems(siteDir, feedUrl, items);

  // Record success
  const etag = response.headers.get("etag") ?? undefined;
  const lastModified = response.headers.get("last-modified") ?? undefined;
  await recordFetchSuccess(siteDir, feedUrl, { etag, lastModified });

  if (newCount === 0) {
    return { feedUrl, title: feedTitle, newItems: [], notified: 0 };
  }

  // Identify which parsed items are actually new
  const newParsedItems = items.filter((item) => {
    const key = dedupKey(item);
    return !existingKeys.has(key);
  });

  // Queue notifications for new items
  let notified = 0;
  if (!opts?.skipNotify) {
    const config = await loadConfig(siteDir);
    const now = new Date().toISOString();
    const entries = [];

    for (const item of newParsedItems) {
      const stored: StoredItem = {
        ...item,
        feedUrl,
        dedupKey: dedupKey(item),
        firstSeenAt: now,
        read: false,
        starred: false,
      };

      const entry = shouldNotify(stored, sub, config, feedTitle);
      if (entry) entries.push(entry);
    }

    if (entries.length > 0) {
      await addToInbox(siteDir, entries);
      notified = entries.length;
    }
  }

  return { feedUrl, title: feedTitle, newItems: newParsedItems, notified };
}

/**
 * Poll all subscriptions that are due for a check.
 * Returns results for feeds that had new items or errors.
 */
export async function pollAllFeeds(
  siteDir: string,
  opts?: PollOptions & {
    /** Default check interval in minutes. Default: 15 */
    defaultInterval?: number;
    /** Force poll all feeds regardless of interval */
    force?: boolean;
  },
): Promise<PollResult[]> {
  const subs = await listSubscriptions(siteDir);
  const defaultInterval = opts?.defaultInterval ?? 15;
  const now = Date.now();
  const results: PollResult[] = [];

  for (const sub of subs) {
    if (!opts?.force && !isDue(sub, now, defaultInterval)) continue;

    const result = await pollFeed(siteDir, sub.feedUrl, opts);
    if (result.newItems.length > 0 || result.error) {
      results.push(result);
    }
  }

  return results;
}

/** Check if a subscription is due for polling based on its interval */
function isDue(sub: Subscription, now: number, defaultMinutes: number): boolean {
  if (!sub.lastFetchedAt) return true;
  const intervalMs = defaultMinutes * 60 * 1000;
  const lastFetch = new Date(sub.lastFetchedAt).getTime();
  return now - lastFetch >= intervalMs;
}
