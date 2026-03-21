import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { processMessage, type PipelineConfig } from "./pipeline.js";
import { scaffoldSite } from "../generator/site.js";
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
      deploy: false, // skip git for unit test
    };

    const result = await processMessage(
      {
        id: "1",
        text: "Coffee in Lisbon is incredible.",
        images: [],
        sender: { id: "99", name: "Hector" },
        receivedAt: new Date().toISOString(),
      },
      config,
    );

    expect(result.post.type).toBe("micro");
    expect(result.post.url).toContain("test.com");
    expect(result.deployed).toBe(false);

    // Verify HTML was written
    const html = await readFile(
      join(siteDir, `${result.post.slug}.html`),
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
        sender: { id: "99", name: "Hector" },
        receivedAt: new Date().toISOString(),
      },
      config,
    );

    expect(result.draft).toBeDefined();
    expect(result.draft!.status).toBe("draft");
    expect(result.post).toBeUndefined();

    // Verify draft file exists
    const draftPath = join(siteDir, "drafts", `${result.draft!.slug}.json`);
    const draft = JSON.parse(await readFile(draftPath, "utf-8"));
    expect(draft.status).toBe("draft");
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

    const config: PipelineConfig = {
      siteDir,
      callModel: mockCallModel,
      deploy: false,
    };

    const result = await processMessage(
      {
        id: "3",
        text: "Hello world",
        images: [],
        sender: { id: "99", name: "Hector" },
        receivedAt: new Date().toISOString(),
      },
      config,
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

    const config: PipelineConfig = {
      siteDir,
      callModel: mockCallModel,
      deploy: false,
    };

    const result = await processMessage(
      {
        id: "4",
        text: "draft: Save this",
        images: [],
        sender: { id: "99", name: "Hector" },
        receivedAt: new Date().toISOString(),
      },
      config,
    );

    expect(result.reply).toContain("Saved as draft");
    expect(result.reply).toContain("save-this");
  });

  it("includes error in reply when classification fails", async () => {
    const mockCallModel = vi.fn().mockRejectedValue(new Error("API timeout"));

    const config: PipelineConfig = {
      siteDir,
      callModel: mockCallModel,
      deploy: false,
    };

    const result = await processMessage(
      {
        id: "5",
        text: "Hello",
        images: [],
        sender: { id: "99", name: "Hector" },
        receivedAt: new Date().toISOString(),
      },
      config,
    );

    expect(result.error).toBeDefined();
    expect(result.reply).toContain("Failed");
  });
});
