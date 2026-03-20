import { readFile, writeFile, readdir, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ClassifiedContent, Draft, DraftStatus } from "../config/types.js";

const DRAFTS_DIR = "drafts";

/**
 * Complete draft management system.
 *
 * Drafts are JSON files stored in {siteDir}/drafts/{slug}.json.
 * Operations: create, list, get, update, publish, delete, schedule.
 *
 * UX principles:
 * - Every operation returns the affected draft for confirmation
 * - List operations return newest-first (reverse chronological)
 * - Slug conflicts are resolved by appending a numeric suffix
 * - Deletes require the exact slug (no fuzzy matching for safety)
 */

function draftsDir(siteDir: string): string {
  return join(siteDir, DRAFTS_DIR);
}

function draftPath(siteDir: string, slug: string): string {
  return join(draftsDir(siteDir), `${slug}.json`);
}

/** Ensure drafts directory exists */
async function ensureDraftsDir(siteDir: string): Promise<void> {
  await mkdir(draftsDir(siteDir), { recursive: true });
}

/** Create a new draft from classified content */
export async function createDraft(
  siteDir: string,
  content: ClassifiedContent,
): Promise<Draft> {
  await ensureDraftsDir(siteDir);

  const slug = await resolveSlugConflict(siteDir, content.slug);
  const draft: Draft = {
    ...content,
    slug,
    status: "draft",
    updatedAt: new Date().toISOString(),
  };

  await writeFile(draftPath(siteDir, slug), JSON.stringify(draft, null, 2));
  return draft;
}

/** List all drafts, newest first */
export async function listDrafts(
  siteDir: string,
  filter?: { status?: DraftStatus },
): Promise<Draft[]> {
  await ensureDraftsDir(siteDir);
  const dir = draftsDir(siteDir);
  const files = await readdir(dir);
  const jsonFiles = files.filter((f: string) => f.endsWith(".json"));

  const drafts: Draft[] = [];
  for (const file of jsonFiles) {
    const raw = await readFile(join(dir, file), "utf-8");
    const draft = JSON.parse(raw) as Draft;
    drafts.push(draft);
  }

  // Filter by status if specified
  const filtered = filter?.status
    ? drafts.filter((d) => d.status === filter.status)
    : drafts;

  // Sort newest first
  return filtered.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/** Get a single draft by slug */
export async function getDraft(
  siteDir: string,
  slug: string,
): Promise<Draft | null> {
  try {
    const raw = await readFile(draftPath(siteDir, slug), "utf-8");
    return JSON.parse(raw) as Draft;
  } catch {
    return null;
  }
}

/** Update a draft's content. Merges fields, preserves what's not provided. */
export async function updateDraft(
  siteDir: string,
  slug: string,
  updates: Partial<ClassifiedContent>,
): Promise<Draft | null> {
  const existing = await getDraft(siteDir, slug);
  if (!existing) return null;

  const updated: Draft = {
    ...existing,
    ...updates,
    slug: existing.slug, // slug is immutable after creation
    status: existing.status, // status changes via dedicated methods
    updatedAt: new Date().toISOString(),
  };

  await writeFile(
    draftPath(siteDir, existing.slug),
    JSON.stringify(updated, null, 2),
  );
  return updated;
}

/** Delete a draft permanently */
export async function deleteDraft(
  siteDir: string,
  slug: string,
): Promise<boolean> {
  try {
    await unlink(draftPath(siteDir, slug));
    return true;
  } catch {
    return false;
  }
}

/** Mark a draft as scheduled for future publishing */
export async function scheduleDraft(
  siteDir: string,
  slug: string,
  scheduledAt: string,
): Promise<Draft | null> {
  const existing = await getDraft(siteDir, slug);
  if (!existing) return null;

  const date = new Date(scheduledAt);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${scheduledAt}`);
  }
  if (date.getTime() <= Date.now()) {
    throw new Error("Scheduled date must be in the future");
  }

  const updated: Draft = {
    ...existing,
    status: "scheduled",
    scheduledAt: date.toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeFile(draftPath(siteDir, slug), JSON.stringify(updated, null, 2));
  return updated;
}

/** Unschedule a draft — revert from scheduled back to draft */
export async function unscheduleDraft(
  siteDir: string,
  slug: string,
): Promise<Draft | null> {
  const existing = await getDraft(siteDir, slug);
  if (!existing) return null;
  if (existing.status !== "scheduled") return existing;

  const updated: Draft = {
    ...existing,
    status: "draft",
    scheduledAt: undefined,
    updatedAt: new Date().toISOString(),
  };

  await writeFile(draftPath(siteDir, slug), JSON.stringify(updated, null, 2));
  return updated;
}

/** Mark a draft as published (does NOT do the actual publishing — caller handles that) */
export async function markPublished(
  siteDir: string,
  slug: string,
): Promise<Draft | null> {
  const existing = await getDraft(siteDir, slug);
  if (!existing) return null;

  const updated: Draft = {
    ...existing,
    status: "published",
    updatedAt: new Date().toISOString(),
  };

  await writeFile(draftPath(siteDir, slug), JSON.stringify(updated, null, 2));
  return updated;
}

/** Get all drafts that are scheduled and past their scheduled time */
export async function getDueScheduledDrafts(
  siteDir: string,
): Promise<Draft[]> {
  const scheduled = await listDrafts(siteDir, { status: "scheduled" });
  const now = Date.now();
  return scheduled.filter(
    (d) => d.scheduledAt && new Date(d.scheduledAt).getTime() <= now,
  );
}

/** Resolve slug conflicts by appending -2, -3, etc. */
async function resolveSlugConflict(
  siteDir: string,
  slug: string,
): Promise<string> {
  const existing = await getDraft(siteDir, slug);
  if (!existing) return slug;

  let counter = 2;
  while (await getDraft(siteDir, `${slug}-${counter}`)) {
    counter++;
  }
  return `${slug}-${counter}`;
}
