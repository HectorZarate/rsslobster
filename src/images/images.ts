import { copyFile, mkdir, unlink } from "node:fs/promises";
import { join, extname } from "node:path";
import type { InboundImage } from "../channels/types.js";
import type { ImageAttachment } from "../config/types.js";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/** Get MIME type from filename extension. Defaults to image/jpeg. */
export function mimeFromExtension(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return EXT_TO_MIME[ext] ?? "image/jpeg";
}

/** Get file extension from MIME type. Defaults to .jpg. */
function extFromMime(mime: string): string {
  return MIME_TO_EXT[mime] ?? ".jpg";
}

/** Generate a deterministic filename: {slug}-{n}.{ext} */
export function generateFilename(
  slug: string,
  originalFilename: string,
  index: number,
  mimeType?: string,
): string {
  let ext = extname(originalFilename).toLowerCase();
  if (!ext || !EXT_TO_MIME[ext]) {
    ext = mimeType ? extFromMime(mimeType) : ".jpg";
  }
  return `${slug}-${index + 1}${ext}`;
}

/** Copy a single inbound image to the site's images directory. */
export async function ingestImage(
  siteDir: string,
  image: InboundImage,
  slug: string,
  index: number,
): Promise<ImageAttachment> {
  const imagesDir = join(siteDir, "images");
  await mkdir(imagesDir, { recursive: true });

  const filename = generateFilename(
    slug,
    image.filename,
    index,
    image.mimeType,
  );
  const destPath = join(imagesDir, filename);

  await copyFile(image.localPath, destPath);

  return {
    src: `/images/${filename}`,
    alt: `${slug} image ${index + 1}`,
  };
}

/**
 * Ingest all inbound images into the site.
 * Skips individual failures so one bad image doesn't block the post.
 * Optionally deletes source files after copy (for temp downloads).
 */
export async function ingestImages(
  siteDir: string,
  images: InboundImage[],
  slug: string,
  cleanupSource = false,
): Promise<ImageAttachment[]> {
  const attachments: ImageAttachment[] = [];

  for (let i = 0; i < images.length; i++) {
    const image = images[i]!;
    try {
      const attachment = await ingestImage(siteDir, image, slug, i);
      attachments.push(attachment);
      if (cleanupSource) {
        try {
          await unlink(image.localPath);
        } catch {
          // Non-critical: cleanup failure is fine
        }
      }
    } catch {
      // Skip failed images — log would go here in production
      continue;
    }
  }

  return attachments;
}
