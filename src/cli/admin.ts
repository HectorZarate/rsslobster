import { Command } from "commander";
import { createServer } from "node:http";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { execSync } from "node:child_process";
import pc from "picocolors";
import { outputDir } from "../config/paths.js";
import { generateAdminPage } from "../generator/admin.js";
import { readPostsIndex, readSiteConfig } from "../generator/site.js";
import { readLobsterConfig } from "../config/lobster.js";
import { handleAdminPublish } from "../admin/handler.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

export const adminCommand = new Command("admin")
  .description("Open the RSS Lobster admin panel in your browser")
  .argument("[site-dir]", "Path to the site directory", ".")
  .option("-p, --port <port>", "Port to serve on", "4321")
  .action(async (siteDirArg: string, opts: { port: string }) => {
    const siteDir = resolve(siteDirArg);
    const outDir = outputDir(siteDir);
    const port = parseInt(opts.port, 10);
    const adminUrl = `http://localhost:${port}/lobster-admin/`;

    // Verify site exists
    try {
      await readSiteConfig(siteDir);
    } catch {
      console.error(
        pc.red("No rsslobster.json found. Run `rsslobster onboard` first."),
      );
      process.exit(1);
    }

    // Ensure _site exists
    await mkdir(outDir, { recursive: true });

    // Generate admin page
    async function refreshAdminPage(): Promise<void> {
      const posts = await readPostsIndex(siteDir);
      const siteConfig = await readSiteConfig(siteDir);
      const lobster = await readLobsterConfig(siteDir);
      const html = generateAdminPage(posts, siteConfig, lobster);
      const adminDir = join(outDir, "lobster-admin");
      await mkdir(adminDir, { recursive: true });
      await writeFile(join(adminDir, "index.html"), html);
    }

    await refreshAdminPage();

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      const pathname = decodeURIComponent(url.pathname);

      // Handle admin publish POST
      if (req.method === "POST" && pathname === "/lobster-admin/publish") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const rawBody = Buffer.concat(chunks).toString("utf-8");

        const result = await handleAdminPublish(rawBody, siteDir);
        await refreshAdminPage();

        if (result.ok) {
          console.log(pc.green(`  Published: ${result.post!.url}`));
          res.writeHead(303, { Location: "/lobster-admin/" });
          res.end();
        } else {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            `<h1>Error</h1><p>${result.error}</p><a href="/lobster-admin/">Back</a>`,
          );
        }
        return;
      }

      // Serve static files from _site
      const candidates = [
        join(outDir, pathname),
        join(outDir, pathname, "index.html"),
        join(outDir, `${pathname}.html`),
      ];

      let filePath: string | undefined;
      for (const candidate of candidates) {
        try {
          const s = await stat(candidate);
          if (s.isFile()) {
            filePath = candidate;
            break;
          }
        } catch {
          // try next
        }
      }

      if (!filePath) {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>404 — Not Found</h1>");
        return;
      }

      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
      const body = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      });
      res.end(body);
    });

    server.listen(port, () => {
      console.log(
        pc.green(`\n  RSS Lobster Admin running at ${pc.cyan(adminUrl)}`),
      );
      console.log(pc.dim("  Press Ctrl+C to stop.\n"));

      // Open browser
      try {
        execSync(`open "${adminUrl}"`, { stdio: "ignore" });
      } catch {
        console.log(`  Open this URL in your browser:\n  ${adminUrl}`);
      }
    });

    process.on("SIGINT", () => {
      server.close();
      process.exit(0);
    });
  });
