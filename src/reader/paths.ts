import { join } from "node:path";
import { mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const READER_DIR = "reader";
const FEEDS_DIR = "feeds";

export function readerDir(siteDir: string): string {
  return join(siteDir, READER_DIR);
}

export async function ensureReaderDir(siteDir: string): Promise<void> {
  await mkdir(readerDir(siteDir), { recursive: true });
}

/** Content-addressable hash: SHA-256 of title|content, truncated to 16 hex chars. */
export function contentHash(title: string, content: string): string {
  return createHash("sha256")
    .update(title + "|" + content)
    .digest("hex")
    .slice(0, 16);
}

// ---------------------------------------------------------------------------
// Per-feed directory layout
// ---------------------------------------------------------------------------

/** Root directory for all per-feed storage */
export function feedsDir(siteDir: string): string {
  return join(readerDir(siteDir), FEEDS_DIR);
}

/** Directory for a specific feed's items */
export function feedDir(siteDir: string, slug: string): string {
  return join(feedsDir(siteDir), slug);
}

/** Ensure a feed's directory exists */
export async function ensureFeedDir(siteDir: string, slug: string): Promise<void> {
  await mkdir(feedDir(siteDir, slug), { recursive: true });
}

/** Items file for a specific feed */
export function feedItemsPath(siteDir: string, slug: string): string {
  return join(feedDir(siteDir, slug), "items.json");
}

/** Metadata file for a specific feed */
export function feedMetaPath(siteDir: string, slug: string): string {
  return join(feedDir(siteDir, slug), "meta.json");
}

/**
 * Generate a filesystem-safe, human-readable slug from a feed URL.
 * Format: {hostname-without-www}-{6-char-hash}
 * Example: "simonwillison-net-a3b4c5"
 */
export function feedSlug(feedUrl: string): string {
  let base: string;
  try {
    const url = new URL(feedUrl);
    base = url.hostname
      .replace(/^www\./, "")
      .replace(/\./g, "-");
  } catch {
    base = "unknown";
  }
  const hash = createHash("sha256").update(feedUrl).digest("hex").slice(0, 6);
  return `${base}-${hash}`;
}

/** List all feed slugs that have directories in reader/feeds/ */
export async function listFeedSlugs(siteDir: string): Promise<string[]> {
  try {
    const entries = await readdir(feedsDir(siteDir), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}
