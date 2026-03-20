import { describe, it, expect } from "vitest";
import { extractStylesFromHtml } from "./inherit.js";

describe("extractStylesFromHtml", () => {
  it("extracts CSS custom properties from :root", () => {
    const html = `
      <style>
        :root {
          --font-family: Inter, sans-serif;
          --font-size: 18px;
          --line-height: 1.6;
          --max-width: 700px;
          --color-text: #222;
          --color-bg: #fff;
          --color-accent: #0055aa;
        }
      </style>
    `;
    const result = extractStylesFromHtml(html);

    expect(result.fontFamily).toBe("Inter, sans-serif");
    expect(result.fontSize).toBe("18px");
    expect(result.lineHeight).toBe("1.6");
    expect(result.maxWidth).toBe("700px");
    expect(result.colorText).toBe("#222");
    expect(result.colorBackground).toBe("#fff");
    expect(result.colorAccent).toBe("#0055aa");
  });

  it("extracts from body style block", () => {
    const html = `
      <style>
        body {
          font-family: Georgia, serif;
          font-size: 20px;
          line-height: 1.7;
          max-width: 600px;
          color: #333;
          background-color: #fafafa;
        }
      </style>
    `;
    const result = extractStylesFromHtml(html);

    expect(result.fontFamily).toBe("Georgia, serif");
    expect(result.fontSize).toBe("20px");
    expect(result.lineHeight).toBe("1.7");
    expect(result.maxWidth).toBe("600px");
    expect(result.colorText).toBe("#333");
    expect(result.colorBackground).toBe("#fafafa");
  });

  it("prefers CSS custom properties over body styles", () => {
    const html = `
      <style>
        :root { --font-size: 16px; }
        body { font-size: 20px; }
      </style>
    `;
    const result = extractStylesFromHtml(html);
    expect(result.fontSize).toBe("16px");
  });

  it("returns empty object for HTML with no styles", () => {
    const result = extractStylesFromHtml("<html><body>Hello</body></html>");
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("handles alternate CSS variable naming conventions", () => {
    const html = `
      <style>
        :root {
          --primary-color: #ff0000;
          --background-color: #000;
          --text-color: #eee;
        }
      </style>
    `;
    const result = extractStylesFromHtml(html);
    expect(result.colorAccent).toBe("#ff0000");
    expect(result.colorBackground).toBe("#000");
    expect(result.colorText).toBe("#eee");
  });

  it("strips undefined keys from result", () => {
    const html = `<style>:root { --font-size: 14px; }</style>`;
    const result = extractStylesFromHtml(html);
    expect(result.fontSize).toBe("14px");
    // Keys that weren't found should not exist (not be undefined)
    expect("fontFamily" in result).toBe(false);
  });
});
