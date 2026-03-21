import type { Channel, InboundMessage, MessageHandler } from "./types.js";

export interface DiscordConfig {
  botToken: string;
  channelId: string;
}

/**
 * Discord channel — not yet implemented.
 *
 * When implemented, this will use the Discord Gateway (WebSocket) to listen
 * for messages in a specific channel and the REST API to send replies.
 *
 * Discord's bot API is structurally similar to Telegram's: you create a bot
 * via the Developer Portal, invite it to a server, and listen for MESSAGE_CREATE events.
 */
export function createDiscordChannel(_config: DiscordConfig): Channel {
  return {
    type: "discord",

    poll(_handler: MessageHandler, _signal?: AbortSignal): Promise<void> {
      throw new Error(
        "Discord channel is not yet implemented. " +
          "Contributions welcome — see CONTRIBUTING.md",
      );
    },

    reply(_chatId: string, _text: string): Promise<void> {
      throw new Error("Discord channel is not yet implemented.");
    },

    downloadImages(_message: InboundMessage): Promise<void> {
      throw new Error("Discord channel is not yet implemented.");
    },
  };
}
