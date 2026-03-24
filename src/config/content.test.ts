import { describe, it, expect } from "vitest";
import { slugify } from "./content.js";

describe("slugify", () => {
  it("converts text to lowercase kebab-case", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips special characters", () => {
    expect(slugify("What's up?")).toBe("whats-up");
  });

  it("collapses multiple dashes", () => {
    expect(slugify("foo  --  bar")).toBe("foo-bar");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("truncates to maxLen", () => {
    const long = "a ".repeat(50);
    const slug = slugify(long, 20);
    expect(slug.length).toBeLessThanOrEqual(20);
  });

  it("generates a fallback slug for emoji-only content", () => {
    const slug = slugify("🦞");
    expect(slug).toMatch(/^post-[a-z0-9]+$/);
  });

  it("generates a fallback slug for non-ASCII content", () => {
    const slug = slugify("日本語テスト");
    expect(slug).toMatch(/^post-[a-z0-9]+$/);
  });

  it("generates a fallback slug for empty string", () => {
    const slug = slugify("");
    expect(slug).toMatch(/^post-[a-z0-9]+$/);
  });

  it("handles mixed emoji and ASCII", () => {
    const slug = slugify("🦞 lobster time");
    expect(slug).toBe("lobster-time");
  });
});
