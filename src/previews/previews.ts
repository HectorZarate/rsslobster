import { randomBytes } from "node:crypto";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Draft, Post } from "../config/types.js";
import { generateHtmlPage, previewPageOptions } from "../generator/html.js";
import {
  getDraft,
  updateDraft,
  listDrafts,
  markPublished,
} from "../drafts/drafts.js";
import { addContent, readSiteConfig } from "../generator/site.js";

const PREVIEWS_DIR = "_previews";
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateToken(): string {
  return randomBytes(6).toString("hex");
}

async function ensurePreviewsDir(siteDir: string): Promise<void> {
  await mkdir(join(siteDir, PREVIEWS_DIR), { recursive: true });
}

/** Generate a preview for a draft. Updates the draft with preview metadata. */
export async function createPreview(
  siteDir: string,
  draft: Draft,
): Promise<Draft> {
  await ensurePreviewsDir(siteDir);
  const config = await readSiteConfig(siteDir);

  // Reuse existing token or generate new one
  const token = draft.previewId ?? generateToken();
  const previewUrl = `https://${config.domain}/${PREVIEWS_DIR}/${token}.html`;

  // Write metadata first (source of truth), then HTML
  const updated = await updateDraft(siteDir, draft.slug, {
    previewId: token,
    previewUrl,
    previewExpiresAt: new Date(Date.now() + DEFAULT_TTL_MS).toISOString(),
  });

  if (!updated) {
    throw new Error(`Draft "${draft.slug}" not found during preview creation`);
  }

  // Generate 1:1 HTML with preview banner + noindex
  const html = generateHtmlPage(draft, config, previewPageOptions());
  await writeFile(join(siteDir, PREVIEWS_DIR, `${token}.html`), html);

  return updated;
}

/** Delete preview HTML file and clear preview fields from draft. */
export async function deletePreview(
  siteDir: string,
  slug: string,
): Promise<boolean> {
  const draft = await getDraft(siteDir, slug);
  if (!draft?.previewId) return false;

  try {
    await unlink(join(siteDir, PREVIEWS_DIR, `${draft.previewId}.html`));
  } catch {
    /* file may already be gone */
  }

  await updateDraft(siteDir, slug, {
    previewId: undefined,
    previewUrl: undefined,
    previewExpiresAt: undefined,
  });
  return true;
}

/** Promote a draft to published post. Cleans up preview if exists. */
export async function promotePreview(
  siteDir: string,
  slug: string,
): Promise<Post> {
  const draft = await getDraft(siteDir, slug);
  if (!draft) throw new Error(`Draft "${slug}" not found`);
  if (draft.status === "published") {
    throw new Error(`Draft "${slug}" is already published`);
  }

  // Clean up preview file if one exists
  if (draft.previewId) {
    try {
      await unlink(
        join(siteDir, PREVIEWS_DIR, `${draft.previewId}.html`),
      );
    } catch {
      /* ok */
    }
  }

  // Mark draft as published BEFORE addContent to prevent duplicate publish
  // on retry if addContent succeeds but a later step fails
  await markPublished(siteDir, slug);

  // Clear preview metadata from the draft record
  await updateDraft(siteDir, slug, {
    previewId: undefined,
    previewUrl: undefined,
    previewExpiresAt: undefined,
  });

  // Publish via normal path
  const post = await addContent(siteDir, draft);

  return post;
}

/** List all drafts that have active (non-expired) previews. */
export async function listActivePreviews(
  siteDir: string,
): Promise<Draft[]> {
  const drafts = await listDrafts(siteDir);
  const now = Date.now();
  return drafts.filter(
    (d) =>
      d.previewId &&
      d.previewExpiresAt &&
      new Date(d.previewExpiresAt).getTime() > now,
  );
}

/** Clean up expired preview HTML files and clear their draft metadata. */
export async function cleanExpiredPreviews(
  siteDir: string,
): Promise<number> {
  const drafts = await listDrafts(siteDir);
  const now = Date.now();
  let cleaned = 0;

  for (const draft of drafts) {
    if (
      draft.previewId &&
      draft.previewExpiresAt &&
      new Date(draft.previewExpiresAt).getTime() <= now
    ) {
      await deletePreview(siteDir, draft.slug);
      cleaned++;
    }
  }
  return cleaned;
}
