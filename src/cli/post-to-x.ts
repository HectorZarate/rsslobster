import { Command } from "commander";
import { resolve } from "node:path";
import pc from "picocolors";
import { TwitterApi } from "twitter-api-v2";
import { readPostsIndex, readSiteConfig } from "../generator/site.js";
import { readLobsterConfig } from "../config/lobster.js";
import { expandPermalink } from "../config/permalink.js";
import { resolveTargetSite } from "../config/workspace.js";
import type { Post } from "../config/types.js";

const TWEET_MAX = 280;
/** URLs always count as 23 chars on X regardless of actual length */
const URL_CHAR_COUNT = 23;

/** Format a post into tweet text based on its content type */
function formatTweet(post: Post, postUrl: string): string {
  switch (post.type) {
    case "micro":
      // Micros are already <280 chars. Append URL only if it fits.
      if (post.body.length + 1 + URL_CHAR_COUNT <= TWEET_MAX) {
        return `${post.body}\n${postUrl}`;
      }
      return post.body;

    case "post": {
      // Title + URL. Truncate title if needed.
      const title = post.title ?? post.body;
      const available = TWEET_MAX - URL_CHAR_COUNT - 2; // 2 for "\n\n"
      const truncated =
        title.length > available
          ? title.slice(0, available - 1) + "\u2026"
          : title;
      return `${truncated}\n\n${postUrl}`;
    }

    case "link": {
      // Body + the shared link (prefer linkUrl over post page URL)
      const url = post.linkUrl ?? postUrl;
      const available = TWEET_MAX - URL_CHAR_COUNT - 2;
      const text = post.body.length > available
        ? post.body.slice(0, available - 1) + "\u2026"
        : post.body;
      return `${text}\n\n${url}`;
    }

    default: {
      // image, carousel, video, audio — text + post URL
      const available = TWEET_MAX - URL_CHAR_COUNT - 2;
      const text = post.body.length > available
        ? post.body.slice(0, available - 1) + "\u2026"
        : post.body;
      return `${text}\n\n${postUrl}`;
    }
  }
}

export const postToXCommand = new Command("post-to-x")
  .description("Share a published post to X (Twitter)")
  .argument("<slug>", "Post slug to share")
  .option("--text <text>", "Custom tweet text (overrides auto-formatting)")
  .option("--dry-run", "Show what would be posted without sending")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .option("--to <site>", "Target a different registered site")
  .action(
    async (
      slug: string,
      opts: {
        text?: string;
        dryRun?: boolean;
        siteDir: string;
        to?: string;
      },
    ) => {
      let siteDir = resolve(opts.siteDir);

      if (opts.to) {
        try {
          const resolved = await resolveTargetSite(opts.to);
          siteDir = resolved.siteDir;
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Failed to resolve target site";
          console.error(pc.red(msg));
          process.exit(1);
        }
      }

      // Find the post
      const posts = await readPostsIndex(siteDir);
      const post = posts.find((p) => p.slug === slug);
      if (!post) {
        console.error(pc.red(`No post with slug "${slug}" found.`));
        process.exit(1);
      }

      // Build post URL
      const config = await readSiteConfig(siteDir);
      const permalink = expandPermalink(config.permalink, post);
      const postUrl = `https://${config.domain}${permalink}`;

      // Format tweet
      const tweetText = opts.text ?? formatTweet(post, postUrl);

      if (opts.dryRun) {
        console.log(pc.dim("Dry run — would post to X:\n"));
        console.log(tweetText);
        console.log(pc.dim(`\n(${tweetText.length} chars)`));
        return;
      }

      // Read X credentials
      const lobster = await readLobsterConfig(siteDir);
      if (!lobster.twitter) {
        console.error(
          pc.red(
            "X credentials not configured. Run: rsslobster enable x",
          ),
        );
        process.exit(1);
      }

      const { apiKey, apiKeySecret, accessToken, accessTokenSecret } =
        lobster.twitter;

      const client = new TwitterApi({
        appKey: apiKey,
        appSecret: apiKeySecret,
        accessToken,
        accessSecret: accessTokenSecret,
      });

      try {
        const result = await client.v2.tweet(tweetText);
        const tweetUrl = `https://x.com/i/status/${result.data.id}`;
        console.log(pc.green(`Posted to X. ${tweetUrl}`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to post";
        console.error(pc.red(`X API error: ${msg}`));
        process.exit(1);
      }
    },
  );
