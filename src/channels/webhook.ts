import { createServer, type Server } from "node:http";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sanitizeFilename, type Channel, type InboundMessage, type MessageHandler } from "./types.js";

const MAX_BODY_SIZE = 1_048_576; // 1 MB

export interface WebhookConfig {
  /** Port to listen on. Default: 3000 */
  port?: number;
  /** Shared secret for HMAC-SHA256 signature verification (optional but recommended) */
  secret?: string;
  /** Allowed source IPs (optional). If set, only these IPs can POST. */
  allowedIps?: string[];
}

/**
 * Expected POST body shape:
 * {
 *   "text": "Your message here",
 *   "images": [{ "url": "https://...", "filename": "photo.jpg" }],
 *   "sender": { "id": "automation-1", "name": "My Script" }
 * }
 */
interface WebhookPayload {
  text: string;
  images?: { url: string; filename?: string }[];
  sender?: { id: string; name: string };
}

/** Verify HMAC-SHA256 signature using constant-time comparison. */
export function verifySignature(
  body: string,
  secret: string,
  signature: string,
): boolean {
  const expected = createHmac("sha256", secret).update(body).digest();
  const signatureBuffer = Buffer.from(signature, "hex");
  if (expected.length !== signatureBuffer.length) return false;
  return timingSafeEqual(expected, signatureBuffer);
}

/** Parse and validate a webhook payload. */
export function parseWebhookPayload(
  body: string,
  requestId: string,
): InboundMessage | null {
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(body) as WebhookPayload;
  } catch {
    return null;
  }

  if (typeof payload.text !== "string" || payload.text.trim().length === 0) {
    return null;
  }

  const imageUrls = (payload.images ?? []).filter(
    (img) => typeof img.url === "string",
  );
  const pendingImages = imageUrls.map((img) => ({ fileId: img.url }));

  return {
    id: requestId,
    text: payload.text,
    images: [],
    mediaFiles: [],
    chatId: "webhook",
    pendingImages: pendingImages.length > 0 ? pendingImages : undefined,
    sender:
      payload.sender &&
      typeof payload.sender.id === "string" &&
      typeof payload.sender.name === "string"
        ? payload.sender
        : { id: "webhook", name: "Webhook" },
    receivedAt: new Date().toISOString(),
  };
}

/** Download an image from a URL. Returns local path. */
async function downloadWebhookImage(
  url: string,
  filename: string,
  destDir: string,
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download webhook image: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await mkdir(destDir, { recursive: true });
  const localPath = join(destDir, filename);
  await writeFile(localPath, buffer);
  return localPath;
}

/**
 * Start an HTTP server that accepts POST requests and processes them as messages.
 *
 * POST /publish — publish a message
 * GET /health — health check
 *
 * If a secret is configured, requests must include an X-Lobster-Signature header
 * with the HMAC-SHA256 hex digest of the raw request body.
 */
export function startWebhookServer(
  config: WebhookConfig,
  handler: MessageHandler,
  signal?: AbortSignal,
): Promise<void> {
  const port = config.port ?? 3000;
  const allowedIps = config.allowedIps ? new Set(config.allowedIps) : undefined;

  return new Promise<void>((resolve, reject) => {
    const server: Server = createServer(async (req, res) => {
      // Health check
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      // Only accept POST to /publish (or root /)
      if (req.method !== "POST" || (req.url !== "/publish" && req.url !== "/")) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found. POST to /publish" }));
        return;
      }

      // IP allowlist check
      if (allowedIps) {
        const clientIp = req.socket.remoteAddress ?? "";
        if (!allowedIps.has(clientIp)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Forbidden" }));
          return;
        }
      }

      // Read body with size limit
      const chunks: Buffer[] = [];
      let totalSize = 0;
      for await (const chunk of req) {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        totalSize += buf.length;
        if (totalSize > MAX_BODY_SIZE) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Payload too large" }));
          return;
        }
        chunks.push(buf);
      }
      const body = Buffer.concat(chunks).toString("utf-8");

      // Verify signature if secret is configured
      if (config.secret) {
        const signature = req.headers["x-lobster-signature"];
        if (
          typeof signature !== "string" ||
          !verifySignature(body, config.secret, signature)
        ) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid signature" }));
          return;
        }
      }

      // Parse payload
      const requestId = `webhook-${randomUUID()}`;
      const message = parseWebhookPayload(body, requestId);
      if (!message) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Invalid payload. Expected: { text: string, images?: [{ url }] }",
          }),
        );
        return;
      }

      // Process asynchronously, but respond once done
      try {
        await handler(message);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "published", id: message.id }));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Processing failed";
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: errorMsg }));
      }
    });

    signal?.addEventListener(
      "abort",
      () => {
        server.close(() => resolve());
      },
      { once: true },
    );

    server.on("error", reject);

    server.listen(port, () => {
      // Server is listening — this promise resolves when the server closes
    });
  });
}

// --- Channel interface implementation ---

/** Create a Webhook Channel from config. */
export function createWebhookChannel(config: WebhookConfig): Channel {
  return {
    type: "webhook",

    async poll(handler: MessageHandler, signal?: AbortSignal): Promise<void> {
      await startWebhookServer(config, handler, signal);
    },

    reply(_chatId: string, _text: string): Promise<void> {
      // Webhooks are fire-and-forget — the HTTP response IS the reply.
      return Promise.resolve();
    },

    async downloadImages(message: InboundMessage): Promise<void> {
      if (!message.pendingImages || message.pendingImages.length === 0) return;
      const downloadDir = join(tmpdir(), `rsslobster-dl-${message.id}`);
      for (const pending of message.pendingImages) {
        try {
          const url = new URL(pending.fileId);
          const rawName = url.pathname.split("/").pop() ?? `${message.id}.jpg`;
          const filename = sanitizeFilename(rawName);
          const localPath = await downloadWebhookImage(
            pending.fileId,
            filename,
            downloadDir,
          );
          message.images.push({ localPath, filename });
        } catch {
          // Skip failed downloads
        }
      }
    },
  };
}
