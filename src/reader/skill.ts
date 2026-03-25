import {
  subscribe,
  unsubscribe,
  listSubscriptions,
  updateSubscription,
} from "./subscriptions.js";
import {
  listItems,
  markRead,
  starItem,
  unstarItem,
  getItemCounts,
} from "./store.js";
import { discoverFeed } from "./discover.js";
import { pollFeed } from "./poll.js";
import { generatePlainRecap, generateAIRecap } from "./recap.js";
import { drainInbox, formatDigest } from "./notifications.js";
import type { StoredItem } from "./types.js";
import type { ClassifiedContent } from "../config/types.js";
import type { CallModel } from "../agent/classify.js";

/** Result of a skill command */
export interface SkillResult {
  /** Reply text to send back to the channel */
  reply: string;
  /** Whether the skill handled the message (true = don't classify) */
  handled: boolean;
  /** If the skill wants to publish content (share command) */
  content?: ClassifiedContent;
}

/**
 * Last listing state per chat — enables positional references like "read 3", "star 2".
 * Keyed by chatId so concurrent users don't interfere.
 * Stored in-memory per session, not persisted.
 */
const lastListings = new Map<string, StoredItem[]>();
const DEFAULT_CHAT = "__default__";

/**
 * Handle a reader command from the chat channel.
 * Returns { handled: false } if the message is not a reader command.
 *
 * Supported commands:
 *   subscribe <url>       — subscribe to a feed
 *   unsubscribe <url>     — unsubscribe
 *   feeds                 — list subscriptions
 *   unread                — show unread items (numbered)
 *   starred               — show starred items
 *   read <n>              — show item N from last listing, mark read
 *   star <n>              — star item N
 *   unstar <n>            — unstar item N
 *   share <n>             — publish item N as a link post
 *   mute <url>            — mute feed notifications
 *   unmute <url>          — unmute feed notifications
 *   recap [daily|weekly]  — generate a recap
 *   notifications         — show pending notifications
 *   summarize <slug>      — (handled in pipeline.ts, not here)
 */
