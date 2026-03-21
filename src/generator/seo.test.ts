import { describe, it, expect } from "vitest";
import { generateSitemap, generateRobotsTxt } from "./seo.js";
import type { Post, SiteConfig } from "../config/types.js";

const CONFIG: SiteConfig = {
  domain: "example.com",
  title: "Test Blog",
  description: "A test blog",
  author: "Test Author",
  language: "en",
  style: { preset: "minimal" },
  repo: "",
};

function makePost(slug: string, updatedAt: string): Post {
  return {
    type: "post",
    body: `Content of ${slug}`,
    slug,
    tags: [],
    createdAt: updatedAt,
    updatedAt,
    url: `https://example.com/${slug}.html`,
    publishedAt: updatedAt,
  };
}

describe("generateSitemap", () => {
  it("includes index page", () => {
    const sitemap = generateSitemap(CONFIG, []);
    expect(sitemap).toContain("https://example.com/");
    expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });

  it("includes all posts", () => {
    const posts = [
      makePost("hello-world", "2026-03-20T10:00:00Z"),
      makePost("second-post", "2026-03-21T10:00:00Z"),
    ];
    const sitemap = generateSitemap(CONFIG, posts);
    expect(sitemap).toContain("https://example.com/hello-world.html");
    expect(sitemap).toContain("https://example.com/second-post.html");
  });

  it("includes static pages", () => {
    const configWithPages = {
      ...CONFIG,
      pages: [{ title: "About", slug: "about", body: "About me", navOrder: 1 }],
    };
    const sitemap = generateSitemap(configWithPages, []);
    expect(sitemap).toContain("https://example.com/about.html");
  });

  it("includes archive when >30 posts", () => {
    const posts = Array.from({ length: 31 }, (_, i) =>
      makePost(`post-${i}`, "2026-03-20T10:00:00Z"),
    );
    const sitemap = generateSitemap(CONFIG, posts);
    expect(sitemap).toContain("archive.html");
  });

  it("omits archive when <=30 posts", () => {
    const sitemap = generateSitemap(CONFIG, [makePost("one", "2026-03-20T10:00:00Z")]);
    expect(sitemap).not.toContain("archive.html");
  });
});

describe("generateRobotsTxt", () => {
  it("allows all crawlers and blocks previews", () => {
    const robots = generateRobotsTxt(CONFIG);
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Disallow: /_previews/");
    expect(robots).toContain("Sitemap: https://example.com/sitemap.xml");
  });
});
