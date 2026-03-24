import { describe, it, expect } from "vitest";
import { expandPermalink, permalinkDir } from "./permalink.js";
import type { ClassifiedContent } from "./types.js";

const CONTENT: ClassifiedContent = {
  type: "post",
  title: "My Test Post",
  body: "Some content",
  slug: "my-test-post",
  tags: ["test"],
  createdAt: "2026-03-15T10:30:00Z",
  updatedAt: "2026-03-15T10:30:00Z",
};

describe("expandPermalink", () => {
  it("defaults to /posts/:slug/index.html", () => {
    expect(expandPermalink(undefined, CONTENT)).toBe("/posts/my-test-post/index.html");
  });

  it("expands :slug", () => {
    expect(expandPermalink("/:slug.html", CONTENT)).toBe("/my-test-post.html");
  });

  it("expands :year/:month/:slug", () => {
    expect(expandPermalink("/:year/:month/:slug.html", CONTENT)).toBe(
      "/2026/03/my-test-post.html",
    );
  });

  it("expands :day", () => {
    expect(expandPermalink("/:year/:month/:day/:slug.html", CONTENT)).toBe(
      "/2026/03/15/my-test-post.html",
    );
  });

  it("expands :type", () => {
    expect(expandPermalink("/:type/:slug.html", CONTENT)).toBe(
      "/post/my-test-post.html",
    );
  });

  it("zero-pads month and day", () => {
    const content = {
      ...CONTENT,
      createdAt: "2026-01-05T10:00:00Z",
    };
    expect(expandPermalink("/:year/:month/:day/:slug.html", content)).toBe(
      "/2026/01/05/my-test-post.html",
    );
  });
});

describe("permalinkDir", () => {
  it("returns empty for flat permalink", () => {
    expect(permalinkDir("/my-post.html")).toBe("");
  });

  it("returns directory path for nested permalink", () => {
    expect(permalinkDir("/2026/03/my-post.html")).toBe("2026/03");
  });

  it("returns full nested path", () => {
    expect(permalinkDir("/2026/03/15/my-post.html")).toBe("2026/03/15");
  });
});
