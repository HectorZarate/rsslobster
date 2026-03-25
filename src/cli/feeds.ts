import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  subscribe,
  unsubscribe,
  listSubscriptions,
  listFolders,
  updateSubscription,
} from "../reader/subscriptions.js";
import { parseOpml, generateOpml } from "../reader/opml.js";
import {
  getItemCounts,
  listItems,
  getItem,
  markRead,
  starItem,
  unstarItem,
} from "../reader/store.js";
import { pollAllFeeds, pollFeed } from "../reader/poll.js";
import { discoverFeed } from "../reader/discover.js";
import {
  loadConfig,
  updateConfig,
  inboxCount,
} from "../reader/notifications.js";
import type { SubscriptionNotify } from "../reader/types.js";

export const feedsCommand = new Command("feeds")
  .description("RSS reader — subscribe, poll, and read feeds");

// ---------------------------------------------------------------------------
// feeds (default = list)
// ---------------------------------------------------------------------------

feedsCommand
  .command("list", { isDefault: true })
  .description("List all feed subscriptions with unread counts")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--folder <folder>", "Filter by folder")
  .action(async (siteDir: string, opts: { folder?: string }) => {
    const dir = resolve(siteDir);
    const subs = await listSubscriptions(
      dir,
      opts.folder ? { folder: opts.folder } : undefined,
    );

    if (subs.length === 0) {
      console.log("No subscriptions. Add one with: rsslobster feeds add <url>");
      return;
    }

    const pending = await inboxCount(dir);
    if (pending > 0) {
      console.log(`${pending} pending notification(s)\n`);
    }

    for (const sub of subs) {
      const counts = await getItemCounts(dir, sub.feedUrl);
      const folder = sub.folder ? ` [${sub.folder}]` : "";
      const muted = sub.notify?.muted ? " (muted)" : "";
      const health = sub.errorCount > 0 ? ` !! ${sub.lastError}` : "";
      console.log(
        `  ${sub.title}${folder}${muted} — ${counts.unread} unread, ${counts.total} total${health}`,
      );
      console.log(`    ${sub.feedUrl}`);
    }

    const folders = await listFolders(dir);
    if (folders.length > 0) {
      console.log(`\nFolders: ${folders.join(", ")}`);
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

      console.log(`Subscribed to "${sub.title}"`);
      console.log(`  Feed: ${sub.feedUrl}`);
      if (siteUrl) console.log(`  Site: ${siteUrl}`);

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
        console.error(`  ${result.title}: ${result.error}`);
      } else {
        console.log(`  ${result.title}: ${result.newItems.length} new`);
        totalNew += result.newItems.length;
        totalNotified += result.notified;
      }
    }

    console.log(`\n${totalNew} new item(s) across ${results.length} feed(s)`);
    if (totalNotified > 0) {
      console.log(`${totalNotified} notification(s) queued`);
    }
  });

// ---------------------------------------------------------------------------
// feeds items
// ---------------------------------------------------------------------------

feedsCommand
  .command("items")
  .description("Show feed items (defaults to unread)")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--all", "Show all items, not just unread")
  .option("--starred", "Show starred items only")
  .option("--feed <url>", "Filter by feed URL")
  .option("-n, --limit <n>", "Max items to show", "20")
  .action(
    async (
      siteDir: string,
      opts: { all?: boolean; starred?: boolean; feed?: string; limit: string },
    ) => {
      const dir = resolve(siteDir);
      const limit = parseInt(opts.limit, 10) || 20;

      const items = await listItems(
        dir,
        {
          feedUrl: opts.feed,
          read: opts.all ? undefined : opts.starred ? undefined : false,
          starred: opts.starred ? true : undefined,
        },
        limit,
      );

      if (items.length === 0) {
        const label = opts.starred ? "starred" : opts.all ? "" : "unread";
        console.log(`No ${label} items.`);
        return;
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const flags = [
          item.starred ? "*" : " ",
          item.read ? " " : "N",
        ].join("");
        const date = item.publishedAt
          ? new Date(item.publishedAt).toLocaleDateString()
          : "";
        const displayTitle = item.title || item.content.replace(/<[^>]+>/g, "").trim().slice(0, 80) || "(untitled)";
        console.log(`  ${String(i + 1).padStart(3)}. [${flags}] ${displayTitle}`);
        if (item.link) console.log(`       ${item.link}`);
        console.log(`       ${date}  |  ${item.dedupKey}`);
      }
    },
  );

// ---------------------------------------------------------------------------
// feeds read
// ---------------------------------------------------------------------------

feedsCommand
  .command("read")
  .description("Show an item's content and mark it as read")
  .argument("<id>", "Item dedup key")
  .argument("[site-dir]", "Path to site directory", ".")
  .action(async (id: string, siteDir: string) => {
    const dir = resolve(siteDir);
    const item = await getItem(dir, id);

    if (!item) {
      console.error(`Item not found: ${id}`);
      process.exit(1);
    }

    const text = item.content.replace(/<[^>]+>/g, "").trim();
    const displayTitle = item.title || text.slice(0, 80) || "(untitled)";
    console.log(displayTitle);
    if (item.author) console.log(`by ${item.author}`);
    if (item.link) console.log(item.link);
    console.log(`${item.publishedAt ?? item.firstSeenAt}\n`);
    console.log(text);

    await markRead(dir, id);
  });

// ---------------------------------------------------------------------------
// feeds star / unstar
// ---------------------------------------------------------------------------

feedsCommand
  .command("star")
  .description("Star an item")
  .argument("<id>", "Item dedup key")
  .argument("[site-dir]", "Path to site directory", ".")
  .action(async (id: string, siteDir: string) => {
    const dir = resolve(siteDir);
    const ok = await starItem(dir, id);
    if (!ok) {
      console.error(`Item not found: ${id}`);
      process.exit(1);
    }
    console.log("Starred.");
  });

feedsCommand
  .command("unstar")
  .description("Unstar an item")
  .argument("<id>", "Item dedup key")
  .argument("[site-dir]", "Path to site directory", ".")
  .action(async (id: string, siteDir: string) => {
    const dir = resolve(siteDir);
    const ok = await unstarItem(dir, id);
    if (!ok) {
      console.error(`Item not found: ${id}`);
      process.exit(1);
    }
    console.log("Unstarred.");
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
      `Imported ${added} feed(s)${skipped > 0 ? `, ${skipped} skipped (duplicate or invalid)` : ""}`,
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
