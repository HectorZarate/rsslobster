import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClassifiedContent, SiteConfig } from "../config/types.js";
import {
  scaffoldSite,
  readSiteConfig,
  addContent,
  deletePost,
  readPostsIndex,
  rebuildFeeds,
  rebuildIndex,
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

  it("locks permalink pattern in config", async () => {
    await scaffoldSite(siteDir, CONFIG);
    const config = await readSiteConfig(siteDir);
    expect(config.permalink).toBe("/posts/:slug/index.html");
  });

  it("creates posts.json index", async () => {
    await scaffoldSite(siteDir, CONFIG);
    const posts = await readPostsIndex(siteDir);
    expect(posts).toEqual([]);
  });

  it("creates images directory", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await expect(access(join(siteDir, "_site", "images"))).resolves.toBeUndefined();
  });

  it("creates drafts directory", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await expect(access(join(siteDir, "drafts"))).resolves.toBeUndefined();
  });

  it("generates initial index.html", async () => {
    await scaffoldSite(siteDir, CONFIG);
    const html = await readFile(join(siteDir, "_site", "index.html"), "utf-8");
    expect(html).toContain("Test Site");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("generates favicon.svg", async () => {
    await scaffoldSite(siteDir, CONFIG);
    const svg = await readFile(join(siteDir, "_site", "favicon.svg"), "utf-8");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    // Uses first character of site title
    expect(svg).toContain(">T</text>");
  });

  it("includes favicon in generated index.html", async () => {
    await scaffoldSite(siteDir, CONFIG);
    const html = await readFile(join(siteDir, "_site", "index.html"), "utf-8");
    expect(html).toContain("data:image/svg+xml,");
    expect(html).toContain('href="/favicon.svg"');
  });

  it("does NOT generate empty feed.xml on scaffold (zero posts)", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await expect(
      access(join(siteDir, "_site", "feed.xml")),
    ).rejects.toThrow();
  });

  it("does NOT generate empty feed.json on scaffold (zero posts)", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await expect(
      access(join(siteDir, "_site", "feed.json")),
    ).rejects.toThrow();
  });
});

describe("addContent", () => {
  it("creates HTML page for content", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, MICRO);

    const html = await readFile(join(siteDir, "_site", "posts", "hello-test", "index.html"), "utf-8");
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

    const rss = await readFile(join(siteDir, "_site", "feed.xml"), "utf-8");
    expect(rss).toContain("hello-test");

    const json = await readFile(join(siteDir, "_site", "feed.json"), "utf-8");
    const feed = JSON.parse(json);
    expect(feed.items).toHaveLength(1);
  });

  it("rebuilds index page after adding content", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, MICRO);

    const html = await readFile(join(siteDir, "_site", "index.html"), "utf-8");
    expect(html).toContain("/posts/hello-test/index.html");
  });

  it("returns a Post with publishedAt and url", async () => {
    await scaffoldSite(siteDir, CONFIG);
    const post = await addContent(siteDir, MICRO);

    expect(post.publishedAt).toBeTruthy();
    expect(post.url).toBe("https://test.example.com/posts/hello-test/index.html");
  });
});

describe("deletePost", () => {
  it("removes post from posts.json", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, MICRO);
    await addContent(siteDir, POST);

    const deleted = await deletePost(siteDir, "hello-test");
    expect(deleted).not.toBeNull();
    expect(deleted!.slug).toBe("hello-test");

    const posts = await readPostsIndex(siteDir);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.slug).toBe("test-blog-post");
  });

  it("deletes the generated HTML file", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, MICRO);

    // Verify HTML exists before delete
    const htmlPath = join(siteDir, "_site", "posts", "hello-test", "index.html");
    await expect(access(htmlPath)).resolves.toBeUndefined();

    await deletePost(siteDir, "hello-test");

    // HTML should be gone
    await expect(access(htmlPath)).rejects.toThrow();
  });

  it("rebuilds feeds without the deleted post", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, MICRO);
    await addContent(siteDir, POST);

    await deletePost(siteDir, "hello-test");

    const raw = await readFile(join(siteDir, "_site", "feed.json"), "utf-8");
    const feed = JSON.parse(raw);
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].title).toBe("Test Blog Post");
  });

  it("rebuilds search index without the deleted post", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, MICRO);
    await addContent(siteDir, POST);

    await deletePost(siteDir, "hello-test");

    const raw = await readFile(join(siteDir, "_site", "search-index.json"), "utf-8");
    const index = JSON.parse(raw);
    expect(index).toHaveLength(1);
    expect(index[0].s).toBe("test-blog-post");
  });

  it("returns null for nonexistent slug", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, MICRO);

    const result = await deletePost(siteDir, "nonexistent");
    expect(result).toBeNull();

    // Posts unchanged
    const posts = await readPostsIndex(siteDir);
    expect(posts).toHaveLength(1);
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

    const raw = await readFile(join(siteDir, "_site", "feed.json"), "utf-8");
    const feed = JSON.parse(raw);
    expect(feed.items).toHaveLength(20);
  });
});

