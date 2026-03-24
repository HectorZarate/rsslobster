import type { ClassifiedContent } from "./types.js";

/**
 * Permalink pattern expansion.
 *
 * Supported tokens:
 *   :slug     — the post slug
 *   :year     — 4-digit year from createdAt
 *   :month    — 2-digit month
 *   :day      — 2-digit day
 *   :type     — content type (micro, post, link, etc.)
 *
 * Default: "/posts/:slug/index.html"
 * Example: "/:year/:month/:slug.html" → "/2026/03/my-post.html"
 */

export const DEFAULT_PERMALINK = "/posts/:slug/index.html";

/** Expand a permalink pattern for a given piece of content */
export function expandPermalink(
  pattern: string | undefined,
  content: ClassifiedContent,
): string {
  const p = pattern ?? DEFAULT_PERMALINK;
  const d = new Date(content.createdAt);
  const year = String(d.getFullYear());
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return p
    .replace(/:slug/g, content.slug)
    .replace(/:year/g, year)
    .replace(/:month/g, month)
    .replace(/:day/g, day)
    .replace(/:type/g, content.type);
}

/** Get the directory path (without filename) for a permalink, for mkdir */
export function permalinkDir(permalink: string): string {
  const lastSlash = permalink.lastIndexOf("/");
  return lastSlash > 0 ? permalink.slice(1, lastSlash) : "";
}
