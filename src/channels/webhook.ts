import type { Channel, InboundMessage, MessageHandler } from "./types.js";

export interface WebhookConfig {
  /** Port to listen on. Default: 3000 */
  port?: number;
  /** Shared secret for HMAC signature verification (optional but recommended) */
  secret?: string;
}

/**
 * Webhook channel — not yet implemented.
 *
 * When implemented, this will start a lightweight HTTP server that accepts
 * POST requests with a JSON body matching the InboundMessage shape.
 *
 * This is the universal glue channel — it lets you publish from:
 * - curl / CLI scripts
 * - IFTTT / Zapier / n8n automations
 * - iOS Shortcuts
 * - Custom integrations
 *
 * Expected POST body:
 * {
 *   "text": "Your message here",
 *   "images": [{ "url": "https://..." }]  // optional
 * }
 *
 * If a secret is configured, requests must include an
 * X-Lobster-Signature header with an HMAC-SHA256 of the body.
 */
export function createWebhookChannel(_config: WebhookConfig): Channel {
  return {
    type: "webhook",

    poll(_handler: MessageHandler, _signal?: AbortSignal): Promise<void> {
      throw new Error(
        "Webhook channel is not yet implemented. " +
          "Contributions welcome — see CONTRIBUTING.md",
      );
    },

    reply(_chatId: string, _text: string): Promise<void> {
      // Webhooks are fire-and-forget — replies are no-ops.
      // The HTTP response to the original POST serves as the reply.
      return Promise.resolve();
    },

    downloadImages(_message: InboundMessage): Promise<void> {
      throw new Error("Webhook channel is not yet implemented.");
    },
  };
}
