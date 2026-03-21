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

    it("includes classification instructions", () => {
      const prompt = buildClassificationPrompt("hello");
      expect(prompt).toContain("micro");
      expect(prompt).toContain("post");
      expect(prompt).toContain("image");
      expect(prompt).toContain("link");
    });

    it("mentions images when present", () => {
      const prompt = buildClassificationPrompt("sunset photo", true);
      expect(prompt).toContain("image");
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
        title: null,
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
        isDraft: false,
      });

      const result = parseClassificationResponse(json);
      expect(result.slug).toBe("short-thought-here");
    });

    it("truncates long slugs", () => {
      const json = JSON.stringify({
        type: "micro",
        body: "This is a very long message that should be truncated when used as a slug because URLs should be reasonable",
        tags: [],
        isDraft: false,
      });

      const result = parseClassificationResponse(json);
      expect(result.slug.length).toBeLessThanOrEqual(60);
      expect(result.slug.endsWith("-")).toBe(false);
    });

    it("handles JSON wrapped in markdown code fences", () => {
      const response = '```json\n{"type":"micro","body":"hello","tags":[]}\n```';
      const result = parseClassificationResponse(response);
      expect(result.type).toBe("micro");
      expect(result.body).toBe("hello");
    });

    it("throws on invalid JSON", () => {
      expect(() => parseClassificationResponse("not json")).toThrow();
    });

    it("throws on missing type", () => {
      const json = JSON.stringify({ body: "hello", tags: [] });
      expect(() => parseClassificationResponse(json)).toThrow();
    });

    it("throws on invalid type", () => {
      const json = JSON.stringify({
        type: "tweet",
        body: "hello",
        tags: [],
      });
      expect(() => parseClassificationResponse(json)).toThrow();
    });

    it("defaults isDraft to false", () => {
      const json = JSON.stringify({
        type: "micro",
        body: "hello",
        tags: [],
      });
      const result = parseClassificationResponse(json);
      expect(result.isDraft).toBe(false);
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

      const result = await classifyContent(
        "Coffee is great",
        [],
        mockCallModel,
      );

      expect(mockCallModel).toHaveBeenCalledOnce();
      expect(result.type).toBe("micro");
      expect(result.body).toBe("Coffee is great");
    });

    it("passes image flag when images present", async () => {
      const mockCallModel = vi.fn().mockResolvedValue(
        JSON.stringify({
          type: "image",
          body: "Sunset",
          tags: [],
          isDraft: false,
        }),
      );

      await classifyContent("Sunset", ["/img/sunset.jpg"], mockCallModel);

      const prompt = mockCallModel.mock.calls[0]![0] as string;
      expect(prompt).toContain("image");
    });
  });
});
