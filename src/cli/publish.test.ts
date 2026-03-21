import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldSite, readPostsIndex } from "../generator/site.js";
import { buildPublishContent } from "./publish.js";
import type { SiteConfig } from "../config/types.js";

const SITE_CONFIG: SiteConfig = {
  domain: "example.com",
  title: "Test Blog",
  description: "A test blog",
  author: "Tester",
  language: "en",
  style: { preset: "minimal" },
  repo: "",
};

describe("buildPublishContent", () => {
  it("creates a micro post from text and type", () => {
    const content = buildPublishContent({
      type: "micro",
      text: "The coffee in Lisbon is incredible.",
    });

    expect(content.type).toBe("micro");
    expect(content.body).toBe("The coffee in Lisbon is incredible.");
    expect(content.slug).toBe("the-coffee-in-lisbon-is-incredible");
    expect(content.tags).toEqual([]);
    expect(content.title).toBeUndefined();
  });

  it("creates a post with title", () => {
    const content = buildPublishContent({
      type: "post",
      text: "In 2025, owning your content matters more than ever.",
      title: "Why RSS Still Matters",
    });

    expect(content.type).toBe("post");
    expect(content.title).toBe("Why RSS Still Matters");
    expect(content.body).toBe(
      "In 2025, owning your content matters more than ever.",
    );
    expect(content.slug).toBe("why-rss-still-matters");
  });

  it("uses custom slug when provided", () => {
    const content = buildPublishContent({
      type: "micro",
      text: "Hello world",
      slug: "my-custom-slug",
    });

    expect(content.slug).toBe("my-custom-slug");
  });

  it("parses comma-separated tags", () => {
    const content = buildPublishContent({
      type: "post",
      text: "Some content",
      title: "Tagged Post",
      tags: "rust,indieweb,rss",
    });

    expect(content.tags).toEqual(["rust", "indieweb", "rss"]);
  });

  it("trims whitespace from tags", () => {
    const content = buildPublishContent({
      type: "micro",
      text: "Hello",
      tags: " rust , indieweb , rss ",
    });

    expect(content.tags).toEqual(["rust", "indieweb", "rss"]);
  });

  it("enforces max 3 tags", () => {
    const content = buildPublishContent({
      type: "micro",
      text: "Hello",
      tags: "a,b,c,d,e",
    });

    expect(content.tags).toHaveLength(3);
    expect(content.tags).toEqual(["a", "b", "c"]);
  });

  it("creates a link post with URL", () => {
    const content = buildPublishContent({
      type: "link",
      text: "Best thing I read this week",
      linkUrl: "https://example.com/great-article",
    });

    expect(content.type).toBe("link");
    expect(content.linkUrl).toBe("https://example.com/great-article");
    expect(content.body).toBe("Best thing I read this week");
  });

  it("sets createdAt and updatedAt to ISO timestamps", () => {
    const before = new Date().toISOString();
    const content = buildPublishContent({
      type: "micro",
      text: "Hello",
    });
    const after = new Date().toISOString();

    expect(content.createdAt >= before).toBe(true);
    expect(content.updatedAt <= after).toBe(true);
  });

  it("rejects invalid content type", () => {
    expect(() =>
      buildPublishContent({
        type: "video" as "micro",
        text: "Hello",
      }),
    ).toThrow("Invalid content type");
  });

  it("rejects empty text", () => {
    expect(() =>
      buildPublishContent({
        type: "micro",
        text: "",
      }),
    ).toThrow("Text is required");
  });
});

describe("publish command integration", () => {
  let siteDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-publish-"));
    await scaffoldSite(siteDir, SITE_CONFIG);
  });

  it("publishes a micro post to the site", async () => {
    const content = buildPublishContent({
      type: "micro",
      text: "The coffee in Lisbon is incredible.",
    });

    const { addContent } = await import("../generator/site.js");
    const post = await addContent(siteDir, content);

    expect(post.url).toBe(
      "https://example.com/the-coffee-in-lisbon-is-incredible.html",
    );

    // Verify HTML was written
    const html = await readFile(
      join(siteDir, "the-coffee-in-lisbon-is-incredible.html"),
      "utf-8",
    );
    expect(html).toContain("The coffee in Lisbon is incredible.");
    expect(html).toContain("<!DOCTYPE html>");

    // Verify posts index was updated
    const posts = await readPostsIndex(siteDir);
    expect(posts).toHaveLength(1);
    expect(posts[0].type).toBe("micro");
  });

  it("publishes a post with title and tags", async () => {
    const content = buildPublishContent({
      type: "post",
      text: "RSS is the backbone of the open web.",
      title: "Why RSS Matters",
      tags: "rss,indieweb",
    });

    const { addContent } = await import("../generator/site.js");
    const post = await addContent(siteDir, content);

    expect(post.url).toBe("https://example.com/why-rss-matters.html");

    const html = await readFile(
      join(siteDir, "why-rss-matters.html"),
      "utf-8",
    );
    expect(html).toContain("Why RSS Matters");
    expect(html).toContain("rss");
    expect(html).toContain("indieweb");
  });

  it("publishes a link post", async () => {
    const content = buildPublishContent({
      type: "link",
      text: "Great article on IndieWeb",
      linkUrl: "https://indieweb.org/why",
    });

    const { addContent } = await import("../generator/site.js");
    await addContent(siteDir, content);

    const html = await readFile(
      join(siteDir, "great-article-on-indieweb.html"),
      "utf-8",
    );
    expect(html).toContain("https://indieweb.org/why");
  });

  it("updates feeds after publishing", async () => {
    const content = buildPublishContent({
      type: "micro",
      text: "Feed test post",
    });

    const { addContent } = await import("../generator/site.js");
    await addContent(siteDir, content);

    const rss = await readFile(join(siteDir, "feed.xml"), "utf-8");
    expect(rss).toContain("Feed test post");

    const jsonFeed = await readFile(join(siteDir, "feed.json"), "utf-8");
    const parsed = JSON.parse(jsonFeed);
    expect(parsed.items).toHaveLength(1);
  });
});
