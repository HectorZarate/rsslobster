import { Command } from "commander";
import {
  listActivePreviews,
  deletePreview,
  cleanExpiredPreviews,
  createPreview,
} from "../previews/previews.js";
import { getDraft } from "../drafts/drafts.js";
import { deployToGit } from "../deploy/git.js";

export const previewsCommand = new Command("previews")
  .description("Manage preview pages");

previewsCommand
  .command("list")
  .description("List drafts with active (non-expired) previews")
  .argument("[site-dir]", "Path to site directory", ".")
  .action(async (siteDir: string) => {
    const active = await listActivePreviews(siteDir);
    console.log(JSON.stringify(active.map((d) => ({
      slug: d.slug,
      type: d.type,
      title: d.title,
      previewUrl: d.previewUrl,
      previewExpiresAt: d.previewExpiresAt,
    }))));
  });

previewsCommand
  .command("show <slug>")
  .description("Show preview URL for a draft")
  .argument("[site-dir]", "Path to site directory", ".")
  .action(async (slug: string, siteDir: string) => {
    const draft = await getDraft(siteDir, slug);
    if (!draft) {
      console.error(JSON.stringify({ ok: false, error: `Draft "${slug}" not found` }));
      process.exitCode = 1;
      return;
    }
    if (!draft.previewId) {
      console.error(JSON.stringify({ ok: false, error: `Draft "${slug}" has no active preview` }));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify({
      ok: true,
      slug: draft.slug,
      previewUrl: draft.previewUrl,
      previewExpiresAt: draft.previewExpiresAt,
    }));
  });

previewsCommand
  .command("generate <slug>")
  .description("Generate a preview for an existing draft")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--deploy", "Git commit+push after generating", false)
  .action(async (slug: string, siteDir: string, opts: { deploy: boolean }) => {
    const draft = await getDraft(siteDir, slug);
    if (!draft) {
      console.error(JSON.stringify({ ok: false, error: `Draft "${slug}" not found` }));
      process.exitCode = 1;
      return;
    }

    const updated = await createPreview(siteDir, draft);

    if (opts.deploy) {
      await deployToGit(siteDir, `preview: ${slug}`);
    }

    console.log(JSON.stringify({
      ok: true,
      slug: updated.slug,
      previewUrl: updated.previewUrl,
      previewExpiresAt: updated.previewExpiresAt,
    }));
  });

previewsCommand
  .command("delete <slug>")
  .description("Delete a preview (keeps the draft)")
  .argument("[site-dir]", "Path to site directory", ".")
  .action(async (slug: string, siteDir: string) => {
    const deleted = await deletePreview(siteDir, slug);
    if (!deleted) {
      console.error(JSON.stringify({ ok: false, error: `No preview found for "${slug}"` }));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify({ ok: true, deleted: slug }));
  });

previewsCommand
  .command("clean")
  .description("Remove all expired previews")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--deploy", "Git commit+push after cleaning", false)
  .action(async (siteDir: string, opts: { deploy: boolean }) => {
    const count = await cleanExpiredPreviews(siteDir);

    if (count > 0 && opts.deploy) {
      await deployToGit(siteDir, "chore: clean expired previews");
    }

    console.log(JSON.stringify({ ok: true, cleaned: count }));
  });
