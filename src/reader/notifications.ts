import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  NotificationConfig,
  InboxEntry,
  StoredItem,
  Subscription,
} from "./types.js";
import { readerDir, ensureReaderDir } from "./paths.js";

const CONFIG_FILE = "config.json";
const INBOX_FILE = "inbox.json";

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

export function defaultNotificationConfig(): NotificationConfig {
  return {
    enabled: true,
    schedule: "immediate",
    deliverAt: "09:00",
    dayOfWeek: 1,
    recap: {
      enabled: false,
      frequency: "daily",
      deliverAt: "08:00",
      style: "brief",
    },
  };
}

// ---------------------------------------------------------------------------
// Config management
// ---------------------------------------------------------------------------

function configPath(siteDir: string): string {
  return join(readerDir(siteDir), CONFIG_FILE);
}

/** Load notification config. Returns defaults if file doesn't exist. */
export async function loadConfig(
  siteDir: string,
): Promise<NotificationConfig> {
  try {
    const raw = await readFile(configPath(siteDir), "utf-8");
    const saved = JSON.parse(raw) as Partial<NotificationConfig>;
    return { ...defaultNotificationConfig(), ...saved };
  } catch {
    return defaultNotificationConfig();
  }
}

/** Save notification config. */
export async function saveConfig(
  siteDir: string,
  config: NotificationConfig,
): Promise<void> {
  await ensureReaderDir(siteDir);
  await writeFile(configPath(siteDir), JSON.stringify(config, null, 2));
}

/** Update specific config fields (merge). Validates time formats. */
export async function updateConfig(
  siteDir: string,
  updates: Partial<NotificationConfig>,
): Promise<NotificationConfig> {
  // Validate time formats
  if (updates.deliverAt && !isValidTime(updates.deliverAt)) {
    throw new Error(`Invalid time format: "${updates.deliverAt}". Use HH:MM (e.g., "09:00")`);
  }
  if (updates.quietHours) {
    if (!isValidTime(updates.quietHours.start)) {
      throw new Error(`Invalid quiet hours start: "${updates.quietHours.start}". Use HH:MM`);
    }
    if (!isValidTime(updates.quietHours.end)) {
      throw new Error(`Invalid quiet hours end: "${updates.quietHours.end}". Use HH:MM`);
    }
  }
  if (updates.dayOfWeek !== undefined && (updates.dayOfWeek < 0 || updates.dayOfWeek > 6)) {
    throw new Error(`Invalid day of week: ${updates.dayOfWeek}. Use 0 (Sun) - 6 (Sat)`);
  }
  if (updates.schedule && !["immediate", "hourly", "daily", "weekly"].includes(updates.schedule)) {
    throw new Error(`Invalid schedule: "${updates.schedule}". Use: immediate, hourly, daily, weekly`);
  }

  const config = await loadConfig(siteDir);
  const merged = {
    ...config,
    ...updates,
    recap: { ...config.recap, ...updates.recap },
  };
  await saveConfig(siteDir, merged);
  return merged;
}

