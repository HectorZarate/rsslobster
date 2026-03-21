import type { ContentType } from "./types.js";

/** Valid content types for validation at module boundaries. */
export const VALID_TYPES: ReadonlySet<string> = new Set<ContentType>([
  "micro",
  "post",
  "image",
  "carousel",
  "link",
  "video",
  "audio",
]);

export const MAX_TAGS = 3;

/** Generate a URL-friendly slug from text. */
export function slugify(text: string, maxLen = 60): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen);

  // Trim to last word boundary if we truncated
  const trimmed =
    slug.length >= maxLen && slug.includes("-")
      ? slug.slice(0, slug.lastIndexOf("-"))
      : slug;
  return trimmed.replace(/-$/, "");
}
