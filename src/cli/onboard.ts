import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import pc from "picocolors";
import { scaffoldSite } from "../generator/site.js";
import type { SiteConfig, StylePreset } from "../config/types.js";

const VALID_PRESETS = new Set(["minimal", "brutalist", "magazine", "terminal"]);

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

    // Telegram config
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
      telegram: { token: telegramToken, allowedUsers },
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
    console.log(`  Style: ${pc.cyan(style)}`);
    console.log(
      `\nRun ${pc.bold("rsslobster start")} to begin listening.\n`,
    );
  });