/** Validate HH:MM format */
function isValidTime(time: string): boolean {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return false;
  const h = parseInt(match[1]!, 10);
  const m = parseInt(match[2]!, 10);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

// ---------------------------------------------------------------------------
// Inbox management
// ---------------------------------------------------------------------------

function inboxPath(siteDir: string): string {
  return join(readerDir(siteDir), INBOX_FILE);
}

/** Load pending inbox entries. */
export async function loadInbox(siteDir: string): Promise<InboxEntry[]> {
  try {
    const raw = await readFile(inboxPath(siteDir), "utf-8");
    return JSON.parse(raw) as InboxEntry[];
  } catch {
    return [];
  }
}

/** Save inbox. */
async function saveInbox(
  siteDir: string,
  entries: InboxEntry[],
): Promise<void> {
  await ensureReaderDir(siteDir);
  await writeFile(inboxPath(siteDir), JSON.stringify(entries, null, 2));
}

const MAX_INBOX_SIZE = 1000;

/** Add entries to the inbox. Oldest entries are dropped if inbox exceeds max size. */
export async function addToInbox(
  siteDir: string,
  entries: InboxEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  const existing = await loadInbox(siteDir);
  existing.push(...entries);
  // Trim oldest entries if over limit
  const trimmed = existing.length > MAX_INBOX_SIZE
    ? existing.slice(existing.length - MAX_INBOX_SIZE)
    : existing;
  await saveInbox(siteDir, trimmed);
}

/** Drain the inbox — returns all entries and clears it. */
export async function drainInbox(siteDir: string): Promise<InboxEntry[]> {
  const entries = await loadInbox(siteDir);
  if (entries.length > 0) {
    await saveInbox(siteDir, []);
  }
  return entries;
}

/** Count pending inbox entries. */
export async function inboxCount(siteDir: string): Promise<number> {
  const entries = await loadInbox(siteDir);
  return entries.length;
}

// ---------------------------------------------------------------------------
// Notification filtering
// ---------------------------------------------------------------------------

/**
 * Decide whether a newly ingested item should be added to the inbox.
 * Checks:
 * - Global notifications enabled
 * - Subscription not muted
 * - Subscription keyword filter (if set)
 * - Quiet hours (skipped for high-priority feeds)
 *
 * Returns an InboxEntry if the item should be notified, null otherwise.
 */
export function shouldNotify(
  item: StoredItem,
  sub: Subscription,
  config: NotificationConfig,
  feedTitle: string,
): InboxEntry | null {
  // Global off
  if (!config.enabled) return null;

  // Per-feed mute
  if (sub.notify?.muted) return null;

  // Keyword filter
  if (sub.notify?.filter && sub.notify.filter.length > 0) {
    const text = `${item.title} ${item.content}`.toLowerCase();
    const matches = sub.notify.filter.some((term) =>
      text.includes(term.toLowerCase()),
    );
    if (!matches) return null;
  }

  // Quiet hours (high-priority bypasses)
  if (
    config.quietHours &&
    sub.notify?.priority !== "high"
  ) {
    if (isInQuietHours(config.quietHours.start, config.quietHours.end)) {
      return null;
    }
  }

  return {
    feedUrl: sub.feedUrl,
    feedTitle,
    itemDedupKey: item.dedupKey,
    title: item.title,
    link: item.link,
    summary: item.content.slice(0, 300),
    author: item.author,
    receivedAt: item.firstSeenAt,
  };
}

/**
 * Check if the current time falls within quiet hours.
 * Handles overnight ranges (e.g., 22:00 - 08:00).
 */
function isInQuietHours(start: string, end: string): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);

  if (startMinutes <= endMinutes) {
    // Same-day range (e.g., 09:00 - 17:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  // Overnight range (e.g., 22:00 - 08:00)
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// ---------------------------------------------------------------------------
// Schedule checking
// ---------------------------------------------------------------------------

/**
 * Check if it's time to deliver batched notifications.
 * For "immediate", always returns true.
 * For others, checks against deliverAt time and frequency.
 */
export function isDeliveryTime(
  config: NotificationConfig,
  lastDeliveredAt?: string,
): boolean {
  if (config.schedule === "immediate") return true;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const deliverMinutes = parseTimeToMinutes(config.deliverAt);

  // Check if we're within the delivery window (±2 minutes)
  if (Math.abs(currentMinutes - deliverMinutes) > 2) return false;

  // Check if we already delivered recently
  if (lastDeliveredAt) {
    const lastMs = new Date(lastDeliveredAt).getTime();
    const nowMs = now.getTime();
    const hourMs = 60 * 60 * 1000;

    switch (config.schedule) {
      case "hourly":
        if (nowMs - lastMs < hourMs) return false;
        break;
      case "daily":
        if (nowMs - lastMs < 23 * hourMs) return false;
        break;
      case "weekly": {
        if (nowMs - lastMs < 6 * 24 * hourMs) return false;
        if (now.getDay() !== config.dayOfWeek) return false;
        break;
      }
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Notification formatting
// ---------------------------------------------------------------------------

/** Format a single inbox entry as a notification message. */
export function formatNotification(entry: InboxEntry): string {
  const parts: string[] = [];
  parts.push(`${entry.feedTitle}: ${entry.title}`);
  if (entry.link) parts.push(entry.link);
  return parts.join("\n");
}

/** Format a batch of inbox entries as a digest message. */
export function formatDigest(entries: InboxEntry[]): string {
  if (entries.length === 0) return "";

  // Group by feed
  const byFeed = new Map<string, InboxEntry[]>();
  for (const entry of entries) {
    const group = byFeed.get(entry.feedTitle) ?? [];
    group.push(entry);
    byFeed.set(entry.feedTitle, group);
  }

  const lines: string[] = [];
  lines.push(`${entries.length} new item${entries.length === 1 ? "" : "s"}:\n`);

  for (const [feedTitle, feedEntries] of byFeed) {
    lines.push(`${feedTitle}:`);
    for (const entry of feedEntries.slice(0, 5)) {
      const link = entry.link ? ` — ${entry.link}` : "";
      lines.push(`  ${entry.title}${link}`);
    }
    if (feedEntries.length > 5) {
      lines.push(`  ...and ${feedEntries.length - 5} more`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
