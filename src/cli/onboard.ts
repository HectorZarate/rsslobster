import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import pc from "picocolors";
import { scaffoldSite } from "../generator/site.js";
import type { SiteConfig, StylePreset } from "../config/types.js";
import { CHANNEL_TYPES, CHANNEL_LABELS } from "../channels/channel.js";
import type { ChannelType } from "../channels/types.js";

const VALID_PRESETS = new Set(["minimal", "brutalist", "magazine", "terminal"]);
const VALID_CHANNELS = new Set(CHANNEL_TYPES);

async function ask(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultValue?: string,
): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = await rl.question(`${question}${suffix}: `);
  return answer.trim() || defaultValue || "";
}

export const onboardCommand = new Command("onboard")
  .description("Set up a new rsslobster site interactively")
  .argument("[site-dir]", "Path to create site in", ".")
  .action(async (siteDirArg: string) => {
    const siteDir = resolve(siteDirArg);
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(pc.bold("\n🦞 RSS Lobster — Setup\n"));

    // Site config
    const domain = await ask(rl, "Domain (e.g. mysite.com)");
    if (!domain) {
      console.error(pc.red("Domain is required."));
      rl.close();
      process.exit(1);
    }

    const title = await ask(rl, "Site title", domain);
    const author = await ask(rl, "Your name", "");
    const description = await ask(
      rl,
      "Description",
      "A personal site",
    );

    let style: StylePreset = "minimal";
    const styleInput = await ask(
      rl,
      "Style (minimal, brutalist, magazine, terminal)",
      "minimal",
    );
    if (VALID_PRESETS.has(styleInput)) {
      style = styleInput as StylePreset;
    }

    // Channel selection
    const channelList = CHANNEL_TYPES.map((t) => CHANNEL_LABELS[t]).join(", ");
    console.log(
      pc.dim(`\nSupported channels: ${channelList}`),
    );
    console.log(
      pc.dim(
        "Telegram is fully implemented. Others are coming soon — contributions welcome.",
      ),
    );
    const channelInput = await ask(
      rl,
      "Channel (telegram, discord, slack, whatsapp, signal, nostr, matrix, webhook, irc)",
      "telegram",
    );
    const channel: ChannelType = VALID_CHANNELS.has(channelInput as ChannelType)
      ? (channelInput as ChannelType)
      : "telegram";

    // Channel-specific config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channelConfig: Record<string, any> = {};

    if (channel === "telegram") {
      console.log(
        pc.dim(
          "\nTelegram bot setup — get a token from @BotFather on Telegram.",
        ),
      );
      const telegramToken = await ask(rl, "Telegram bot token");
      const allowedUsersRaw = await ask(
        rl,
        "Your Telegram user ID (for security, optional)",
        "",
      );
      const allowedUsers = allowedUsersRaw
        ? allowedUsersRaw.split(",").map((s) => s.trim())
        : undefined;
      channelConfig = { token: telegramToken, allowedUsers };
    } else if (channel === "discord") {
      console.log(pc.dim("\nDiscord bot setup — create a bot at discord.com/developers."));
      channelConfig = {
        botToken: await ask(rl, "Discord bot token"),
        channelId: await ask(rl, "Discord channel ID"),
      };
    } else if (channel === "slack") {
      console.log(pc.dim("\nSlack app setup — create an app at api.slack.com/apps."));
      channelConfig = {
        botToken: await ask(rl, "Slack bot token (xoxb-...)"),
        appToken: await ask(rl, "Slack app token (xapp-...)"),
      };
    } else if (channel === "whatsapp") {
      console.log(pc.dim("\nWhatsApp setup — requires a Meta Business account and WhatsApp Business API."));
      channelConfig = {
        phoneNumberId: await ask(rl, "Phone number ID"),
        accessToken: await ask(rl, "Access token"),
        verifyToken: await ask(rl, "Webhook verify token"),
      };
    } else if (channel === "signal") {
      console.log(pc.dim("\nSignal setup — requires signal-cli REST API running locally."));
      channelConfig = {
        apiUrl: await ask(rl, "signal-cli REST API URL", "http://localhost:8080"),
        phoneNumber: await ask(rl, "Your phone number (E.164 format, e.g. +1234567890)"),
      };
    } else if (channel === "nostr") {
      console.log(pc.dim("\nNostr setup — you'll need a private key and relay URLs."));
      channelConfig = {
        privateKey: await ask(rl, "Private key (hex or nsec)"),
        relays: (await ask(rl, "Relay URLs (comma-separated)", "wss://relay.damus.io"))
          .split(",")
          .map((s) => s.trim()),
      };
    } else if (channel === "matrix") {
      console.log(pc.dim("\nMatrix setup — you'll need a homeserver URL, access token, and room ID."));
      channelConfig = {
        homeserverUrl: await ask(rl, "Homeserver URL (e.g. https://matrix.org)"),
        accessToken: await ask(rl, "Access token"),
        roomId: await ask(rl, "Room ID (e.g. !abc123:matrix.org)"),
      };
    } else if (channel === "webhook") {
      channelConfig = {
        port: Number(await ask(rl, "Port", "3000")) || 3000,
        secret: await ask(rl, "Shared secret for HMAC verification (optional)", "") || undefined,
      };
    } else if (channel === "irc") {
      console.log(pc.dim("\nIRC setup — connect to a server and channel."));
      channelConfig = {
        server: await ask(rl, "IRC server (e.g. irc.libera.chat)"),
        port: Number(await ask(rl, "Port", "6697")) || 6697,
        nick: await ask(rl, "Bot nick"),
        channel: await ask(rl, "Channel (e.g. #mysite)"),
        password: await ask(rl, "NickServ password (optional)", "") || undefined,
        tls: true,
      };
    }

    // Model config
    console.log(
      pc.dim(
        "\nModel setup — any OpenAI-compatible API works (Ollama, OpenAI, etc.).",
      ),
    );
    const modelBaseUrl = await ask(
      rl,
      "Model API base URL",
      "http://localhost:11434/v1",
    );
    const modelName = await ask(rl, "Model name", "llama3");
    const modelApiKey = await ask(rl, "API key", "ollama");

    // Git repo
    const repo = await ask(
      rl,
      "Git remote URL for deploy (optional)",
      "",
    );

    rl.close();

    // Build configs
    const siteConfig: SiteConfig = {
      domain,
      title,
      description,
      author,
      language: "en",
      style: { preset: style },
      repo,
    };

    const lobsterConfig = {
      channel,
      [channel]: channelConfig,
      model: {
        baseUrl: modelBaseUrl,
        model: modelName,
        apiKey: modelApiKey,
      },
    };

    // Write everything
    await scaffoldSite(siteDir, siteConfig);
    await writeFile(
      join(siteDir, "lobster.json"),
      JSON.stringify(lobsterConfig, null, 2),
    );

    // Add lobster.json to .gitignore (contains secrets)
    const gitignorePath = join(siteDir, ".gitignore");
    try {
      await writeFile(gitignorePath, "lobster.json\nnode_modules/\n");
    } catch {
      // not critical
    }

    console.log(pc.green("\n✓ Site scaffolded."));
    console.log(`  Directory: ${pc.cyan(siteDir)}`);
    console.log(`  Domain: ${pc.cyan(`https://${domain}`)}`);
    console.log(`  Channel: ${pc.cyan(CHANNEL_LABELS[channel])}`);
    console.log(`  Style: ${pc.cyan(style)}`);
    console.log(
      `\nRun ${pc.bold("rsslobster start")} to begin listening.\n`,
    );
  });
