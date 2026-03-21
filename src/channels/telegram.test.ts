import { describe, it, expect } from "vitest";
import {
  parseTelegramUpdate,
  buildApiUrl,
  extractImageFileIds,
} from "./telegram.js";

describe("telegram channel", () => {
  describe("buildApiUrl", () => {
    it("builds correct URL for a method", () => {
      const url = buildApiUrl("tok123", "getUpdates");
      expect(url).toBe("https://api.telegram.org/bottok123/getUpdates");
    });
  });

  describe("parseTelegramUpdate", () => {
    it("parses a text message", () => {
      const update = {
        update_id: 1,
        message: {
          message_id: 42,
          date: 1700000000,
          chat: { id: 99, type: "private" as const },
          from: { id: 99, is_bot: false, first_name: "Hector" },
          text: "The coffee in Lisbon is incredible.",
        },
      };

      const result = parseTelegramUpdate(update);
      expect(result).not.toBeNull();
      expect(result!.text).toBe("The coffee in Lisbon is incredible.");
      expect(result!.sender.name).toBe("Hector");
      expect(result!.sender.id).toBe("99");
      expect(result!.images).toHaveLength(0);
    });

    it("parses a photo message with caption", () => {
      const update = {
        update_id: 2,
        message: {
          message_id: 43,
          date: 1700000000,
          chat: { id: 99, type: "private" as const },
          from: { id: 99, is_bot: false, first_name: "Hector" },
          caption: "Sunset from the rooftop",
          photo: [
            { file_id: "small", file_unique_id: "s", width: 90, height: 90 },
            {
              file_id: "large",
              file_unique_id: "l",
              width: 1280,
              height: 720,
            },
          ],
        },
      };

      const result = parseTelegramUpdate(update);
      expect(result).not.toBeNull();
      expect(result!.text).toBe("Sunset from the rooftop");
      // Photo file IDs extracted (largest first)
      expect(result!.images).toHaveLength(0); // images populated after download
    });

    it("returns null for non-message updates", () => {
      const update = { update_id: 3 };
      expect(parseTelegramUpdate(update as any)).toBeNull();
    });

    it("returns null for group messages (only private)", () => {
      const update = {
        update_id: 4,
        message: {
          message_id: 44,
          date: 1700000000,
          chat: { id: -100, type: "group" as const },
          from: { id: 99, is_bot: false, first_name: "Hector" },
          text: "hello",
        },
      };

      expect(parseTelegramUpdate(update)).toBeNull();
    });

    it("uses caption for photo messages, empty string if no text/caption", () => {
      const update = {
        update_id: 5,
        message: {
          message_id: 45,
          date: 1700000000,
          chat: { id: 99, type: "private" as const },
          from: { id: 99, is_bot: false, first_name: "Hector" },
        },
      };

      const result = parseTelegramUpdate(update);
      expect(result).not.toBeNull();
      expect(result!.text).toBe("");
    });
  });

  describe("extractImageFileIds", () => {
    it("returns largest photo file_id", () => {
      const photos = [
        { file_id: "small", file_unique_id: "s", width: 90, height: 90 },
        { file_id: "medium", file_unique_id: "m", width: 320, height: 320 },
        { file_id: "large", file_unique_id: "l", width: 1280, height: 720 },
      ];
      const ids = extractImageFileIds(photos);
      expect(ids).toEqual(["large"]);
    });

    it("returns empty array when no photos", () => {
      expect(extractImageFileIds(undefined)).toEqual([]);
    });
  });
});
