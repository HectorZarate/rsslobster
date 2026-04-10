import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { ModelConfig, ModelProvider } from "../agent/model.js";
import type { ChannelType } from "../channels/types.js";
import type { HooksConfig } from "../hooks/hooks.js";
import type { ReaderConfig } from "./types.js";
import { CHANNEL_TYPES } from "../channels/channel.js";

const LOBSTER_FILE = "lobster.json";

/** Runtime lobster config — all fields except reader are optional for progressive setup. */
export interface LobsterConfig {
  /** Which channel to use */
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
  /** LLM config — optional. Without it, publish requires explicit --type. */
  model?: ModelConfig;
  /** X (Twitter) API credentials for cross-posting */
  twitter?: {
    apiKey: string;
    apiKeySecret: string;
    accessToken: string;
    accessTokenSecret: string;
  };
  /** Lifecycle hooks */
  hooks?: HooksConfig;
  /** RSS reader / feed polling config */
  reader?: ReaderConfig;
}

export interface ConfigValidationError {
  field: string;
  message: string;
}

/** Read lobster.json. Returns empty config if file doesn't exist. */
export async function readLobsterConfig(
  siteDir: string,
): Promise<LobsterConfig> {
  try {
    const raw = await readFile(join(siteDir, LOBSTER_FILE), "utf-8");
    return JSON.parse(raw) as LobsterConfig;
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return {};
    }
    throw err;
  }
}

/** Write lobster.json atomically (temp file + rename). Merges with existing config. */
export async function writeLobsterConfig(
  siteDir: string,
  updates: Partial<LobsterConfig>,
): Promise<void> {
  const existing = await readLobsterConfig(siteDir);
  const merged = { ...existing, ...updates };
  const content = JSON.stringify(merged, null, 2) + "\n";
  const tmpFile = join(
    siteDir,
    `.lobster-${randomBytes(4).toString("hex")}.tmp`,
  );
  await writeFile(tmpFile, content);
  await rename(tmpFile, join(siteDir, LOBSTER_FILE));
}

/** Check if lobster.json exists in the given directory. */
export async function lobsterConfigExists(siteDir: string): Promise<boolean> {
  try {
    await readFile(join(siteDir, LOBSTER_FILE), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate lobster.json fields that are present.
 * Returns an empty array if everything is valid.
 * Only validates fields that exist — missing optional fields are fine.
 */
export function validateLobsterConfig(
  config: LobsterConfig,
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  if (config.channel !== undefined) {
    if (!CHANNEL_TYPES.includes(config.channel)) {
      errors.push({
        field: "channel",
        message: `Invalid channel type: "${config.channel}". Must be one of: ${CHANNEL_TYPES.join(", ")}`,
      });
    }
  }

  if (config.model !== undefined) {
    const m = config.model;
    if (!m.baseUrl) {
      errors.push({ field: "model.baseUrl", message: "model.baseUrl is empty" });
    }
    if (!m.model) {
      errors.push({ field: "model.model", message: "model.model is empty" });
    }
    if (!m.apiKey) {
      errors.push({ field: "model.apiKey", message: "model.apiKey is empty" });
    }
    if (m.provider !== undefined) {
      const validProviders: ModelProvider[] = ["openai", "anthropic"];
      if (!validProviders.includes(m.provider)) {
        errors.push({
          field: "model.provider",
          message: `Invalid provider: "${m.provider}". Must be "openai" or "anthropic"`,
        });
      }
    }
  }

  // Validate channel-specific config if channel is set
  if (config.channel === "telegram" && config.telegram) {
    if (!config.telegram.token) {
      errors.push({
        field: "telegram.token",
        message: "telegram.token is empty",
      });
    }
  }

  return errors;
}
