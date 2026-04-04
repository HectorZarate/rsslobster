import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { outputDir } from "../config/paths.js";
export { outputDir } from "../config/paths.js";
import type {
  ClassifiedContent,
  FeedConfig,
  FeedItem,
  Post,
  SiteConfig,
} from "../config/types.js";
import { generateHtmlPage, generateIndexPage, generateArchivePage } from "./html.js";
import { initMarkdown, renderMarkdown } from "./markdown.js";
import { generateRss } from "./rss.js";
import { generateJsonFeed } from "./json-feed.js";
import { writeSearchIndex } from "./search.js";
import { writeSeo } from "./seo.js";
import { writePages } from "../pages/pages.js";
import { expandPermalink, permalinkDir, DEFAULT_PERMALINK } from "../config/permalink.js";
import type { PageInjections } from "../plugins/types.js";
import { loadCustomCss } from "../styles/presets.js";
import { writeFavicon, writeOgImage } from "./favicon.js";
import { generateBlogrollPage } from "./html.js";
import { listSubscriptions } from "../reader/subscriptions.js";

const POSTS_INDEX = "posts.json";

/**
 * Site-level operations: add content, rebuild feeds, read config.
 */

/** Read site config from rsslobster.json */
export async function readSiteConfig(siteDir: string): Promise<SiteConfig> {
  const raw = await readFile(join(siteDir, "rsslobster.json"), "utf-8");
  return JSON.parse(raw) as SiteConfig;
}

/** Write site config */
export async function writeSiteConfig(
  siteDir: string,
  config: SiteConfig,
): Promise<void> {
  await writeFile(
    join(siteDir, "rsslobster.json"),
    JSON.stringify(config, null, 2),
  );
}

/** Read the posts index */
export async function readPostsIndex(siteDir: string): Promise<Post[]> {
  try {
    const raw = await readFile(join(siteDir, POSTS_INDEX), "utf-8");
    return JSON.parse(raw) as Post[];
  } catch {
    return [];
  }
}

/** Write the posts index */
async function writePostsIndex(
  siteDir: string,
  posts: Post[],
): Promise<void> {
  await writeFile(join(siteDir, POSTS_INDEX), JSON.stringify(posts, null, 2));
}

/** Optional injections from plugin system */
export interface AddContentOptions {
  pluginInjections?: PageInjections;
}

/** Add content to the site: generate HTML, update feeds, update index */
export async function addContent(
  siteDir: string,
  content: ClassifiedContent,
  options?: AddContentOptions,
): Promise<Post> {
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

  const posts = await readPostsIndex(siteDir);

  const existingSlugs = new Set(posts.map((p) => p.slug));
  let slug = content.slug;
  let counter = 1;
  while (existingSlugs.has(slug)) {
    slug = `${content.slug}-${++counter}`;
  }
  if (slug !== content.slug) {
    content = { ...content, slug };
  }

  const permalink = expandPermalink(config.permalink, content);
  const dir = permalinkDir(permalink);
  const outDir = outputDir(siteDir);
  if (dir) {
    await mkdir(join(outDir, dir), { recursive: true });
  }

  const pageUrl = `https://${config.domain}${permalink}`;
  const commentsSubmitUrl = config.commentsEndpoint
    ? `${config.commentsEndpoint}/submit`
    : undefined;
  const html = generateHtmlPage(content, config, {
    pluginInjections: options?.pluginInjections,
    pageUrl,
    comments: [],
    commentsSubmitUrl,
  });

  const htmlPath = permalink.startsWith("/") ? permalink.slice(1) : permalink;
  await writeFile(join(outDir, htmlPath), html);

  const post: Post = {
    ...content,
    url: pageUrl,
    publishedAt: new Date().toISOString(),
  };

  posts.unshift(post);
  await writePostsIndex(siteDir, posts);

  await Promise.all([
    rebuildFeeds(siteDir, config, posts),
    rebuildIndex(siteDir, config, posts, options?.pluginInjections),
    writeSearchIndex(siteDir, posts),
    writeSeo(siteDir, config, posts),
    writePages(siteDir, config, options?.pluginInjections),
    rebuildBlogroll(siteDir, config),
  ]);

  return post;
}

/** Delete a post by slug. Returns the deleted post, or null if not found. */
export async function deletePost(
  siteDir: string,
  slug: string,
): Promise<Post | null> {
  await initMarkdown();
  const config = await readSiteConfig(siteDir);
  const posts = await readPostsIndex(siteDir);
  const outDir = outputDir(siteDir);

  const idx = posts.findIndex((p) => p.slug === slug);
  if (idx === -1) return null;

  const post = posts[idx]!;
  posts.splice(idx, 1);
  await writePostsIndex(siteDir, posts);

  const domain = `https://${config.domain}`;
  const permalink = post.url.startsWith(domain)
    ? post.url.slice(domain.length)
    : `/${post.slug}.html`;
  const htmlDir = permalinkDir(permalink);
  if (htmlDir) {
    await rm(join(outDir, htmlDir), { recursive: true, force: true });
  } else {
    const htmlPath = permalink.startsWith("/") ? permalink.slice(1) : permalink;
    await rm(join(outDir, htmlPath), { force: true });
  }

  await Promise.all([
    rebuildFeeds(siteDir, config, posts),
    rebuildIndex(siteDir, config, posts),
    writeSearchIndex(siteDir, posts),
    writeSeo(siteDir, config, posts),
  ]);

  return post;
}

