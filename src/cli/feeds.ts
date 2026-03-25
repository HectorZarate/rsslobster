import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { writeJsonAtomic } from "../reader/paths.js";
import { resolve, join } from "node:path";
import pc from "picocolors";
import {
  subscribe,
  unsubscribe,
  listSubscriptions,
  updateSubscription,
} from "../reader/subscriptions.js";
import { parseOpml, generateOpml } from "../reader/opml.js";
import {
  getItemCounts,
  listItems,
  getItem,
  markRead,
  markAllRead,
  starItem,
  unstarItem,
  removeItemsForFeed,
} from "../reader/store.js";
import { pollAllFeeds, pollFeed } from "../reader/poll.js";
import { discoverFeed } from "../reader/discover.js";
import {
  loadConfig,
  updateConfig,
  inboxCount,
} from "../reader/notifications.js";
import type { SubscriptionNotify, StoredItem } from "../reader/types.js";

export const feedsCommand = new Command("feeds")
  .description("RSS reader — subscribe, poll, and read feeds");

/** Truncate verbose feed titles to something scannable */
export function shortFeedName(title: string): string {
  if (title.length <= 25) return title;
  // Common separators: "Name — tagline", "Name | tagline", "Name: tagline"
  for (const sep of [" — ", " | ", " - ", ": "]) {
    const idx = title.indexOf(sep);
    if (idx > 0 && idx < 40) return title.slice(0, idx);
  }
  // Very long titles that look like sentences: take first word (the brand name)
  const words = title.split(/\s+/);
  if (words.length > 5 && title.length > 50) {
    return words[0]!;
  }
  // Truncate at word boundary
  const truncated = title.slice(0, 25);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 5 ? truncated.slice(0, lastSpace) : truncated;
}

// ---------------------------------------------------------------------------
// Last-listing persistence (Tasks 8 & 9)
// ---------------------------------------------------------------------------

export interface ListingEntry {
  dedupKey: string;
  title: string;
  link?: string;
  feedUrl: string;
  content: string;
  categories: string[];
  publishedAt?: string;
}

export async function saveLastListing(siteDir: string, items: StoredItem[]): Promise<void> {
  const entries: ListingEntry[] = items.map(i => ({
    dedupKey: i.dedupKey,
    title: i.title,
    link: i.link,
    feedUrl: i.feedUrl,
    content: i.content,
    categories: i.categories,
    publishedAt: i.publishedAt,
  }));
  const path = join(siteDir, "reader", ".last-listing.json");
  await writeJsonAtomic(path, entries);
}

export async function loadLastListing(siteDir: string): Promise<ListingEntry[]> {
  try {
    const path = join(siteDir, "reader", ".last-listing.json");
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Relative date formatting (Task 10)
// ---------------------------------------------------------------------------

export function relativeDate(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) {
    const d = new Date(iso);
    return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]!;
  }
  const d = new Date(iso);
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]} ${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// feeds (default = list)
// ---------------------------------------------------------------------------

feedsCommand
  .command("list", { isDefault: true })
  .description("Show your feed — unread items, paginated")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--subs", "Show subscriptions only")
  .option("--folder <folder>", "Filter by folder")
  .option("-n, --limit <n>", "Items per page", "5")
  .option("-p, --page <p>", "Page number (1-indexed)", "1")
  .action(async (siteDir: string, opts: { subs?: boolean; folder?: string; limit: string; page: string }) => {
    const dir = resolve(siteDir);
    const subs = await listSubscriptions(
      dir,
      opts.folder ? { folder: opts.folder } : undefined,
    );

    if (subs.length === 0) {
      console.log("No subscriptions. Add one with: rsslobster feeds add <url>");
      return;
    }

    // --subs: just show subscriptions
    if (opts.subs) {
      for (const sub of subs) {
        const counts = await getItemCounts(dir, sub.feedUrl);
        const muted = sub.notify?.muted ? pc.dim(" (muted)") : "";
        const errFlag = sub.errorCount >= 5 ? pc.red(" [!]") : "";
        const unread = counts.unread > 0 ? pc.yellow(String(counts.unread)) : pc.dim("0");
        console.log(`  ${pc.bold(sub.title)}${muted}${errFlag} — ${unread}/${pc.dim(String(counts.total))}`);
      }
      return;
    }

    // Default: show unread items, paginated
    const limit = parseInt(opts.limit, 10) || 5;
    const page = parseInt(opts.page, 10) || 1;
    const offset = (page - 1) * limit;
    const totalCounts = await getItemCounts(dir);
    const items = await listItems(dir, { read: false }, limit, offset);

    if (totalCounts.unread === 0) {
      console.log("All caught up.");
      return;
    }

    // Build short feed name lookup
    const subMap = new Map(subs.map((s) => [s.feedUrl, shortFeedName(s.title)]));

    const totalPages = Math.ceil(totalCounts.unread / limit);
    console.log(`${pc.yellow(String(totalCounts.unread))} unread — page ${page}/${totalPages}\n`);

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const feed = subMap.get(item.feedUrl) ?? "";
      const title = item.title || item.content.replace(/<[^>]+>/g, "").trim().slice(0, 80) || "(untitled)";
      const num = offset + i + 1;
      const date = relativeDate(item.publishedAt ?? item.firstSeenAt);
      console.log(`${pc.dim(String(num) + ".")} ${pc.bold(title)} ${pc.dim("(" + date + ")")}`);
      console.log(`   ${pc.cyan(feed)} ${pc.dim("—")} ${pc.dim(item.link ?? "")}`);
    }

    await saveLastListing(dir, items);

    if (page < totalPages) {
      console.log(`\nNext: rsslobster feeds -p ${page + 1}`);
    }
  });

