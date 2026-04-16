import { Command } from "commander";
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import pc from "picocolors";
import {
  readSiteConfig,
  readPostsIndex,
  writePostsIndex,
  healPostText,
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
import { paginateComments, cleanStaleCommentPages, DEFAULT_COMMENTS_PER_PAGE } from "../generator/pagination.js";
import type { CommentPaginationInfo } from "../generator/html.js";
import { writeFavicon, writeOgImage } from "../generator/favicon.js";
import { listSubscriptions } from "../reader/subscriptions.js";
import { type Comment, fetchComments } from "ziscus";

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

  if (config.style.cssFile) {
    const customCss = await loadCustomCss(siteDir, config.style.cssFile);
    if (customCss) {
      config.style.overrides = config.style.overrides ?? {};
      config.style.overrides.customCss =
        (config.style.overrides.customCss ?? "") + "\n" + customCss;
    }
  }

  const rawPosts = await readPostsIndex(siteDir);
  // Heal any mojibake left behind by a broken upstream ingest pipeline so
  // future renders stop echoing garbage characters. If anything changed,
  // rewrite posts.json.
  const posts = rawPosts.map((p) => healPostText(p));
  const healed = posts.some((p, i) => p.body !== rawPosts[i]!.body
    || p.title !== rawPosts[i]!.title);
  if (healed) {
    await writePostsIndex(siteDir, posts);
  }
  const outDir = outputDir(siteDir);

  const targetPosts = options?.slug
    ? posts.filter((p) => p.slug === options.slug)
    : posts;

  if (options?.slug && targetPosts.length === 0) {
    throw new Error(`Post with slug "${options.slug}" not found`);
  }

  const commentsEndpoint = config.commentsEndpoint;
  const commentsSubmitUrl = commentsEndpoint
    ? `${commentsEndpoint}/submit`
    : undefined;

  const pageSize = config.commentsPerPage ?? DEFAULT_COMMENTS_PER_PAGE;

  for (const post of targetPosts) {
    const domain = `https://${config.domain}`;
    const permalink = post.url.startsWith(domain)
      ? post.url.slice(domain.length)
      : `/${post.slug}.html`;

    const dir = permalinkDir(permalink);
    if (dir) {
      await mkdir(join(outDir, dir), { recursive: true });
    }

    let allComments: Comment[] | undefined;
    if (commentsEndpoint) {
      allComments = await fetchComments(post.slug, commentsEndpoint);
    }

    const idx = posts.indexOf(post);
    const prevPost = idx > 0
      ? { title: posts[idx - 1]!.title ?? posts[idx - 1]!.body.slice(0, 60), url: posts[idx - 1]!.url }
      : undefined;
    const nextPost = idx < posts.length - 1
      ? { title: posts[idx + 1]!.title ?? posts[idx + 1]!.body.slice(0, 60), url: posts[idx + 1]!.url }
      : undefined;

    const pages = paginateComments(allComments ?? [], pageSize);
    const totalPages = pages.length;
    const totalComments = (allComments ?? []).length;
    const canPaginate = !!dir;
    if (!canPaginate && totalPages > 1) {
      console.warn(
        pc.yellow(
          `Warning: ${post.slug} has ${totalComments} comments but uses a flat permalink — comment pagination requires a directory-based permalink (e.g. /posts/:slug/index.html). Only the first ${pageSize} comments will be shown.`,
        ),
      );
    }
    const baseUrl = dir ? `/${dir}/` : "/";

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const pageComments = pages[pageNum - 1]!;

      let htmlPath: string;
      let pageUrl: string;
      if (pageNum === 1) {
        htmlPath = permalink.startsWith("/") ? permalink.slice(1) : permalink;
        pageUrl = post.url;
      } else if (canPaginate) {
        htmlPath = `${dir}/${pageNum}/index.html`;
        pageUrl = `https://${config.domain}${baseUrl}${pageNum}/`;
        await mkdir(join(outDir, dir, String(pageNum)), { recursive: true });
      } else {
        break;
      }

      const commentPagination: CommentPaginationInfo | undefined =
        totalPages > 1 && canPaginate
          ? { currentPage: pageNum, totalPages, totalComments, baseUrl }
          : undefined;

      const html = generateHtmlPage(post, config, {
        pageUrl,
        comments: pageComments,
        commentsSubmitUrl,
        prevPost,
        nextPost,
        commentPagination,
      });
      await writeFile(join(outDir, htmlPath), html);
    }

    if (canPaginate) {
      await cleanStaleCommentPages(outDir, dir, totalPages);
    }
  }

  await writeFavicon(siteDir, config.title, config.style.preset, config.style.overrides);
  await writeOgImage(siteDir, config.title, config.description, config.style.preset, config.style.overrides);
  await rebuildFeeds(siteDir, config, posts);
  await rebuildIndex(siteDir, config, posts);
  await writeSearchIndex(siteDir, posts);
  await writeSeo(siteDir, config, posts);
  await writePages(siteDir, config);

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
  .option("--site-dir <dir>", "Path to site directory", ".")
  .option("--slug <slug>", "Only regenerate the page for this post slug")
  .action(async (siteDirArg: string, opts: { siteDir: string; slug?: string }) => {
    const siteDir = resolve(opts.siteDir !== "." ? opts.siteDir : siteDirArg);
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
