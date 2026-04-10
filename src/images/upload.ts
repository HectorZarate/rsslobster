/**
 * Image upload helpers — pure, runtime-agnostic functions for handling
 * user-uploaded images on a post. Used by the rsslobster admin Worker
 * to validate, name, and structure images before committing them to
 * the site repository.
 */

import type { ContentType, ImageAttachment } from "../config/types.js";

/** MIME types we accept for image uploads. */
export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** Map a MIME type to a safe file extension, or null if unsupported. */
export function imageExtensionFromMime(mime: string): string | null {
  return MIME_TO_EXT[mime] ?? null;
}

/**
 * Build a URL-safe, deterministic image filename from a post slug,
 * a 0-based index, and an extension. Used as the storage key under
 * `_site/img/`.
 */
export function safeImageKey(
  slug: string,
  index: number,
  extension: string,
): string {
  const safeSlug = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safeSlug}-${index}${extension}`;
}

/**
 * Decide which post type to use given how many images are attached.
 * One image → "image", multiple → "carousel", none → keep the original.
 */
export function determineImagePostType(
  imageCount: number,
  defaultType: ContentType,
): ContentType {
  if (imageCount === 1) return "image";
  if (imageCount > 1) return "carousel";
  return defaultType;
}

/** Per-image input for buildImageAttachments — mime is required, alt optional. */
export interface UploadedImageInfo {
  mime: string;
  alt?: string;
}

/**
 * Build the ImageAttachment[] array for a post from a list of uploaded
 * image descriptors. Each image gets a deterministic key based on the
 * slug and its index. Throws if any mime is unsupported.
 */
export function buildImageAttachments(
  slug: string,
  images: UploadedImageInfo[],
): ImageAttachment[] {
  return images.map((img, index) => {
    const ext = imageExtensionFromMime(img.mime);
    if (!ext) {
      throw new Error(`Unsupported image mime type: ${img.mime}`);
    }
    const key = safeImageKey(slug, index, ext);
    return {
      src: `/img/${key}`,
      alt: img.alt ?? "",
    };
  });
}
