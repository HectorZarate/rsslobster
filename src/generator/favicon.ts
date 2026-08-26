import { mkdir, writeFile } from "node:fs/promises";
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

/** HTML link tags for favicon, apple-touch-icon, and theme-color */
export function faviconLinkTags(svg: string, preset?: StylePreset, overrides?: StyleOverrides): string {
  const uri = faviconDataUri(svg);
  const resolved = resolveStyle(preset, overrides);
  return [
    `<link rel="icon" type="image/svg+xml" href="${uri}">`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="apple-touch-icon" href="/icon.png">`,
    `<meta name="theme-color" content="${resolved.colorBackground}">`,
  ].join("\n  ");
}

/** Write favicon.svg and icon.png (for RSS readers) to the site output directory */
export async function writeFavicon(
  siteDir: string,
  title: string,
  preset?: StylePreset,
  overrides?: StyleOverrides,
): Promise<string> {
  const svg = generateFaviconSvg(title, preset, overrides);
  const outDir = outputDir(siteDir);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "favicon.svg"), svg);

  const sharp = (await import("sharp")).default;
  const svgBuf = Buffer.from(svg);

  // 512x512 PNG for apple-touch-icon and general use
  const png512 = await sharp(svgBuf).resize(512, 512).png().toBuffer();
  await writeFile(join(outDir, "icon.png"), png512);

  // 32x32 PNG as favicon.ico fallback (RSS readers and legacy browsers check this)
  const png32 = await sharp(svgBuf).resize(32, 32).png().toBuffer();
  await writeFile(join(outDir, "favicon.ico"), png32);

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