/** Rebuild RSS and JSON feeds from the posts index */
export async function rebuildFeeds(
  siteDir: string,
  config: SiteConfig,
  posts: Post[],
): Promise<void> {
  const feedConfig: FeedConfig = {
    title: config.title,
    link: `https://${config.domain}`,
    description: config.description,
    language: config.language,
    author: config.author,
    feedUrl: `https://${config.domain}/feed.xml`,
    imageUrl: `https://${config.domain}/icon.png`,
  };

  const feedPosts = posts.filter((p) => !p.noRss);
  const items: FeedItem[] = feedPosts.slice(0, 20).map((p) => ({
    title: p.title,
    link: p.url,
    description: renderMarkdown(p.body),
    pubDate: new Date(p.publishedAt).toUTCString(),
    guid: p.url,
    author: config.author,
    categories: p.tags.length > 0 ? p.tags : undefined,
    enclosure: p.media?.[0]
      ? {
          url: `https://${config.domain}${p.media[0].src}`,
          type: p.media[0].mimeType,
        }
      : p.images?.[0]
        ? {
            url: `https://${config.domain}${p.images[0].src}`,
            type: mimeFromSrc(p.images[0].src),
          }
        : undefined,
  }));

  const rss = generateRss(feedConfig, items);
  const json = generateJsonFeed(feedConfig, items);

  await writeFile(join(outputDir(siteDir), "feed.xml"), rss);
  await writeFile(join(outputDir(siteDir), "feed.json"), json);
}

/** Rebuild the blogroll / following page from current subscriptions */
export async function rebuildBlogroll(
  siteDir: string,
  config: SiteConfig,
): Promise<void> {
  const subs = await listSubscriptions(siteDir);
  if (subs.length === 0) return;

  const outDir = outputDir(siteDir);
  const followingDir = join(outDir, "following");
  await mkdir(followingDir, { recursive: true });
  const html = generateBlogrollPage(subs, config);
  await writeFile(join(followingDir, "index.html"), html);
}

/** Rebuild the index.html and archive.html pages */
export async function rebuildIndex(
  siteDir: string,
  config: SiteConfig,
  posts: Post[],
  injections?: PageInjections,
): Promise<void> {
  const outDir = outputDir(siteDir);
  const visiblePosts = posts.filter((p) => !p.noRss);
  const html = generateIndexPage(visiblePosts, config, injections);

  // If a homepage page is set, post listing goes to /posts/index.html
  if (config.homepage) {
    const postsDir = join(outDir, "posts");
    await mkdir(postsDir, { recursive: true });
    await writeFile(join(postsDir, "index.html"), html);
  } else {
    await writeFile(join(outDir, "index.html"), html);
  }

  // Generate archive page if there are enough posts
  if (visiblePosts.length > 30) {
    const archive = generateArchivePage(visiblePosts, config, injections);
    await writeFile(join(outDir, "archive.html"), archive);
  }
}

/** Scaffold a new site directory */
export async function scaffoldSite(
  siteDir: string,
  config: SiteConfig,
): Promise<void> {
  await mkdir(siteDir, { recursive: true });
  const outDir = outputDir(siteDir);
  await mkdir(outDir, { recursive: true });
  await mkdir(join(outDir, "images"), { recursive: true });
  await mkdir(join(outDir, "media"), { recursive: true });
  await mkdir(join(siteDir, "drafts"), { recursive: true });

  // Lock permalink pattern in config so future rsslobster upgrades don't break URLs
  if (!config.permalink) {
    config = { ...config, permalink: DEFAULT_PERMALINK };
  }

  await writeSiteConfig(siteDir, config);
  await writePostsIndex(siteDir, []);

  await writeFavicon(siteDir, config.title, config.style.preset, config.style.overrides);
  await writeOgImage(siteDir, config.title, config.description, config.style.preset, config.style.overrides);

  await rebuildFeeds(siteDir, config, []);
  await rebuildIndex(siteDir, config, []);
  await writeSearchIndex(siteDir, []);
  await writeSeo(siteDir, config, []);
  await writePages(siteDir, config);
}

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function mimeFromSrc(src: string): string {
  const ext = src.slice(src.lastIndexOf(".")).toLowerCase();
  return MIME_MAP[ext] ?? "image/jpeg";
}
