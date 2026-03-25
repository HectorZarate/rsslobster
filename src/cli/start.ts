import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pc from "picocolors";
import { readSiteConfig } from "../generator/site.js";
import { createModelCaller, type ModelConfig } from "../agent/model.js";
import { processMessage } from "../agent/pipeline.js";
import type { InboundMessage, ChannelType } from "../channels/types.js";
import { createChannel, CHANNEL_LABELS } from "../channels/channel.js";
import { publishDueScheduled } from "../agent/scheduler.js";
import { cleanExpiredPreviews } from "../previews/previews.js";
import { deployToGit } from "../deploy/git.js";
import type { HooksConfig } from "../hooks/hooks.js";
import { PluginRegistry } from "../plugins/registry.js";
import { pollAllFeeds } from "../reader/poll.js";
import {
  loadConfig,
  drainInbox,
  isDeliveryTime,
  formatNotification,
  formatDigest,
} from "../reader/notifications.js";
import type { ReaderConfig } from "../config/types.js";

interface LobsterConfig {
  /** Which channel to use. Default: "telegram" */
  channel?: ChannelType;
  telegram?: { token: string; allowedUsers?: string[] };
  discord?: { botToken: string; channelId: string };
  slack?: { botToken: string; appToken: string; channelId?: string };
  whatsapp?: {
    phoneNumberId: string;
    accessToken: string;
    verifyToken: string;
  };
  signal?: { apiUrl: string; phoneNumber: string };
  nostr?: { privateKey: string; relays: string[] };
  matrix?: { homeserverUrl: string; accessToken: string; roomId: string };
  webhook?: { port?: number; secret?: string; tokens?: string[] };
  irc?: {
    server: string;
    port?: number;
    nick: string;
    channel: string;
    password?: string;
    tls?: boolean;
  };
  model: ModelConfig;
  /** Lifecycle hooks */
  hooks?: HooksConfig;
  /** RSS reader / feed polling config */
  reader?: ReaderConfig;
}

async function loadLobsterConfig(siteDir: string): Promise<LobsterConfig> {
  const raw = await readFile(join(siteDir, "lobster.json"), "utf-8");
  return JSON.parse(raw) as LobsterConfig;
}