// ---------------------------------------------------------------------------
// feeds add
// ---------------------------------------------------------------------------

feedsCommand
  .command("add")
  .description("Subscribe to a feed (auto-discovers feed URL from HTML)")
  .argument("<url>", "Feed or site URL")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--title <title>", "Override feed title")
  .option("--folder <folder>", "Assign to folder")
  .option("--muted", "Start muted (no notifications)")
  .action(
    async (
      url: string,
      siteDir: string,
      opts: { title?: string; folder?: string; muted?: boolean },
    ) => {
      const dir = resolve(siteDir);

      // Auto-discover feed URL and title
      let feedUrl = url;
      let title = opts.title ?? "";
      let siteUrl: string | undefined;

      try {
        const discovered = await discoverFeed(url);
        feedUrl = discovered.feedUrl;
        title = opts.title ?? discovered.title;
        siteUrl = discovered.siteUrl;
      } catch {
        // Discovery failed — use URL as-is, hostname as title
        if (!title) {
          try {
            title = new URL(url).hostname;
          } catch {
            title = url;
          }
        }
      }

      const notify: SubscriptionNotify | undefined = opts.muted
        ? { muted: true }
        : undefined;

      const sub = await subscribe(dir, feedUrl, title, {
        siteUrl,
        folder: opts.folder,
      });

      if (notify) {
        await updateSubscription(dir, feedUrl, { notify });
      }

      console.log(`Subscribed to ${pc.bold(`"${sub.title}"`)}`);
      console.log(`  Feed: ${pc.dim(sub.feedUrl)}`);
      if (siteUrl) console.log(`  Site: ${pc.dim(siteUrl)}`);

      // Initial poll
      const result = await pollFeed(dir, feedUrl, { skipNotify: true });
      if (result.newItems.length > 0) {
        console.log(`  ${result.newItems.length} item(s) fetched`);
      }
    },
  );

// ---------------------------------------------------------------------------
// feeds remove
// ---------------------------------------------------------------------------

