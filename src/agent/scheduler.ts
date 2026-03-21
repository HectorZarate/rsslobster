import type { Post } from "../config/types.js";
import { getDueScheduledDrafts, markPublished } from "../drafts/drafts.js";
import { addContent } from "../generator/site.js";

/**
 * Find and publish all scheduled drafts that are past their scheduled time.
 * Called on a timer by the start command (every 60s).
 * Returns the list of newly published posts.
 */
export async function publishDueScheduled(siteDir: string): Promise<Post[]> {
  const due = await getDueScheduledDrafts(siteDir);
  if (due.length === 0) return [];

  const published: Post[] = [];

  for (const draft of due) {
    try {
      const post = await addContent(siteDir, draft);
      await markPublished(siteDir, draft.slug);
      published.push(post);
    } catch {
      // Individual failures don't block remaining publishes
      continue;
    }
  }

  return published;
}
