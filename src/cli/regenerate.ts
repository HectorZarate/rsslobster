import { Command } from "commander";
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import pc from "picocolors";
import {
  readSiteConfig,
  readPostsIndex,
  rebuildFeeds,
  rebuildIndex,
  outputDir,
} from "../generator/site.js";
import { generateHtmlPage, generateBlogrollPage } from "../generator/html.js";
import { writeSearchIndex } from "../generator/search.js";
import { writeSeo } from "../generator/seo.js";
import { writePages } from "../pages/pages.js";
import { initMarkdown } from "../generator/markdown.js";
import { loadCustomCss } from "../styles/presets.js";
import { permalinkDir } from "../config/permalink.js";
import { writeFavicon, writeOgImage } from "../generator/favicon.js";
import { listSubscriptions } from "../reader/subscriptions.js";
import { fetchComments } from "../comments/fetch.js";

/** Options for regeneration */
export interface RegenerateOptions {
  /** Only regenerate the page for this slug */
  slug?: string;
}

/**
 * Regenerate HTML pages, feeds, and search index from existing posts.
 * Reads posts.json + rsslobster.json and rebuilds everything.
 * Does not modify posts.json or rsslobster.json.
 *
 * When `options.slug` is provided, only the matching post's HTML is regenerated.
 * Feeds, index, search, and SEO are always rebuilt.
 */
export async function regenerateSite(
  siteDir: string,
  options?: RegenerateOptions,
): Promise<void> {
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
  const outDir = outputDir(siteDir);

  // Determine which posts to regenerate HTML for
  const targetPosts = options?.slug
    ? posts.filter((p) => p.slug === options.slug)
    : posts;

  if (options?.slug && targetPosts.length === 0) {
    throw new Error(`Post with slug "${options.slug}" not found`);
  }

  // Comments endpoint for baking comments into pages
  const commentsEndpoint = config.commentsEndpoint;
  const commentsSubmitUrl = commentsEndpoint
    ? `${commentsEndpoint}/submit`
    : undefined;

  // Regenerate each target post's HTML page
  for (const post of targetPosts) {
    // Derive file path from stored URL (O(1) string manipulation)
    const domain = `https://${config.domain}`;
    const permalink = post.url.startsWith(domain)
      ? post.url.slice(domain.length)
      : `/${post.slug}.html`;

    const dir = permalinkDir(permalink);
    if (dir) {
      await mkdir(join(outDir, dir), { recursive: true });
    }

    // Fetch comments from Worker API if endpoint is configured
    let comments;
    if (commentsEndpoint) {
      comments = await fetchComments(post.slug, commentsEndpoint);
    }

    const html = generateHtmlPage(post, config, {
      pageUrl: post.url,
      comments,
      commentsSubmitUrl,
    });
    const htmlPath = permalink.startsWith("/") ? permalink.slice(1) : permalink;
    await writeFile(join(outDir, htmlPath), html);
  }

  // Rebuild assets, feeds, index, search, SEO, pages, and blogroll
  await writeFavicon(siteDir, config.title, config.style.preset, config.style.overrides);
  await writeOgImage(siteDir, config.title, config.description, config.style.preset, config.style.overrides);
  await rebuildFeeds(siteDir, config, posts);
  await rebuildIndex(siteDir, config, posts);
  await writeSearchIndex(siteDir, posts);
  await writeSeo(siteDir, config, posts);
  await writePages(siteDir, config);

  // Blogroll: render subscriptions as a public following page
  const subs = await listSubscriptions(siteDir);
  if (subs.length > 0) {
    const followingDir = join(outDir, "following");
    await mkdir(followingDir, { recursive: true });
    const blogrollHtml = generateBlogrollPage(subs, config);
    await writeFile(join(followingDir, "index.html"), blogrollHtml);
  }
}

export const regenerateCommand = new Command("regenerate")
  .description(
    "Regenerate all HTML pages, feeds, and search index from existing posts",
  )
  .argument("[site-dir]", "Path to the site directory", ".")
  .option("--slug <slug>", "Only regenerate the page for this post slug")
  .action(async (siteDirArg: string, opts: { slug?: string }) => {
    const siteDir = resolve(siteDirArg);
    try {
      await regenerateSite(siteDir, { slug: opts.slug });
      const msg = opts.slug
        ? `Regenerated page for "${opts.slug}".`
        : "Regenerated all pages.";
      console.log(pc.green(msg));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Regeneration failed";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });
