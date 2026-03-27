import { Command } from "commander";
import { resolve } from "node:path";
import pc from "picocolors";
import { deletePost, readSiteConfig } from "../generator/site.js";
import { deployToGit } from "../deploy/git.js";
import { pingWebSubHub } from "../deploy/websub.js";
import { resolveTargetSite } from "../config/workspace.js";

export const deleteCommand = new Command("delete")
  .description("Delete a published post by slug")
  .argument("<slug>", "Post slug to delete")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .option("--to <site>", "Delete from a different registered site")
  .option("--deploy", "Git commit and push after deletion")
  .action(
    async (
      slug: string,
      opts: {
        siteDir: string;
        to?: string;
        deploy?: boolean;
      },
    ) => {
      let siteDir = resolve(opts.siteDir);

      // Resolve target site from registry
      if (opts.to) {
        try {
          const resolved = await resolveTargetSite(opts.to);
          siteDir = resolved.siteDir;
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : "Failed to resolve target site";
          console.error(pc.red(msg));
          process.exit(1);
        }
      }

      const post = await deletePost(siteDir, slug);

      if (!post) {
        console.error(pc.red(`No post with slug "${slug}" found.`));
        process.exit(1);
      }

      const title = post.title ?? post.body.slice(0, 60);
      console.log(pc.green(`Deleted: "${title}" (${slug})`));
      console.log(pc.dim(`  Removed from index, feeds, search, and sitemap.`));

      if (opts.deploy) {
        const result = await deployToGit(
          siteDir,
          `delete: ${post.type} — ${slug}`,
        );
        if (result.committed && !result.pushError) {
          const config = await readSiteConfig(siteDir);
          await pingWebSubHub(`https://${config.domain}/feed.xml`);
          await pingWebSubHub(`https://${config.domain}/feed.json`);
          console.log(pc.green("  Deployed."));
        } else if (result.pushError) {
          console.log(
            pc.yellow(
              `  Committed locally but push failed: ${result.pushError}`,
            ),
          );
        }
      } else if (opts.to) {
        console.log(pc.dim("  Local only. Add --deploy to push."));
      }
    },
  );
