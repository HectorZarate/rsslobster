import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { processMessage, type PipelineConfig } from "./pipeline.js";
import { scaffoldSite, readPostsIndex } from "../generator/site.js";
import { createDraft } from "../drafts/drafts.js";
import type { SiteConfig } from "../config/types.js";

describe("agent pipeline", () => {
  let siteDir: string;
  const siteConfig: SiteConfig = {
    domain: "test.com",
    title: "Test Site",
    description: "A test",
    author: "Tester",
    language: "en",
    style: { preset: "minimal" },
    repo: "",
  };

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-pipeline-"));
    await scaffoldSite(siteDir, siteConfig);
  });

  afterEach(async () => {
    await rm(siteDir, { recursive: true, force: true });
  });

  it("classifies and generates content from a text message", async () => {
    const mockCallModel = vi.fn().mockResolvedValue(
      JSON.stringify({
        type: "micro",
        body: "Coffee in Lisbon is incredible.",
        tags: ["travel"],
        isDraft: false,
      }),
    );

    const config: PipelineConfig = {
      siteDir,
      callModel: mockCallModel,
      deploy: false,
    };

    const result = await processMessage(
      {
        id: "1",
        text: "Coffee in Lisbon is incredible.",
        images: [],
        mediaFiles: [],
        chatId: "99",
        sender: { id: "99", name: "Hector" },
        receivedAt: new Date().toISOString(),
      },
      config,
    );

    expect(result.post).toBeDefined();
    expect(result.post!.type).toBe("micro");
    expect(result.post!.url).toContain("test.com");
    expect(result.deployed).toBe(false);

    // Verify HTML was written
    const html = await readFile(
      join(siteDir, "posts", result.post!.slug, "index.html"),
      "utf-8",
    );
    expect(html).toContain("Coffee in Lisbon");
  });

  it("saves as draft when classifier says isDraft", async () => {
    const mockCallModel = vi.fn().mockResolvedValue(
      JSON.stringify({
        type: "post",
        title: "Work in Progress",
        body: "Still thinking about this...",
        tags: [],
        isDraft: true,
      }),
    );

    const config: PipelineConfig = {
      siteDir,
      callModel: mockCallModel,
      deploy: false,
    };

    const result = await processMessage(
      {
        id: "2",
        text: "Draft: Still thinking about this...",
        images: [],
        mediaFiles: [],
        chatId: "99",
        sender: { id: "99", name: "Hector" },
        receivedAt: new Date().toISOString(),
      },
      config,
    );

    expect(result.draft).toBeDefined();
    expect(result.draft!.status).toBe("draft");
    expect(result.post).toBeUndefined();
  });

  it("returns reply text for the channel", async () => {
    const mockCallModel = vi.fn().mockResolvedValue(
      JSON.stringify({
        type: "micro",
        body: "Hello world",
        tags: [],
        isDraft: false,
      }),
    );

    const result = await processMessage(
      {
        id: "3",
        text: "Hello world",
        images: [],
        mediaFiles: [],
        chatId: "99",
        sender: { id: "99", name: "Hector" },
        receivedAt: new Date().toISOString(),
      },
      { siteDir, callModel: mockCallModel, deploy: false },
    );

    expect(result.reply).toContain("https://test.com/");
  });

  it("returns draft reply when saving a draft", async () => {
    const mockCallModel = vi.fn().mockResolvedValue(
      JSON.stringify({
        type: "micro",
        body: "Save this",
        tags: [],
        isDraft: true,
      }),
    );

    const result = await processMessage(
      {
        id: "4",
        text: "draft: Save this",
        images: [],
        mediaFiles: [],
        chatId: "99",
        sender: { id: "99", name: "Hector" },
        receivedAt: new Date().toISOString(),
      },
      { siteDir, callModel: mockCallModel, deploy: false },
    );

    expect(result.reply).toContain("Saved as draft");
    expect(result.reply).toContain("save-this");
  });

  it("includes error in reply when classification fails", async () => {
    const mockCallModel = vi.fn().mockRejectedValue(new Error("API timeout"));

    const result = await processMessage(
      {
        id: "5",
        text: "Hello",
        images: [],
        mediaFiles: [],
        chatId: "99",
        sender: { id: "99", name: "Hector" },
        receivedAt: new Date().toISOString(),
      },
      { siteDir, callModel: mockCallModel, deploy: false },
    );

    expect(result.error).toBeDefined();
    expect(result.reply).toContain("Failed");
  });

  describe("preview flow", () => {
    it("'preview: text' creates a draft with preview HTML", async () => {
      const mockCallModel = vi.fn().mockResolvedValue(
        JSON.stringify({
          type: "micro",
          body: "Preview this thought",
          tags: ["test"],
          isDraft: false,
        }),
      );

      const result = await processMessage(
        {
          id: "p1",
          text: "preview: Preview this thought",
          images: [],
          mediaFiles: [],
          chatId: "99",
          sender: { id: "99", name: "Hector" },
          receivedAt: new Date().toISOString(),
        },
        { siteDir, callModel: mockCallModel, deploy: false },
      );

      // Should return a preview draft
      expect(result.preview).toBeDefined();
      expect(result.preview!.previewId).toMatch(/^[a-f0-9]{12}$/);
      expect(result.preview!.previewUrl).toContain("_previews/");
      expect(result.post).toBeUndefined();

      // Reply should include preview URL and publish hint
      expect(result.reply).toContain("Preview:");
      expect(result.reply).toContain("_previews/");
      expect(result.reply).toContain("publish");

      // Preview HTML should exist
      const htmlPath = join(siteDir, "_previews", `${result.preview!.previewId}.html`);
      const html = await readFile(htmlPath, "utf-8");
      expect(html).toContain("Preview this thought");
      expect(html).toContain("noindex");

      // posts.json should be empty — preview doesn't pollute feeds
      const posts = await readPostsIndex(siteDir);
      expect(posts).toHaveLength(0);
    });

    it("'publish {slug}' promotes a draft to published", async () => {
      // First, create a draft manually
      await createDraft(siteDir, {
        type: "micro",
        body: "Ready to publish",
        slug: "ready-to-publish",
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const mockCallModel = vi.fn(); // Should NOT be called for publish command

      const result = await processMessage(
        {
          id: "p2",
          text: "publish ready-to-publish",
          images: [],
          mediaFiles: [],
          chatId: "99",
          sender: { id: "99", name: "Hector" },
          receivedAt: new Date().toISOString(),
        },
        { siteDir, callModel: mockCallModel, deploy: false },
      );

      // Should have published
      expect(result.post).toBeDefined();
      expect(result.post!.url).toContain("test.com");
      expect(result.reply).toContain("Published");

      // Model should NOT have been called
      expect(mockCallModel).not.toHaveBeenCalled();

      // posts.json should have the post
      const posts = await readPostsIndex(siteDir);
      expect(posts).toHaveLength(1);
    });

    it("'preview {slug}' generates preview for existing draft", async () => {
      // Create a draft
      await createDraft(siteDir, {
        type: "post",
        title: "Draft Post",
        body: "This is a draft that needs preview",
        slug: "draft-post",
        tags: ["test"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const mockCallModel = vi.fn(); // Should NOT be called

      const result = await processMessage(
        {
          id: "p3",
          text: "preview draft-post",
          images: [],
          mediaFiles: [],
          chatId: "99",
          sender: { id: "99", name: "Hector" },
          receivedAt: new Date().toISOString(),
        },
        { siteDir, callModel: mockCallModel, deploy: false },
      );

      expect(result.preview).toBeDefined();
      expect(result.preview!.previewUrl).toContain("_previews/");
      expect(result.reply).toContain("Preview:");
      expect(mockCallModel).not.toHaveBeenCalled();
    });

    it("'publish {slug}' returns error for nonexistent draft", async () => {
      const result = await processMessage(
        {
          id: "p4",
          text: "publish nonexistent-slug",
          images: [],
          mediaFiles: [],
          chatId: "99",
          sender: { id: "99", name: "Hector" },
          receivedAt: new Date().toISOString(),
        },
        { siteDir, callModel: vi.fn(), deploy: false },
      );

      expect(result.error).toBeDefined();
      expect(result.reply).toContain("not found");
    });

    it("isPreview from classifier routes to preview flow", async () => {
      const mockCallModel = vi.fn().mockResolvedValue(
        JSON.stringify({
          type: "micro",
          body: "Let me see this",
          tags: [],
          isDraft: false,
          isPreview: true,
        }),
      );

      const result = await processMessage(
        {
          id: "p5",
          text: "let me see this",
          images: [],
          mediaFiles: [],
          chatId: "99",
          sender: { id: "99", name: "Hector" },
          receivedAt: new Date().toISOString(),
        },
        { siteDir, callModel: mockCallModel, deploy: false },
      );

      expect(result.preview).toBeDefined();
      expect(result.preview!.previewId).toBeDefined();
      expect(result.post).toBeUndefined();
    });
  });

  describe("image handling", () => {
    it("ingests pre-downloaded images into site and wires into content", async () => {
      // Create a fake image file (simulating already-downloaded Telegram photo)
      const tempDir = await mkdtemp(join(tmpdir(), "rsslobster-img-"));
      const imgPath = join(tempDir, "sunset.jpg");
      await writeFile(imgPath, Buffer.from("fake-jpeg"));

      const mockCallModel = vi.fn().mockResolvedValue(
        JSON.stringify({
          type: "image",
          body: "Beautiful sunset",
          tags: ["photo"],
          isDraft: false,
        }),
      );

      const result = await processMessage(
        {
          id: "6",
          text: "Beautiful sunset",
          images: [{ localPath: imgPath, filename: "sunset.jpg" }],
          mediaFiles: [],
          chatId: "99",
          sender: { id: "99", name: "Hector" },
          receivedAt: new Date().toISOString(),
        },
        { siteDir, callModel: mockCallModel, deploy: false },
      );

      expect(result.post).toBeDefined();
      expect(result.post!.type).toBe("image");
      expect(result.post!.images).toBeDefined();
      expect(result.post!.images!.length).toBe(1);
      expect(result.post!.images![0]!.src).toMatch(/^\/images\//);

      // Image file should exist in site
      const imgStat = await stat(
        join(siteDir, result.post!.images![0]!.src.slice(1)),
      );
      expect(imgStat.isFile()).toBe(true);

      // HTML should reference the image
      const html = await readFile(
        join(siteDir, "posts", result.post!.slug, "index.html"),
        "utf-8",
      );
      expect(html).toContain("/images/");
      expect(html).toContain("img");

      await rm(tempDir, { recursive: true, force: true });
    });

    it("handles multiple images for carousel type", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "rsslobster-img-"));
      const images = [];
      for (let i = 0; i < 3; i++) {
        const p = join(tempDir, `photo${i}.jpg`);
        await writeFile(p, Buffer.from(`image-${i}`));
        images.push({ localPath: p, filename: `photo${i}.jpg` });
      }

      const mockCallModel = vi.fn().mockResolvedValue(
        JSON.stringify({
          type: "carousel",
          body: "Trip photos",
          tags: ["travel"],
          isDraft: false,
        }),
      );

      const result = await processMessage(
        {
          id: "7",
          text: "Trip photos",
          images,
          mediaFiles: [],
          chatId: "99",
          sender: { id: "99", name: "Hector" },
          receivedAt: new Date().toISOString(),
        },
        { siteDir, callModel: mockCallModel, deploy: false },
      );

      expect(result.post!.images).toHaveLength(3);
      expect(result.post!.images![0]!.src).toContain("-1.jpg");
      expect(result.post!.images![1]!.src).toContain("-2.jpg");
      expect(result.post!.images![2]!.src).toContain("-3.jpg");

      await rm(tempDir, { recursive: true, force: true });
    });

    it("publishes even when image ingestion partially fails", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "rsslobster-img-"));
      const goodPath = join(tempDir, "good.jpg");
      await writeFile(goodPath, Buffer.from("ok"));

      const mockCallModel = vi.fn().mockResolvedValue(
        JSON.stringify({
          type: "image",
          body: "Photo with issue",
          tags: [],
          isDraft: false,
        }),
      );

      const result = await processMessage(
        {
          id: "8",
          text: "Photo with issue",
          images: [
            { localPath: "/nonexistent.jpg", filename: "bad.jpg" },
            { localPath: goodPath, filename: "good.jpg" },
          ],
          mediaFiles: [],
          chatId: "99",
          sender: { id: "99", name: "Hector" },
          receivedAt: new Date().toISOString(),
        },
        { siteDir, callModel: mockCallModel, deploy: false },
      );

      // Should still publish with the good image
      expect(result.post).toBeDefined();
      expect(result.post!.images).toHaveLength(1);

      await rm(tempDir, { recursive: true, force: true });
    });
  });
});
