import { Command } from "commander";
import { readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import pc from "picocolors";
import { ask, createPrompt } from "./prompt.js";
import {
  readLobsterConfig,
  writeLobsterConfig,
  lobsterConfigExists,
} from "../config/lobster.js";
import type { LobsterConfig } from "../config/lobster.js";
import type { ModelProvider } from "../agent/model.js";

/** Show the status dashboard. */
async function showStatus(siteDir: string): Promise<void> {
  const config = await readLobsterConfig(siteDir);

  // Read site config for domain
  let domain = "unknown";
  let style = "unknown";
  try {
    const raw = await readFile(join(siteDir, "rsslobster.json"), "utf-8");
    const site = JSON.parse(raw) as { domain?: string; style?: { preset?: string } };
    domain = site.domain ?? "unknown";
    style = site.style?.preset ?? "unknown";
  } catch {
    // No site config
  }

  // Read reader stats
  let subs = 0;
  let unread = 0;
  try {
    const subsRaw = await readFile(
      join(siteDir, "reader", "subscriptions.json"),
      "utf-8",
    );
    const subsData = JSON.parse(subsRaw) as unknown[];
    subs = subsData.length;
  } catch {
    // No subscriptions
  }
  try {
    const unreadRaw = await readFile(
      join(siteDir, "reader", "unread-index.json"),
      "utf-8",
    );
    const unreadData = JSON.parse(unreadRaw) as unknown[];
    unread = Array.isArray(unreadData) ? unreadData.length : 0;
  } catch {
    // No unread index
  }

  console.log(pc.bold("\nRSS Lobster — Status\n"));

  // Site
  console.log(
    `  ${domain !== "unknown" ? "[OK]" : "[--]"} Site         ${domain} (${style})`,
  );

  // Telegram
  if (config.channel && config[config.channel]) {
    const token = config.channel === "telegram" && config.telegram?.token
      ? `(bot token: ...${config.telegram.token.slice(-4)})`
      : "";
    console.log(`  [OK] ${config.channel.charAt(0).toUpperCase() + config.channel.slice(1)}     configured ${token}`);
  } else {
    console.log(
      `  [--] Channel      not configured — run: ${pc.cyan("rsslobster enable telegram")}`,
    );
  }

  // Model
  if (config.model) {
    console.log(
      `  [OK] Model        ${config.model.model} (${config.model.provider ?? "openai"})`,
    );
  } else {
    console.log(
      `  [--] Model        not configured — run: ${pc.cyan("rsslobster enable model")}`,
    );
  }

  // Deploy
  let hasRepo = false;
  try {
    const siteRaw = await readFile(join(siteDir, "rsslobster.json"), "utf-8");
    const site = JSON.parse(siteRaw) as { repo?: string };
    hasRepo = !!site.repo;
  } catch {
    // ignore
  }
  if (hasRepo) {
    console.log("  [OK] Deploy       configured");
  } else {
    console.log(
      `  [--] Deploy       not configured — run: ${pc.cyan("rsslobster enable deploy")}`,
    );
  }

  // X (Twitter)
  if (config.twitter) {
    console.log(`  [OK] X            configured (key: ...${config.twitter.apiKey.slice(-4)})`);
  } else {
    console.log(
      `  [--] X            not configured — run: ${pc.cyan("rsslobster enable x")}`,
    );
  }

  // Reader
  if (subs > 0) {
    console.log(`  [OK] Reader       ${subs} subscription${subs !== 1 ? "s" : ""}, ${unread} unread`);
  } else {
    console.log(
      `  [--] Reader       no subscriptions — run: ${pc.cyan("rsslobster feed add <url>")}`,
    );
  }

  console.log();
}

/** Enable Telegram channel. */
async function enableTelegram(siteDir: string): Promise<void> {
  const config = await readLobsterConfig(siteDir);
  const rl = createPrompt();

  console.log(
    pc.dim(
      "\nTelegram bot setup — get a token from @BotFather on Telegram.",
    ),
  );

  const existingToken = config.telegram?.token ?? "";
  const tokenDefault = existingToken
    ? `...${existingToken.slice(-4)}`
    : undefined;
  let token = await ask(rl, "Telegram bot token", tokenDefault);
  // If user accepted the masked default, keep the original
  if (token === tokenDefault && existingToken) {
    token = existingToken;
  }

  const existingUsers = config.telegram?.allowedUsers?.join(", ") ?? "";
  const allowedUsersRaw = await ask(
    rl,
    "Your Telegram user ID (for security, optional)",
    existingUsers || undefined,
  );
  const allowedUsers = allowedUsersRaw
    ? allowedUsersRaw.split(",").map((s) => s.trim())
    : undefined;

  rl.close();

  await writeLobsterConfig(siteDir, {
    channel: "telegram",
    telegram: { token, allowedUsers },
  });

  console.log(
    pc.green("\n[OK] Telegram configured. Send a message to your bot to publish.\n"),
  );
}

/** Enable LLM model. */
async function enableModel(siteDir: string): Promise<void> {
  const config = await readLobsterConfig(siteDir);
  const rl = createPrompt();

  console.log(
    pc.dim(
      "\nModel setup — supports OpenAI-compatible APIs (Ollama, OpenAI) and Anthropic natively.",
    ),
  );

  const existingProvider = config.model?.provider ?? "openai";
  const providerInput = await ask(
    rl,
    "Provider (openai, anthropic)",
    existingProvider,
  );
  const provider: ModelProvider =
    providerInput === "anthropic" ? "anthropic" : "openai";

  const defaultBaseUrl =
    provider === "anthropic"
      ? "https://api.anthropic.com/v1"
      : "http://localhost:11434/v1";
  const defaultModel =
    provider === "anthropic" ? "claude-sonnet-4-20250514" : "llama3";
  const defaultKey = provider === "anthropic" ? "" : "ollama";

  const baseUrl = await ask(
    rl,
    "Model API base URL",
    config.model?.baseUrl ?? defaultBaseUrl,
  );
  const model = await ask(
    rl,
    "Model name",
    config.model?.model ?? defaultModel,
  );
  const apiKey = await ask(
    rl,
    "API key",
    config.model?.apiKey ?? defaultKey,
  );

  // Optional fallback
  const wantFallback = await ask(rl, "Add a fallback provider? (y/n)", "n");
  let fallback: LobsterConfig["model"] | undefined;
  if (wantFallback.toLowerCase() === "y") {
    const fbProvider = await ask(
      rl,
      "Fallback provider (openai, anthropic)",
      provider === "anthropic" ? "openai" : "anthropic",
    );
    const fbDefaultUrl =
      fbProvider === "anthropic"
        ? "https://api.anthropic.com/v1"
        : "http://localhost:11434/v1";
    const fbDefaultModel =
      fbProvider === "anthropic" ? "claude-sonnet-4-20250514" : "llama3";
    fallback = {
      provider: fbProvider as ModelProvider,
      baseUrl: await ask(rl, "Fallback API base URL", fbDefaultUrl),
      model: await ask(rl, "Fallback model name", fbDefaultModel),
      apiKey: await ask(rl, "Fallback API key"),
    };
  }

  rl.close();

  await writeLobsterConfig(siteDir, {
    model: {
      provider,
      baseUrl,
      model,
      apiKey,
      ...(fallback ? { fallback } : {}),
    },
  });

  console.log(
    pc.green("\n[OK] Model configured. The lobster will auto-classify your posts.\n"),
  );
}

/** Enable git deploy. */
async function enableDeploy(siteDir: string): Promise<void> {
  const rl = createPrompt();

  const repo = await ask(rl, "Git remote URL (e.g. git@github.com:user/site.git)");

  if (!repo) {
    console.error(pc.red("Git remote URL is required."));
    rl.close();
    process.exit(1);
  }

  // Check for .git directory
  let hasGit = false;
  try {
    await access(join(siteDir, ".git"));
    hasGit = true;
  } catch {
    // No .git
  }

  if (!hasGit) {
    const initGit = await ask(rl, "Initialize a git repo here? (y/N)", "N");
    if (initGit.toLowerCase() === "y") {
      execSync("git init", { cwd: siteDir, stdio: "pipe" });
      execSync(`git remote add origin ${repo}`, {
        cwd: siteDir,
        stdio: "pipe",
      });
      console.log(pc.dim("  Git repo initialized with remote."));
    }
  }

  rl.close();

  // Update site config (rsslobster.json) with repo
  const siteConfigPath = join(siteDir, "rsslobster.json");
  try {
    const raw = await readFile(siteConfigPath, "utf-8");
    const siteConfig = JSON.parse(raw) as Record<string, unknown>;
    siteConfig.repo = repo;
    const { writeFile: wf } = await import("node:fs/promises");
    await wf(siteConfigPath, JSON.stringify(siteConfig, null, 2) + "\n");
  } catch {
    console.error(
      pc.yellow(
        "Could not update rsslobster.json — run `rsslobster onboard` first.",
      ),
    );
  }

  console.log(
    pc.green("\n[OK] Deploy configured. Publishing will auto-deploy via git push.\n"),
  );
}

/** Enable X (Twitter) cross-posting. */
async function enableX(siteDir: string): Promise<void> {
  const config = await readLobsterConfig(siteDir);
  const rl = createPrompt();

  console.log(
    pc.dim(
      "\nX API setup — create an app at https://developer.x.com and generate OAuth 1.0a keys.",
    ),
  );

  const existing = config.twitter;

  const mask = (val?: string) =>
    val ? `...${val.slice(-4)}` : undefined;

  let apiKey = await ask(rl, "API Key", mask(existing?.apiKey));
  if (apiKey === mask(existing?.apiKey) && existing?.apiKey) {
    apiKey = existing.apiKey;
  }

  let apiKeySecret = await ask(rl, "API Key Secret", mask(existing?.apiKeySecret));
  if (apiKeySecret === mask(existing?.apiKeySecret) && existing?.apiKeySecret) {
    apiKeySecret = existing.apiKeySecret;
  }

  let accessToken = await ask(rl, "Access Token", mask(existing?.accessToken));
  if (accessToken === mask(existing?.accessToken) && existing?.accessToken) {
    accessToken = existing.accessToken;
  }

  let accessTokenSecret = await ask(rl, "Access Token Secret", mask(existing?.accessTokenSecret));
  if (accessTokenSecret === mask(existing?.accessTokenSecret) && existing?.accessTokenSecret) {
    accessTokenSecret = existing.accessTokenSecret;
  }

  rl.close();

  await writeLobsterConfig(siteDir, {
    twitter: { apiKey, apiKeySecret, accessToken, accessTokenSecret },
  });

  console.log(
    pc.green("\n[OK] X configured. Share posts with: rsslobster post-to-x <slug>\n"),
  );
}

/**
 * Non-interactive comments enablement — used by tests and scripted setup.
 * Writes commentsEndpoint to rsslobster.json and commentsAdminSecret to lobster.json.
 */
export async function enableCommentsNonInteractive(
  siteDir: string,
  endpoint: string,
  adminSecret: string,
): Promise<void> {
  // Update rsslobster.json
  const siteConfigPath = join(siteDir, "rsslobster.json");
  const raw = await readFile(siteConfigPath, "utf-8");
  const siteConfig = JSON.parse(raw) as Record<string, unknown>;
  siteConfig.commentsEndpoint = endpoint;
  const { writeFile: wf } = await import("node:fs/promises");
  await wf(siteConfigPath, JSON.stringify(siteConfig, null, 2));

  // Update lobster.json
  await writeLobsterConfig(siteDir, {
    commentsAdminSecret: adminSecret,
  } as Partial<LobsterConfig> & { commentsAdminSecret: string });
}

/** Interactive comments enablement. */
async function enableComments(siteDir: string): Promise<void> {
  const rl = createPrompt();

  console.log(
    pc.dim(
      "\nComments setup — configure the comments Worker endpoint.",
    ),
  );

  const endpoint = await ask(rl, "Comments Worker URL (e.g. https://comments.yourdomain.com)");
  if (!endpoint) {
    console.error(pc.red("Comments endpoint URL is required."));
    rl.close();
    process.exit(1);
  }

  const secret = await ask(rl, "Admin secret (for approving/rejecting comments)");
  if (!secret) {
    console.error(pc.red("Admin secret is required."));
    rl.close();
    process.exit(1);
  }

  rl.close();

  await enableCommentsNonInteractive(siteDir, endpoint, secret);

  console.log(
    pc.green("\n[OK] Comments configured. Comment forms will appear on post pages.\n"),
  );
}

export const enableCommand = new Command("enable")
  .description("Enable a capability (telegram, model, deploy, x)")
  .argument("[capability]", "What to enable: telegram, model, deploy, x")
  .option("--list", "Show status of all capabilities")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(
    async (
      capability: string | undefined,
      opts: { list?: boolean; siteDir: string },
    ) => {
      const siteDir = resolve(opts.siteDir);

      if (opts.list || !capability) {
        if (!(await lobsterConfigExists(siteDir))) {
          console.log(
            pc.yellow(
              "No rsslobster site found here. Run `rsslobster onboard` first.",
            ),
          );
          return;
        }
        await showStatus(siteDir);
        return;
      }

      switch (capability) {
        case "telegram":
          await enableTelegram(siteDir);
          break;
        case "model":
          await enableModel(siteDir);
          break;
        case "deploy":
          await enableDeploy(siteDir);
          break;
        case "comments":
          await enableComments(siteDir);
          break;
        case "x":
          await enableX(siteDir);
          break;
        default:
          console.error(
            pc.red(
              `Unknown capability: "${capability}". Use: telegram, model, deploy, comments, x`,
            ),
          );
          process.exit(1);
      }
    },
  );
