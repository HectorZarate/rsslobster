import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import pc from "picocolors";
import { readSiteConfig } from "../generator/site.js";
import { createModelCaller, type ModelConfig } from "../agent/model.js";
import { processMessage } from "../agent/pipeline.js";
import {
  pollForUpdates,
  sendReply,
  downloadTelegramFile,
} from "../channels/telegram.js";
import type { InboundMessage } from "../channels/types.js";
import { publishDueScheduled } from "../agent/scheduler.js";

interface LobsterConfig {
  telegram: { token: string; allowedUsers?: string[] };
  model: ModelConfig;
}

async function loadLobsterConfig(siteDir: string): Promise<LobsterConfig> {
  const raw = await readFile(join(siteDir, "lobster.json"), "utf-8");
  return JSON.parse(raw) as LobsterConfig;
}

/** Download any pending Telegram photos and attach to the message. */
async function downloadPendingImages(
  message: InboundMessage,
  token: string,
): Promise<void> {
  if (!message.pendingImages || message.pendingImages.length === 0) return;

  const downloadDir = join(tmpdir(), `rsslobster-dl-${message.id}`);
  for (const pending of message.pendingImages) {
    try {
      const localPath = await downloadTelegramFile(
        token,
        pending.fileId,
        downloadDir,
      );
      const filename = localPath.split("/").pop() ?? `${pending.fileId}.jpg`;
      message.images.push({ localPath, filename });
    } catch {
      // Skip failed downloads — pipeline handles partial images gracefully
    }
  }
}

export const startCommand = new Command("start")
  .description("Start the lobster — listen for Telegram messages and publish")
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
    const token = lobsterConfig.telegram.token;
    const allowedUsers = lobsterConfig.telegram.allowedUsers
      ? new Set(lobsterConfig.telegram.allowedUsers)
      : undefined;

    console.log(pc.green("🦞 Lobster is live."));
    console.log(`   Site: ${pc.cyan(`https://${siteConfig.domain}`)}`);
    console.log(`   Model: ${pc.cyan(lobsterConfig.model.model)}`);
    console.log("   Listening for Telegram messages...\n");

    // Start scheduled draft publisher (check every 60s)
    const schedulerInterval = setInterval(async () => {
      try {
        const published = await publishDueScheduled(siteDir);
        for (const post of published) {
          console.log(pc.green(`  ⏰ Scheduled publish: ${post.url}`));
        }
      } catch {
        // Scheduler errors are non-fatal
      }
    }, 60_000);

    const controller = new AbortController();
    process.on("SIGINT", () => {
      console.log(pc.yellow("\nShutting down..."));
      clearInterval(schedulerInterval);
      controller.abort();
    });

    await pollForUpdates(
      token,
      async (message: InboundMessage) => {
        if (allowedUsers && !allowedUsers.has(message.sender.id)) return;

        console.log(
          pc.dim(
            `[${new Date().toISOString()}] ${message.sender.name}: ${message.text.slice(0, 60)}`,
          ),
        );

        try {
          // Download any Telegram photos before processing
          await downloadPendingImages(message, token);

          const result = await processMessage(message, {
            siteDir,
            callModel,
            deploy: true,
          });

          await sendReply(token, message.chatId, result.reply);
          console.log(pc.green(`  → ${result.reply}`));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(pc.red(`  ✗ ${msg}`));
          try {
            await sendReply(token, message.chatId, `Error: ${msg}`);
          } catch {
            // If we can't even send the error reply, just log it
          }
        }
      },
      controller.signal,
    );
  });
