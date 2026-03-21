import type { Channel, ChannelType } from "./types.js";
import {
  createTelegramChannel,
  type TelegramConfig,
} from "./telegram.js";
import { createDiscordChannel, type DiscordConfig } from "./discord.js";
import { createSlackChannel, type SlackConfig } from "./slack.js";
import { createWhatsappChannel, type WhatsappConfig } from "./whatsapp.js";
import { createSignalChannel, type SignalConfig } from "./signal.js";
import { createNostrChannel, type NostrConfig } from "./nostr.js";
import { createMatrixChannel, type MatrixConfig } from "./matrix.js";
import { createWebhookChannel, type WebhookConfig } from "./webhook.js";
import { createIrcChannel, type IrcConfig } from "./irc.js";

/** Union of all channel configs, keyed by channel type. */
export interface ChannelConfigs {
  telegram: TelegramConfig;
  discord: DiscordConfig;
  slack: SlackConfig;
  whatsapp: WhatsappConfig;
  signal: SignalConfig;
  nostr: NostrConfig;
  matrix: MatrixConfig;
  webhook: WebhookConfig;
  irc: IrcConfig;
}

/** All supported channel types. */
export const CHANNEL_TYPES: ChannelType[] = [
  "telegram",
  "discord",
  "slack",
  "whatsapp",
  "signal",
  "nostr",
  "matrix",
  "webhook",
  "irc",
];

/** Human-readable labels for each channel. */
export const CHANNEL_LABELS: Record<ChannelType, string> = {
  telegram: "Telegram",
  discord: "Discord",
  slack: "Slack",
  whatsapp: "WhatsApp",
  signal: "Signal",
  nostr: "Nostr",
  matrix: "Matrix",
  webhook: "Webhook",
  irc: "IRC",
};

/** Create a Channel instance from a type and its config. */
export function createChannel<T extends ChannelType>(
  type: T,
  config: ChannelConfigs[T],
): Channel {
  switch (type) {
    case "telegram":
      return createTelegramChannel(config as TelegramConfig);
    case "discord":
      return createDiscordChannel(config as DiscordConfig);
    case "slack":
      return createSlackChannel(config as SlackConfig);
    case "whatsapp":
      return createWhatsappChannel(config as WhatsappConfig);
    case "signal":
      return createSignalChannel(config as SignalConfig);
    case "nostr":
      return createNostrChannel(config as NostrConfig);
    case "matrix":
      return createMatrixChannel(config as MatrixConfig);
    case "webhook":
      return createWebhookChannel(config as WebhookConfig);
    case "irc":
      return createIrcChannel(config as IrcConfig);
    default:
      throw new Error(`Unknown channel type: ${type as string}`);
  }
}
