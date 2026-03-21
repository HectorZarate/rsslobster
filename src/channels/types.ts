/** A message received from any channel (Telegram, etc.) */
export interface InboundMessage {
  /** Unique message ID from the channel */
  id: string;
  /** Raw text content */
  text: string;
  /** Attached images (downloaded to local paths) */
  images: InboundImage[];
  /** Telegram chat ID for replies */
  chatId: string;
  /** Photos pending download (Telegram file_ids) */
  pendingImages?: PendingImage[];
  /** Sender info for logging */
  sender: { id: string; name: string };
  /** ISO timestamp */
  receivedAt: string;
}

export interface InboundImage {
  /** Local file path after download */
  localPath: string;
  /** Mime type if known */
  mimeType?: string;
  /** Original filename */
  filename: string;
}

/** Raw photo reference before download (Telegram file_id etc.) */
export interface PendingImage {
  fileId: string;
}

/** Callback for when a message arrives */
export type MessageHandler = (message: InboundMessage) => Promise<void>;

/** Send a reply back to the user */
export type ReplySender = (chatId: string, text: string) => Promise<void>;
