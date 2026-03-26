import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pc from "picocolors";
import { readSiteConfig } from "../generator/site.js";
import { createModelCaller } from "../agent/model.js";
import { processMessage } from "../agent/pipeline.js";
import type { InboundMessage } from "../channels/types.js";
import { createChannel, CHANNEL_LABELS } from "../channels/channel.js";
import { publishDueScheduled } from "../agent/scheduler.js";
import { cleanExpiredPreviews } from "../previews/previews.js";
import { deployToGit } from "../deploy/git.js";
import { PluginRegistry } from "../plugins/registry.js";
import { pollAllFeeds } from "../reader/poll.js";
import {
  loadConfig,
  drainInbox,
  isDeliveryTime,
  formatNotification,
  formatDigest,
} from "../reader/notifications.js";
import {
  readLobsterConfig,
  validateLobsterConfig,
} from "../config/lobster.js";

export const startCommand = new Command("start")
  .description(
    "Start the lobster — listen for messages and publish",
  )
  .argument("[site-dir]", "Path to the site directory", ".")
  .action(async (siteDirArg: string) => {
    const siteDir = resolve(siteDirArg);

    // Load configs
    const lobsterConfig = await readLobsterConfig(siteDir);

    // Validate config
    const errors = validateLobsterConfig(lobsterConfig);
    if (errors.length > 0) {
      for (const err of errors) {
        console.error(pc.red(`lobster.json: ${err.field} — ${err.message}`));
      }
      process.exit(1);
    }

    const siteConfig = await readSiteConfig(siteDir);

    // Model setup (optional)
    let callModel: Awaited<ReturnType<typeof createModelCaller>> | undefined;
    if (lobsterConfig.model) {
      // Read SOUL.md if present for system prompt
      try {
        const systemPrompt = await readFile(join(siteDir, "SOUL.md"), "utf-8");
        lobsterConfig.model.systemPrompt = systemPrompt;
      } catch {
        // No SOUL.md, use defaults
      }
      callModel = createModelCaller(lobsterConfig.model);
    }

    // Channel setup (optional)
    const channelType = lobsterConfig.channel;
    const channelConfig = channelType ? lobsterConfig[channelType] : undefined;
    const channel = channelType && channelConfig
      ? createChannel(channelType, channelConfig as never)
      : undefined;
    const channelLabel = channelType ? CHANNEL_LABELS[channelType] : undefined;

    // Load plugins if configured
    const pluginRegistry = new PluginRegistry();
    if (siteConfig.plugins && siteConfig.plugins.length > 0) {
      await pluginRegistry.loadPlugins(siteConfig.plugins, siteDir);
      console.log(pc.dim(`   Plugins: ${siteConfig.plugins.length} loaded`));
    }

    console.log(pc.green("Lobster is live."));
    console.log(`   Site: ${pc.cyan(`https://${siteConfig.domain}`)}`);
    if (callModel && lobsterConfig.model) {
      console.log(`   Model: ${pc.cyan(lobsterConfig.model.model)}`);
    } else {
      console.log(pc.dim("   Model: not configured — publish via CLI with --type"));
    }
    if (channel && channelLabel) {
      console.log(`   Listening on ${pc.cyan(channelLabel)}...\n`);
    } else {
      console.log(pc.dim("   No channel configured. Publishing via CLI only."));
      console.log(pc.dim(`   Run ${pc.cyan("rsslobster enable telegram")} to publish from your phone.\n`));
    }

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

        // Deliver notifications if schedule says it's time (requires channel)
        if (channel && lastChatId) {
          const notifyConfig = await loadConfig(siteDir);
          if (notifyConfig.enabled && isDeliveryTime(notifyConfig, lastDeliveredAt)) {
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

    if (channel && callModel) {
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
              callModel: callModel!,
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
    } else {
      // No channel or no model — keep alive for feed polling only
      if (!channel) {
        console.log(pc.dim("Feed polling active. Press Ctrl+C to stop."));
      } else if (!callModel) {
        console.log(pc.dim("Channel active but no model configured. Run `rsslobster enable model`."));
      }
      await new Promise<void>((resolve) => {
        controller.signal.addEventListener("abort", () => resolve());
      });
    }
  });
