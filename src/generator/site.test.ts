import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClassifiedContent, SiteConfig } from "../config/types.js";
import {
  scaffoldSite,
  readSiteConfig,
  addContent,
  readPostsIndex,
} from "./site.js";

let siteDir: string;

const CONFIG: SiteConfig = {
  domain: "test.example.com",
  title: "Test Site",
  description: "A test rsslobster site",
  author: "Tester",
  language: "en",
  style: { preset: "minimal" },
  repo: "git@github.com:user/site.git",
};

const MICRO: ClassifiedContent = {
  type: "micro",
  body: "Hello from the test suite!",
  slug: "hello-test",
  tags: ["test"],
  createdAt: "2026-03-20T12:00:00.000Z",
  updatedAt: "2026-03-20T12:00:00.000Z",
};

const POST: ClassifiedContent = {
  type: "post",
  title: "Test Blog Post",
  body: "A longer form blog post for testing.",
  slug: "test-blog-post",
  tags: ["blog"],
  createdAt: "2026-03-20T13:00:00.000Z",
  updatedAt: "2026-03-20T13:00:00.000Z",
};

beforeEach(async () => {
  siteDir = await mkdtemp(join(tmpdir(), "rsslobster-site-"));
});

afterEach(async () => {
  await rm(siteDir, { recursive: true, force: true });
});

describe("scaffoldSite", () => {
  it("creates rsslobster.json config file", async () => {
    await scaffoldSite(siteDir, CONFIG);
    const config = await readSiteConfig(siteDir);
    expect(config.domain).toBe("test.example.com");
    expect(config.title).toBe("Test Site");
  });

  it("creates posts.json index", async () => {
    await scaffoldSite(siteDir, CONFIG);
    const posts = await readPostsIndex(siteDir);
    expect(posts).toEqual([]);
  });

  it("creates images directory", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await expect(access(join(siteDir, "images"))).resolves.toBeUndefined();
  });

  it("creates drafts directory", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await expect(access(join(siteDir, "drafts"))).resolves.toBeUndefined();
  });

  it("generates initial index.html", async () => {
    await scaffoldSite(siteDir, CONFIG);
    const html = await readFile(join(siteDir, "index.html"), "utf-8");
    expect(html).toContain("Test Site");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("generates favicon.svg", async () => {
    await scaffoldSite(siteDir, CONFIG);
    const svg = await readFile(join(siteDir, "favicon.svg"), "utf-8");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    // Uses first character of site title
    expect(svg).toContain(">T</text>");
  });

  it("includes favicon in generated index.html", async () => {
    await scaffoldSite(siteDir, CONFIG);
    const html = await readFile(join(siteDir, "index.html"), "utf-8");
    expect(html).toContain("data:image/svg+xml,");
    expect(html).toContain('href="/favicon.svg"');
  });

  it("generates initial feed.xml", async () => {
    await scaffoldSite(siteDir, CONFIG);
    const rss = await readFile(join(siteDir, "feed.xml"), "utf-8");
    expect(rss).toContain("<rss");
    expect(rss).toContain("Test Site");
  });

  it("generates initial feed.json", async () => {
    await scaffoldSite(siteDir, CONFIG);
    const raw = await readFile(join(siteDir, "feed.json"), "utf-8");
    const feed = JSON.parse(raw);
    expect(feed.version).toContain("jsonfeed.org");
    expect(feed.title).toBe("Test Site");
  });
});

describe("addContent", () => {
  it("creates HTML page for content", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, MICRO);

    const html = await readFile(join(siteDir, "posts", "hello-test", "index.html"), "utf-8");
    expect(html).toContain("Hello from the test suite!");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("adds post to posts index", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, MICRO);

    const posts = await readPostsIndex(siteDir);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.slug).toBe("hello-test");
    expect(posts[0]!.url).toBe("https://test.example.com/posts/hello-test/index.html");
  });

  it("prepends new posts (newest first)", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, MICRO);
    await addContent(siteDir, POST);

    const posts = await readPostsIndex(siteDir);
    expect(posts).toHaveLength(2);
    expect(posts[0]!.slug).toBe("test-blog-post"); // newer
    expect(posts[1]!.slug).toBe("hello-test"); // older
  });

  it("rebuilds feeds after adding content", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, MICRO);

    const rss = await readFile(join(siteDir, "feed.xml"), "utf-8");
    expect(rss).toContain("hello-test");

    const json = await readFile(join(siteDir, "feed.json"), "utf-8");
    const feed = JSON.parse(json);
    expect(feed.items).toHaveLength(1);
  });

  it("rebuilds index page after adding content", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, MICRO);

    const html = await readFile(join(siteDir, "index.html"), "utf-8");
    expect(html).toContain("/posts/hello-test/index.html");
  });

  it("returns a Post with publishedAt and url", async () => {
    await scaffoldSite(siteDir, CONFIG);
    const post = await addContent(siteDir, MICRO);

    expect(post.publishedAt).toBeTruthy();
    expect(post.url).toBe("https://test.example.com/posts/hello-test/index.html");
  });
});

describe("rebuildFeeds", () => {
  it("limits feed to 20 most recent items", async () => {
    await scaffoldSite(siteDir, CONFIG);

    // Add 25 posts
    for (let i = 0; i < 25; i++) {
      await addContent(siteDir, {
        ...MICRO,
        slug: `post-${i}`,
        body: `Post number ${i}`,
      });
    }

    const raw = await readFile(join(siteDir, "feed.json"), "utf-8");
    const feed = JSON.parse(raw);
    expect(feed.items).toHaveLength(20);
  });
});
