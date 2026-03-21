import type { Channel, InboundMessage, MessageHandler } from "./types.js";

export interface IrcConfig {
  server: string;
  port?: number;
  nick: string;
  channel: string;
  /** NickServ password for authentication (optional) */
  password?: string;
  /** Use TLS. Default: true */
  tls?: boolean;
}

/**
 * IRC channel — not yet implemented.
 *
 * When implemented, this will connect to an IRC server, join a channel,
 * and listen for messages directed at the bot (via nick mention or DM).
 *
 * IRC has no native image support, so images would need to be sent as URLs.
 * The bot replies in-channel or via PRIVMSG.
 *
 * IRC is the OG chat protocol — minimal, text-first, and still widely used
 * by the kind of people who'd run their own static site.
 */
export function createIrcChannel(_config: IrcConfig): Channel {
  return {
    type: "irc",

    poll(_handler: MessageHandler, _signal?: AbortSignal): Promise<void> {
      throw new Error(
        "IRC channel is not yet implemented. " +
          "Contributions welcome — see CONTRIBUTING.md",
      );
    },

    reply(_chatId: string, _text: string): Promise<void> {
      throw new Error("IRC channel is not yet implemented.");
    },

    downloadImages(_message: InboundMessage): Promise<void> {
      // IRC doesn't support native image attachments.
      // Images would arrive as URLs in the message text.
      return Promise.resolve();
    },
  };
}
