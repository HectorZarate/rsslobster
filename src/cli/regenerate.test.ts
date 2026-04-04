import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldSite, addContent } from "../generator/site.js";
import { regenerateSite, regenerateCommand } from "./regenerate.js";
import type { SiteConfig, ClassifiedContent } from "../config/types.js";

const SITE_CONFIG: SiteConfig = {
  domain: "example.com",
  title: "Test Blog",
  description: "A test blog",
  author: "Tester",
  language: "en",
  style: { preset: "minimal" },
  repo: "",
};

const MICRO: ClassifiedContent = {
  type: "micro",
  body: "Hello from the test suite",
  slug: "hello-test",
  tags: ["test"],
  createdAt: "2025-03-15T10:00:00Z",
  updatedAt: "2025-03-15T10:00:00Z",
};

const POST: ClassifiedContent = {
  type: "post",
  title: "Why RSS Matters",
  body: "RSS is the backbone of the open web.",
  slug: "why-rss-matters",
  tags: ["rss", "indieweb"],
  createdAt: "2025-03-14T08:00:00Z",
  updatedAt: "2025-03-14T08:00:00Z",
};

describe("regenerateSite", () => {
  let siteDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-regen-"));
  });

  it("is a function", () => {
    expect(typeof regenerateSite).toBe("function");
  });

  it("throws on missing rsslobster.json", async () => {
    await expect(regenerateSite(siteDir)).rejects.toThrow();
  });

  it("handles site with zero posts", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await regenerateSite(siteDir);
    const html = await readFile(join(siteDir, "_site", "index.html"), "utf-8");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Test Blog");
  });

  it("regenerates index.html from existing posts", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);
    await addContent(siteDir, POST);

    // Corrupt index.html
    await writeFile(join(siteDir, "_site", "index.html"), "CORRUPTED");

    await regenerateSite(siteDir);

    const html = await readFile(join(siteDir, "_site", "index.html"), "utf-8");
    expect(html).toContain("Hello from the test suite");
    expect(html).toContain("Why RSS Matters");
    expect(html).not.toBe("CORRUPTED");
  });

  it("regenerates individual post HTML pages", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);

    // Corrupt the post file
    await writeFile(join(siteDir, "_site", "posts", "hello-test", "index.html"), "CORRUPTED");

    await regenerateSite(siteDir);

    const html = await readFile(join(siteDir, "_site", "posts", "hello-test", "index.html"), "utf-8");
    expect(html).toContain("Hello from the test suite");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("regenerates feed.xml", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);

    await writeFile(join(siteDir, "_site", "feed.xml"), "CORRUPTED");
    await regenerateSite(siteDir);

    const rss = await readFile(join(siteDir, "_site", "feed.xml"), "utf-8");
    expect(rss).toContain("<rss");
    expect(rss).toContain("Hello from the test suite");
  });

  it("regenerates feed.json", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);

    await writeFile(join(siteDir, "_site", "feed.json"), "CORRUPTED");
    await regenerateSite(siteDir);

    const json = await readFile(join(siteDir, "_site", "feed.json"), "utf-8");
    const parsed = JSON.parse(json);
    expect(parsed.items).toHaveLength(1);
  });

  it("regenerates search-index.json", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);

    await writeFile(join(siteDir, "_site", "search-index.json"), "CORRUPTED");
    await regenerateSite(siteDir);

    const raw = await readFile(join(siteDir, "_site", "search-index.json"), "utf-8");
    const index = JSON.parse(raw);
    expect(index).toHaveLength(1);
    expect(index[0].s).toBe("hello-test");
  });

  it("regenerates sitemap.xml", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);

    await writeFile(join(siteDir, "_site", "sitemap.xml"), "CORRUPTED");
    await regenerateSite(siteDir);

    const sitemap = await readFile(join(siteDir, "_site", "sitemap.xml"), "utf-8");
    expect(sitemap).toContain("<urlset");
  });

  it("uses current style preset for regenerated pages", async () => {
    const terminalConfig = { ...SITE_CONFIG, style: { preset: "terminal" as const } };
    await scaffoldSite(siteDir, terminalConfig);
    await addContent(siteDir, MICRO);

    await regenerateSite(siteDir);

    const html = await readFile(join(siteDir, "_site", "posts", "hello-test", "index.html"), "utf-8");
    // Terminal preset uses amber text color
    expect(html).toContain("#FFB000");
  });

  it("preserves posts.json unchanged", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);

    const postsBefore = await readFile(join(siteDir, "posts.json"), "utf-8");
    await regenerateSite(siteDir);
    const postsAfter = await readFile(join(siteDir, "posts.json"), "utf-8");

    expect(JSON.parse(postsAfter)).toEqual(JSON.parse(postsBefore));
  });

  it("preserves rsslobster.json unchanged", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);

    const configBefore = await readFile(join(siteDir, "rsslobster.json"), "utf-8");
    await regenerateSite(siteDir);
    const configAfter = await readFile(join(siteDir, "rsslobster.json"), "utf-8");

    expect(configAfter).toBe(configBefore);
  });

  it("writes homepage page as index.html, not slug.html", async () => {
    const homepageConfig: SiteConfig = {
      ...SITE_CONFIG,
      homepage: "landing",
      pages: [
        {
          title: "Landing Page",
          slug: "landing",
          body: "<p>Welcome to the landing page</p>",
        },
      ],
    };
    await scaffoldSite(siteDir, homepageConfig);

    // Write a markdown bodyFile to test the full flow
    await writeFile(join(siteDir, "landing.md"), "# Hello from landing\n\nThis is the landing page.");

    // Update config to use bodyFile
    const configWithFile: SiteConfig = {
      ...homepageConfig,
      pages: [
        {
          title: "Landing Page",
          slug: "landing",
          body: "",
          bodyFile: "landing.md",
        },
      ],
    };
    await writeFile(join(siteDir, "rsslobster.json"), JSON.stringify(configWithFile, null, 2));

    await regenerateSite(siteDir);

    // index.html should contain the landing page content
    const indexHtml = await readFile(join(siteDir, "_site", "index.html"), "utf-8");
    expect(indexHtml).toContain("Hello from landing");
    expect(indexHtml).toContain("This is the landing page");

    // landing.html should NOT exist
    const landingExists = await access(join(siteDir, "_site", "landing.html")).then(() => true).catch(() => false);
    expect(landingExists).toBe(false);
  });

  it("moves post listing to /posts/index.html when homepage is set", async () => {
    const homepageConfig: SiteConfig = {
      ...SITE_CONFIG,
      homepage: "landing",
      pages: [
        {
          title: "Landing Page",
          slug: "landing",
          body: "<p>Welcome</p>",
        },
      ],
    };
    await scaffoldSite(siteDir, homepageConfig);
    await addContent(siteDir, MICRO);

    await regenerateSite(siteDir);

    // Post listing should be at /posts/index.html
    const postsHtml = await readFile(join(siteDir, "_site", "posts", "index.html"), "utf-8");
    expect(postsHtml).toContain("Hello from the test suite");
  });
});

describe("regenerateSite with slug filter", () => {
  let siteDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-regen-slug-"));
  });

  it("regenerates only the specified post when slug is provided", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);
    await addContent(siteDir, POST);

    // Corrupt the target post's HTML
    const postPath = join(siteDir, "_site", "posts", "hello-test", "index.html");
    await writeFile(postPath, "CORRUPTED");

    await regenerateSite(siteDir, { slug: "hello-test" });

    const html = await readFile(postPath, "utf-8");
    expect(html).toContain("Hello from the test suite");
    expect(html).not.toBe("CORRUPTED");
  });

  it("does not regenerate other posts when slug is provided", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);
    await addContent(siteDir, POST);

    // Corrupt the OTHER post to prove it's untouched
    const otherPath = join(siteDir, "_site", "posts", "why-rss-matters", "index.html");
    await writeFile(otherPath, "UNTOUCHED");

    await regenerateSite(siteDir, { slug: "hello-test" });

    const html = await readFile(otherPath, "utf-8");
    expect(html).toBe("UNTOUCHED");
  });

  it("still rebuilds feeds when slug is specified", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);

    await writeFile(join(siteDir, "_site", "feed.xml"), "CORRUPTED");
    await regenerateSite(siteDir, { slug: "hello-test" });

    const rss = await readFile(join(siteDir, "_site", "feed.xml"), "utf-8");
    expect(rss).toContain("hello-test");
  });

  it("throws for nonexistent slug", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);

    await expect(
      regenerateSite(siteDir, { slug: "nonexistent" }),
    ).rejects.toThrow();
  });
});

describe("regenerateSite with comments", () => {
  let siteDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-regen-comments-"));
  });

  it("includes comment form when commentsEndpoint is configured", async () => {
    const configWithComments: SiteConfig = {
      ...SITE_CONFIG,
      commentsEndpoint: "https://comments.example.com",
    };
    await scaffoldSite(siteDir, configWithComments);
    await addContent(siteDir, MICRO);

    await regenerateSite(siteDir);

    const html = await readFile(
      join(siteDir, "_site", "posts", "hello-test", "index.html"),
      "utf-8",
    );
    expect(html).toContain('<section id="comments"');
    expect(html).toContain("<form");
    expect(html).toContain("https://comments.example.com/submit");
  });

  it("does not include comments section without commentsEndpoint", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);

    await regenerateSite(siteDir);

    const html = await readFile(
      join(siteDir, "_site", "posts", "hello-test", "index.html"),
      "utf-8",
    );
    expect(html).not.toContain('<section id="comments"');
  });
});

describe("regenerateCommand", () => {
  it("is named regenerate", () => {
    expect(regenerateCommand.name()).toBe("regenerate");
  });

  it("accepts optional site-dir argument", () => {
    const args = regenerateCommand.registeredArguments;
    expect(args.length).toBeGreaterThanOrEqual(1);
  });

  it("accepts optional --slug flag", () => {
    const slugOption = regenerateCommand.options.find(
      (o) => o.long === "--slug",
    );
    expect(slugOption).toBeDefined();
  });
});
