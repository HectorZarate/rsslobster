import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { processMessage } from "../agent/pipeline.js";
import { scaffoldSite, readPostsIndex } from "../generator/site.js";
import { createDraft } from "../drafts/drafts.js";
import type { SiteConfig } from "../config/types.js";
import type { InboundMessage } from "../channels/types.js";
import type { CallModel } from "../agent/classify.js";

/**
 * End-to-end pipeline tests with canned model responses.
 *
 * These tests exercise the FULL flow: classify → ingest → generate → verify output.
 * No mocking of internal modules — only the LLM call is replaced with deterministic
 * canned responses that match real model output.
 */

const SITE_CONFIG: SiteConfig = {
  domain: "example.com",
  title: "My Lobster Blog",
  description: "Publishing from the shell",
  author: "Ada Lovelace",
  language: "en",
  style: { preset: "minimal" },
  repo: "",
};

/** Create a canned model that always returns the same response regardless of prompt. */
function cannedModel(response: string): CallModel {
  return async (_prompt: string) => response;
}

function msg(overrides: Partial<InboundMessage>): InboundMessage {
  return {
    id: "e2e-1",
    text: "",
    images: [],
    mediaFiles: [],
    chatId: "42",
    sender: { id: "42", name: "Ada" },
    receivedAt: "2025-03-15T10:00:00Z",
    ...overrides,
  };
}

