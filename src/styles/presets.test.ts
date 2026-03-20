import { describe, it, expect } from "vitest";
import {
  PRESETS,
  resolveStyle,
  styleToCssVars,
  generateStylesheet,
} from "./presets.js";

describe("PRESETS", () => {
  it("has all four presets defined", () => {
    expect(Object.keys(PRESETS)).toEqual([
      "minimal",
      "brutalist",
      "magazine",
      "terminal",
    ]);
  });

  it.each(Object.keys(PRESETS) as Array<keyof typeof PRESETS>)(
    "%s preset has all required style properties",
    (preset) => {
      const style = PRESETS[preset];
      expect(style.fontFamily).toBeTruthy();
      expect(style.fontSize).toBeTruthy();
      expect(style.lineHeight).toBeTruthy();
      expect(style.maxWidth).toBeTruthy();
      expect(style.colorText).toBeTruthy();
      expect(style.colorBackground).toBeTruthy();
      expect(style.colorAccent).toBeTruthy();
      expect(style.colorMuted).toBeTruthy();
      expect(style.borderRadius).toBeDefined();
    },
  );

  // UX: readable line lengths (max-width between 480-800px)
  it.each(Object.keys(PRESETS) as Array<keyof typeof PRESETS>)(
    "%s has max-width within readable range (480-800px)",
    (preset) => {
      const width = parseInt(PRESETS[preset].maxWidth ?? "0", 10);
      expect(width).toBeGreaterThanOrEqual(480);
      expect(width).toBeLessThanOrEqual(800);
    },
  );

  // UX: line-height between 1.4-1.8 for body text readability
  it.each(Object.keys(PRESETS) as Array<keyof typeof PRESETS>)(
    "%s has line-height within readable range (1.4-1.8)",
    (preset) => {
      const lh = parseFloat(PRESETS[preset].lineHeight ?? "0");
      expect(lh).toBeGreaterThanOrEqual(1.4);
      expect(lh).toBeLessThanOrEqual(1.8);
    },
  );

  // UX: font size >= 15px for readability
  it.each(Object.keys(PRESETS) as Array<keyof typeof PRESETS>)(
    "%s has font-size >= 15px",
    (preset) => {
      const size = parseInt(PRESETS[preset].fontSize ?? "0", 10);
      expect(size).toBeGreaterThanOrEqual(15);
    },
  );
});

describe("resolveStyle", () => {
  it("defaults to minimal preset when no preset specified", () => {
    const resolved = resolveStyle();
    expect(resolved.fontFamily).toBe(PRESETS.minimal.fontFamily);
    expect(resolved.colorText).toBe(PRESETS.minimal.colorText);
  });

  it("uses specified preset", () => {
    const resolved = resolveStyle("terminal");
    expect(resolved.colorText).toBe(PRESETS.terminal.colorText);
    expect(resolved.colorBackground).toBe(PRESETS.terminal.colorBackground);
  });

  it("overrides take precedence over preset", () => {
    const resolved = resolveStyle("minimal", { colorAccent: "#ff00ff" });
    expect(resolved.colorAccent).toBe("#ff00ff");
    // Other values still from preset
    expect(resolved.colorText).toBe(PRESETS.minimal.colorText);
  });

  it("returns customCss empty string by default", () => {
    const resolved = resolveStyle("minimal");
    expect(resolved.customCss).toBe("");
  });

  it("passes through customCss from overrides", () => {
    const resolved = resolveStyle("minimal", {
      customCss: ".special { color: red; }",
    });
    expect(resolved.customCss).toBe(".special { color: red; }");
  });
});

describe("styleToCssVars", () => {
  it("generates valid CSS custom properties", () => {
    const resolved = resolveStyle("minimal");
    const css = styleToCssVars(resolved);

    expect(css).toContain(":root {");
    expect(css).toContain("--font-family:");
    expect(css).toContain("--font-size:");
    expect(css).toContain("--line-height:");
    expect(css).toContain("--max-width:");
    expect(css).toContain("--color-text:");
    expect(css).toContain("--color-bg:");
    expect(css).toContain("--color-accent:");
    expect(css).toContain("--color-muted:");
    expect(css).toContain("--border-radius:");
  });

  it("uses values from the resolved style", () => {
    const resolved = resolveStyle("terminal");
    const css = styleToCssVars(resolved);

    expect(css).toContain("#00ff00"); // terminal text color
    expect(css).toContain("#0a0a0a"); // terminal bg
  });
});

describe("generateStylesheet", () => {
  it("includes CSS custom properties", () => {
    const resolved = resolveStyle("minimal");
    const css = generateStylesheet(resolved);
    expect(css).toContain(":root {");
  });

  // UX: reset for consistent cross-browser rendering
  it("includes CSS reset", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain("box-sizing: border-box");
  });

  // UX: accessible skip link
  it("includes skip link styles", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain(".skip-link");
  });

  // UX: responsive images
  it("includes responsive image styles", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain("img");
    expect(css).toContain("max-width: 100%");
  });

  // UX: touch target minimum size (WCAG 2.5.8)
  it("includes 44px minimum touch targets", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain("min-height: 44px");
  });

  // UX: focus indicators for keyboard navigation
  it("includes focus-visible styles", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain("focus-visible");
  });

  // UX: reduced motion support (WCAG 2.3.3)
  it("includes prefers-reduced-motion media query", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain("prefers-reduced-motion");
  });

  // UX: mobile responsive breakpoint
  it("includes mobile breakpoint", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain("@media (max-width: 480px)");
  });

  // UX: scroll snap for carousels
  it("includes carousel with scroll-snap", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain("scroll-snap-type");
  });

  it("appends customCss at the end", () => {
    const resolved = resolveStyle("minimal", {
      customCss: ".custom { display: none; }",
    });
    const css = generateStylesheet(resolved);
    expect(css).toContain(".custom { display: none; }");
    // Custom CSS should be at the end
    const lastRoot = css.lastIndexOf(":root");
    const customPos = css.indexOf(".custom");
    expect(customPos).toBeGreaterThan(lastRoot);
  });
});
