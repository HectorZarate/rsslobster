/** Supported channel types */
export type ChannelType =
  | "telegram"
  | "discord"
  | "slack"
  | "whatsapp"
  | "signal"
  | "nostr"
  | "matrix"
  | "webhook"
  | "irc";

/** A message received from any channel */
export interface InboundMessage {
  /** Unique message ID from the channel */
  id: string;
  /** Raw text content */
  text: string;
  /** Attached images (downloaded to local paths) */
  images: InboundImage[];
  /** Attached media files — video or audio (downloaded to local paths) */
  mediaFiles: InboundMedia[];
  /** Channel-specific chat/conversation ID for replies */
  chatId: string;
  /** Photos pending download (channel-specific file references) */
  pendingImages?: PendingImage[];
  /** Media files pending download */
  pendingMedia?: PendingMedia[];
  /** Sender info for logging */
  sender: { id: string; name: string };
  /** ISO timestamp */
  receivedAt: string;
}

export interface InboundMedia {
  /** Local file path after download */
  localPath: string;
  /** MIME type (e.g. "video/mp4", "audio/ogg") */
  mimeType: string;
  /** Original filename */
  filename: string;
}

/** Raw media reference before download */
export interface PendingMedia {
  fileId: string;
  mimeType?: string;
}

export interface InboundImage {
  /** Local file path after download */
  localPath: string;
  /** Mime type if known */
  mimeType?: string;
  /** Original filename */
  filename: string;
}

/** Raw photo reference before download (file_id, URL, etc.) */
export interface PendingImage {
  fileId: string;
}

/** Strip path traversal characters from a filename. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, "_").replace(/\.\./g, "_");
}

/** Callback for when a message arrives */
export type MessageHandler = (message: InboundMessage) => Promise<void>;

/** Send a reply back to the user */
export type ReplySender = (chatId: string, text: string) => Promise<void>;

/**
 * A channel connects RSS Lobster to a messaging platform.
 *
 * Channels are responsible for:
 * - Polling or listening for inbound messages
 * - Downloading any attached images to local temp files
 * - Sending reply messages back to the user
 */
export interface Channel {
  /** Which channel type this is */
  readonly type: ChannelType;

  /** Start listening for messages. Runs until the signal is aborted. */
  poll(handler: MessageHandler, signal?: AbortSignal): Promise<void>;

  /** Send a text reply back to the user */
  reply(chatId: string, text: string): Promise<void>;

  /** Download pending images attached to a message */
  downloadImages(message: InboundMessage): Promise<void>;
}
