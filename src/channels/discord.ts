import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sanitizeFilename, type Channel, type InboundMessage, type MessageHandler } from "./types.js";

// --- Discord API types (minimal subset) ---

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  bot?: boolean;
}

interface DiscordAttachment {
  id: string;
  filename: string;
  content_type?: string;
  url: string;
  size: number;
}

interface DiscordMessage {
  id: string;
  channel_id: string;
  author: DiscordUser;
  content: string;
  timestamp: string;
  attachments: DiscordAttachment[];
}

interface GatewayPayload {
  op: number;
  d: unknown;
  s?: number;
  t?: string;
}

interface HelloEvent {
  heartbeat_interval: number;
}

// --- Discord Gateway opcodes ---

const OP_DISPATCH = 0;
const OP_HEARTBEAT = 1;
const OP_IDENTIFY = 2;
const OP_HEARTBEAT_ACK = 11;
const OP_HELLO = 10;

// --- Discord Gateway intents ---

const INTENT_GUILD_MESSAGES = 1 << 9;
const INTENT_DIRECT_MESSAGES = 1 << 12;
const INTENT_MESSAGE_CONTENT = 1 << 15;

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
const API_BASE = "https://discord.com/api/v10";

// --- Public API ---

export interface DiscordConfig {
  botToken: string;
  /** Channel ID to listen in (DM channel or server text channel) */
  channelId: string;
  /** Allowed user IDs. If set, only these users' messages are processed. */
  allowedUsers?: string[];
}

/** Download a Discord attachment by URL. Returns local path. */
export async function downloadDiscordAttachment(
  url: string,
  filename: string,
  destDir: string,
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download Discord attachment: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await mkdir(destDir, { recursive: true });
  const localPath = join(destDir, filename);
  await writeFile(localPath, buffer);
  return localPath;
}

/** Send a message to a Discord channel. */
export async function sendDiscordMessage(
  botToken: string,
  channelId: string,
  text: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: text }),
  });
  if (!res.ok) {
    throw new Error(`Discord sendMessage failed: ${res.status}`);
  }
}

/** Check if an attachment is an image based on content_type. */
function isImageAttachment(attachment: DiscordAttachment): boolean {
  return attachment.content_type?.startsWith("image/") ?? false;
}

/** Check if an attachment is audio or video. */
function isMediaAttachment(attachment: DiscordAttachment): boolean {
  const ct = attachment.content_type ?? "";
  return ct.startsWith("video/") || ct.startsWith("audio/");
}

/** Parse a Discord MESSAGE_CREATE event into our InboundMessage. */
export function parseDiscordMessage(
  msg: DiscordMessage,
  targetChannelId: string,
): InboundMessage | null {
  // Only process messages from the target channel
  if (msg.channel_id !== targetChannelId) return null;
  // Ignore bot messages
  if (msg.author.bot) return null;

  const imageAttachments = msg.attachments.filter(isImageAttachment);
  const pendingImages = imageAttachments.map((a) => ({ fileId: a.url }));

  const mediaAttachments = msg.attachments.filter(isMediaAttachment);
  const pendingMedia = mediaAttachments.map((a) => ({
    fileId: a.url,
    mimeType: a.content_type,
  }));

  return {
    id: msg.id,
    text: msg.content,
    images: [],
    mediaFiles: [],
    chatId: msg.channel_id,
    pendingImages: pendingImages.length > 0 ? pendingImages : undefined,
    pendingMedia: pendingMedia.length > 0 ? pendingMedia : undefined,
    sender: {
      id: msg.author.id,
      name: msg.author.username,
    },
    receivedAt: msg.timestamp,
  };
}

/**
 * Connect to the Discord Gateway via WebSocket and listen for messages.
 * Uses the Gateway Intents for GUILD_MESSAGES, DIRECT_MESSAGES, and MESSAGE_CONTENT.
 */
export async function pollDiscordGateway(
  config: DiscordConfig,
  handler: MessageHandler,
  signal?: AbortSignal,
): Promise<void> {
  const allowedUsers = config.allowedUsers
    ? new Set(config.allowedUsers)
    : undefined;

  let consecutiveFailures = 0;

  while (!signal?.aborted) {
    try {
      await connectAndListen(config, allowedUsers, handler, signal);
      consecutiveFailures = 0;
    } catch {
      if (signal?.aborted) break;
      consecutiveFailures++;
      const delay = Math.min(5000 * Math.pow(2, consecutiveFailures - 1), 300_000) + Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function connectAndListen(
  config: DiscordConfig,
  allowedUsers: Set<string> | undefined,
  handler: MessageHandler,
  signal?: AbortSignal,
): Promise<void> {
  // Node.js 22+ has native WebSocket support
  const ws = new WebSocket(GATEWAY_URL);
  let sequenceNumber: number | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let lastAckReceived = true;

  const cleanup = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  };

  signal?.addEventListener("abort", cleanup, { once: true });

  return new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => {
      // Connection established, wait for HELLO
    });

    ws.addEventListener("message", async (event) => {
      let payload: GatewayPayload;
      try {
        payload = JSON.parse(String(event.data)) as GatewayPayload;
      } catch {
        return; // Skip malformed frames
      }

      if (payload.s !== undefined && payload.s !== null) {
        sequenceNumber = payload.s;
      }

      switch (payload.op) {
        case OP_HELLO: {
          const hello = payload.d as HelloEvent;

          // First heartbeat with jitter per Discord spec
          const jitter = Math.random();
          setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) return;
            ws.send(JSON.stringify({ op: OP_HEARTBEAT, d: sequenceNumber }));
          }, hello.heartbeat_interval * jitter);

          // Subsequent heartbeats on fixed interval
          heartbeatTimer = setInterval(() => {
            if (!lastAckReceived) {
              // Zombie connection — no ACK received, force reconnect
              ws.close(4000, "Zombie connection - no heartbeat ACK");
              return;
            }
            lastAckReceived = false;
            ws.send(JSON.stringify({ op: OP_HEARTBEAT, d: sequenceNumber }));
          }, hello.heartbeat_interval);

          // Send IDENTIFY
          ws.send(
            JSON.stringify({
              op: OP_IDENTIFY,
              d: {
                token: config.botToken,
                intents: INTENT_GUILD_MESSAGES | INTENT_DIRECT_MESSAGES | INTENT_MESSAGE_CONTENT,
                properties: {
                  os: "linux",
                  browser: "rsslobster",
                  device: "rsslobster",
                },
              },
            }),
          );
          break;
        }

        case OP_HEARTBEAT_ACK:
          lastAckReceived = true;
          break;

        case OP_HEARTBEAT:
          // Server requested immediate heartbeat
          ws.send(JSON.stringify({ op: OP_HEARTBEAT, d: sequenceNumber }));
          break;

        case OP_DISPATCH: {
          if (payload.t === "MESSAGE_CREATE") {
            const msg = payload.d as DiscordMessage;
            const parsed = parseDiscordMessage(msg, config.channelId);
            if (parsed) {
              if (allowedUsers && !allowedUsers.has(parsed.sender.id)) break;
              try {
                await handler(parsed);
              } catch {
                // Handler errors don't crash the gateway connection
              }
            }
          }
          break;
        }
      }
    });

    ws.addEventListener("close", () => {
      cleanup();
      if (signal?.aborted) {
        resolve();
      } else {
        reject(new Error("Discord WebSocket closed unexpectedly"));
      }
    });

    ws.addEventListener("error", (err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error("Discord WebSocket error"));
    });
  });
}

// --- Channel interface implementation ---

/** Create a Discord Channel from config. */
export function createDiscordChannel(config: DiscordConfig): Channel {
  return {
    type: "discord",

    async poll(handler: MessageHandler, signal?: AbortSignal): Promise<void> {
      await pollDiscordGateway(config, handler, signal);
    },

    async reply(chatId: string, text: string): Promise<void> {
      await sendDiscordMessage(config.botToken, chatId, text);
    },

    async downloadAttachments(message: InboundMessage): Promise<void> {
      const downloadDir = join(tmpdir(), `rsslobster-dl-${message.id}`);

      if (message.pendingImages && message.pendingImages.length > 0) {
        for (const pending of message.pendingImages) {
          try {
            const url = new URL(pending.fileId);
            const rawName = url.pathname.split("/").pop() ?? `${message.id}.jpg`;
            const filename = sanitizeFilename(rawName);
            const localPath = await downloadDiscordAttachment(
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

      if (message.pendingMedia && message.pendingMedia.length > 0) {
        for (const pending of message.pendingMedia) {
          try {
            const url = new URL(pending.fileId);
            const rawName = url.pathname.split("/").pop() ?? `${message.id}.mp4`;
            const filename = sanitizeFilename(rawName);
            const localPath = await downloadDiscordAttachment(
              pending.fileId,
              filename,
              downloadDir,
            );
            message.mediaFiles.push({
              localPath,
              filename,
              mimeType: pending.mimeType ?? "application/octet-stream",
            });
          } catch {
            // Skip failed downloads
          }
        }
      }
    },
  };
}
