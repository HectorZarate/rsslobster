import { describe, it, expect } from "vitest";
import { parseSlackMessage } from "./slack.js";

function slackEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: "message" as const,
    user: "U024BE7LH",
    text: "Hello from Slack",
    ts: "1678901234.567890",
    channel: "C024BE91L",
    ...overrides,
  };
}

describe("parseSlackMessage", () => {
  it("parses a simple text message", () => {
    const result = parseSlackMessage(slackEvent());
    expect(result).not.toBeNull();
    expect(result!.id).toBe("1678901234.567890");
    expect(result!.text).toBe("Hello from Slack");
    expect(result!.sender.id).toBe("U024BE7LH");
    expect(result!.chatId).toBe("C024BE91L");
    expect(result!.images).toEqual([]);
    expect(result!.mediaFiles).toEqual([]);
  });

  it("returns null for messages with subtypes (edits, joins, etc.)", () => {
    const result = parseSlackMessage(slackEvent({ subtype: "message_changed" }));
    expect(result).toBeNull();
  });

  it("filters by target channel when specified", () => {
    const result = parseSlackMessage(slackEvent(), "C_OTHER");
    expect(result).toBeNull();
  });

  it("passes through when target channel matches", () => {
    const result = parseSlackMessage(slackEvent(), "C024BE91L");
    expect(result).not.toBeNull();
  });

  it("passes through when no target channel specified", () => {
    const result = parseSlackMessage(slackEvent());
    expect(result).not.toBeNull();
  });

  it("extracts image files as pending images", () => {
    const result = parseSlackMessage(
      slackEvent({
        files: [
          { id: "F1", name: "photo.jpg", mimetype: "image/jpeg", url_private_download: "https://files.slack.com/photo.jpg" },
        ],
      }),
    );
    expect(result!.pendingImages).toHaveLength(1);
    expect(result!.pendingImages![0].fileId).toBe("https://files.slack.com/photo.jpg");
  });

  it("extracts video/audio files as pending media", () => {
    const result = parseSlackMessage(
      slackEvent({
        files: [
          { id: "F1", name: "clip.mp4", mimetype: "video/mp4", url_private_download: "https://files.slack.com/clip.mp4" },
          { id: "F2", name: "voice.ogg", mimetype: "audio/ogg", url_private_download: "https://files.slack.com/voice.ogg" },
        ],
      }),
    );
    expect(result!.pendingMedia).toHaveLength(2);
    expect(result!.pendingMedia![0].mimeType).toBe("video/mp4");
    expect(result!.pendingMedia![1].mimeType).toBe("audio/ogg");
  });

  it("separates images from media files", () => {
    const result = parseSlackMessage(
      slackEvent({
        files: [
          { id: "F1", name: "photo.jpg", mimetype: "image/jpeg", url_private_download: "https://files.slack.com/photo.jpg" },
          { id: "F2", name: "clip.mp4", mimetype: "video/mp4", url_private_download: "https://files.slack.com/clip.mp4" },
          { id: "F3", name: "doc.pdf", mimetype: "application/pdf", url_private_download: "https://files.slack.com/doc.pdf" },
        ],
      }),
    );
    expect(result!.pendingImages).toHaveLength(1);
    expect(result!.pendingMedia).toHaveLength(1);
  });

  it("converts Slack ts to ISO timestamp", () => {
    const result = parseSlackMessage(slackEvent({ ts: "1678901234.567890" }));
    const date = new Date(result!.receivedAt);
    expect(date.getFullYear()).toBe(2023);
    expect(date.getTime()).toBeCloseTo(1678901234567, -1);
  });
});
