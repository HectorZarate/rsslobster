import { Command } from "commander";
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import pc from "picocolors";
import {
  readSiteConfig,
  readPostsIndex,
  rebuildFeeds,
  rebuildIndex,
} from "../generator/site.js";
import { generateHtmlPage } from "../generator/html.js";
import { writeSearchIndex } from "../generator/search.js";
import { writeSeo } from "../generator/seo.js";
import { writePages } from "../pages/pages.js";
import { initMarkdown } from "../generator/markdown.js";
import { loadCustomCss } from "../styles/presets.js";
import { permalinkDir } from "../config/permalink.js";

/**
 * Regenerate all HTML pages, feeds, and search index from existing posts.
 * Reads posts.json + rsslobster.json and rebuilds everything.
 * Does not modify posts.json or rsslobster.json.
 */
export async function regenerateSite(siteDir: string): Promise<void> {
  await initMarkdown();
  const config = await readSiteConfig(siteDir);

  // Load custom CSS if configured
  if (config.style.cssFile) {
    const customCss = await loadCustomCss(siteDir, config.style.cssFile);
    if (customCss) {
      config.style.overrides = config.style.overrides ?? {};
      config.style.overrides.customCss =
        (config.style.overrides.customCss ?? "") + "\n" + customCss;
    }
  }

  const posts = await readPostsIndex(siteDir);

  // Regenerate each post's HTML page
  for (const post of posts) {
    // Derive file path from stored URL (O(1) string manipulation)
    const domain = `https://${config.domain}`;
    const permalink = post.url.startsWith(domain)
      ? post.url.slice(domain.length)
      : `/${post.slug}.html`;

    const dir = permalinkDir(permalink);
    if (dir) {
      await mkdir(join(siteDir, dir), { recursive: true });
    }

    const html = generateHtmlPage(post, config, { pageUrl: post.url });
    const htmlPath = permalink.startsWith("/") ? permalink.slice(1) : permalink;
    await writeFile(join(siteDir, htmlPath), html);
  }

  // Rebuild feeds, index, search, SEO, and pages
  await rebuildFeeds(siteDir, config, posts);
  await rebuildIndex(siteDir, config, posts);
  await writeSearchIndex(siteDir, posts);
  await writeSeo(siteDir, config, posts);
  await writePages(siteDir, config);
}

export const regenerateCommand = new Command("regenerate")
  .description(
    "Regenerate all HTML pages, feeds, and search index from existing posts",
  )
  .argument("[site-dir]", "Path to the site directory", ".")
  .action(async (siteDirArg: string) => {
    const siteDir = resolve(siteDirArg);
    try {
      await regenerateSite(siteDir);
      console.log(pc.green("Regenerated all pages."));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Regeneration failed";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });
