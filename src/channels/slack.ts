import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sanitizeFilename, type Channel, type InboundMessage, type MessageHandler } from "./types.js";

// --- Slack API types (minimal subset) ---

interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  url_private_download: string;
}

interface SlackMessageEvent {
  type: "message";
  subtype?: string;
  user: string;
  text: string;
  ts: string;
  channel: string;
  files?: SlackFile[];
}

interface SlackHelloPayload {
  type: "hello";
}

interface SlackDisconnectPayload {
  type: "disconnect";
  reason: string;
}

interface SlackEnvelope {
  envelope_id: string;
  type: "events_api";
  payload: {
    event: SlackMessageEvent;
  };
}

type SlackSocketMessage = SlackHelloPayload | SlackDisconnectPayload | SlackEnvelope;

// --- Public API ---

export interface SlackConfig {
  /** Bot User OAuth Token (xoxb-...) — needs chat:write, channels:history, files:read */
  botToken: string;
  /** App-Level Token (xapp-...) — needed for Socket Mode */
  appToken: string;
  /** Channel ID to listen in. If not set, listens to all DMs. */
  channelId?: string;
  /** Allowed user IDs. If set, only these users' messages are processed. */
  allowedUsers?: string[];
}

const API_BASE = "https://slack.com/api";

/** Fetch a Socket Mode WebSocket URL from Slack. */
async function getSocketModeUrl(appToken: string): Promise<string> {
  const res = await fetch(`${API_BASE}/apps.connections.open`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
  if (!data.ok || !data.url) {
    throw new Error(`Failed to open Socket Mode connection: ${data.error ?? "unknown"}`);
  }
  return data.url;
}

/** Look up a Slack user's display name. */
async function getUserName(botToken: string, userId: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/users.info?user=${userId}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const data = (await res.json()) as {
      ok: boolean;
      user?: { real_name?: string; name?: string };
    };
    if (data.ok && data.user) {
      return data.user.real_name ?? data.user.name ?? userId;
    }
  } catch {
    // Fall through to default
  }
  return userId;
}

/** Download a Slack file using the bot token for auth. Returns local path. */
export async function downloadSlackFile(
  botToken: string,
  url: string,
  filename: string,
  destDir: string,
): Promise<string> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${botToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to download Slack file: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await mkdir(destDir, { recursive: true });
  const localPath = join(destDir, filename);
  await writeFile(localPath, buffer);
  return localPath;
}

/** Send a message to a Slack channel. */
export async function sendSlackMessage(
  botToken: string,
  channelId: string,
  text: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId, text }),
  });
  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!data.ok) {
    throw new Error(`Slack postMessage failed: ${data.error ?? "unknown"}`);
  }
}

/** Check if a Slack file is an image. */
function isImageFile(file: SlackFile): boolean {
  return file.mimetype.startsWith("image/");
}

/** Check if a Slack file is audio or video. */
function isMediaFile(file: SlackFile): boolean {
  return file.mimetype.startsWith("video/") || file.mimetype.startsWith("audio/");
}

/** Parse a Slack message event into our InboundMessage. */
export function parseSlackMessage(
  event: SlackMessageEvent,
  targetChannelId?: string,
): InboundMessage | null {
  // Ignore subtypes (edits, joins, etc.) — only process plain messages
  if (event.subtype) return null;

  // Filter by channel if configured
  if (targetChannelId && event.channel !== targetChannelId) return null;

  const imageFiles = (event.files ?? []).filter(isImageFile);
  const pendingImages = imageFiles.map((f) => ({ fileId: f.url_private_download }));

  const mediaFiles = (event.files ?? []).filter(isMediaFile);
  const pendingMedia = mediaFiles.map((f) => ({
    fileId: f.url_private_download,
    mimeType: f.mimetype,
  }));

  return {
    id: event.ts,
    text: event.text,
    images: [],
    mediaFiles: [],
    chatId: event.channel,
    pendingImages: pendingImages.length > 0 ? pendingImages : undefined,
    pendingMedia: pendingMedia.length > 0 ? pendingMedia : undefined,
    sender: {
      id: event.user,
      name: event.user,
    },
    receivedAt: new Date(Number(event.ts) * 1000).toISOString(),
  };
}

