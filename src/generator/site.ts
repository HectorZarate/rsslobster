import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  ClassifiedContent,
  FeedConfig,
  FeedItem,
  Post,
  SiteConfig,
} from "../config/types.js";
import { generateHtmlPage, generateIndexPage, generateArchivePage, escHtml } from "./html.js";
import { generateRss } from "./rss.js";
import { generateJsonFeed } from "./json-feed.js";
import { writeSearchIndex } from "./search.js";

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

/** Add content to the site: generate HTML, update feeds, update index */
export async function addContent(
  siteDir: string,
  content: ClassifiedContent,
): Promise<Post> {
  const config = await readSiteConfig(siteDir);
  const posts = await readPostsIndex(siteDir);

  // Resolve slug collisions — append -2, -3, etc. if slug already exists
  const existingSlugs = new Set(posts.map((p) => p.slug));
  let slug = content.slug;
  let counter = 1;
  while (existingSlugs.has(slug)) {
    slug = `${content.slug}-${++counter}`;
  }
  if (slug !== content.slug) {
    content = { ...content, slug };
  }

  // Generate HTML page
  const html = generateHtmlPage(content, config);
  await writeFile(join(siteDir, `${content.slug}.html`), html);

  // Create post record
  const post: Post = {
    ...content,
    url: `https://${config.domain}/${content.slug}.html`,
    publishedAt: new Date().toISOString(),
  };

  // Prepend to posts (newest first)
  posts.unshift(post);
  await writePostsIndex(siteDir, posts);

  // Rebuild feeds, index, and search
  await rebuildFeeds(siteDir, config, posts);
  await rebuildIndex(siteDir, config, posts);
  await writeSearchIndex(siteDir, posts);

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
  };

  const items: FeedItem[] = posts.slice(0, 20).map((p) => ({
    title: p.title ?? truncate(p.body, 80),
    link: p.url,
    description: escHtml(p.body),
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

  await writeFile(join(siteDir, "feed.xml"), rss);
  await writeFile(join(siteDir, "feed.json"), json);
}

/** Rebuild the index.html and archive.html pages */
async function rebuildIndex(
  siteDir: string,
  config: SiteConfig,
  posts: Post[],
): Promise<void> {
  const html = generateIndexPage(posts, config);
  await writeFile(join(siteDir, "index.html"), html);

  // Generate archive page if there are enough posts
  if (posts.length > 30) {
    const archive = generateArchivePage(posts, config);
    await writeFile(join(siteDir, "archive.html"), archive);
  }
}

/** Scaffold a new site directory */
export async function scaffoldSite(
  siteDir: string,
  config: SiteConfig,
): Promise<void> {
  await mkdir(siteDir, { recursive: true });
  await mkdir(join(siteDir, "images"), { recursive: true });
  await mkdir(join(siteDir, "media"), { recursive: true });
  await mkdir(join(siteDir, "drafts"), { recursive: true });

  await writeSiteConfig(siteDir, config);
  await writePostsIndex(siteDir, []);

  // Generate empty index, feeds, and search
  await rebuildFeeds(siteDir, config, []);
  await rebuildIndex(siteDir, config, []);
  await writeSearchIndex(siteDir, []);
}

function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  return s.slice(0, len - 1) + "\u2026";
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
