import { describe, it, expect } from "vitest";
import { buildSearchIndex, SEARCH_HTML, SEARCH_SCRIPT, SEARCH_CSS } from "./search.js";
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
    expect(index[0].t).toBe("hello world");
    expect(index[0].d).toBe("Hello World");
    expect(index[0].b).toBe("this is a test post");
    expect(index[0].g).toBe("test hello");
  });

  it("lowercases title for search matching", () => {
    const index = buildSearchIndex([post({ title: "My UPPERCASE Title" })]);
    expect(index[0].t).toBe("my uppercase title");
  });

  it("preserves original title casing in display field", () => {
    const index = buildSearchIndex([post({ title: "My Title" })]);
    expect(index[0].d).toBe("My Title");
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

describe("SEARCH_HTML", () => {
  it("contains a search input with type=search", () => {
    expect(SEARCH_HTML).toContain('type="search"');
  });

  it("has role=search on form", () => {
    expect(SEARCH_HTML).toContain('role="search"');
  });

  it("has aria-label on input", () => {
    expect(SEARCH_HTML).toContain("aria-label=");
  });

  it("has aria-live=polite on results container", () => {
    expect(SEARCH_HTML).toContain('aria-live="polite"');
  });

  it("contains a form element for progressive enhancement", () => {
    expect(SEARCH_HTML).toContain("<form");
  });
});

describe("SEARCH_SCRIPT", () => {
  it("uses input event for as-you-type search", () => {
    expect(SEARCH_SCRIPT).toContain("'input'");
  });

  it("implements debounce", () => {
    expect(SEARCH_SCRIPT).toMatch(/setTimeout/);
  });

  it("supports Cmd/Ctrl+K keyboard shortcut", () => {
    expect(SEARCH_SCRIPT).toContain("keydown");
    expect(SEARCH_SCRIPT).toMatch(/metaKey|ctrlKey/);
  });

  it("shows result count", () => {
    expect(SEARCH_SCRIPT).toMatch(/result/i);
  });

  it("shows body preview snippet in results", () => {
    expect(SEARCH_SCRIPT).toContain("e.b");
  });

  it("shows tags in results", () => {
    expect(SEARCH_SCRIPT).toContain("e.g");
  });

  it("shows loading state on first fetch", () => {
    expect(SEARCH_SCRIPT).toMatch(/[Ss]earching/);
  });

  it("clears results when input is cleared", () => {
    expect(SEARCH_SCRIPT).toMatch(/innerHTML\s*=\s*['"]['"]|textContent\s*=\s*['"]['""]/);
  });

  it("escapes user input to prevent XSS", () => {
    expect(SEARCH_SCRIPT).toContain("esc(");
  });

  it("stays under 2KB", () => {
    expect(SEARCH_SCRIPT.length).toBeLessThan(2048);
  });

  it("wraps in script tags", () => {
    expect(SEARCH_SCRIPT).toMatch(/^<script>/);
    expect(SEARCH_SCRIPT).toMatch(/<\/script>$/);
  });

  it("does not call toLowerCase in search loop", () => {
    // The search filtering should use pre-lowercased index fields
    // Only the query itself should be lowercased (once)
    const scriptBody = SEARCH_SCRIPT.replace(/\.toLowerCase\(\)/, ""); // allow one for query
    expect(scriptBody).not.toMatch(/\.toLowerCase\(\)/);
  });

  it("uses display title field for rendering results", () => {
    expect(SEARCH_SCRIPT).toContain("e.d");
  });
});

describe("SEARCH_CSS", () => {
  it("is a string", () => {
    expect(typeof SEARCH_CSS).toBe("string");
  });

  it("uses only CSS custom properties (no hardcoded colors)", () => {
    expect(SEARCH_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/);
  });

  it("styles the search form", () => {
    expect(SEARCH_CSS).toContain("#search-form");
  });

  it("styles the search input", () => {
    expect(SEARCH_CSS).toContain("#search-input");
  });

  it("styles results container", () => {
    expect(SEARCH_CSS).toContain("#search-results");
  });

  it("enforces minimum touch target size", () => {
    expect(SEARCH_CSS).toContain("44px");
  });
});
