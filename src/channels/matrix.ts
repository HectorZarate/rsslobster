import type { Channel, InboundMessage, MessageHandler } from "./types.js";

export interface MatrixConfig {
  homeserverUrl: string;
  accessToken: string;
  roomId: string;
}

/**
 * Matrix channel — not yet implemented.
 *
 * When implemented, this will use the Matrix Client-Server API to sync messages
 * from a specific room and send replies via the same API.
 *
 * Matrix is a decentralized, open protocol for real-time communication.
 * It's a good fit for privacy-conscious users who want to self-host everything.
 */
export function createMatrixChannel(_config: MatrixConfig): Channel {
  return {
    type: "matrix",

    poll(_handler: MessageHandler, _signal?: AbortSignal): Promise<void> {
      throw new Error(
        "Matrix channel is not yet implemented. " +
          "Contributions welcome — see CONTRIBUTING.md",
      );
    },

    reply(_chatId: string, _text: string): Promise<void> {
      throw new Error("Matrix channel is not yet implemented.");
    },

    downloadImages(_message: InboundMessage): Promise<void> {
      throw new Error("Matrix channel is not yet implemented.");
    },
  };
}
