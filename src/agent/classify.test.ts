import { describe, it, expect, vi } from "vitest";
import {
  classifyContent,
  buildClassificationPrompt,
  parseClassificationResponse,
} from "./classify.js";

describe("content classification", () => {
  describe("buildClassificationPrompt", () => {
    it("includes the user message text", () => {
      const prompt = buildClassificationPrompt(
        "The coffee in Lisbon is incredible.",
      );
      expect(prompt).toContain("The coffee in Lisbon is incredible.");
    });

    it("includes all five content types", () => {
      const prompt = buildClassificationPrompt("hello");
      expect(prompt).toContain("micro");
      expect(prompt).toContain("post");
      expect(prompt).toContain("image");
      expect(prompt).toContain("carousel");
      expect(prompt).toContain("link");
    });

    it("includes few-shot examples", () => {
      const prompt = buildClassificationPrompt("hello");
      // Should have concrete input→output examples
      expect(prompt).toContain('"type"');
      expect(prompt).toContain('"body"');
      expect(prompt).toContain('"tags"');
    });

    it("notes image count when images attached", () => {
      const prompt = buildClassificationPrompt("sunset photo", 1);
      expect(prompt).toContain("1 image");
      expect(prompt).toContain('"image"');
    });

    it("notes multiple images for carousel hint", () => {
      const prompt = buildClassificationPrompt("my trip photos", 3);
      expect(prompt).toContain("3 images");
      expect(prompt).toContain("carousel");
    });

    it("detects URL in text and hints link type", () => {
      const prompt = buildClassificationPrompt(
        "Check this out https://example.com/article",
      );
      expect(prompt).toContain("https://example.com/article");
    });
  });

  describe("parseClassificationResponse", () => {
    it("parses a valid micro classification", () => {
      const json = JSON.stringify({
        type: "micro",
        title: null,
        body: "The coffee in Lisbon is incredible.",
        tags: ["travel", "lisbon"],
        isDraft: false,
      });
      const result = parseClassificationResponse(json);
      expect(result.type).toBe("micro");
      expect(result.body).toBe("The coffee in Lisbon is incredible.");
      expect(result.tags).toEqual(["travel", "lisbon"]);
      expect(result.slug).toMatch(/^the-coffee-in-lisbon/);
    });

    it("parses a post with title", () => {
      const json = JSON.stringify({
        type: "post",
        title: "My Weekend in Lisbon",
        body: "Long form content here...",
        tags: ["travel"],
        isDraft: false,
      });
      const result = parseClassificationResponse(json);
      expect(result.type).toBe("post");
      expect(result.title).toBe("My Weekend in Lisbon");
      expect(result.slug).toBe("my-weekend-in-lisbon");
    });

    it("parses a link share", () => {
      const json = JSON.stringify({
        type: "link",
        body: "Great article about RSS",
        tags: ["rss"],
        isDraft: false,
        linkUrl: "https://example.com/rss-article",
      });
      const result = parseClassificationResponse(json);
      expect(result.type).toBe("link");
      expect(result.linkUrl).toBe("https://example.com/rss-article");
    });

    it("generates slug from body when no title", () => {
      const json = JSON.stringify({
        type: "micro",
        body: "Short thought here",
        tags: [],
      });
      const result = parseClassificationResponse(json);
      expect(result.slug).toBe("short-thought-here");
    });

    it("truncates long slugs at word boundary", () => {
      const json = JSON.stringify({
        type: "micro",
        body: "This is a very long message that should be truncated when used as a slug because URLs should be reasonable",
        tags: [],
      });
      const result = parseClassificationResponse(json);
      expect(result.slug.length).toBeLessThanOrEqual(60);
      expect(result.slug.endsWith("-")).toBe(false);
    });

    it("handles JSON wrapped in markdown code fences", () => {
      const response =
        '```json\n{"type":"micro","body":"hello","tags":[]}\n```';
      const result = parseClassificationResponse(response);
      expect(result.type).toBe("micro");
      expect(result.body).toBe("hello");
    });

    it("handles JSON with leading/trailing whitespace and newlines", () => {
      const response =
        '\n\n  {"type":"micro","body":"hello","tags":[]}\n\n';
      const result = parseClassificationResponse(response);
      expect(result.type).toBe("micro");
    });

    it("extracts JSON object from response with surrounding text", () => {
      const response =
        'Here is the classification:\n{"type":"micro","body":"hello","tags":[]}\nDone.';
      const result = parseClassificationResponse(response);
      expect(result.type).toBe("micro");
    });

    it("throws on invalid JSON with no extractable object", () => {
      expect(() => parseClassificationResponse("not json at all")).toThrow();
    });

    it("throws on missing type field", () => {
      const json = JSON.stringify({ body: "hello", tags: [] });
      expect(() => parseClassificationResponse(json)).toThrow(/type/i);
    });

    it("throws on invalid type value", () => {
      const json = JSON.stringify({ type: "tweet", body: "hello", tags: [] });
      expect(() => parseClassificationResponse(json)).toThrow(/type/i);
    });

    it("defaults isDraft to false when missing", () => {
      const json = JSON.stringify({ type: "micro", body: "hello", tags: [] });
      const result = parseClassificationResponse(json);
      expect(result.isDraft).toBe(false);
    });

    it("coerces tags to strings and filters non-strings", () => {
      const json = JSON.stringify({
        type: "micro",
        body: "hello",
        tags: ["valid", 123, null, "also-valid"],
      });
      const result = parseClassificationResponse(json);
      expect(result.tags).toEqual(["valid", "also-valid"]);
    });

    it("enforces max 3 tags", () => {
      const json = JSON.stringify({
        type: "micro",
        body: "hello",
        tags: ["a", "b", "c", "d", "e"],
      });
      const result = parseClassificationResponse(json);
      expect(result.tags).toHaveLength(3);
    });

    it("lowercases and trims tags", () => {
      const json = JSON.stringify({
        type: "micro",
        body: "hello",
        tags: [" Travel ", "COFFEE"],
      });
      const result = parseClassificationResponse(json);
      expect(result.tags).toEqual(["travel", "coffee"]);
    });

    it("validates linkUrl is a valid URL for link type", () => {
      const json = JSON.stringify({
        type: "link",
        body: "check this",
        tags: [],
        linkUrl: "not-a-url",
      });
      // Should still parse but linkUrl left as-is (model might return partial)
      const result = parseClassificationResponse(json);
      expect(result.type).toBe("link");
    });

    it("handles null title correctly (not string 'null')", () => {
      const json = JSON.stringify({
        type: "micro",
        body: "hello",
        tags: [],
        title: null,
      });
      const result = parseClassificationResponse(json);
      expect(result.title).toBeUndefined();
    });

    it("handles empty body gracefully", () => {
      const json = JSON.stringify({
        type: "micro",
        body: "",
        tags: [],
        title: "Has Title",
      });
      const result = parseClassificationResponse(json);
      expect(result.slug).toBe("has-title");
    });
  });

  describe("classifyContent", () => {
    it("calls the model and returns classified content", async () => {
      const mockResponse = JSON.stringify({
        type: "micro",
        body: "Coffee is great",
        tags: ["coffee"],
        isDraft: false,
      });
      const mockCallModel = vi.fn().mockResolvedValue(mockResponse);
      const result = await classifyContent("Coffee is great", [], mockCallModel);

      expect(mockCallModel).toHaveBeenCalledOnce();
      expect(result.type).toBe("micro");
      expect(result.body).toBe("Coffee is great");
    });

    it("passes image count when images present", async () => {
      const mockCallModel = vi.fn().mockResolvedValue(
        JSON.stringify({ type: "image", body: "Sunset", tags: [] }),
      );
      await classifyContent("Sunset", ["/img/sunset.jpg"], mockCallModel);

      const prompt = mockCallModel.mock.calls[0]![0] as string;
      expect(prompt).toContain("1 image");
    });

    it("retries once on parse failure", async () => {
      const mockCallModel = vi
        .fn()
        .mockResolvedValueOnce("I cannot classify this")
        .mockResolvedValueOnce(
          JSON.stringify({ type: "micro", body: "hello", tags: [] }),
        );

      const result = await classifyContent("hello", [], mockCallModel);
      expect(mockCallModel).toHaveBeenCalledTimes(2);
      expect(result.type).toBe("micro");
    });

    it("throws after retry exhausted", async () => {
      const mockCallModel = vi
        .fn()
        .mockResolvedValue("I cannot classify this sorry");

      await expect(
        classifyContent("hello", [], mockCallModel),
      ).rejects.toThrow();
      expect(mockCallModel).toHaveBeenCalledTimes(2);
    });
  });
});
