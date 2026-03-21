import type { Channel, InboundMessage, MessageHandler } from "./types.js";

export interface NostrConfig {
  /** Hex or npub private key for signing events */
  privateKey: string;
  /** Relay URLs to connect to */
  relays: string[];
}

/**
 * Nostr channel — not yet implemented.
 *
 * When implemented, this will connect to Nostr relays via WebSocket,
 * subscribe to direct messages (NIP-04 encrypted DMs or NIP-17 gift-wrapped),
 * and publish reply events back.
 *
 * Nostr is a decentralized protocol where users own their identity via
 * keypairs — a natural fit for "unplatform yourself."
 */
export function createNostrChannel(_config: NostrConfig): Channel {
  return {
    type: "nostr",

    poll(_handler: MessageHandler, _signal?: AbortSignal): Promise<void> {
      throw new Error(
        "Nostr channel is not yet implemented. " +
          "Contributions welcome — see CONTRIBUTING.md",
      );
    },

    reply(_chatId: string, _text: string): Promise<void> {
      throw new Error("Nostr channel is not yet implemented.");
    },

    downloadImages(_message: InboundMessage): Promise<void> {
      // Nostr images are typically URLs in event content.
      return Promise.resolve();
    },
  };
}
