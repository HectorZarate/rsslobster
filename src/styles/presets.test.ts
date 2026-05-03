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
      expect(style.fontFamilyHeading).toBeTruthy();
      expect(style.fontSize).toBeTruthy();
      expect(style.lineHeight).toBeTruthy();
      expect(style.maxWidth).toBeTruthy();
      expect(style.colorText).toBeTruthy();
      expect(style.colorBackground).toBeTruthy();
      expect(style.colorAccent).toBeTruthy();
      expect(style.colorLink).toBeTruthy();
      expect(style.colorVisited).toBeTruthy();
      expect(style.colorMuted).toBeTruthy();
      expect(style.colorBorder).toBeTruthy();
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

  // UX: zero border-radius — retro web uses sharp corners
  it.each(Object.keys(PRESETS) as Array<keyof typeof PRESETS>)(
    "%s has 0px border-radius (retro web, sharp corners)",
    (preset) => {
      expect(PRESETS[preset].borderRadius).toBe("0px");
    },
  );

  // UX: every preset defines visited link color (retro web essential)
  it.each(Object.keys(PRESETS) as Array<keyof typeof PRESETS>)(
    "%s has distinct visited link color",
    (preset) => {
      const style = PRESETS[preset];
      expect(style.colorVisited).toBeTruthy();
      expect(style.colorVisited).not.toBe(style.colorLink);
    },
  );

  // UX: link and visited colors differ from body text
  it.each(Object.keys(PRESETS) as Array<keyof typeof PRESETS>)(
    "%s has link color distinct from body text",
    (preset) => {
      const style = PRESETS[preset];
      expect(style.colorLink).not.toBe(style.colorText);
    },
  );

  // UX: heading font is defined (can differ from body for visual hierarchy)
  it.each(Object.keys(PRESETS) as Array<keyof typeof PRESETS>)(
    "%s has heading font family defined",
    (preset) => {
      expect(PRESETS[preset].fontFamilyHeading).toBeTruthy();
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

  it("resolves new properties: colorLink, colorVisited, colorBorder, fontFamilyHeading", () => {
    const resolved = resolveStyle("minimal");
    expect(resolved.colorLink).toBe(PRESETS.minimal.colorLink);
    expect(resolved.colorVisited).toBe(PRESETS.minimal.colorVisited);
    expect(resolved.colorBorder).toBe(PRESETS.minimal.colorBorder);
    expect(resolved.fontFamilyHeading).toBe(PRESETS.minimal.fontFamilyHeading);
  });
});

describe("styleToCssVars", () => {
  it("generates valid CSS custom properties", () => {
    const resolved = resolveStyle("minimal");
    const css = styleToCssVars(resolved);

    expect(css).toContain(":root {");
    expect(css).toContain("--font-body:");
    expect(css).toContain("--font-heading:");
    expect(css).toContain("--font-size:");
    expect(css).toContain("--line-height:");
    expect(css).toContain("--max-width:");
    expect(css).toContain("--color-text:");
    expect(css).toContain("--color-bg:");
    expect(css).toContain("--color-accent:");
    expect(css).toContain("--color-link:");
    expect(css).toContain("--color-visited:");
    expect(css).toContain("--color-muted:");
    expect(css).toContain("--color-border:");
    expect(css).toContain("--border-radius:");
  });

  it("uses values from the resolved style", () => {
    const resolved = resolveStyle("terminal");
    const css = styleToCssVars(resolved);

    expect(css).toContain("#FFB000"); // terminal amber text
    expect(css).toContain("#0D0D0D"); // terminal dark bg
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
    const lastRoot = css.lastIndexOf(":root");
    const customPos = css.indexOf(".custom");
    expect(customPos).toBeGreaterThan(lastRoot);
  });

  // Retro web: visited link styles
  it("includes visited link styles", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain("a:visited");
    expect(css).toContain("--color-visited");
  });

  // Retro web: horizontal rule styling
  it("includes horizontal rule styles", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain("hr {");
  });

  // Retro web: blockquote with left border
  it("includes blockquote with border-left", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain("blockquote");
    expect(css).toContain("border-left");
  });

  // Retro web: selection colors
  it("includes selection color styling", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain("::selection");
  });

  // Retro web: print stylesheet
  it("includes print media query", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain("@media print");
  });

  // UX: code block styling
  it("includes code and pre styles", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain("code {");
    expect(css).toContain("pre {");
  });

  // UX: header has bottom border for structure
  it("includes header with bottom border", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain("header {");
    expect(css).toContain("border-bottom");
  });

  // UX: text-wrap balance on headings
  it("includes text-wrap balance on headings", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).toContain("text-wrap: balance");
  });

  // UX: zero external dependencies — no framework, no imports
  it("contains no @import rules", () => {
    const css = generateStylesheet(resolveStyle());
    expect(css).not.toContain("@import");
  });

  it("contains no external URLs except in print href display", () => {
    const css = generateStylesheet(resolveStyle());
    // Split on @media print to check only non-print section
    const beforePrint = css.split("@media print")[0] ?? "";
    expect(beforePrint).not.toContain("url(");
    expect(beforePrint).not.toMatch(/https?:\/\//);
  });

  // Static-landing: omit post-only CSS rules on sites with no posts
  describe("hasPosts option", () => {
    it("includes .post-thumb when hasPosts is true (default)", () => {
      const css = generateStylesheet(resolveStyle());
      expect(css).toContain(".post-thumb");
    });

    it("includes .post-nav when hasPosts is true (default)", () => {
      const css = generateStylesheet(resolveStyle());
      expect(css).toContain(".post-nav");
    });

    it("omits .post-thumb when hasPosts is false", () => {
      const css = generateStylesheet(resolveStyle(), { hasPosts: false });
      expect(css).not.toContain(".post-thumb");
    });

    it("omits .post-nav rules when hasPosts is false", () => {
      const css = generateStylesheet(resolveStyle(), { hasPosts: false });
      expect(css).not.toContain(".post-nav");
      expect(css).not.toContain(".post-nav-prev");
      expect(css).not.toContain(".post-nav-next");
    });

    it("still includes table styles when hasPosts is false (general utility)", () => {
      const css = generateStylesheet(resolveStyle(), { hasPosts: false });
      expect(css).toContain("border-collapse: collapse");
    });

    it("still includes skip-link and reset when hasPosts is false", () => {
      const css = generateStylesheet(resolveStyle(), { hasPosts: false });
      expect(css).toContain(".skip-link");
      expect(css).toContain("box-sizing: border-box");
    });
  });
});