export async function handleReaderCommand(
  text: string,
  siteDir: string,
  context: { callModel?: CallModel; chatId?: string },
): Promise<SkillResult> {
  const chatId = context.chatId ?? DEFAULT_CHAT;
  const trimmed = text.trim();
  const NOT_HANDLED: SkillResult = { reply: "", handled: false };

  // subscribe <url>
  const subscribeMatch = trimmed.match(/^subscribe\s+(\S+)$/i);
  if (subscribeMatch) {
    return handleSubscribe(siteDir, subscribeMatch[1]!);
  }

  // unsubscribe <url>
  const unsubscribeMatch = trimmed.match(/^unsubscribe\s+(\S+)$/i);
  if (unsubscribeMatch) {
    return handleUnsubscribe(siteDir, unsubscribeMatch[1]!);
  }

  // feeds
  if (/^feeds$/i.test(trimmed)) {
    return handleFeeds(siteDir);
  }

  // unread
  if (/^unread$/i.test(trimmed)) {
    return handleUnread(siteDir, chatId);
  }

  // starred
  if (/^starred$/i.test(trimmed)) {
    return handleStarred(siteDir, chatId);
  }

  // read <n>
  const readMatch = trimmed.match(/^read\s+(\d+)$/i);
  if (readMatch) {
    return handleRead(siteDir, parseInt(readMatch[1]!, 10), chatId);
  }

  // star <n>
  const starMatch = trimmed.match(/^star\s+(\d+)$/i);
  if (starMatch) {
    return handleStar(siteDir, parseInt(starMatch[1]!, 10), chatId);
  }

  // unstar <n>
  const unstarMatch = trimmed.match(/^unstar\s+(\d+)$/i);
  if (unstarMatch) {
    return handleUnstar(siteDir, parseInt(unstarMatch[1]!, 10), chatId);
  }

  // share <n>
  const shareMatch = trimmed.match(/^share\s+(\d+)$/i);
  if (shareMatch) {
    return handleShare(siteDir, parseInt(shareMatch[1]!, 10), chatId);
  }

  // mute <url>
  const muteMatch = trimmed.match(/^mute\s+(\S+)$/i);
  if (muteMatch) {
    return handleMute(siteDir, muteMatch[1]!, true);
  }

  // unmute <url>
  const unmuteMatch = trimmed.match(/^unmute\s+(\S+)$/i);
  if (unmuteMatch) {
    return handleMute(siteDir, unmuteMatch[1]!, false);
  }

  // recap [daily|weekly]
  const recapMatch = trimmed.match(/^recap(?:\s+(daily|weekly))?$/i);
  if (recapMatch) {
    const frequency = (recapMatch[1]?.toLowerCase() ?? "daily") as "daily" | "weekly";
    return handleRecap(siteDir, frequency, context.callModel);
  }

  // notifications
  if (/^notifications$/i.test(trimmed)) {
    return handleNotifications(siteDir);
  }

  return NOT_HANDLED;
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function handleSubscribe(siteDir: string, url: string): Promise<SkillResult> {
  try {
    let feedUrl = url;
    let title = "";
    let siteUrl: string | undefined;

    try {
      const discovered = await discoverFeed(url);
      feedUrl = discovered.feedUrl;
      title = discovered.title;
      siteUrl = discovered.siteUrl;
    } catch {
      try { title = new URL(url).hostname; } catch { title = url; }
    }

    const sub = await subscribe(siteDir, feedUrl, title, { siteUrl });
    const result = await pollFeed(siteDir, feedUrl, { skipNotify: true });

    return {
      reply: `Subscribed to "${sub.title}"\n${result.newItems.length} item(s) fetched`,
      handled: true,
    };
  } catch (err) {
    return {
      reply: `Failed to subscribe: ${err instanceof Error ? err.message : String(err)}`,
      handled: true,
    };
  }
}

async function handleUnsubscribe(siteDir: string, url: string): Promise<SkillResult> {
  const removed = await unsubscribe(siteDir, url);
  return {
    reply: removed ? `Unsubscribed from ${url}` : `Not subscribed to ${url}`,
    handled: true,
  };
}

async function handleFeeds(siteDir: string): Promise<SkillResult> {
  const subs = await listSubscriptions(siteDir);
  if (subs.length === 0) {
    return { reply: "No subscriptions. Send: subscribe <url>", handled: true };
  }

  const lines: string[] = [];
  for (const sub of subs) {
    const counts = await getItemCounts(siteDir, sub.feedUrl);
    const muted = sub.notify?.muted ? " (muted)" : "";
    lines.push(`${sub.title}${muted} — ${counts.unread} unread`);
  }

  return { reply: lines.join("\n"), handled: true };
}

async function handleUnread(siteDir: string, chatId: string): Promise<SkillResult> {
  const items = await listItems(siteDir, { read: false }, 10);
  lastListings.set(chatId, items);

  if (items.length === 0) {
    return { reply: "No unread items.", handled: true };
  }

  const lines = items.map(
    (item, i) => `${i + 1}. ${item.title}${item.link ? `\n   ${item.link}` : ""}`,
  );

  return {
    reply: `${items.length} unread:\n\n${lines.join("\n\n")}`,
    handled: true,
  };
}

async function handleStarred(siteDir: string, chatId: string): Promise<SkillResult> {
  const items = await listItems(siteDir, { starred: true }, 10);
  lastListings.set(chatId, items);

  if (items.length === 0) {
    return { reply: "No starred items.", handled: true };
  }

  const lines = items.map(
    (item, i) => `${i + 1}. ${item.title}${item.link ? `\n   ${item.link}` : ""}`,
  );

  return {
    reply: `${items.length} starred:\n\n${lines.join("\n\n")}`,
    handled: true,
  };
}

async function handleRead(siteDir: string, n: number, chatId: string): Promise<SkillResult> {
  const item = getFromListing(n, chatId);
  if (!item) {
    return { reply: `No item #${n}. Send "unread" first to get a listing.`, handled: true };
  }

  await markRead(siteDir, item.dedupKey);

  const text = item.content.replace(/<[^>]+>/g, "").trim().slice(0, 500);
  const parts: string[] = [];
  parts.push(item.title);
  if (item.author) parts.push(`by ${item.author}`);
  if (item.link) parts.push(item.link);
  parts.push("");
  parts.push(text);
  if (item.content.length > 500) parts.push("\n...(truncated)");

  return { reply: parts.join("\n"), handled: true };
}

async function handleStar(siteDir: string, n: number, chatId: string): Promise<SkillResult> {
  const item = getFromListing(n, chatId);
  if (!item) {
    return { reply: `No item #${n}. Send "unread" first.`, handled: true };
  }
  await starItem(siteDir, item.dedupKey);
  return { reply: `Starred: ${item.title}`, handled: true };
}

async function handleUnstar(siteDir: string, n: number, chatId: string): Promise<SkillResult> {
  const item = getFromListing(n, chatId);
  if (!item) {
    return { reply: `No item #${n}. Send "unread" first.`, handled: true };
  }
  await unstarItem(siteDir, item.dedupKey);
  return { reply: `Unstarred: ${item.title}`, handled: true };
}

async function handleShare(siteDir: string, n: number, chatId: string): Promise<SkillResult> {
  const item = getFromListing(n, chatId);
  if (!item) {
    return { reply: `No item #${n}. Send "unread" first.`, handled: true };
  }

  const now = new Date().toISOString();
  const slug = item.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "shared-item";

  const content: ClassifiedContent = {
    type: "link",
    title: item.title,
    body: item.content || item.title,
    slug,
    tags: item.categories,
    linkUrl: item.link,
    linkTitle: item.title,
    linkDescription: item.content.replace(/<[^>]+>/g, "").slice(0, 200),
    createdAt: item.publishedAt ?? now,
    updatedAt: now,
  };

  await markRead(siteDir, item.dedupKey);

  return {
    reply: `Sharing: ${item.title}`,
    handled: true,
    content,
  };
}

async function handleMute(
  siteDir: string,
  url: string,
  muted: boolean,
): Promise<SkillResult> {
  const result = await updateSubscription(siteDir, url, {
    notify: { muted },
  });
  if (!result) {
    return { reply: `Not subscribed to ${url}`, handled: true };
  }
  return {
    reply: `${muted ? "Muted" : "Unmuted"} "${result.title}"`,
    handled: true,
  };
}

async function handleRecap(
  siteDir: string,
  frequency: "daily" | "weekly",
  callModel?: CallModel,
): Promise<SkillResult> {
  try {
    const recap = callModel
      ? await generateAIRecap(siteDir, frequency, callModel)
      : await generatePlainRecap(siteDir, frequency);

    return { reply: recap, handled: true };
  } catch (err) {
    return {
      reply: `Failed to generate recap: ${err instanceof Error ? err.message : String(err)}`,
      handled: true,
    };
  }
}

async function handleNotifications(siteDir: string): Promise<SkillResult> {
  const entries = await drainInbox(siteDir);
  if (entries.length === 0) {
    return { reply: "No pending notifications.", handled: true };
  }
  return { reply: formatDigest(entries), handled: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFromListing(n: number, chatId: string): StoredItem | null {
  const listing = lastListings.get(chatId) ?? [];
  if (n < 1 || n > listing.length) return null;
  return listing[n - 1] ?? null;
}
