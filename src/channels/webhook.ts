import { createServer, type Server } from "node:http";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  sanitizeFilename,
  type Channel,
  type InboundMessage,
  type MessageHandler,
} from "./types.js";

const MAX_BODY_SIZE = 1_048_576; // 1 MB

export interface WebhookConfig {
  /** Port to listen on. Default: 3000 */
  port?: number;
  /** Shared secret for HMAC-SHA256 signature verification (optional but recommended) */
  secret?: string;
  /** Bearer tokens that are accepted for authentication (optional) */
  tokens?: string[];
  /** Allowed source IPs (optional). If set, only these IPs can POST. */
  allowedIps?: string[];
}

/**
 * Expected POST body shape:
 * {
 *   "text": "Your message here",
 *   "images": [{ "url": "https://...", "filename": "photo.jpg" }],
 *   "media": [{ "url": "https://...", "filename": "clip.mp4", "mimeType": "video/mp4" }],
 *   "sender": { "id": "automation-1", "name": "My Script" }
 * }
 */
interface WebhookPayload {
  text: string;
  images?: { url: string; filename?: string }[];
  media?: { url: string; filename?: string; mimeType?: string }[];
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

/** Check if a bearer token matches any configured token using constant-time comparison. */
export function verifyToken(
  token: string,
  allowedTokens: string[],
): boolean {
  for (const allowed of allowedTokens) {
    if (
      token.length === allowed.length &&
      timingSafeEqual(Buffer.from(token), Buffer.from(allowed))
    ) {
      return true;
    }
  }
  return false;
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

  // Extract image URLs
  const imageUrls = (payload.images ?? []).filter(
    (img) => typeof img.url === "string",
  );
  const pendingImages = imageUrls.map((img) => ({ fileId: img.url }));

  // Extract media URLs (video/audio)
  const mediaEntries = (payload.media ?? []).filter(
    (m) => typeof m.url === "string",
  );
  const pendingMedia = mediaEntries.map((m) => ({
    fileId: m.url,
    mimeType: typeof m.mimeType === "string" ? m.mimeType : undefined,
  }));

  return {
    id: requestId,
    text: payload.text,
    images: [],
    mediaFiles: [],
    chatId: "webhook",
    pendingImages: pendingImages.length > 0 ? pendingImages : undefined,
    pendingMedia: pendingMedia.length > 0 ? pendingMedia : undefined,
    sender:
      payload.sender &&
      typeof payload.sender.id === "string" &&
      typeof payload.sender.name === "string"
        ? payload.sender
        : { id: "webhook", name: "Webhook" },
    receivedAt: new Date().toISOString(),
  };
}

/** Download a file from a URL. Returns local path. */
async function downloadWebhookFile(
  url: string,
  filename: string,
  destDir: string,
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download webhook file: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await mkdir(destDir, { recursive: true });
  const localPath = join(destDir, filename);
  await writeFile(localPath, buffer);
  return localPath;
}

/** Guess MIME type from URL/filename extension. */
function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    flac: "audio/flac",
  };
  return mimeMap[ext ?? ""] ?? "application/octet-stream";
}

/**
 * Authenticate a request using configured auth methods.
 * Returns null if auth passes, or an error message if it fails.
 *
 * Auth is checked in order: HMAC signature, then bearer token.
 * If neither method is configured, all requests pass.
 */
export function authenticateRequest(
  config: WebhookConfig,
  body: string,
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const hasHmac = Boolean(config.secret);
  const hasTokens = Boolean(config.tokens && config.tokens.length > 0);

  // If no auth is configured, allow all
  if (!hasHmac && !hasTokens) return null;

  // Try HMAC signature
  if (hasHmac) {
    const signature = headers["x-lobster-signature"];
    if (
      typeof signature === "string" &&
      verifySignature(body, config.secret!, signature)
    ) {
      return null; // Valid HMAC
    }
  }

  // Try bearer token
  if (hasTokens) {
    const authHeader = headers["authorization"];
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (verifyToken(token, config.tokens!)) {
        return null; // Valid token
      }
    }
  }

  return "Unauthorized";
}

/**
 * Start an HTTP server that accepts POST requests and processes them as messages.
 *
 * POST /publish — publish a message
 * GET /health — health check
 *
 * Authentication (at least one must be configured for security):
 * - HMAC-SHA256: X-Lobster-Signature header with hex digest of body
 * - Bearer token: Authorization: Bearer <token> header
 */
export function startWebhookServer(
  config: WebhookConfig,
  handler: MessageHandler,
  signal?: AbortSignal,
): Promise<void> {
  const port = config.port ?? 3000;
  const allowedIps = config.allowedIps
    ? new Set(config.allowedIps)
    : undefined;

  return new Promise<void>((resolve, reject) => {
    const server: Server = createServer(async (req, res) => {
      // Health check
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      // Only accept POST to /publish (or root /)
      if (
        req.method !== "POST" ||
        (req.url !== "/publish" && req.url !== "/")
      ) {
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

      // Authenticate
      const authError = authenticateRequest(
        config,
        body,
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (authError) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: authError }));
        return;
      }

      // Parse payload
      const requestId = `webhook-${randomUUID()}`;
      const message = parseWebhookPayload(body, requestId);
      if (!message) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error:
              "Invalid payload. Expected: { text: string, images?: [{ url }], media?: [{ url, mimeType? }] }",
          }),
        );
        return;
      }

      // Process and respond with result
      try {
        await handler(message);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "published", id: message.id }));
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Processing failed";
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
      // Webhooks are request-response — the HTTP response IS the reply.
      // The handler result is returned directly in the HTTP 200 response body.
      return Promise.resolve();
    },

    async downloadAttachments(message: InboundMessage): Promise<void> {
      const downloadDir = join(tmpdir(), `rsslobster-dl-${message.id}`);

      // Download pending images
      if (message.pendingImages && message.pendingImages.length > 0) {
        for (const pending of message.pendingImages) {
          try {
            const url = new URL(pending.fileId);
            const rawName =
              url.pathname.split("/").pop() ?? `${message.id}.jpg`;
            const filename = sanitizeFilename(rawName);
            const localPath = await downloadWebhookFile(
              pending.fileId,
              filename,
              downloadDir,
            );
            message.images.push({ localPath, filename });
          } catch {
            // Skip failed downloads
          }
        }
      }

      // Download pending media (video/audio)
      if (message.pendingMedia && message.pendingMedia.length > 0) {
        for (const pending of message.pendingMedia) {
          try {
            const url = new URL(pending.fileId);
            const rawName =
              url.pathname.split("/").pop() ?? `${message.id}.mp4`;
            const filename = sanitizeFilename(rawName);
            const mimeType = pending.mimeType ?? guessMimeType(filename);
            const localPath = await downloadWebhookFile(
              pending.fileId,
              filename,
              downloadDir,
            );
            message.mediaFiles.push({ localPath, mimeType, filename });
          } catch {
            // Skip failed downloads
          }
        }
      }
    },
  };
}
