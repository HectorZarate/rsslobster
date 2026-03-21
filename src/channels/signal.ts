import type { Channel, InboundMessage, MessageHandler } from "./types.js";

export interface SignalConfig {
  /** URL of the signal-cli REST API (e.g. http://localhost:8080) */
  apiUrl: string;
  /** Your Signal phone number in E.164 format (e.g. +1234567890) */
  phoneNumber: string;
}

/**
 * Signal channel — not yet implemented.
 *
 * When implemented, this will use signal-cli's REST API to receive and
 * send messages. Signal requires a linked device or registered number
 * via signal-cli (https://github.com/AsamK/signal-cli).
 *
 * Signal is end-to-end encrypted by default — the most private channel option.
 */
export function createSignalChannel(_config: SignalConfig): Channel {
  return {
    type: "signal",

    poll(_handler: MessageHandler, _signal?: AbortSignal): Promise<void> {
      throw new Error(
        "Signal channel is not yet implemented. " +
          "Contributions welcome — see CONTRIBUTING.md",
      );
    },

    reply(_chatId: string, _text: string): Promise<void> {
      throw new Error("Signal channel is not yet implemented.");
    },

    downloadImages(_message: InboundMessage): Promise<void> {
      throw new Error("Signal channel is not yet implemented.");
    },
  };
}
