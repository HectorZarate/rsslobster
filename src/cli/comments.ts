import { Command } from "commander";
import { resolve } from "node:path";
import pc from "picocolors";
import { readSiteConfig } from "../generator/site.js";
import { readLobsterConfig } from "../config/lobster.js";

/** Shared helper for approve/reject/spam/unapprove admin actions */
async function adminAction(
  action: "approve" | "reject" | "spam" | "unapprove",
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

/** Generic admin API request helper */
async function adminRequest(
  method: string,
  path: string,
  endpoint: string,
  adminSecret: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${adminSecret}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(10000),
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetch(`${endpoint}${path}`, opts);
  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`Request failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return res;
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

/** Require admin secret or throw */
function requireSecret(adminSecret: string | undefined): string {
  if (!adminSecret) {
    throw new Error("No commentsAdminSecret configured in lobster.json");
  }
  return adminSecret;
}

/** Format a comment status with color */
function colorStatus(status: string): string {
  switch (status) {
    case "approved": return pc.green(status);
    case "pending": return pc.yellow(status);
    case "spam": return pc.magenta(status);
    default: return pc.red(status);
  }
}

export const commentsCommand = new Command("comments")
  .description("Manage comments on your posts")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (opts: { siteDir: string }) => {
    const siteDir = resolve(opts.siteDir);
    try {
      const { endpoint, adminSecret } = await loadCommentConfig(siteDir);
      const secret = requireSecret(adminSecret);

      const [statsRes, modeRes] = await Promise.all([
        adminRequest("GET", "/admin/stats", endpoint, secret),
        adminRequest("GET", "/admin/mode", endpoint, secret),
      ]);

      const stats = await statsRes.json() as Record<string, number>;
      const { mode } = await modeRes.json() as { mode: string };

      const modeColor = mode === "on" ? pc.green(mode) : mode === "off" ? pc.red(mode) : pc.yellow(mode);
      console.log(`${pc.bold("Comments")}  mode: ${modeColor}`);
      console.log("");
      console.log(`  ${pc.yellow("pending")}   ${stats.pending ?? 0}`);
      console.log(`  ${pc.green("approved")}  ${stats.approved ?? 0}`);
      console.log(`  ${pc.red("rejected")}  ${stats.rejected ?? 0}`);
      console.log(`  ${pc.magenta("spam")}      ${stats.spam ?? 0}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load dashboard";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });

commentsCommand
  .command("list")
  .description("List comments (default: all pending)")
  .argument("[slug]", "Post slug (omit for all posts)")
  .option("--status <status>", "Filter by status (pending|approved|rejected|spam)")
  .option("--author <name>", "Filter by author name")
  .option("--since <date>", "Filter by date (ISO format)")
  .option("-n, --limit <n>", "Max number of comments")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (slug: string | undefined, opts: { siteDir: string; status?: string; author?: string; since?: string; limit?: string }) => {
    const siteDir = resolve(opts.siteDir);
    try {
      const { endpoint, adminSecret } = await loadCommentConfig(siteDir);
      const secret = requireSecret(adminSecret);

      const params = new URLSearchParams();
      if (slug) params.set("slug", slug);
      if (opts.status) params.set("status", opts.status);
      else params.set("status", "pending");
      if (opts.author) params.set("author", opts.author);
      if (opts.since) params.set("since", opts.since);
      if (opts.limit) params.set("limit", opts.limit);

      const query = params.toString();
      const res = await adminRequest("GET", `/admin/comments${query ? `?${query}` : ""}`, endpoint, secret);
      const comments = await res.json() as Array<{ id: string; slug: string; author: string; body: string; status: string; createdAt?: string; created_at?: string }>;

      if (comments.length === 0) {
        console.log(pc.dim("No comments found."));
        return;
      }

      for (const c of comments) {
        const createdAt = c.createdAt ?? c.created_at ?? "";
        const date = createdAt ? new Date(createdAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        }) : "";
        console.log(`${pc.bold(c.author)} (${date}) [${colorStatus(c.status)}] ${pc.dim(c.id)}`);
        console.log(`  ${pc.dim(c.slug)}  ${c.body.slice(0, 120)}`);
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
      await adminAction("approve", id, endpoint, requireSecret(adminSecret));
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
      await adminAction("reject", id, endpoint, requireSecret(adminSecret));
      console.log(pc.green(`Comment ${id} rejected.`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reject";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });

commentsCommand
  .command("spam")
  .description("Mark a comment as spam")
  .argument("<id>", "Comment ID")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (id: string, opts: { siteDir: string }) => {
    const siteDir = resolve(opts.siteDir);
    try {
      const { endpoint, adminSecret } = await loadCommentConfig(siteDir);
      await adminAction("spam", id, endpoint, requireSecret(adminSecret));
      console.log(pc.green(`Comment ${id} marked as spam.`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to mark as spam";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });

commentsCommand
  .command("unapprove")
  .description("Revert an approved comment to pending")
  .argument("<id>", "Comment ID")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (id: string, opts: { siteDir: string }) => {
    const siteDir = resolve(opts.siteDir);
    try {
      const { endpoint, adminSecret } = await loadCommentConfig(siteDir);
      await adminAction("unapprove", id, endpoint, requireSecret(adminSecret));
      console.log(pc.green(`Comment ${id} reverted to pending.`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to unapprove";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });

commentsCommand
  .command("delete")
  .description("Permanently delete a comment")
  .argument("<id>", "Comment ID")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (id: string, opts: { siteDir: string }) => {
    const siteDir = resolve(opts.siteDir);
    try {
      const { endpoint, adminSecret } = await loadCommentConfig(siteDir);
      await adminRequest("DELETE", `/comments/${id}`, endpoint, requireSecret(adminSecret));
      console.log(pc.green(`Comment ${id} deleted.`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });

commentsCommand
  .command("approve-all")
  .description("Approve all pending comments for a post")
  .argument("<slug>", "Post slug")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (slug: string, opts: { siteDir: string }) => {
    const siteDir = resolve(opts.siteDir);
    try {
      const { endpoint, adminSecret } = await loadCommentConfig(siteDir);
      const res = await adminRequest("POST", "/admin/bulk/approve", endpoint, requireSecret(adminSecret), { slug });
      const { count } = await res.json() as { count: number };
      console.log(pc.green(`Approved ${count} comment${count === 1 ? "" : "s"} for "${slug}".`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to approve all";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });

commentsCommand
  .command("mode")
  .description("Show or set comments mode (on|off|paused)")
  .argument("[value]", "Mode to set: on, off, or paused")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (value: string | undefined, opts: { siteDir: string }) => {
    const siteDir = resolve(opts.siteDir);
    try {
      const { endpoint, adminSecret } = await loadCommentConfig(siteDir);
      const secret = requireSecret(adminSecret);

      if (value) {
        const valid = ["on", "off", "paused"];
        if (!valid.includes(value)) {
          throw new Error(`Invalid mode "${value}". Must be one of: ${valid.join(", ")}`);
        }
        await adminRequest("POST", "/admin/mode", endpoint, secret, { mode: value });
        console.log(pc.green(`Comments mode set to "${value}".`));
      } else {
        const res = await adminRequest("GET", "/admin/mode", endpoint, secret);
        const { mode } = await res.json() as { mode: string };
        const modeColor = mode === "on" ? pc.green(mode) : mode === "off" ? pc.red(mode) : pc.yellow(mode);
        console.log(`Comments mode: ${modeColor}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to get/set mode";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });

commentsCommand
  .command("ban")
  .description("Ban an IP from commenting")
  .argument("<ip-hash>", "IP hash to ban")
  .option("--reason <reason>", "Reason for the ban", "")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (ipHash: string, opts: { siteDir: string; reason: string }) => {
    const siteDir = resolve(opts.siteDir);
    try {
      const { endpoint, adminSecret } = await loadCommentConfig(siteDir);
      await adminRequest("POST", "/admin/ban", endpoint, requireSecret(adminSecret), { ip_hash: ipHash, reason: opts.reason });
      console.log(pc.green(`Banned ${ipHash}.`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to ban";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });

commentsCommand
  .command("unban")
  .description("Remove an IP ban")
  .argument("<ip-hash>", "IP hash to unban")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (ipHash: string, opts: { siteDir: string }) => {
    const siteDir = resolve(opts.siteDir);
    try {
      const { endpoint, adminSecret } = await loadCommentConfig(siteDir);
      await adminRequest("DELETE", `/admin/ban/${ipHash}`, endpoint, requireSecret(adminSecret));
      console.log(pc.green(`Unbanned ${ipHash}.`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to unban";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });

commentsCommand
  .command("dashboard")
  .description("Print the admin dashboard URL with an auth token")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (opts: { siteDir: string }) => {
    const siteDir = resolve(opts.siteDir);
    try {
      const { endpoint, adminSecret } = await loadCommentConfig(siteDir);
      const secret = requireSecret(adminSecret);
      const url = `${endpoint}/admin/dashboard?token=${encodeURIComponent(secret)}`;
      console.log(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to build dashboard URL";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });

commentsCommand
  .command("bans")
  .description("List banned IPs")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (opts: { siteDir: string }) => {
    const siteDir = resolve(opts.siteDir);
    try {
      const { endpoint, adminSecret } = await loadCommentConfig(siteDir);
      const res = await adminRequest("GET", "/admin/bans", endpoint, requireSecret(adminSecret));
      const bans = await res.json() as Array<{ ip_hash: string; reason: string; banned_at: string }>;

      if (bans.length === 0) {
        console.log(pc.dim("No banned IPs."));
        return;
      }

      for (const b of bans) {
        const date = new Date(b.banned_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        console.log(`${pc.bold(b.ip_hash)}  ${date}${b.reason ? `  ${pc.dim(b.reason)}` : ""}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to list bans";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });
