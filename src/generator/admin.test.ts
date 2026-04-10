import { describe, it, expect } from "vitest";
import { generateAdminPage } from "./admin.js";
import type { Post, SiteConfig } from "../config/types.js";
import type { LobsterConfig } from "../config/lobster.js";

const CONFIG: SiteConfig = {
  domain: "example.com",
  title: "Test Site",
  description: "A test site",
  author: "Tester",
  language: "en",
  style: { preset: "terminal" },
  repo: "git@github.com:user/site.git",
};

const LOBSTER: LobsterConfig = {};

const LOBSTER_WITH_X: LobsterConfig = {
  twitter: {
    apiKey: "key",
    apiKeySecret: "secret",
    accessToken: "token",
    accessTokenSecret: "tsecret",
  },
};

const POSTS: Post[] = [
  {
    type: "micro",
    body: "Hello world from the test suite",
    slug: "hello-world",
    tags: ["test"],
    createdAt: "2026-04-01T12:00:00.000Z",
    updatedAt: "2026-04-01T12:00:00.000Z",
    url: "https://example.com/posts/hello-world/index.html",
    publishedAt: "2026-04-01T12:00:00.000Z",
  },
  {
    type: "image",
    body: "A nice sunset",
    slug: "sunset",
    tags: ["photo"],
    images: [{ src: "/images/sunset-1.jpg", alt: "sunset" }],
    createdAt: "2026-03-30T10:00:00.000Z",
    updatedAt: "2026-03-30T10:00:00.000Z",
    url: "https://example.com/posts/sunset/index.html",
    publishedAt: "2026-03-30T10:00:00.000Z",
  },
];

describe("generateAdminPage", () => {
  describe("HTML structure", () => {
    it("produces valid HTML5 document", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain('<html lang="en">');
      expect(html).toContain("<head>");
      expect(html).toContain("</head>");
      expect(html).toContain("<body>");
      expect(html).toContain("</body>");
    });

    it("sets title to RSS Lobster Admin (not Admin Dashboard)", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      expect(html).toContain("<title>RSS Lobster Admin</title>");
      expect(html).not.toContain("Admin Dashboard");
    });

    it("includes viewport meta for mobile", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      expect(html).toContain('name="viewport"');
    });

    it("includes noindex meta to keep admin out of search", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      expect(html).toContain("noindex");
    });
  });

  describe("compose form", () => {
    it("renders a form with POST method", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      expect(html).toContain("<form");
      expect(html).toContain('method="POST"');
    });

    it("form action points to /lobster-admin/publish", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      expect(html).toContain('action="/lobster-admin/publish"');
    });

    it("has a textarea for body with name='body'", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      expect(html).toContain('name="body"');
      expect(html).toContain("<textarea");
    });

    it("has a file input for images", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      expect(html).toContain('type="file"');
      expect(html).toContain('accept="image/*"');
      expect(html).toContain('name="image"');
    });

    it("has a submit button", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      expect(html).toContain('type="submit"');
    });

    it("has a checkbox for publishing to site/RSS", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      expect(html).toContain('name="target_site"');
      expect(html).toContain('type="checkbox"');
    });

    it("has a checkbox for publishing to X when twitter is configured", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER_WITH_X);
      expect(html).toContain('name="target_x"');
    });

    it("does NOT show X checkbox when twitter is not configured", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      expect(html).not.toContain('name="target_x"');
    });

    it("textarea has maxlength=280 for micro posts", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      expect(html).toContain('maxlength="280"');
    });
  });

  describe("recent posts", () => {
    it("shows recent posts when posts exist", () => {
      const html = generateAdminPage(POSTS, CONFIG, LOBSTER);
      expect(html).toContain("Hello world from the test suite");
      expect(html).toContain("A nice sunset");
    });

    it("shows empty state when no posts", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      expect(html).toContain("No posts yet");
    });

    it("shows post type badge", () => {
      const html = generateAdminPage(POSTS, CONFIG, LOBSTER);
      expect(html).toContain("micro");
      expect(html).toContain("image");
    });

    it("shows post date", () => {
      const html = generateAdminPage(POSTS, CONFIG, LOBSTER);
      expect(html).toContain("2026-04-01");
    });

    it("links to the published post", () => {
      const html = generateAdminPage(POSTS, CONFIG, LOBSTER);
      expect(html).toContain('href="https://example.com/posts/hello-world/index.html"');
    });

    it("shows image thumbnail for image posts", () => {
      const html = generateAdminPage(POSTS, CONFIG, LOBSTER);
      expect(html).toContain('src="/images/sunset-1.jpg"');
    });
  });

  describe("collision avoidance with ziscus", () => {
    it("uses lb- prefixed CSS classes", () => {
      const html = generateAdminPage(POSTS, CONFIG, LOBSTER);
      expect(html).toContain("lb-");
      // Must NOT use bare ziscus class names
      expect(html).not.toMatch(/class="settings"/);
      expect(html).not.toMatch(/class="setting"/);
      expect(html).not.toMatch(/class="stats"/);
      expect(html).not.toMatch(/class="stat"/);
      expect(html).not.toMatch(/class="stat-value"/);
      expect(html).not.toMatch(/class="stat-label"/);
      expect(html).not.toMatch(/class="comment-body"/);
      expect(html).not.toMatch(/class="actions"/);
    });

    it("does not use /admin/ URL path", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      expect(html).not.toContain('"/admin/');
    });
  });

  describe("styling", () => {
    it("inherits site style preset", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      // terminal preset uses monospace and amber colors
      expect(html).toContain("<style>");
    });

    it("includes admin-specific styles", () => {
      const html = generateAdminPage([], CONFIG, LOBSTER);
      expect(html).toContain(".lb-compose");
      expect(html).toContain(".lb-posts");
    });
  });
});
