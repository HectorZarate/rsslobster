import { Command } from "commander";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import pc from "picocolors";
import { outputDir } from "../config/paths.js";

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
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".txt": "text/plain; charset=utf-8",
};

export const devCommand = new Command("dev")
  .description("Start a local preview server for the site")
  .argument("[site-dir]", "Path to the site directory", ".")
  .option("-p, --port <port>", "Port to serve on", "4321")
  .action(async (siteDirArg: string, opts: { port: string }) => {
    const siteDir = resolve(siteDirArg);
    const outDir = outputDir(siteDir);
    const port = parseInt(opts.port, 10);

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      let pathname = decodeURIComponent(url.pathname);

      // Try to resolve the file path
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
          // Not found, try next
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
      console.log(pc.green(`\n  Dev server running at ${pc.cyan(`http://localhost:${port}`)}`));
      console.log(pc.dim(`  Serving ${outDir}\n`));
      console.log(pc.dim("  Press Ctrl+C to stop.\n"));
    });

    process.on("SIGINT", () => {
      server.close();
      process.exit(0);
    });
  });