/**
 * Connect to Slack via Socket Mode and listen for messages.
 *
 * Socket Mode uses a WebSocket connection so no public URL is needed.
 * The app must have Socket Mode enabled in the Slack App dashboard.
 */
export async function pollSlackSocketMode(
  config: SlackConfig,
  handler: MessageHandler,
  signal?: AbortSignal,
): Promise<void> {
  const allowedUsers = config.allowedUsers
    ? new Set(config.allowedUsers)
    : undefined;

  let consecutiveFailures = 0;

  while (!signal?.aborted) {
    try {
      const wsUrl = await getSocketModeUrl(config.appToken);
      await connectAndListen(wsUrl, config, allowedUsers, handler, signal);
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
  wsUrl: string,
  config: SlackConfig,
  allowedUsers: Set<string> | undefined,
  handler: MessageHandler,
  signal?: AbortSignal,
): Promise<void> {
  const ws = new WebSocket(wsUrl);

  const cleanup = () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  };

  signal?.addEventListener("abort", cleanup, { once: true });

  return new Promise<void>((resolve, reject) => {
    ws.addEventListener("message", async (event) => {
      let data: SlackSocketMessage;
      try {
        data = JSON.parse(String(event.data)) as SlackSocketMessage;
      } catch {
        return;
      }

      if (data.type === "hello") {
        // Connection established
        return;
      }

      if (data.type === "disconnect") {
        cleanup();
        // Slack is asking us to reconnect — resolve to trigger reconnect loop
        resolve();
        return;
      }

      // Acknowledge the envelope immediately (Slack requires this within 3s)
      const envelope = data as SlackEnvelope;
      if (envelope.envelope_id) {
        ws.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
      }

      if (envelope.type === "events_api" && envelope.payload?.event?.type === "message") {
        const msgEvent = envelope.payload.event;
        const parsed = parseSlackMessage(msgEvent, config.channelId);
        if (parsed) {
          if (allowedUsers && !allowedUsers.has(parsed.sender.id)) return;

          // Resolve user name
          try {
            parsed.sender.name = await getUserName(config.botToken, parsed.sender.id);
          } catch {
            // Keep user ID as name
          }

          try {
            await handler(parsed);
          } catch {
            // Handler errors don't crash the connection
          }
        }
      }
    });

    ws.addEventListener("close", () => {
      cleanup();
      if (signal?.aborted) {
        resolve();
      } else {
        reject(new Error("Slack WebSocket closed unexpectedly"));
      }
    });

    ws.addEventListener("error", (err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error("Slack WebSocket error"));
    });
  });
}

// --- Channel interface implementation ---

/** Create a Slack Channel from config. */
export function createSlackChannel(config: SlackConfig): Channel {
  return {
    type: "slack",

    async poll(handler: MessageHandler, signal?: AbortSignal): Promise<void> {
      await pollSlackSocketMode(config, handler, signal);
    },

    async reply(chatId: string, text: string): Promise<void> {
      await sendSlackMessage(config.botToken, chatId, text);
    },

    async downloadAttachments(message: InboundMessage): Promise<void> {
      const downloadDir = join(tmpdir(), `rsslobster-dl-${message.id}`);

      if (message.pendingImages && message.pendingImages.length > 0) {
        for (const pending of message.pendingImages) {
          try {
            const url = new URL(pending.fileId);
            const rawName = url.pathname.split("/").pop() ?? `${message.id}.jpg`;
            const filename = sanitizeFilename(rawName);
            const localPath = await downloadSlackFile(
              config.botToken,
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
            const localPath = await downloadSlackFile(
              config.botToken,
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