feedsCommand
  .command("remove")
  .description("Unsubscribe from a feed")
  .argument("<url>", "Feed URL")
  .argument("[site-dir]", "Path to site directory", ".")
  .action(async (url: string, siteDir: string) => {
    const dir = resolve(siteDir);
    const removed = await unsubscribe(dir, url);

    if (removed) {
      await removeItemsForFeed(dir, url);
      console.log(`Unsubscribed from ${url}`);
    } else {
      console.error(`Not subscribed to ${url}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// feeds poll
// ---------------------------------------------------------------------------

feedsCommand
  .command("poll")
  .description("Fetch new items from all subscriptions (or a specific feed)")
  .argument("[url]", "Specific feed URL to poll (optional)")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--force", "Ignore poll intervals, fetch all feeds now")
  .action(async (url: string | undefined, siteDir: string, opts: { force?: boolean }) => {
    const dir = resolve(siteDir);

    if (url) {
      const result = await pollFeed(dir, url);
      if (result.error) {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }
      console.log(`${result.title}: ${result.newItems.length} new item(s)`);
      if (result.notified > 0) {
        console.log(`  ${result.notified} notification(s) queued`);
      }
      return;
    }

    const results = await pollAllFeeds(dir, { force: opts.force });

    if (results.length === 0) {
      console.log("All feeds up to date.");
      return;
    }

    let totalNew = 0;
    let totalNotified = 0;
    for (const result of results) {
      if (result.error) {
        console.error(`  ${pc.red(result.title)}: ${result.error}`);
      } else {
        console.log(`  ${pc.bold(result.title)}: ${pc.green(String(result.newItems.length))} new`);
        totalNew += result.newItems.length;
        totalNotified += result.notified;
      }
    }

    console.log(`\n${pc.green(String(totalNew))} new item(s) across ${results.length} feed(s)`);
    if (totalNotified > 0) {
      console.log(`${totalNotified} notification(s) queued`);
    }
  });

// ---------------------------------------------------------------------------
// feeds items
// ---------------------------------------------------------------------------

feedsCommand
  .command("items")
  .description("Show feed items with filtering and pagination")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--all", "Show all items, not just unread")
  .option("--starred", "Show starred items only")
  .option("--feed <url>", "Filter by feed URL")
  .option("-n, --limit <n>", "Items per page", "5")
  .option("-p, --page <p>", "Page number", "1")
  .action(
    async (
      siteDir: string,
      opts: { all?: boolean; starred?: boolean; feed?: string; limit: string; page: string },
    ) => {
      const dir = resolve(siteDir);
      const limit = parseInt(opts.limit, 10) || 5;
      const page = parseInt(opts.page, 10) || 1;
      const offset = (page - 1) * limit;

      const filter = {
        feedUrl: opts.feed,
        read: opts.all ? undefined : opts.starred ? undefined : false,
        starred: opts.starred ? true : undefined,
      };

      const items = await listItems(dir, filter, limit, offset);

      if (items.length === 0) {
        const label = opts.starred ? "starred" : opts.all ? "" : "unread";
        console.log(`No ${label} items.`);
        return;
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const starred = item.starred ? pc.yellow("*") : "";
        const unread = !item.read ? pc.green("N") : "";
        const flags = [starred, unread].filter(Boolean).join("") || " ";
        const title = item.title || item.content.replace(/<[^>]+>/g, "").trim().slice(0, 80) || "(untitled)";
        const num = offset + i + 1;
        const date = relativeDate(item.publishedAt ?? item.firstSeenAt);
        console.log(`${pc.dim(String(num) + ".")} [${flags}] ${pc.bold(title)} ${pc.dim("(" + date + ")")}`);
        console.log(`   ${pc.dim(item.link ?? item.dedupKey)}`);
      }

      await saveLastListing(dir, items);

      // Check if there are more
      const next = await listItems(dir, filter, 1, offset + limit);
      if (next.length > 0) {
        console.log(`\nMore: rsslobster feeds items -p ${page + 1}`);
      }
    },
  );

// ---------------------------------------------------------------------------
// feeds read
// ---------------------------------------------------------------------------

feedsCommand
  .command("read")
  .description("Show an item's content and mark it as read")
  .argument("<n>", "Item number from last listing")
  .argument("[site-dir]", "Path to site directory", ".")
  .action(async (n: string, siteDir: string) => {
    const dir = resolve(siteDir);
    const num = parseInt(n, 10);
    const listing = await loadLastListing(dir);

    if (num < 1 || num > listing.length) {
      console.error(`No item #${num}. Run 'rsslobster feeds' first to see items.`);
      process.exit(1);
    }

    const entry = listing[num - 1]!;
    const item = await getItem(dir, entry.dedupKey);
    if (!item) {
      console.error(`Item not found. The listing may be stale — run 'rsslobster feeds' again.`);
      process.exit(1);
    }

    const text = item.content.replace(/<[^>]+>/g, "").trim();
    const displayTitle = item.title || text.slice(0, 80) || "(untitled)";
    console.log(pc.bold(displayTitle));
    if (item.author) console.log(pc.dim(`by ${item.author}`));
    if (item.link) console.log(pc.dim(item.link));
    const pubDate = item.publishedAt ?? item.firstSeenAt;
    const formatted = new Date(pubDate).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    console.log(pc.dim(formatted) + "\n");
    console.log(text);

    await markRead(dir, item.dedupKey);
  });

// ---------------------------------------------------------------------------
// feeds star / unstar
// ---------------------------------------------------------------------------

feedsCommand
  .command("star")
  .description("Star an item")
  .argument("<n>", "Item number from last listing")
  .argument("[site-dir]", "Path to site directory", ".")
  .action(async (n: string, siteDir: string) => {
    const dir = resolve(siteDir);
    const num = parseInt(n, 10);
    const listing = await loadLastListing(dir);

    if (num < 1 || num > listing.length) {
      console.error(`No item #${num}. Run 'rsslobster feeds' first to see items.`);
      process.exit(1);
    }

    const entry = listing[num - 1]!;
    const ok = await starItem(dir, entry.dedupKey);
    if (!ok) {
      console.error(`Item not found. The listing may be stale — run 'rsslobster feeds' again.`);
      process.exit(1);
    }
    console.log(`Starred: ${entry.title}`);
  });

feedsCommand
  .command("unstar")
  .description("Unstar an item")
  .argument("<n>", "Item number from last listing")
  .argument("[site-dir]", "Path to site directory", ".")
  .action(async (n: string, siteDir: string) => {
    const dir = resolve(siteDir);
    const num = parseInt(n, 10);
    const listing = await loadLastListing(dir);

    if (num < 1 || num > listing.length) {
      console.error(`No item #${num}. Run 'rsslobster feeds' first to see items.`);
      process.exit(1);
    }

    const entry = listing[num - 1]!;
    const ok = await unstarItem(dir, entry.dedupKey);
    if (!ok) {
      console.error(`Item not found. The listing may be stale — run 'rsslobster feeds' again.`);
      process.exit(1);
    }
    console.log(`Unstarred: ${entry.title}`);
  });

// ---------------------------------------------------------------------------
// feeds share
// ---------------------------------------------------------------------------

feedsCommand
  .command("share")
  .description("Share an item as a link post on your site")
  .argument("<n>", "Item number from last listing")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("-m, --message <text>", "Add commentary to the shared post")
  .action(async (n: string, siteDir: string, opts: { message?: string }) => {
    const dir = resolve(siteDir);
    const num = parseInt(n, 10);
    const listing = await loadLastListing(dir);

    if (num < 1 || num > listing.length) {
      console.error(`No item #${num}. Run 'rsslobster feeds' first to see items.`);
      process.exit(1);
    }

    const entry = listing[num - 1]!;

    console.log(`Shared: "${entry.title}"`);
    console.log(`  Source: ${entry.link ?? "(no link)"}`);
    if (opts.message) {
      console.log(`  Note: ${opts.message}`);
    }
    console.log(`  Use: rsslobster publish "${entry.title} ${entry.link ?? ""}"`);

    await markRead(dir, entry.dedupKey);
  });

// ---------------------------------------------------------------------------
// feeds mark-read
// ---------------------------------------------------------------------------

feedsCommand
  .command("mark-read")
  .description("Mark items as read")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--all", "Mark all items as read")
  .option("--feed <url>", "Mark all items from a specific feed as read")
  .action(async (siteDir: string, opts: { all?: boolean; feed?: string }) => {
    const dir = resolve(siteDir);

    if (!opts.all && !opts.feed) {
      console.error("Provide --all or --feed <url>");
      process.exit(1);
    }

    const count = await markAllRead(dir, opts.feed);
    if (opts.feed) {
      console.log(`Marked ${count} item(s) as read from ${opts.feed}`);
    } else {
      console.log(`Marked ${count} item(s) as read`);
    }
  });

// ---------------------------------------------------------------------------
// feeds mute / unmute
// ---------------------------------------------------------------------------

feedsCommand
  .command("mute")
  .description("Mute notifications from a feed")
  .argument("<url>", "Feed URL")
  .argument("[site-dir]", "Path to site directory", ".")
  .action(async (url: string, siteDir: string) => {
    const dir = resolve(siteDir);
    const result = await updateSubscription(dir, url, {
      notify: { muted: true },
    });
    if (!result) {
      console.error(`Not subscribed to ${url}`);
      process.exit(1);
    }
    console.log(`Muted "${result.title}"`);
  });

feedsCommand
  .command("unmute")
  .description("Unmute notifications from a feed")
  .argument("<url>", "Feed URL")
  .argument("[site-dir]", "Path to site directory", ".")
  .action(async (url: string, siteDir: string) => {
    const dir = resolve(siteDir);
    const result = await updateSubscription(dir, url, {
      notify: { muted: false },
    });
    if (!result) {
      console.error(`Not subscribed to ${url}`);
      process.exit(1);
    }
    console.log(`Unmuted "${result.title}"`);
  });

// ---------------------------------------------------------------------------
// feeds filter
// ---------------------------------------------------------------------------

feedsCommand
  .command("filter")
  .description("Set keyword filter for a feed (only notify on matches)")
  .argument("<url>", "Feed URL")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--keywords <words...>", "Keywords to match (any)")
  .option("--clear", "Remove all filters")
  .action(
    async (
      url: string,
      siteDir: string,
      opts: { keywords?: string[]; clear?: boolean },
    ) => {
      const dir = resolve(siteDir);
      const filter = opts.clear ? [] : opts.keywords;
      if (!filter) {
        console.error("Provide --keywords or --clear");
        process.exit(1);
      }
      const result = await updateSubscription(dir, url, {
        notify: { filter },
      });
      if (!result) {
        console.error(`Not subscribed to ${url}`);
        process.exit(1);
      }
      if (filter.length === 0) {
        console.log(`Cleared filters for "${result.title}"`);
      } else {
        console.log(`Filter "${result.title}" for: ${filter.join(", ")}`);
      }
    },
  );

// ---------------------------------------------------------------------------
// feeds notify
// ---------------------------------------------------------------------------

feedsCommand
  .command("notify")
  .description("Show or configure notification settings")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--enable", "Enable notifications")
  .option("--disable", "Disable notifications")
  .option("--schedule <schedule>", "Set schedule: immediate, hourly, daily, weekly")
  .option("--deliver-at <time>", "Delivery time for daily/weekly (HH:MM)")
  .option("--day <day>", "Day of week for weekly (0=Sun..6=Sat)")
  .option("--quiet-start <time>", "Quiet hours start (HH:MM)")
  .option("--quiet-end <time>", "Quiet hours end (HH:MM)")
  .option("--no-quiet", "Remove quiet hours")
  .action(
    async (
      siteDir: string,
      opts: {
        enable?: boolean;
        disable?: boolean;
        schedule?: string;
        deliverAt?: string;
        day?: string;
        quietStart?: string;
        quietEnd?: string;
        quiet?: boolean;
      },
    ) => {
      const dir = resolve(siteDir);

      // If no flags, show current config
      const hasChanges =
        opts.enable || opts.disable || opts.schedule || opts.deliverAt ||
        opts.day || opts.quietStart || opts.quietEnd || opts.quiet === false;

      if (!hasChanges) {
        const config = await loadConfig(dir);
        console.log("Notification settings:");
        console.log(`  Enabled:  ${config.enabled}`);
        console.log(`  Schedule: ${config.schedule}`);
        if (config.schedule !== "immediate") {
          console.log(`  Deliver:  ${config.deliverAt}`);
        }
        if (config.schedule === "weekly") {
          const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          console.log(`  Day:      ${days[config.dayOfWeek]}`);
        }
        if (config.quietHours) {
          console.log(`  Quiet:    ${config.quietHours.start} - ${config.quietHours.end}`);
        }
        console.log(`  Recaps:   ${config.recap.enabled ? `${config.recap.frequency} at ${config.recap.deliverAt}` : "off"}`);

        const pending = await inboxCount(dir);
        if (pending > 0) {
          console.log(`\n  ${pending} pending notification(s) in inbox`);
        }
        return;
      }

      // Apply changes
      const updates: Record<string, unknown> = {};
      if (opts.enable) updates.enabled = true;
      if (opts.disable) updates.enabled = false;
      if (opts.schedule) updates.schedule = opts.schedule;
      if (opts.deliverAt) updates.deliverAt = opts.deliverAt;
      if (opts.day) updates.dayOfWeek = parseInt(opts.day, 10);
      if (opts.quietStart && opts.quietEnd) {
        updates.quietHours = { start: opts.quietStart, end: opts.quietEnd };
      }
      if (opts.quiet === false) {
        updates.quietHours = undefined;
      }

      const config = await updateConfig(
        dir,
        updates as Partial<import("../reader/types.js").NotificationConfig>,
      );
      console.log(`Notifications: ${config.enabled ? "enabled" : "disabled"}, schedule: ${config.schedule}`);
    },
  );

// ---------------------------------------------------------------------------
// feeds recap
// ---------------------------------------------------------------------------

feedsCommand
  .command("recap")
  .description("Configure AI recaps")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--enable", "Enable AI recaps")
  .option("--disable", "Disable AI recaps")
  .option("--frequency <freq>", "Recap frequency: daily, weekly")
  .option("--deliver-at <time>", "Recap delivery time (HH:MM)")
  .option("--style <style>", "Recap style: brief, detailed")
  .action(
    async (
      siteDir: string,
      opts: {
        enable?: boolean;
        disable?: boolean;
        frequency?: string;
        deliverAt?: string;
        style?: string;
      },
    ) => {
      const dir = resolve(siteDir);

      const hasChanges = opts.enable || opts.disable || opts.frequency || opts.deliverAt || opts.style;

      if (!hasChanges) {
        const config = await loadConfig(dir);
        console.log("Recap settings:");
        console.log(`  Enabled:   ${config.recap.enabled}`);
        console.log(`  Frequency: ${config.recap.frequency}`);
        console.log(`  Deliver:   ${config.recap.deliverAt}`);
        console.log(`  Style:     ${config.recap.style}`);
        return;
      }

      const recapUpdates: Record<string, unknown> = {};
      if (opts.enable) recapUpdates.enabled = true;
      if (opts.disable) recapUpdates.enabled = false;
      if (opts.frequency) recapUpdates.frequency = opts.frequency;
      if (opts.deliverAt) recapUpdates.deliverAt = opts.deliverAt;
      if (opts.style) recapUpdates.style = opts.style;

      const config = await updateConfig(dir, {
        recap: recapUpdates as Partial<import("../reader/types.js").RecapConfig> as import("../reader/types.js").RecapConfig,
      });
      console.log(
        `Recaps: ${config.recap.enabled ? "enabled" : "disabled"}, ${config.recap.frequency} at ${config.recap.deliverAt}`,
      );
    },
  );

// ---------------------------------------------------------------------------
// feeds import / export
// ---------------------------------------------------------------------------

feedsCommand
  .command("import")
  .description("Import subscriptions from an OPML file")
  .argument("<file>", "Path to OPML file")
  .argument("[site-dir]", "Path to site directory", ".")
  .action(async (file: string, siteDir: string) => {
    const dir = resolve(siteDir);
    const xml = await readFile(resolve(file), "utf-8");
    const outlines = parseOpml(xml);

    let added = 0;
    let skipped = 0;

    for (const outline of outlines) {
      try {
        await subscribe(dir, outline.xmlUrl, outline.title, {
          siteUrl: outline.htmlUrl,
          folder: outline.folder,
        });
        added++;
      } catch {
        skipped++;
      }
    }

    console.log(
      `Imported ${pc.green(String(added))} feed(s)${skipped > 0 ? `, ${pc.yellow(String(skipped))} skipped (duplicate or invalid)` : ""}`,
    );
  });

feedsCommand
  .command("export")
  .description("Export subscriptions to OPML")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--title <title>", "OPML title", "RSS Lobster Subscriptions")
  .action(async (siteDir: string, opts: { title: string }) => {
    const dir = resolve(siteDir);
    const subs = await listSubscriptions(dir);
    const opml = generateOpml(opts.title, subs);
    console.log(opml);
  });
