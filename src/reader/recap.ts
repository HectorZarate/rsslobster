import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { listItems } from "./store.js";
import { listSubscriptions } from "./subscriptions.js";
import { readerDir } from "./paths.js";
import type { StoredItem } from "./types.js";
import type { CallModel } from "../agent/classify.js";

const RECAPS_DIR = "recaps";

function recapsDir(siteDir: string): string {
  return join(readerDir(siteDir), RECAPS_DIR);
}

/** Time ranges for recaps */
export function getRecapRange(frequency: "daily" | "weekly"): {
  since: string;
  label: string;
  filename: string;
} {
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;

  if (frequency === "daily") {
    const since = new Date(now.getTime() - msPerDay);
    const dateStr = now.toISOString().slice(0, 10);
    return {
      since: since.toISOString(),
      label: dateStr,
      filename: `${dateStr}.md`,
    };
  }

  // Weekly: last 7 days
  const since = new Date(now.getTime() - 7 * msPerDay);
  const year = now.getFullYear();
  const weekNum = getISOWeek(now);
  return {
    since: since.toISOString(),
    label: `${year}-W${String(weekNum).padStart(2, "0")}`,
    filename: `${year}-W${String(weekNum).padStart(2, "0")}.md`,
  };
}

/** Get ISO week number */
function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    )
  );
}

/**
 * Gather items for a recap period, grouped by feed.
 * Returns a structured corpus ready for LLM summarization or plain-text formatting.
 */
export async function gatherRecapItems(
  siteDir: string,
  frequency: "daily" | "weekly",
): Promise<{
  range: ReturnType<typeof getRecapRange>;
  feeds: Array<{
    title: string;
    feedUrl: string;
    items: StoredItem[];
  }>;
  totalItems: number;
}> {
  const range = getRecapRange(frequency);
  const items = await listItems(siteDir, { since: range.since });

  // Group by feed
  const byFeed = new Map<string, StoredItem[]>();
  for (const item of items) {
    const group = byFeed.get(item.feedUrl) ?? [];
    group.push(item);
    byFeed.set(item.feedUrl, group);
  }

  // Resolve feed titles from subscriptions
  const subs = await listSubscriptions(siteDir);
  const subMap = new Map(subs.map((s) => [s.feedUrl, s.title]));

  const feeds = [...byFeed.entries()].map(([feedUrl, feedItems]) => ({
    title: subMap.get(feedUrl) ?? feedUrl,
    feedUrl,
    items: feedItems,
  }));

  // Sort feeds by item count (most active first)
  feeds.sort((a, b) => b.items.length - a.items.length);

  return { range, feeds, totalItems: items.length };
}

/**
 * Format recap items as a context string for LLM summarization.
 * Each feed section includes titles, links, and truncated content.
 */
export function formatRecapContext(
  feeds: Array<{ title: string; items: StoredItem[] }>,
  maxTokensEstimate = 4000,
): string {
  const lines: string[] = [];
  let estimatedTokens = 0;
  const tokensPerChar = 0.25; // rough estimate

  for (const feed of feeds) {
    if (estimatedTokens > maxTokensEstimate) break;

    lines.push(`## ${feed.title}`);
    for (const item of feed.items) {
      if (estimatedTokens > maxTokensEstimate) break;

      const summary = item.content
        .replace(/<[^>]+>/g, "")
        .slice(0, 200)
        .trim();
      const line = `- ${item.title}${item.link ? ` (${item.link})` : ""}\n  ${summary}`;
      lines.push(line);
      estimatedTokens += line.length * tokensPerChar;
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate a plain-text recap (no LLM needed).
 */
export function formatPlainRecap(
  range: ReturnType<typeof getRecapRange>,
  feeds: Array<{ title: string; items: StoredItem[] }>,
  totalItems: number,
): string {
  const lines: string[] = [];
  lines.push(`# RSS Recap: ${range.label}`);
  lines.push(`${totalItems} new items across ${feeds.length} feed(s)\n`);

  for (const feed of feeds) {
    lines.push(`## ${feed.title} (${feed.items.length})`);
    for (const item of feed.items.slice(0, 10)) {
      const link = item.link ? ` — ${item.link}` : "";
      lines.push(`- ${item.title}${link}`);
    }
    if (feed.items.length > 10) {
      lines.push(`- ...and ${feed.items.length - 10} more`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate an AI-powered recap using the LLM.
 */
export async function generateAIRecap(
  siteDir: string,
  frequency: "daily" | "weekly",
  callModel: CallModel,
  style: "brief" | "detailed" = "brief",
): Promise<string> {
  const { range, feeds, totalItems } = await gatherRecapItems(
    siteDir,
    frequency,
  );

  if (totalItems === 0) {
    return `# RSS Recap: ${range.label}\nNo new items in this period.`;
  }

  const context = formatRecapContext(feeds);
  const prompt = style === "brief"
    ? `You are summarizing RSS feed items from the past ${frequency === "daily" ? "24 hours" : "week"}. Write a brief recap (3-5 bullet points) highlighting the most interesting or important items. Be concise.\n\n${context}`
    : `You are summarizing RSS feed items from the past ${frequency === "daily" ? "24 hours" : "week"}. Write a detailed recap organized by topic/theme, highlighting key items and trends across feeds. Include links where relevant.\n\n${context}`;

  const summary = await callModel(prompt, 0.3);

  const recap = `# RSS Recap: ${range.label}\n\n${summary}\n\n---\n${totalItems} items across ${feeds.length} feed(s)`;

  // Save to disk
  const dir = recapsDir(siteDir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, range.filename), recap);

  return recap;
}

/**
 * Generate a plain-text recap and save to disk.
 */
export async function generatePlainRecap(
  siteDir: string,
  frequency: "daily" | "weekly",
): Promise<string> {
  const { range, feeds, totalItems } = await gatherRecapItems(
    siteDir,
    frequency,
  );

  const recap = formatPlainRecap(range, feeds, totalItems);

  // Save to disk
  const dir = recapsDir(siteDir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, range.filename), recap);

  return recap;
}

/** Load a previously generated recap by filename. */
export async function loadRecap(
  siteDir: string,
  filename: string,
): Promise<string | null> {
  try {
    return await readFile(join(recapsDir(siteDir), filename), "utf-8");
  } catch {
    return null;
  }
}
