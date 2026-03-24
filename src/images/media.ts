import { copyFile, mkdir, unlink } from "node:fs/promises";
import { join, extname } from "node:path";
import type { InboundMedia } from "../channels/types.js";
import type { MediaAttachment } from "../config/types.js";

const MIME_TO_EXT: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/ogg": ".ogg",
  "audio/opus": ".opus",
  "audio/wav": ".wav",
  "audio/webm": ".weba",
};

/** Get file extension from MIME type. Defaults to original extension or .bin. */
function extFromMime(mime: string, originalFilename: string): string {
  const mapped = MIME_TO_EXT[mime];
  if (mapped) return mapped;
  const ext = extname(originalFilename).toLowerCase();
  return ext || ".bin";
}

/** Generate a deterministic filename: {slug}-media-{n}.{ext} */
export function generateMediaFilename(
  slug: string,
  originalFilename: string,
  index: number,
  mimeType: string,
): string {
  const ext = extFromMime(mimeType, originalFilename);
  return `${slug}-media-${index + 1}${ext}`;
}

/** Copy a single media file to the site's media directory. */
export async function ingestMediaFile(
  siteDir: string,
  media: InboundMedia,
  slug: string,
  index: number,
): Promise<MediaAttachment> {
  const mediaDir = join(siteDir, "_site", "media");
  await mkdir(mediaDir, { recursive: true });

  const filename = generateMediaFilename(slug, media.filename, index, media.mimeType);
  const destPath = join(mediaDir, filename);

  await copyFile(media.localPath, destPath);

  return {
    src: `/media/${filename}`,
    mimeType: media.mimeType,
  };
}

/**
 * Ingest all inbound media files into the site.
 * Returns all successfully ingested attachments.
 * Skips individual failures so one bad file doesn't block the rest.
 */
export async function ingestMedia(
  siteDir: string,
  mediaFiles: InboundMedia[],
  slug: string,
  cleanupSource = false,
): Promise<MediaAttachment[]> {
  const attachments: MediaAttachment[] = [];

  for (let i = 0; i < mediaFiles.length; i++) {
    const media = mediaFiles[i]!;
    try {
      const attachment = await ingestMediaFile(siteDir, media, slug, i);
      attachments.push(attachment);
      if (cleanupSource) {
        try {
          await unlink(media.localPath);
        } catch {
          // Non-critical
        }
      }
    } catch {
      continue;
    }
  }

  return attachments;
}
