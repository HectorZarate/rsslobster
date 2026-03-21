import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pc from "picocolors";
import { readSiteConfig } from "../generator/site.js";
import { createModelCaller, type ModelConfig } from "../agent/model.js";
import { processMessage } from "../agent/pipeline.js";
import { pollForUpdates, sendReply } from "../channels/telegram.js";
import type { InboundMessage } from "../channels/types.js";

interface LobsterConfig {
  telegram: { token: string; allowedUsers?: string[] };
  model: ModelConfig;
}

async function loadLobsterConfig(siteDir: string): Promise<LobsterConfig> {
  const raw = await readFile(join(siteDir, "lobster.json"), "utf-8");
  return JSON.parse(raw) as LobsterConfig;
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
        pc.red(
          "Missing lobster.json — run `rsslobster onboard` first.",
        ),
      );
      process.exit(1);
    }

    const siteConfig = await readSiteConfig(siteDir);
    const callModel = createModelCaller(lobsterConfig.model);

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

    const token = lobsterConfig.telegram.token;
    const allowedUsers = lobsterConfig.telegram.allowedUsers
      ? new Set(lobsterConfig.telegram.allowedUsers)
      : undefined;

    console.log(pc.green("🦞 Lobster is live."));
    console.log(
      `   Site: ${pc.cyan(`https://${siteConfig.domain}`)}`,
    );
    console.log(
      `   Model: ${pc.cyan(lobsterConfig.model.model)}`,
    );
    console.log("   Listening for Telegram messages...\n");

    const controller = new AbortController();
    process.on("SIGINT", () => {
      console.log(pc.yellow("\nShutting down..."));
      controller.abort();
    });

    await pollForUpdates(
      token,
      async (message: InboundMessage) => {
        // Check allowed users
        if (allowedUsers && !allowedUsers.has(message.sender.id)) {
          return;
        }

        console.log(
          pc.dim(
            `[${new Date().toISOString()}] ${message.sender.name}: ${message.text.slice(0, 60)}`,
          ),
        );

        try {
          const result = await processMessage(message, {
            siteDir,
            callModel,
            deploy: true,
          });

          await sendReply(token, message.sender.id, result.reply);
          console.log(pc.green(`  → ${result.reply}`));
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Unknown error";
          console.error(pc.red(`  ✗ ${msg}`));
          try {
            await sendReply(token, message.sender.id, `Error: ${msg}`);
          } catch {
            // If we can't even send the error reply, just log it
          }
        }
      },
      controller.signal,
    );
  });