export const startCommand = new Command("start")
  .description(
    "Start the lobster — listen for messages and publish",
  )
  .argument("[site-dir]", "Path to the site directory", ".")
  .action(async (siteDirArg: string) => {
    const siteDir = resolve(siteDirArg);

    // Load configs
    let lobsterConfig: LobsterConfig;
    try {
      lobsterConfig = await loadLobsterConfig(siteDir);
    } catch {
      console.error(
        pc.red("Missing lobster.json — run `rsslobster onboard` first."),
      );
      process.exit(1);
    }

    const siteConfig = await readSiteConfig(siteDir);

    // Read SOUL.md if present for system prompt
    let systemPrompt: string | undefined;
    try {
      systemPrompt = await readFile(join(siteDir, "SOUL.md"), "utf-8");
    } catch {
      // No SOUL.md, use defaults
    }

    if (systemPrompt) {
      lobsterConfig.model.systemPrompt = systemPrompt;
    }

    const callModel = createModelCaller(lobsterConfig.model);

    // Resolve channel type (default to telegram for backward compat)
    const channelType: ChannelType = lobsterConfig.channel ?? "telegram";
    const channelConfig = lobsterConfig[channelType];

    if (!channelConfig) {
      console.error(
        pc.red(
          `No config found for channel "${channelType}" in lobster.json. ` +
            `Add a "${channelType}" section or run \`rsslobster onboard\`.`,
        ),
      );
      process.exit(1);
    }

    const channel = createChannel(channelType, channelConfig as never);
    const channelLabel = CHANNEL_LABELS[channelType];

    // Load plugins if configured
    const pluginRegistry = new PluginRegistry();
    if (siteConfig.plugins && siteConfig.plugins.length > 0) {
      await pluginRegistry.loadPlugins(siteConfig.plugins, siteDir);
      console.log(pc.dim(`   Plugins: ${siteConfig.plugins.length} loaded`));
    }

    console.log(pc.green("🦞 Lobster is live."));
    console.log(`   Site: ${pc.cyan(`https://${siteConfig.domain}`)}`);
    console.log(`   Model: ${pc.cyan(lobsterConfig.model.model)}`);
    console.log(`   Listening on ${pc.cyan(channelLabel)}...\n`);

    // Track last notification delivery time
    let lastDeliveredAt: string | undefined;
    // Track last chatId for notification delivery
    let lastChatId: string | undefined;

    // Start scheduled draft publisher + preview cleanup (check every 60s)
    const schedulerInterval = setInterval(async () => {
      try {
        const published = await publishDueScheduled(siteDir);
        for (const post of published) {
          console.log(pc.green(`  ⏰ Scheduled publish: ${post.url}`));
        }
      } catch {
        // Scheduler errors are non-fatal
      }

      // Clean expired previews
      try {
        const cleaned = await cleanExpiredPreviews(siteDir);
        if (cleaned > 0) {
          await deployToGit(siteDir, "chore: clean expired previews");
          console.log(pc.dim(`  Cleaned ${cleaned} expired preview(s)`));
        }
      } catch {
        // Cleanup errors are non-fatal
      }
    }, 60_000);

    // Feed poller + notification delivery (every 60s)
    const readerConfig = lobsterConfig.reader;
    let feedPollRunning = false;
    const feedPollInterval = setInterval(async () => {
      if (feedPollRunning) return; // Skip if previous cycle still running
      feedPollRunning = true;
      try {
        // Poll feeds — this ingests items and queues notifications
        const results = await pollAllFeeds(siteDir, {
          defaultInterval: readerConfig?.defaultInterval ?? 15,
        });

        for (const result of results) {
          if (result.error) {
            console.error(pc.dim(`  Feed error (${result.title}): ${result.error}`));
          } else if (result.newItems.length > 0) {
            console.log(
              pc.dim(`  ${result.title}: ${result.newItems.length} new item(s), ${result.notified} notification(s) queued`),
            );
          }
        }

        // Deliver notifications if schedule says it's time
        const notifyConfig = await loadConfig(siteDir);
        if (notifyConfig.enabled && lastChatId && isDeliveryTime(notifyConfig, lastDeliveredAt)) {
          const entries = await drainInbox(siteDir);
          if (entries.length > 0) {
            const msg = notifyConfig.schedule === "immediate"
              ? entries.map(formatNotification).join("\n\n")
              : formatDigest(entries);

            try {
              await channel.reply(lastChatId, msg);
              lastDeliveredAt = new Date().toISOString();
              console.log(pc.dim(`  Delivered ${entries.length} notification(s)`));
            } catch {
              // Re-queue on delivery failure
              const { addToInbox } = await import("../reader/notifications.js");
              await addToInbox(siteDir, entries);
            }
          }
        }
      } catch (err) {
        console.error(pc.yellow("Feed poll error:"), err instanceof Error ? err.message : String(err));
      } finally {
        feedPollRunning = false;
      }
    }, 60_000);

    const controller = new AbortController();
    process.on("SIGINT", () => {
      console.log(pc.yellow("\nShutting down..."));
      clearInterval(schedulerInterval);
      clearInterval(feedPollInterval);
      controller.abort();
    });

    await channel.poll(
      async (message: InboundMessage) => {
        // Track chatId for notification delivery
        lastChatId = message.chatId;

        console.log(
          pc.dim(
            `[${new Date().toISOString()}] ${message.sender.name}: ${message.text.slice(0, 60)}`,
          ),
        );

        try {
          // Download any pending attachments (images + media) before processing
          await channel.downloadAttachments(message);

          const pluginInjections = pluginRegistry.getInjections(null, siteConfig, "post");
          const result = await processMessage(message, {
            siteDir,
            callModel,
            deploy: true,
            hooks: lobsterConfig.hooks,
            pluginInjections,
          });

          await channel.reply(message.chatId, result.reply);
          console.log(pc.green(`  → ${result.reply}`));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(pc.red(`  ✗ ${msg}`));
          try {
            await channel.reply(message.chatId, `Error: ${msg}`);
          } catch {
            // If we can't even send the error reply, just log it
          }
        }
      },
      controller.signal,
    );
  });
