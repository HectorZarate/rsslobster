import type { Channel, InboundMessage, MessageHandler } from "./types.js";

export interface SlackConfig {
  botToken: string;
  appToken: string;
  channelId?: string;
}

/**
 * Slack channel — not yet implemented.
 *
 * When implemented, this will use Slack's Socket Mode (via the App-Level Token)
 * to receive messages in real-time without exposing a public URL, and the
 * Web API to send replies.
 *
 * Slack's Events API sends message payloads similar to Telegram updates.
 * The bot needs `chat:write`, `channels:history`, and `files:read` scopes.
 */
export function createSlackChannel(_config: SlackConfig): Channel {
  return {
    type: "slack",

    poll(_handler: MessageHandler, _signal?: AbortSignal): Promise<void> {
      throw new Error(
        "Slack channel is not yet implemented. " +
          "Contributions welcome — see CONTRIBUTING.md",
      );
    },

    reply(_chatId: string, _text: string): Promise<void> {
      throw new Error("Slack channel is not yet implemented.");
    },

    downloadImages(_message: InboundMessage): Promise<void> {
      throw new Error("Slack channel is not yet implemented.");
    },
  };
}
