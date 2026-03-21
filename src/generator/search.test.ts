import { describe, it, expect } from "vitest";
import { buildSearchIndex } from "./search.js";
import type { Post } from "../config/types.js";

function post(overrides: Partial<Post> = {}): Post {
  return {
    type: "micro",
    body: "Default body text for testing purposes",
    slug: "default-slug",
    tags: [],
    createdAt: "2025-03-15T10:00:00Z",
    updatedAt: "2025-03-15T10:00:00Z",
    url: "https://example.com/default-slug.html",
    publishedAt: "2025-03-15T10:00:00Z",
    ...overrides,
  };
}

describe("buildSearchIndex", () => {
  it("returns empty array for no posts", () => {
    expect(buildSearchIndex([])).toEqual([]);
  });

  it("maps slug, title, body preview, and tags", () => {
    const index = buildSearchIndex([
      post({ slug: "hello", title: "Hello World", body: "This is a test post", tags: ["test", "hello"] }),
    ]);
    expect(index).toHaveLength(1);
    expect(index[0].s).toBe("hello");
    expect(index[0].t).toBe("Hello World");
    expect(index[0].b).toBe("this is a test post");
    expect(index[0].g).toBe("test hello");
  });

  it("uses body truncation when no title", () => {
    const longBody = "A".repeat(200);
    const index = buildSearchIndex([post({ body: longBody })]);
    expect(index[0].t.length).toBeLessThanOrEqual(80);
  });

  it("lowercases body for search matching", () => {
    const index = buildSearchIndex([post({ body: "UPPERCASE BODY" })]);
    expect(index[0].b).toBe("uppercase body");
  });

  it("truncates body preview to 200 characters", () => {
    const longBody = "x".repeat(500);
    const index = buildSearchIndex([post({ body: longBody })]);
    expect(index[0].b.length).toBe(200);
  });

  it("handles posts with empty tags", () => {
    const index = buildSearchIndex([post({ tags: [] })]);
    expect(index[0].g).toBe("");
  });

  it("joins multiple tags with space", () => {
    const index = buildSearchIndex([post({ tags: ["a", "b", "c"] })]);
    expect(index[0].g).toBe("a b c");
  });

  it("handles multiple posts", () => {
    const index = buildSearchIndex([
      post({ slug: "first", body: "First post" }),
      post({ slug: "second", body: "Second post" }),
    ]);
    expect(index).toHaveLength(2);
    expect(index[0].s).toBe("first");
    expect(index[1].s).toBe("second");
  });
});
