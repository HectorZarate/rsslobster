import { describe, it, expect } from "vitest";
import { generateFaviconSvg, faviconDataUri, faviconLinkTags, generateOgImageSvg, renderOgImagePng } from "./favicon.js";

describe("generateFaviconSvg", () => {
  it("generates valid SVG", () => {
    const svg = generateFaviconSvg("My Blog");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("uses first character of title", () => {
    const svg = generateFaviconSvg("Computational Substrate");
    expect(svg).toContain(">C</text>");
  });

  it("uses accent color from preset as background", () => {
    const svg = generateFaviconSvg("Test", "terminal");
    // Terminal accent is #00CCCC
    expect(svg).toContain("#00CCCC");
  });

  it("uses background color from preset as text fill", () => {
    const svg = generateFaviconSvg("Test", "terminal");
    // Terminal background is #0D0D0D
    expect(svg).toContain("#0D0D0D");
  });

  it("handles emoji in title", () => {
    const svg = generateFaviconSvg("🦞 Lobster Blog");
    expect(svg).toContain("🦞");
  });

  it("escapes XML special characters", () => {
    const svg = generateFaviconSvg("<script>");
    expect(svg).toContain("&lt;");
    expect(svg).not.toContain("<script>");
  });

  it("falls back to ? for empty title", () => {
    const svg = generateFaviconSvg("");
    expect(svg).toContain(">?</text>");
  });

  it("respects style overrides", () => {
    const svg = generateFaviconSvg("Test", "minimal", { colorAccent: "#FF0000" });
    expect(svg).toContain("#FF0000");
  });
});

describe("faviconDataUri", () => {
  it("produces a data URI", () => {
    const svg = generateFaviconSvg("T");
    const uri = faviconDataUri(svg);
    expect(uri).toMatch(/^data:image\/svg\+xml,/);
  });
});

describe("faviconLinkTags", () => {
  it("includes rel=icon link tags", () => {
    const svg = generateFaviconSvg("T");
    const tags = faviconLinkTags(svg);
    expect(tags).toContain('rel="icon"');
    expect(tags).toContain("image/svg+xml");
  });

  it("includes inline data URI", () => {
    const svg = generateFaviconSvg("T");
    const tags = faviconLinkTags(svg);
    expect(tags).toContain("data:image/svg+xml,");
  });

  it("includes reference to favicon.svg file", () => {
    const svg = generateFaviconSvg("T");
    const tags = faviconLinkTags(svg);
    expect(tags).toContain("/favicon.svg");
  });
});

describe("generateOgImageSvg", () => {
  it("generates valid SVG with 1200x630 viewBox", () => {
    const svg = generateOgImageSvg("My Blog", "A personal blog");
    expect(svg).toContain("<svg");
    expect(svg).toContain('viewBox="0 0 1200 630"');
  });

  it("includes the site title", () => {
    const svg = generateOgImageSvg("Computational Substrate", "desc");
    expect(svg).toContain("Computational Substrate");
  });

  it("includes the description", () => {
    const svg = generateOgImageSvg("Title", "Hector Zarate's blog");
    expect(svg).toContain("Hector Zarate");
  });

  it("uses preset colors", () => {
    const svg = generateOgImageSvg("T", "d", "terminal");
    // Terminal accent is #00CCCC
    expect(svg).toContain("#00CCCC");
  });

  it("escapes special characters", () => {
    const svg = generateOgImageSvg("<script>", "desc");
    expect(svg).toContain("&lt;");
  });
});

describe("renderOgImagePng", () => {
  it("returns a PNG buffer", async () => {
    const png = await renderOgImagePng("Test", "A blog");
    expect(png).toBeInstanceOf(Buffer);
    // PNG magic bytes
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50); // P
    expect(png[2]).toBe(0x4e); // N
    expect(png[3]).toBe(0x47); // G
  });

  it("produces a 1200x630 image", async () => {
    const sharp = (await import("sharp")).default;
    const png = await renderOgImagePng("Test", "A blog");
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });
});

describe("writeFavicon on a fresh checkout", () => {
  it("creates the output directory instead of failing with ENOENT", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { outputDir } = await import("../config/paths.js");
    const { writeFavicon } = await import("./favicon.js");
    const site = await mkdtemp(join(tmpdir(), "rsslobster-favicon-"));
    try {
      expect(existsSync(outputDir(site))).toBe(false);
      await writeFavicon(site, "ziscus");
      expect(existsSync(join(outputDir(site), "favicon.svg"))).toBe(true);
      expect(existsSync(join(outputDir(site), "icon.png"))).toBe(true);
    } finally {
      await rm(site, { recursive: true, force: true });
    }
  });
});