describe("noRss flag", () => {
  it("excludes noRss posts from RSS feed", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, MICRO);
    await addContent(siteDir, {
      ...POST,
      slug: "hidden-post",
      noRss: true,
    });

    const raw = await readFile(join(siteDir, "_site", "feed.xml"), "utf-8");
    expect(raw).toContain("hello-test");
    expect(raw).not.toContain("hidden-post");
  });

  it("excludes noRss posts from JSON feed", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, MICRO);
    await addContent(siteDir, {
      ...POST,
      slug: "hidden-post",
      noRss: true,
    });

    const raw = await readFile(join(siteDir, "_site", "feed.json"), "utf-8");
    const feed = JSON.parse(raw);
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].url).toContain("hello-test");
  });

  it("excludes noRss posts from index page", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, MICRO);
    await addContent(siteDir, {
      ...POST,
      slug: "hidden-post",
      noRss: true,
    });

    const html = await readFile(join(siteDir, "_site", "index.html"), "utf-8");
    expect(html).toContain("hello-test");
    expect(html).not.toContain("hidden-post");
  });

  it("still generates HTML page for noRss posts", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, {
      ...POST,
      slug: "hidden-post",
      noRss: true,
    });

    const html = await readFile(
      join(siteDir, "_site", "posts", "hidden-post", "index.html"),
      "utf-8",
    );
    expect(html).toContain("Test Blog Post");
  });

  it("still includes noRss posts in posts.json", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, {
      ...POST,
      slug: "hidden-post",
      noRss: true,
    });

    const posts = await readPostsIndex(siteDir);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.slug).toBe("hidden-post");
  });
});

// Static-landing pages: rsslobster sites with no posts (e.g. resume / portfolio
// homepages) should not ship empty post-archive infrastructure on every regen.
describe("static-landing behavior (zero posts)", () => {
  async function fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  describe("rebuildFeeds with empty posts", () => {
    it("does not write feed.xml when posts is empty", async () => {
      await scaffoldSite(siteDir, CONFIG);
      // Pre-clear in case scaffold seeds an empty feed
      await rm(join(siteDir, "_site", "feed.xml"), { force: true });
      await rm(join(siteDir, "_site", "feed.json"), { force: true });

      await rebuildFeeds(siteDir, CONFIG, []);

      expect(await fileExists(join(siteDir, "_site", "feed.xml"))).toBe(false);
    });

    it("does not write feed.json when posts is empty", async () => {
      await scaffoldSite(siteDir, CONFIG);
      await rm(join(siteDir, "_site", "feed.xml"), { force: true });
      await rm(join(siteDir, "_site", "feed.json"), { force: true });

      await rebuildFeeds(siteDir, CONFIG, []);

      expect(await fileExists(join(siteDir, "_site", "feed.json"))).toBe(false);
    });

    it("still writes feed.xml when posts is non-empty (preserves existing behavior)", async () => {
      await scaffoldSite(siteDir, CONFIG);
      await addContent(siteDir, MICRO);
      // addContent already triggers rebuildFeeds, so feed.xml exists.
      expect(await fileExists(join(siteDir, "_site", "feed.xml"))).toBe(true);
    });
  });

  describe("rebuildIndex with empty posts and homepage", () => {
    const CONFIG_WITH_HOMEPAGE: SiteConfig = {
      ...CONFIG,
      homepage: "home",
      pages: [
        {
          title: "Home",
          slug: "home",
          body: "Welcome",
          layout: "raw",
        },
      ],
    };

    it("does not write _site/posts/index.html when posts=[] and config.homepage is set", async () => {
      await scaffoldSite(siteDir, CONFIG_WITH_HOMEPAGE);
      // Clear any seeded archive
      await rm(join(siteDir, "_site", "posts", "index.html"), { force: true });

      await rebuildIndex(siteDir, CONFIG_WITH_HOMEPAGE, []);

      expect(
        await fileExists(join(siteDir, "_site", "posts", "index.html")),
      ).toBe(false);
    });

    it("still writes posts/index.html when posts is non-empty and homepage is set", async () => {
      await scaffoldSite(siteDir, CONFIG_WITH_HOMEPAGE);
      await addContent(siteDir, MICRO);

      expect(
        await fileExists(join(siteDir, "_site", "posts", "index.html")),
      ).toBe(true);
    });

    it("still writes root index.html when posts=[] and no homepage (preserves current behavior)", async () => {
      await scaffoldSite(siteDir, CONFIG);
      // Clear seeded index from scaffold
      await rm(join(siteDir, "_site", "index.html"), { force: true });

      await rebuildIndex(siteDir, CONFIG, []);

      expect(await fileExists(join(siteDir, "_site", "index.html"))).toBe(true);
    });
  });
});
