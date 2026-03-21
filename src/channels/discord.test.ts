import { describe, it, expect } from "vitest";
import { parseDiscordMessage } from "./discord.js";

const TARGET_CHANNEL = "123456789";

function discordMsg(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    channel_id: TARGET_CHANNEL,
    author: { id: "user-1", username: "Ada", discriminator: "0001" },
    content: "Hello world",
    timestamp: "2025-03-15T10:00:00.000Z",
    attachments: [],
    ...overrides,
  };
}

describe("parseDiscordMessage", () => {
  it("parses a simple text message", () => {
    const result = parseDiscordMessage(discordMsg(), TARGET_CHANNEL);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("msg-1");
    expect(result!.text).toBe("Hello world");
    expect(result!.sender.id).toBe("user-1");
    expect(result!.sender.name).toBe("Ada");
    expect(result!.chatId).toBe(TARGET_CHANNEL);
    expect(result!.images).toEqual([]);
    expect(result!.mediaFiles).toEqual([]);
  });

  it("returns null for messages from wrong channel", () => {
    const result = parseDiscordMessage(discordMsg({ channel_id: "other" }), TARGET_CHANNEL);
    expect(result).toBeNull();
  });

  it("returns null for bot messages", () => {
    const result = parseDiscordMessage(
      discordMsg({
        author: { id: "bot-1", username: "SomeBot", discriminator: "0000", bot: true },
      }),
      TARGET_CHANNEL,
    );
    expect(result).toBeNull();
  });

  it("does not filter non-bot users", () => {
    const result = parseDiscordMessage(
      discordMsg({
        author: { id: "user-2", username: "Bob", discriminator: "1234", bot: false },
      }),
      TARGET_CHANNEL,
    );
    expect(result).not.toBeNull();
    expect(result!.sender.name).toBe("Bob");
  });

  it("extracts image attachments as pending images", () => {
    const result = parseDiscordMessage(
      discordMsg({
        attachments: [
          { id: "a1", filename: "photo.jpg", content_type: "image/jpeg", url: "https://cdn.discord.com/photo.jpg", size: 1024 },
          { id: "a2", filename: "doc.pdf", content_type: "application/pdf", url: "https://cdn.discord.com/doc.pdf", size: 2048 },
        ],
      }),
      TARGET_CHANNEL,
    );
    expect(result!.pendingImages).toHaveLength(1);
    expect(result!.pendingImages![0].fileId).toBe("https://cdn.discord.com/photo.jpg");
  });

  it("extracts video/audio attachments as pending media", () => {
    const result = parseDiscordMessage(
      discordMsg({
        attachments: [
          { id: "a1", filename: "clip.mp4", content_type: "video/mp4", url: "https://cdn.discord.com/clip.mp4", size: 5000 },
          { id: "a2", filename: "voice.ogg", content_type: "audio/ogg", url: "https://cdn.discord.com/voice.ogg", size: 3000 },
        ],
      }),
      TARGET_CHANNEL,
    );
    expect(result!.pendingMedia).toHaveLength(2);
    expect(result!.pendingMedia![0].mimeType).toBe("video/mp4");
    expect(result!.pendingMedia![1].mimeType).toBe("audio/ogg");
  });

  it("preserves original ISO timestamp without re-parsing", () => {
    const ts = "2025-06-15T12:30:00.123456Z";
    const result = parseDiscordMessage(discordMsg({ timestamp: ts }), TARGET_CHANNEL);
    expect(result!.receivedAt).toBe(ts);
  });

  it("handles message with no attachments", () => {
    const result = parseDiscordMessage(discordMsg({ attachments: [] }), TARGET_CHANNEL);
    expect(result!.pendingImages).toBeUndefined();
    expect(result!.pendingMedia).toBeUndefined();
  });
});