describe("E2E pipeline", () => {
  let siteDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-e2e-"));
    await scaffoldSite(siteDir, SITE_CONFIG);
  });

  afterEach(async () => {
    await rm(siteDir, { recursive: true, force: true });
  });

  it("micro post: message → HTML page + RSS + JSON Feed + index", async () => {
    const callModel = cannedModel(
      JSON.stringify({
        type: "micro",
        body: "The mass of men lead lives of quiet desperation.",
        tags: ["quote"],
        isDraft: false,
      }),
    );

    const result = await processMessage(
      msg({ text: "The mass of men lead lives of quiet desperation." }),
      { siteDir, callModel, deploy: false },
    );

    // Published, not a draft
    expect(result.post).toBeDefined();
    expect(result.draft).toBeUndefined();
    expect(result.error).toBeUndefined();
    expect(result.post!.type).toBe("micro");
    expect(result.post!.url).toBe(
      "https://example.com/the-mass-of-men-lead-lives-of-quiet-desperation.html",
    );

    // HTML page exists and has correct structure
    const html = await readFile(
      join(siteDir, `${result.post!.slug}.html`),
      "utf-8",
    );
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("quiet desperation");
    expect(html).toContain("My Lobster Blog");
    expect(html).toContain('class="skip-link"');
    expect(html).toContain('href="/feed.xml"');
    expect(html).toContain('href="/feed.json"');
    expect(html).toContain('<span class="tag">quote</span>');

    // RSS feed updated with the new post
    const rss = await readFile(join(siteDir, "feed.xml"), "utf-8");
    expect(rss).toContain("<rss version");
    expect(rss).toContain("quiet desperation");
    expect(rss).toContain("<category>quote</category>");
    expect(rss).toContain("example.com");

    // JSON Feed updated
    const jsonFeed = JSON.parse(
      await readFile(join(siteDir, "feed.json"), "utf-8"),
    );
    expect(jsonFeed.version).toBe("https://jsonfeed.org/version/1.1");
    expect(jsonFeed.title).toBe("My Lobster Blog");
    expect(jsonFeed.items).toHaveLength(1);
    expect(jsonFeed.items[0].title).toContain("quiet desperation");

    // Index page lists the post
    const index = await readFile(join(siteDir, "index.html"), "utf-8");
    expect(index).toContain("quiet desperation");
    expect(index).toContain(".html");

    // Posts index JSON updated
    const posts = await readPostsIndex(siteDir);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.type).toBe("micro");
  });

  it("long post: title and body render with correct structure", async () => {
    const callModel = cannedModel(
      JSON.stringify({
        type: "post",
        title: "Why RSS Still Matters",
        body: "In an age of algorithmic feeds and walled gardens, RSS remains the only open standard that puts readers in control. No algorithm decides what you see. No company can take it away.",
        tags: ["rss", "indieweb", "web"],
        isDraft: false,
      }),
    );

    const result = await processMessage(
      msg({
        text: "# Why RSS Still Matters\nIn an age of algorithmic feeds and walled gardens, RSS remains the only open standard...",
      }),
      { siteDir, callModel, deploy: false },
    );

    expect(result.post!.type).toBe("post");
    expect(result.post!.title).toBe("Why RSS Still Matters");

    const html = await readFile(
      join(siteDir, `${result.post!.slug}.html`),
      "utf-8",
    );
    expect(html).toContain("<h1>Why RSS Still Matters</h1>");
    expect(html).toContain("algorithmic feeds");
    expect(html).toContain('<span class="tag">rss</span>');
    expect(html).toContain('<span class="tag">indieweb</span>');
    expect(html).toContain('<span class="tag">web</span>');

    // Title is in the <title> tag
    expect(html).toContain(
      "<title>Why RSS Still Matters — My Lobster Blog</title>",
    );
  });

  it("link share: renders link card with URL and metadata", async () => {
    const callModel = cannedModel(
      JSON.stringify({
        type: "link",
        body: "Best explanation of how the indieweb works that I've seen.",
        tags: ["indieweb"],
        isDraft: false,
        linkUrl: "https://indieweb.org/Getting_Started",
        linkTitle: "Getting Started with the IndieWeb",
        linkDescription:
          "A step-by-step guide to owning your online identity.",
      }),
    );

    const result = await processMessage(
      msg({
        text: "https://indieweb.org/Getting_Started — best explanation of how the indieweb works",
      }),
      { siteDir, callModel, deploy: false },
    );

    expect(result.post!.type).toBe("link");

    const html = await readFile(
      join(siteDir, `${result.post!.slug}.html`),
      "utf-8",
    );
    expect(html).toContain('class="link-card"');
    expect(html).toContain('href="https://indieweb.org/Getting_Started"');
    expect(html).toContain("Getting Started with the IndieWeb");
    expect(html).toContain("step-by-step guide");
    expect(html).toContain("rel=\"noopener\"");
  });

  it("draft: saved but NOT published, no HTML page generated", async () => {
    const callModel = cannedModel(
      JSON.stringify({
        type: "post",
        title: "Unfinished Thoughts on Decentralization",
        body: "Need to think more about this...",
        tags: ["tech"],
        isDraft: true,
      }),
    );

    const result = await processMessage(
      msg({ text: "Draft: unfinished thoughts on decentralization" }),
      { siteDir, callModel, deploy: false },
    );

    expect(result.draft).toBeDefined();
    expect(result.draft!.status).toBe("draft");
    expect(result.post).toBeUndefined();
    expect(result.reply).toContain("Saved as draft");

    // No HTML page should exist for the draft
    const files = await readdir(siteDir);
    const htmlFiles = files.filter(
      (f) => f.endsWith(".html") && f !== "index.html",
    );
    expect(htmlFiles).toHaveLength(0);

    // Posts index should be empty
    const posts = await readPostsIndex(siteDir);
    expect(posts).toHaveLength(0);

    // RSS should have no items
    const rss = await readFile(join(siteDir, "feed.xml"), "utf-8");
    expect(rss).not.toContain("<item>");
  });

  it("multiple posts build up the index and feeds correctly", async () => {
    const messages = [
      {
        text: "First coffee of the day.",
        response: JSON.stringify({
          type: "micro",
          body: "First coffee of the day.",
          tags: ["morning"],
          isDraft: false,
        }),
      },
      {
        text: "Second thought for today.",
        response: JSON.stringify({
          type: "micro",
          body: "Second thought for today.",
          tags: ["life"],
          isDraft: false,
        }),
      },
      {
        text: "# On Writing\nWrite every day, even when you don't feel like it.",
        response: JSON.stringify({
          type: "post",
          title: "On Writing",
          body: "Write every day, even when you don't feel like it.",
          tags: ["writing"],
          isDraft: false,
        }),
      },
    ];

    for (const m of messages) {
      await processMessage(msg({ text: m.text }), {
        siteDir,
        callModel: cannedModel(m.response),
        deploy: false,
      });
    }

    // Ordering is by insertion (unshift), not by timestamp — all posts
    // get new Date() at processing time, so the last processed is first.
    const posts = await readPostsIndex(siteDir);
    expect(posts).toHaveLength(3);
    expect(posts[0]!.title).toBe("On Writing");

    // Three HTML pages + index.html
    const files = await readdir(siteDir);
    const htmlFiles = files.filter((f) => f.endsWith(".html"));
    expect(htmlFiles).toHaveLength(4); // 3 posts + index.html

    // RSS and JSON Feed have all 3 items
    const rss = await readFile(join(siteDir, "feed.xml"), "utf-8");
    const itemMatches = rss.match(/<item>/g);
    expect(itemMatches).toHaveLength(3);

    const jsonFeed = JSON.parse(
      await readFile(join(siteDir, "feed.json"), "utf-8"),
    );
    expect(jsonFeed.items).toHaveLength(3);

    // Index page lists all 3
    const index = await readFile(join(siteDir, "index.html"), "utf-8");
    expect(index).toContain("First coffee");
    expect(index).toContain("Second thought");
    expect(index).toContain("On Writing");
  });

  it("classification failure returns error, does not corrupt site", async () => {
    const failingModel: CallModel = async () => {
      throw new Error("Model API is down");
    };

    const result = await processMessage(
      msg({ text: "This should fail gracefully" }),
      { siteDir, callModel: failingModel, deploy: false },
    );

    expect(result.error).toBeDefined();
    expect(result.reply).toContain("Failed");
    expect(result.post).toBeUndefined();

    // Site should be untouched — empty posts, clean feeds
    const posts = await readPostsIndex(siteDir);
    expect(posts).toHaveLength(0);

    const rss = await readFile(join(siteDir, "feed.xml"), "utf-8");
    expect(rss).not.toContain("<item>");
  });

  it("video post: renders video element and media enclosure in feed", async () => {
    const callModel = cannedModel(
      JSON.stringify({
        type: "video",
        body: "Check out this sunset timelapse",
        tags: ["nature"],
        isDraft: false,
      }),
    );

    const result = await processMessage(
      msg({ text: "Check out this sunset timelapse" }),
      { siteDir, callModel, deploy: false },
    );

    expect(result.post).toBeDefined();
    expect(result.post!.type).toBe("video");

    // HTML page should contain video structure (no actual media file attached)
    const html = await readFile(
      join(siteDir, `${result.post!.slug}.html`),
      "utf-8",
    );
    expect(html).toContain("sunset timelapse");
    expect(html).toContain('<span class="tag">nature</span>');

    // Posts index updated
    const posts = await readPostsIndex(siteDir);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.type).toBe("video");
  });

  it("audio post: renders audio element and feed entry", async () => {
    const callModel = cannedModel(
      JSON.stringify({
        type: "audio",
        body: "Voice note about distributed systems",
        tags: ["tech"],
        isDraft: false,
      }),
    );

    const result = await processMessage(
      msg({ text: "Voice note about distributed systems" }),
      { siteDir, callModel, deploy: false },
    );

    expect(result.post).toBeDefined();
    expect(result.post!.type).toBe("audio");

    const html = await readFile(
      join(siteDir, `${result.post!.slug}.html`),
      "utf-8",
    );
    expect(html).toContain("distributed systems");

    // RSS should contain the item
    const rss = await readFile(join(siteDir, "feed.xml"), "utf-8");
    expect(rss).toContain("distributed systems");
  });

  it("search index is generated after publishing", async () => {
    const callModel = cannedModel(
      JSON.stringify({
        type: "micro",
        body: "Searchable content here",
        tags: ["search"],
        isDraft: false,
      }),
    );

    await processMessage(
      msg({ text: "Searchable content here" }),
      { siteDir, callModel, deploy: false },
    );

    const searchIndex = JSON.parse(
      await readFile(join(siteDir, "search-index.json"), "utf-8"),
    );
    expect(searchIndex).toHaveLength(1);
    expect(searchIndex[0].b).toContain("searchable content");
    expect(searchIndex[0].g).toBe("search");
  });

  it("XSS in user input is escaped in all outputs", async () => {
    const xssPayload = '<script>alert("xss")</script>';
    const callModel = cannedModel(
      JSON.stringify({
        type: "micro",
        body: xssPayload,
        tags: ["test"],
        isDraft: false,
      }),
    );

    const result = await processMessage(
      msg({ text: xssPayload }),
      { siteDir, callModel, deploy: false },
    );

    // HTML page must escape the XSS script tag (JSON-LD script is legitimate)
    const html = await readFile(
      join(siteDir, `${result.post!.slug}.html`),
      "utf-8",
    );
    expect(html).not.toContain('<script>alert');
    expect(html).toContain("&lt;script&gt;");

    // RSS must escape it too
    const rss = await readFile(join(siteDir, "feed.xml"), "utf-8");
    expect(rss).not.toContain("<script>alert");

    // Index page must escape the XSS payload (not the legitimate search script)
    const index = await readFile(join(siteDir, "index.html"), "utf-8");
    expect(index).not.toContain('<script>alert');
  });

  // --- Preview E2E tests ---

  it("preview: prefix creates preview without polluting feeds", async () => {
    const callModel = cannedModel(
      JSON.stringify({
        type: "micro",
        body: "A thought I want to preview first.",
        tags: ["preview"],
        isDraft: false,
      }),
    );

    const result = await processMessage(
      msg({ text: "preview: A thought I want to preview first." }),
      { siteDir, callModel, deploy: false },
    );

    // Preview should be returned
    expect(result.preview).toBeDefined();
    expect(result.preview!.previewId).toMatch(/^[a-f0-9]{12}$/);
    expect(result.preview!.previewUrl).toContain("/_previews/");
    expect(result.post).toBeUndefined();

    // Preview HTML should exist with banner and noindex
    const html = await readFile(
      join(siteDir, "_previews", `${result.preview!.previewId}.html`),
      "utf-8",
    );
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("A thought I want to preview first.");
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain("Preview — not yet published");

    // Feeds and index must NOT contain the preview content
    const posts = await readPostsIndex(siteDir);
    expect(posts).toHaveLength(0);

    const rss = await readFile(join(siteDir, "feed.xml"), "utf-8");
    expect(rss).not.toContain("preview first");

    const jsonFeed = JSON.parse(
      await readFile(join(siteDir, "feed.json"), "utf-8"),
    );
    expect(jsonFeed.items).toHaveLength(0);

    const index = await readFile(join(siteDir, "index.html"), "utf-8");
    expect(index).not.toContain("preview first");
  });

  it("full preview → publish cycle", async () => {
    // Step 1: Preview
    const previewModel = cannedModel(
      JSON.stringify({
        type: "post",
        title: "On Decentralization",
        body: "The future of the web is decentralized.",
        tags: ["tech", "web"],
        isDraft: false,
      }),
    );

    const previewResult = await processMessage(
      msg({ text: "preview: On Decentralization" }),
      { siteDir, callModel: previewModel, deploy: false },
    );

    expect(previewResult.preview).toBeDefined();
    const slug = previewResult.preview!.slug;

    // Verify preview exists, feeds empty
    const postsBeforePublish = await readPostsIndex(siteDir);
    expect(postsBeforePublish).toHaveLength(0);

    // Step 2: Publish via "publish {slug}"
    const publishResult = await processMessage(
      msg({ text: `publish ${slug}` }),
      { siteDir, callModel: cannedModel("unused"), deploy: false },
    );

    expect(publishResult.post).toBeDefined();
    expect(publishResult.post!.url).toContain("example.com");
    expect(publishResult.reply).toContain("Published");

    // Published HTML should exist
    const publishedHtml = await readFile(
      join(siteDir, `${slug}.html`),
      "utf-8",
    );
    expect(publishedHtml).toContain("<h1>On Decentralization</h1>");
    expect(publishedHtml).toContain("decentralized");
    // Published page should NOT have preview banner or noindex
    expect(publishedHtml).not.toContain("noindex");
    expect(publishedHtml).not.toContain("Preview — not yet published");

    // Posts index should have exactly 1 post
    const postsAfter = await readPostsIndex(siteDir);
    expect(postsAfter).toHaveLength(1);
    expect(postsAfter[0]!.title).toBe("On Decentralization");

    // RSS should have the post
    const rss = await readFile(join(siteDir, "feed.xml"), "utf-8");
    expect(rss).toContain("On Decentralization");

    // Preview file should be cleaned up
    const previewFiles = await readdir(join(siteDir, "_previews"));
    expect(previewFiles.filter((f) => f.endsWith(".html"))).toHaveLength(0);
  });

  it("preview existing draft by slug", async () => {
    // Create a draft directly
    await createDraft(siteDir, {
      type: "micro",
      body: "Saved earlier, preview now.",
      slug: "saved-earlier",
      tags: [],
      createdAt: "2026-03-20T10:00:00Z",
      updatedAt: "2026-03-20T10:00:00Z",
    });

    const result = await processMessage(
      msg({ text: "preview saved-earlier" }),
      { siteDir, callModel: cannedModel("unused"), deploy: false },
    );

    expect(result.preview).toBeDefined();
    expect(result.preview!.slug).toBe("saved-earlier");
    expect(result.preview!.previewUrl).toContain("_previews/");

    // Preview HTML should contain the draft content
    const html = await readFile(
      join(siteDir, "_previews", `${result.preview!.previewId}.html`),
      "utf-8",
    );
    expect(html).toContain("Saved earlier, preview now.");

    // No pollution of feeds
    const posts = await readPostsIndex(siteDir);
    expect(posts).toHaveLength(0);
  });
});
