import { Command } from "commander";
import {
  createDraft,
  listDrafts,
  getDraft,
  updateDraft,
  deleteDraft,
  scheduleDraft,
  unscheduleDraft,
} from "../drafts/drafts.js";
import { promotePreview } from "../previews/previews.js";
import { publishDueScheduled } from "../agent/scheduler.js";
import type { ClassifiedContent, Draft } from "../config/types.js";
import { readFile } from "node:fs/promises";

export const draftsCommand = new Command("drafts")
  .description("Manage drafts");

draftsCommand
  .command("create")
  .description("Create a new draft from JSON on stdin")
  .argument("[site-dir]", "Path to site directory", ".")
  .action(async (siteDir: string) => {
    const input = await readFile("/dev/stdin", "utf-8");
    const content = JSON.parse(input) as ClassifiedContent;
    const draft = await createDraft(siteDir, content);
    console.log(JSON.stringify({ ok: true, slug: draft.slug, status: draft.status }));
  });

draftsCommand
  .command("list")
  .description("List all drafts")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--status <status>", "Filter by status (draft, scheduled, published)")
  .action(async (siteDir: string, opts: { status?: string }) => {
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
  .action(async (slug: string, siteDir: string) => {
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
  .action(async (slug: string, siteDir: string) => {
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
  .action(async (slug: string, siteDir: string) => {
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
  .action(async (slug: string, datetime: string, siteDir: string) => {
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
  .action(async (slug: string, siteDir: string) => {
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
  .action(async (slug: string, siteDir: string) => {
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
  .action(async (siteDir: string) => {
    const published = await publishDueScheduled(siteDir);
    console.log(
      JSON.stringify({
        ok: true,
        published: published.map((p) => ({ slug: p.slug, url: p.url })),
        count: published.length,
      }),
    );
  });
