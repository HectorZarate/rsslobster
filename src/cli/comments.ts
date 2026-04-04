import { Command } from "commander";
import { resolve } from "node:path";
import pc from "picocolors";
import { readSiteConfig } from "../generator/site.js";
import { readLobsterConfig } from "../config/lobster.js";
import { fetchComments } from "../comments/fetch.js";

/** Shared helper for approve/reject admin actions */
async function adminAction(
  action: "approve" | "reject",
  id: string,
  endpoint: string,
  adminSecret: string,
): Promise<void> {
  const res = await fetch(`${endpoint}/${action}/${id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminSecret}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const status = res.status;
    let detail = "";
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`Failed to ${action} (${status})${detail ? `: ${detail}` : ""}`);
  }
}

/** Read endpoint and admin secret from config files */
async function loadCommentConfig(siteDir: string) {
  const config = await readSiteConfig(siteDir);
  const lobster = await readLobsterConfig(siteDir);

  if (!config.commentsEndpoint) {
    throw new Error(
      'No commentsEndpoint configured. Run "rsslobster enable comments" first.',
    );
  }

  return {
    endpoint: config.commentsEndpoint,
    adminSecret: (lobster as Record<string, unknown>).commentsAdminSecret as
      | string
      | undefined,
  };
}

export const commentsCommand = new Command("comments")
  .description("Manage comments on your posts");

commentsCommand
  .command("list")
  .description("List comments for a post")
  .argument("<slug>", "Post slug")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (slug: string, opts: { siteDir: string }) => {
    const siteDir = resolve(opts.siteDir);
    try {
      const { endpoint } = await loadCommentConfig(siteDir);
      const comments = await fetchComments(slug, endpoint);

      if (comments.length === 0) {
        console.log(pc.dim("No comments for this post."));
        return;
      }

      for (const c of comments) {
        const date = new Date(c.createdAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        const status = c.status === "approved"
          ? pc.green(c.status)
          : c.status === "pending"
            ? pc.yellow(c.status)
            : pc.red(c.status);
        console.log(`${pc.bold(c.author)} (${date}) [${status}] ${pc.dim(c.id)}`);
        console.log(`  ${c.body.slice(0, 120)}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to list comments";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });

commentsCommand
  .command("approve")
  .description("Approve a pending comment")
  .argument("<id>", "Comment ID")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (id: string, opts: { siteDir: string }) => {
    const siteDir = resolve(opts.siteDir);
    try {
      const { endpoint, adminSecret } = await loadCommentConfig(siteDir);
      if (!adminSecret) {
        throw new Error("No commentsAdminSecret configured in lobster.json");
      }

      await adminAction("approve", id, endpoint, adminSecret);

      console.log(pc.green(`Comment ${id} approved.`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to approve";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });

commentsCommand
  .command("reject")
  .description("Reject a comment")
  .argument("<id>", "Comment ID")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (id: string, opts: { siteDir: string }) => {
    const siteDir = resolve(opts.siteDir);
    try {
      const { endpoint, adminSecret } = await loadCommentConfig(siteDir);
      if (!adminSecret) {
        throw new Error("No commentsAdminSecret configured in lobster.json");
      }

      await adminAction("reject", id, endpoint, adminSecret);

      console.log(pc.green(`Comment ${id} rejected.`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reject";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });
