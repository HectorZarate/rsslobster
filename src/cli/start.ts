import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pc from "picocolors";
import { readSiteConfig } from "../generator/site.js";
import { createModelCaller, type ModelConfig } from "../agent/model.js";
import { processMessage } from "../agent/pipeline.js";
import type { InboundMessage } from "../channels/types.js";
import type { ChannelType } from "../channels/types.js";
import { createChannel, CHANNEL_LABELS } from "../channels/channel.js";
import { publishDueScheduled } from "../agent/scheduler.js";
import { cleanExpiredPreviews } from "../previews/previews.js";
import { deployToGit } from "../deploy/git.js";
import type { HooksConfig } from "../hooks/hooks.js";

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

    console.log(pc.green("🦞 Lobster is live."));
    console.log(`   Site: ${pc.cyan(`https://${siteConfig.domain}`)}`);
    console.log(`   Model: ${pc.cyan(lobsterConfig.model.model)}`);
    console.log(`   Listening on ${pc.cyan(channelLabel)}...\n`);

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

    const controller = new AbortController();
    process.on("SIGINT", () => {
      console.log(pc.yellow("\nShutting down..."));
      clearInterval(schedulerInterval);
      controller.abort();
    });

    await channel.poll(
      async (message: InboundMessage) => {
        console.log(
          pc.dim(
            `[${new Date().toISOString()}] ${message.sender.name}: ${message.text.slice(0, 60)}`,
          ),
        );

        try {
          // Download any pending attachments (images + media) before processing
          await channel.downloadAttachments(message);

          const result = await processMessage(message, {
            siteDir,
            callModel,
            deploy: true,
            hooks: lobsterConfig.hooks,
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
