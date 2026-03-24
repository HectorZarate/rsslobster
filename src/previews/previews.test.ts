import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldSite } from "../generator/site.js";
import { createDraft } from "../drafts/drafts.js";
import type { ClassifiedContent, SiteConfig } from "../config/types.js";
import {
  createPreview,
  deletePreview,
  promotePreview,
  listActivePreviews,
  cleanExpiredPreviews,
} from "./previews.js";
import { readPostsIndex } from "../generator/site.js";

const SITE_CONFIG: SiteConfig = {
  domain: "test.com",
  title: "Preview Test",
  description: "Testing previews",
  author: "Tester",
  language: "en",
  style: { preset: "minimal" },
  repo: "",
};

const MICRO_CONTENT: ClassifiedContent = {
  type: "micro",
  body: "Coffee in Lisbon is incredible.",
  slug: "coffee-lisbon",
  tags: ["travel"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const POST_CONTENT: ClassifiedContent = {
  type: "post",
  title: "Why RSS Matters",
  body: "In an age of algorithmic feeds...",
  slug: "why-rss-matters",
  tags: ["rss", "web"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("previews", () => {
  let siteDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-preview-"));
    await scaffoldSite(siteDir, SITE_CONFIG);
  });

  afterEach(async () => {
    await rm(siteDir, { recursive: true, force: true });
  });

  describe("createPreview", () => {
    it("creates a draft and generates preview HTML in _previews/", async () => {
      const draft = await createDraft(siteDir, MICRO_CONTENT);
      const updated = await createPreview(siteDir, draft);

      // Draft should have preview metadata
      expect(updated.previewId).toBeDefined();
      expect(updated.previewId).toMatch(/^[a-f0-9]{12}$/);
      expect(updated.previewUrl).toContain("https://test.com/_previews/");
      expect(updated.previewUrl).toContain(".html");
      expect(updated.previewExpiresAt).toBeDefined();

      // HTML file should exist
      const htmlPath = join(siteDir, "_site", "_previews", `${updated.previewId}.html`);
      const html = await readFile(htmlPath, "utf-8");
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Coffee in Lisbon");
    });

    it("preview HTML contains noindex meta and banner", async () => {
      const draft = await createDraft(siteDir, MICRO_CONTENT);
      const updated = await createPreview(siteDir, draft);

      const html = await readFile(
        join(siteDir, "_site", "_previews", `${updated.previewId}.html`),
        "utf-8",
      );
      expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(html).toContain("Preview — not yet published");
      expect(html).toContain("position:fixed");
    });

    it("preview body content matches non-preview body content", async () => {
      const draft = await createDraft(siteDir, POST_CONTENT);
      const updated = await createPreview(siteDir, draft);

      const previewHtml = await readFile(
        join(siteDir, "_site", "_previews", `${updated.previewId}.html`),
        "utf-8",
      );

      // The article content should be identical
      const extractArticle = (html: string) => {
        const start = html.indexOf("<article>");
        const end = html.indexOf("</article>") + "</article>".length;
        return html.slice(start, end);
      };

      // Generate what a normal page would look like
      const { generateHtmlPage } = await import("../generator/html.js");
      const { readSiteConfig } = await import("../generator/site.js");
      const config = await readSiteConfig(siteDir);
      const normalHtml = generateHtmlPage(draft, config);

      expect(extractArticle(previewHtml)).toBe(extractArticle(normalHtml));
    });

    it("does NOT update posts.json, feed.xml, feed.json, or index.html", async () => {
      // Snapshot current state
      const postsBefore = await readFile(join(siteDir, "posts.json"), "utf-8");
      const rssBefore = await readFile(join(siteDir, "_site", "feed.xml"), "utf-8");
      const jsonBefore = await readFile(join(siteDir, "_site", "feed.json"), "utf-8");
      const indexBefore = await readFile(join(siteDir, "_site", "index.html"), "utf-8");

      const draft = await createDraft(siteDir, MICRO_CONTENT);
      await createPreview(siteDir, draft);

      // Nothing should have changed
      expect(await readFile(join(siteDir, "posts.json"), "utf-8")).toBe(postsBefore);
      expect(await readFile(join(siteDir, "_site", "feed.xml"), "utf-8")).toBe(rssBefore);
      expect(await readFile(join(siteDir, "_site", "feed.json"), "utf-8")).toBe(jsonBefore);
      expect(await readFile(join(siteDir, "_site", "index.html"), "utf-8")).toBe(indexBefore);
    });

    it("reuses existing token on re-preview", async () => {
      const draft = await createDraft(siteDir, MICRO_CONTENT);
      const first = await createPreview(siteDir, draft);
      const second = await createPreview(siteDir, first);

      expect(second.previewId).toBe(first.previewId);
      expect(second.previewUrl).toBe(first.previewUrl);
    });

    it("sets expiry ~7 days in the future", async () => {
      const draft = await createDraft(siteDir, MICRO_CONTENT);
      const updated = await createPreview(siteDir, draft);

      const expiresAt = new Date(updated.previewExpiresAt!).getTime();
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      // Allow 10s tolerance
      expect(expiresAt - now).toBeGreaterThan(sevenDays - 10_000);
      expect(expiresAt - now).toBeLessThan(sevenDays + 10_000);
    });
  });

  describe("deletePreview", () => {
    it("removes preview HTML and clears draft metadata", async () => {
      const draft = await createDraft(siteDir, MICRO_CONTENT);
      const withPreview = await createPreview(siteDir, draft);

      const result = await deletePreview(siteDir, withPreview.slug);
      expect(result).toBe(true);

      // HTML file should be gone
      const files = await readdir(join(siteDir, "_site", "_previews"));
      expect(files.filter((f) => f.endsWith(".html"))).toHaveLength(0);

      // Draft should still exist but without preview fields
      const { getDraft } = await import("../drafts/drafts.js");
      const updated = await getDraft(siteDir, withPreview.slug);
      expect(updated).toBeDefined();
      expect(updated!.previewId).toBeUndefined();
      expect(updated!.previewUrl).toBeUndefined();
    });

    it("returns false for draft without preview", async () => {
      const draft = await createDraft(siteDir, MICRO_CONTENT);
      const result = await deletePreview(siteDir, draft.slug);
      expect(result).toBe(false);
    });

    it("returns false for nonexistent draft", async () => {
      const result = await deletePreview(siteDir, "nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("promotePreview", () => {
    it("publishes draft via addContent and cleans up preview file", async () => {
      const draft = await createDraft(siteDir, MICRO_CONTENT);
      const withPreview = await createPreview(siteDir, draft);

      const post = await promotePreview(siteDir, withPreview.slug);

      // Post should be published
      expect(post.url).toContain("https://test.com/");
      expect(post.url).toContain(".html");
      expect(post.publishedAt).toBeDefined();

      // posts.json should have the post
      const posts = await readPostsIndex(siteDir);
      expect(posts).toHaveLength(1);
      expect(posts[0]!.slug).toBe(MICRO_CONTENT.slug);

      // Preview HTML should be gone
      const previewFiles = await readdir(join(siteDir, "_site", "_previews"));
      expect(previewFiles.filter((f) => f.endsWith(".html"))).toHaveLength(0);

      // Published HTML should exist
      const published = await stat(join(siteDir, "_site", "posts", post.slug, "index.html"));
      expect(published.isFile()).toBe(true);

      // RSS should have the post
      const rss = await readFile(join(siteDir, "_site", "feed.xml"), "utf-8");
      expect(rss).toContain("Coffee in Lisbon");
    });

    it("works for drafts without a preview", async () => {
      const draft = await createDraft(siteDir, MICRO_CONTENT);

      const post = await promotePreview(siteDir, draft.slug);
      expect(post.url).toContain("test.com");

      const posts = await readPostsIndex(siteDir);
      expect(posts).toHaveLength(1);
    });

    it("throws for nonexistent draft", async () => {
      await expect(promotePreview(siteDir, "nope")).rejects.toThrow(
        /not found/i,
      );
    });
  });

  describe("listActivePreviews", () => {
    it("returns only drafts with non-expired previews", async () => {
      // Draft with preview
      const d1 = await createDraft(siteDir, MICRO_CONTENT);
      await createPreview(siteDir, d1);

      // Draft without preview
      await createDraft(siteDir, POST_CONTENT);

      const active = await listActivePreviews(siteDir);
      expect(active).toHaveLength(1);
      expect(active[0]!.slug).toBe(MICRO_CONTENT.slug);
    });

    it("excludes expired previews", async () => {
      const draft = await createDraft(siteDir, MICRO_CONTENT);
      const withPreview = await createPreview(siteDir, draft);

      // Manually expire it
      const { updateDraft } = await import("../drafts/drafts.js");
      await updateDraft(siteDir, withPreview.slug, {
        previewExpiresAt: new Date(Date.now() - 1000).toISOString(),
      });

      const active = await listActivePreviews(siteDir);
      expect(active).toHaveLength(0);
    });
  });

  describe("cleanExpiredPreviews", () => {
    it("removes expired previews and keeps active ones", async () => {
      // Create two drafts with previews
      const d1 = await createDraft(siteDir, MICRO_CONTENT);
      const p1 = await createPreview(siteDir, d1);

      const d2 = await createDraft(siteDir, POST_CONTENT);
      const p2 = await createPreview(siteDir, d2);

      // Expire only the first one
      const { updateDraft } = await import("../drafts/drafts.js");
      await updateDraft(siteDir, p1.slug, {
        previewExpiresAt: new Date(Date.now() - 1000).toISOString(),
      });

      const cleaned = await cleanExpiredPreviews(siteDir);
      expect(cleaned).toBe(1);

      // First preview HTML should be gone
      const files = await readdir(join(siteDir, "_site", "_previews"));
      const htmlFiles = files.filter((f) => f.endsWith(".html"));
      expect(htmlFiles).toHaveLength(1);
      expect(htmlFiles[0]).toContain(p2.previewId);
    });

    it("returns 0 when no previews are expired", async () => {
      const draft = await createDraft(siteDir, MICRO_CONTENT);
      await createPreview(siteDir, draft);

      const cleaned = await cleanExpiredPreviews(siteDir);
      expect(cleaned).toBe(0);
    });

    it("returns 0 when no previews exist", async () => {
      const cleaned = await cleanExpiredPreviews(siteDir);
      expect(cleaned).toBe(0);
    });
  });
});
