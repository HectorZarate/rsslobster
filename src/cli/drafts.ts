import { Command } from "commander";
import {
  createDraft,
  listDrafts,
  getDraft,
  updateDraft,
  deleteDraft,
  scheduleDraft,
  unscheduleDraft,
  getDraftRevisions,
  restoreDraftRevision,
} from "../drafts/drafts.js";
import { promotePreview } from "../previews/previews.js";
import { publishDueScheduled } from "../agent/scheduler.js";
import type { ClassifiedContent, Draft } from "../config/types.js";
import { readFile } from "node:fs/promises";

export const draftsCommand = new Command("drafts")
  .description("Manage drafts");

/**
 * Resolve siteDir from option or positional arg.
 * The --site-dir option takes precedence when it differs from the default ".".
 * Falls back to the positional arg for backward compatibility.
 */
function resolveSiteDir(positional: string, optSiteDir?: string): string {
  if (optSiteDir !== undefined && optSiteDir !== ".") return optSiteDir;
  return positional;
}

draftsCommand
  .command("create")
  .description("Create a new draft from JSON on stdin")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (siteDirArg: string, opts: { siteDir: string }) => {
    const siteDir = resolveSiteDir(siteDirArg, opts.siteDir);
    const input = await readFile("/dev/stdin", "utf-8");
    const content = JSON.parse(input) as ClassifiedContent;
    const draft = await createDraft(siteDir, content);
    console.log(JSON.stringify({ ok: true, slug: draft.slug, status: draft.status }));
  });

draftsCommand
  .command("list")
  .description("List all drafts")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .option("--status <status>", "Filter by status (draft, scheduled, published)")
  .action(async (siteDirArg: string, opts: { siteDir: string; status?: string }) => {
    const siteDir = resolveSiteDir(siteDirArg, opts.siteDir);
    const filter = opts.status ? { status: opts.status as "draft" | "scheduled" | "published" } : undefined;
    const drafts = await listDrafts(siteDir, filter);
    console.log(JSON.stringify(drafts.map((d) => ({
      slug: d.slug,
      type: d.type,
      status: d.status,
      title: d.title,
      body: d.body.slice(0, 80),
      updatedAt: d.updatedAt,
      scheduledAt: d.scheduledAt,
    }))));
  });

draftsCommand
  .command("show <slug>")
  .description("Show a draft by slug")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (slug: string, siteDirArg: string, opts: { siteDir: string }) => {
    const siteDir = resolveSiteDir(siteDirArg, opts.siteDir);
    const draft = await getDraft(siteDir, slug);
    if (!draft) {
      console.error(JSON.stringify({ ok: false, error: `Draft "${slug}" not found` }));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(draft));
  });

draftsCommand
  .command("update <slug>")
  .description("Update a draft (JSON patch on stdin)")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (slug: string, siteDirArg: string, opts: { siteDir: string }) => {
    const siteDir = resolveSiteDir(siteDirArg, opts.siteDir);
    const input = await readFile("/dev/stdin", "utf-8");
    const updates = JSON.parse(input) as Partial<Draft>;
    const draft = await updateDraft(siteDir, slug, updates);
    if (!draft) {
      console.error(JSON.stringify({ ok: false, error: `Draft "${slug}" not found` }));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify({ ok: true, slug: draft.slug, updatedAt: draft.updatedAt }));
  });

draftsCommand
  .command("delete <slug>")
  .description("Delete a draft permanently")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (slug: string, siteDirArg: string, opts: { siteDir: string }) => {
    const siteDir = resolveSiteDir(siteDirArg, opts.siteDir);
    const deleted = await deleteDraft(siteDir, slug);
    if (!deleted) {
      console.error(JSON.stringify({ ok: false, error: `Draft "${slug}" not found` }));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify({ ok: true, deleted: slug }));
  });

draftsCommand
  .command("schedule <slug> <datetime>")
  .description("Schedule a draft for future publication")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (slug: string, datetime: string, siteDirArg: string, opts: { siteDir: string }) => {
    const siteDir = resolveSiteDir(siteDirArg, opts.siteDir);
    try {
      const draft = await scheduleDraft(siteDir, slug, datetime);
      if (!draft) {
        console.error(JSON.stringify({ ok: false, error: `Draft "${slug}" not found` }));
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify({ ok: true, slug: draft.slug, scheduledAt: draft.scheduledAt }));
    } catch (err) {
      console.error(JSON.stringify({ ok: false, error: (err as Error).message }));
      process.exitCode = 1;
    }
  });

draftsCommand
  .command("unschedule <slug>")
  .description("Unschedule a draft (revert to draft status)")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (slug: string, siteDirArg: string, opts: { siteDir: string }) => {
    const siteDir = resolveSiteDir(siteDirArg, opts.siteDir);
    const draft = await unscheduleDraft(siteDir, slug);
    if (!draft) {
      console.error(JSON.stringify({ ok: false, error: `Draft "${slug}" not found` }));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify({ ok: true, slug: draft.slug, status: draft.status }));
  });

draftsCommand
  .command("publish <slug>")
  .description("Publish a draft (generates HTML + feeds, marks as published)")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (slug: string, siteDirArg: string, opts: { siteDir: string }) => {
    const siteDir = resolveSiteDir(siteDirArg, opts.siteDir);
    try {
      const post = await promotePreview(siteDir, slug);
      console.log(JSON.stringify({ ok: true, url: post.url, slug: post.slug }));
    } catch (err) {
      console.error(JSON.stringify({ ok: false, error: (err as Error).message }));
      process.exitCode = 1;
    }
  });

draftsCommand
  .command("publish-due")
  .description("Publish all scheduled drafts that are past their time")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (siteDirArg: string, opts: { siteDir: string }) => {
    const siteDir = resolveSiteDir(siteDirArg, opts.siteDir);
    const published = await publishDueScheduled(siteDir);
    console.log(
      JSON.stringify({
        ok: true,
        published: published.map((p) => ({ slug: p.slug, url: p.url })),
        count: published.length,
      }),
    );
  });

draftsCommand
  .command("revisions <slug>")
  .description("List revision history for a draft")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (slug: string, siteDirArg: string, opts: { siteDir: string }) => {
    const siteDir = resolveSiteDir(siteDirArg, opts.siteDir);
    const revisions = await getDraftRevisions(siteDir, slug);
    if (revisions.length === 0) {
      console.error(JSON.stringify({ ok: false, error: `No revisions for "${slug}"` }));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(revisions.map((r) => ({
      revision: r.revision,
      savedAt: r.savedAt,
      title: r.title,
      bodyPreview: r.body.slice(0, 80),
      tags: r.tags,
    }))));
  });

draftsCommand
  .command("restore <slug> <revision>")
  .description("Restore a draft to a previous revision")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (slug: string, revision: string, siteDirArg: string, opts: { siteDir: string }) => {
    const siteDir = resolveSiteDir(siteDirArg, opts.siteDir);
    const revNum = parseInt(revision, 10);
    if (isNaN(revNum) || revNum < 1) {
      console.error(JSON.stringify({ ok: false, error: "Revision must be a positive number" }));
      process.exitCode = 1;
      return;
    }
    const draft = await restoreDraftRevision(siteDir, slug, revNum);
    if (!draft) {
      console.error(JSON.stringify({ ok: false, error: `Draft or revision not found` }));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify({
      ok: true,
      slug: draft.slug,
      restoredFrom: revNum,
      currentRevision: draft.revisions?.length ?? 0,
    }));
  });
