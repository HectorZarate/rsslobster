import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { InboundMessage, MessageHandler } from "./types.js";

// --- Telegram Bot API types (minimal subset) ---

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
}

interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
}

interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// --- Public API ---

const API_BASE = "https://api.telegram.org/bot";

/** Build a Telegram Bot API URL. */
export function buildApiUrl(token: string, method: string): string {
  return `${API_BASE}${token}/${method}`;
}

/** Extract the largest photo file_id from a photo array. */
export function extractImageFileIds(
  photos: TelegramPhotoSize[] | undefined,
): string[] {
  if (!photos || photos.length === 0) return [];
  // Telegram sends sizes smallest→largest. Pick the last (largest).
  const largest = photos[photos.length - 1];
  return largest ? [largest.file_id] : [];
}

/** Parse a Telegram update into our InboundMessage. Returns null if not actionable. */
export function parseTelegramUpdate(
  update: TelegramUpdate,
): InboundMessage | null {
  const msg = update.message;
  if (!msg) return null;

  // Only respond to private messages (DMs to the bot)
  if (msg.chat.type !== "private") return null;

  const text = msg.text ?? msg.caption ?? "";
  const sender = msg.from
    ? { id: String(msg.from.id), name: msg.from.first_name }
    : { id: "unknown", name: "Unknown" };

  const photoFileIds = extractImageFileIds(msg.photo);
  const pendingImages = photoFileIds.map((fileId) => ({ fileId }));

  return {
    id: String(msg.message_id),
    text,
    images: [],
    chatId: String(msg.chat.id),
    pendingImages: pendingImages.length > 0 ? pendingImages : undefined,
    sender,
    receivedAt: new Date(msg.date * 1000).toISOString(),
  };
}

/** Download a Telegram file by file_id. Returns local path. */
export async function downloadTelegramFile(
  token: string,
  fileId: string,
  destDir: string,
): Promise<string> {
  // Step 1: get file path from Telegram
  const fileInfoUrl = new URL(buildApiUrl(token, "getFile"));
  fileInfoUrl.searchParams.set("file_id", fileId);
  const res = await fetch(fileInfoUrl);
  const data = (await res.json()) as {
    ok: boolean;
    result?: { file_path?: string };
  };
  if (!data.ok || !data.result?.file_path) {
    throw new Error(`Failed to get file info for ${fileId}`);
  }

  // Step 2: download the file
  const downloadUrl = `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
  const fileRes = await fetch(downloadUrl);
  if (!fileRes.ok) {
    throw new Error(`Failed to download file: ${fileRes.status}`);
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const filename = data.result.file_path.split("/").pop() ?? `${fileId}.jpg`;
  await mkdir(destDir, { recursive: true });
  const localPath = join(destDir, filename);
  await writeFile(localPath, buffer);

  return localPath;
}

/** Send a text reply via Telegram. Throws on API failure. */
export async function sendReply(
  token: string,
  chatId: string | number,
  text: string,
): Promise<void> {
  const url = buildApiUrl(token, "sendMessage");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`Telegram sendMessage failed: ${res.status}`);
  }
}

/** Long-poll for updates. Calls handler for each new message. */
export async function pollForUpdates(
  token: string,
  handler: MessageHandler,
  signal?: AbortSignal,
): Promise<void> {
  let offset = 0;

  while (!signal?.aborted) {
    try {
      const url = buildApiUrl(token, "getUpdates");
      const res = await fetch(
        `${url}?offset=${offset}&timeout=30&allowed_updates=["message"]`,
        { signal },
      );
      const data = (await res.json()) as {
        ok: boolean;
        result?: TelegramUpdate[];
      };

      if (!data.ok || !data.result) continue;

      for (const update of data.result) {
        offset = update.update_id + 1;
        const message = parseTelegramUpdate(update);
        if (message) {
          await handler(message);
        }
      }
    } catch {
      if (signal?.aborted) break;
      // Back off on error, then retry
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}
