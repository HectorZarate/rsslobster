import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveStyle } from "../styles/presets.js";
import type { StylePreset, StyleOverrides } from "../config/types.js";
import { outputDir } from "../config/paths.js";

/**
 * Generate an inline SVG favicon based on the site title's first character
 * and the preset's accent color. Zero external requests.
 */
export function generateFaviconSvg(
  title: string,
  preset?: StylePreset,
  overrides?: StyleOverrides,
): string {
  const resolved = resolveStyle(preset, overrides);
  const char = extractInitial(title);
  const bg = resolved.colorAccent;
  const fg = resolved.colorBackground;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`,
    `<rect width="64" height="64" rx="12" fill="${bg}"/>`,
    `<text x="32" y="44" font-family="system-ui,sans-serif" font-size="36" font-weight="700" fill="${fg}" text-anchor="middle">${escXml(char)}</text>`,
    `</svg>`,
  ].join("");
}

/** Generate the data URI for inline use in HTML */
export function faviconDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** HTML link tags for favicon — inline SVG + basic ico fallback */
export function faviconLinkTags(svg: string): string {
  const uri = faviconDataUri(svg);
  return `<link rel="icon" type="image/svg+xml" href="${uri}">\n  <link rel="icon" href="/favicon.svg" type="image/svg+xml">`;
}

/** Write the favicon.svg file to the site directory */
export async function writeFavicon(
  siteDir: string,
  title: string,
  preset?: StylePreset,
  overrides?: StyleOverrides,
): Promise<string> {
  const svg = generateFaviconSvg(title, preset, overrides);
  await writeFile(join(outputDir(siteDir), "favicon.svg"), svg);
  return svg;
}

/**
 * Generate an OG image SVG (1200x630) with the site title and description.
 * Used as og:image for social sharing previews.
 */
export function generateOgImageSvg(
  title: string,
  description: string,
  preset?: StylePreset,
  overrides?: StyleOverrides,
): string {
  const resolved = resolveStyle(preset, overrides);
  const bg = resolved.colorAccent;
  const fg = resolved.colorBackground;
  const muted = resolved.colorMuted;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">`,
    `<rect width="1200" height="630" fill="${bg}"/>`,
    `<text x="80" y="300" font-family="system-ui,sans-serif" font-size="72" font-weight="700" fill="${fg}">${escXml(title)}</text>`,
    `<text x="80" y="380" font-family="system-ui,sans-serif" font-size="32" fill="${muted}">${escXml(description)}</text>`,
    `</svg>`,
  ].join("");
}

/** Render an OG image SVG to PNG using sharp */
export async function renderOgImagePng(
  title: string,
  description: string,
  preset?: StylePreset,
  overrides?: StyleOverrides,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const svg = generateOgImageSvg(title, description, preset, overrides);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Write the OG image as PNG to the site output directory */
export async function writeOgImage(
  siteDir: string,
  title: string,
  description: string,
  preset?: StylePreset,
  overrides?: StyleOverrides,
): Promise<void> {
  const png = await renderOgImagePng(title, description, preset, overrides);
  await writeFile(join(outputDir(siteDir), "og-image.png"), png);
}

/** Extract the first visible character (supports emoji) from a title */
function extractInitial(title: string): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const { segment } of segmenter.segment(title.trim())) {
    if (segment.trim()) return segment;
  }
  return "?";
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
