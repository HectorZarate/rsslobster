import { describe, it, expect } from "vitest";
import { commentStyles } from "./styles.js";

describe("commentStyles", () => {
  it("returns a non-empty CSS string", () => {
    const css = commentStyles();
    expect(typeof css).toBe("string");
    expect(css.length).toBeGreaterThan(0);
  });

  it("styles the comments section", () => {
    const css = commentStyles();
    expect(css).toContain("#comments");
  });

  it("styles individual comments", () => {
    const css = commentStyles();
    expect(css).toContain(".comment");
  });

  it("styles the comment form", () => {
    const css = commentStyles();
    expect(css).toContain(".comment-form");
  });

  it("uses CSS custom properties from the design system", () => {
    const css = commentStyles();
    // Should reference the existing preset CSS variables rather than hardcoding colors
    expect(css).toMatch(/var\(--color-/);
  });

});
