import { describe, it, expect } from "vitest";
import { generateFaviconSvg, faviconDataUri, faviconLinkTags, generateOgImageSvg } from "./favicon.js";

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
