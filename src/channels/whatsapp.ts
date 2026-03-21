import type { Channel, InboundMessage, MessageHandler } from "./types.js";

export interface WhatsappConfig {
  /** WhatsApp Business API phone number ID */
  phoneNumberId: string;
  /** Permanent access token from Meta Developer Portal */
  accessToken: string;
  /** Webhook verify token for initial handshake */
  verifyToken: string;
}

/**
 * WhatsApp channel — not yet implemented.
 *
 * When implemented, this will use the WhatsApp Business Cloud API to
 * receive messages via webhook and send replies via the Messages API.
 *
 * Requires a Meta Business account and WhatsApp Business API access.
 * The webhook endpoint needs to be publicly accessible (use a tunnel
 * during development).
 */
export function createWhatsappChannel(_config: WhatsappConfig): Channel {
  return {
    type: "whatsapp",

    poll(_handler: MessageHandler, _signal?: AbortSignal): Promise<void> {
      throw new Error(
        "WhatsApp channel is not yet implemented. " +
          "Contributions welcome — see CONTRIBUTING.md",
      );
    },

    reply(_chatId: string, _text: string): Promise<void> {
      throw new Error("WhatsApp channel is not yet implemented.");
    },

    downloadImages(_message: InboundMessage): Promise<void> {
      throw new Error("WhatsApp channel is not yet implemented.");
    },
  };
}
