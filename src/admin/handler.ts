import type { Post } from "../config/types.js";
import { addContent } from "../generator/site.js";
import { parseAdminForm, buildContentFromForm } from "./publish.js";

export interface PublishResult {
  ok: boolean;
  post?: Post;
  error?: string;
  targets: { site: boolean; x: boolean };
}

/**
 * Handle a POST from the admin compose form.
 * Parses URL-encoded body, builds content, and publishes to the site.
 * X posting is recorded as a target but handled by the caller (dev server).
 */
export async function handleAdminPublish(
  rawBody: string,
  siteDir: string,
): Promise<PublishResult> {
  const form = parseAdminForm(rawBody);
  const targets = { site: form.targetSite, x: form.targetX };

  let content;
  try {
    content = buildContentFromForm(form);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid input",
      targets,
    };
  }

  try {
    const post = await addContent(siteDir, content);
    return { ok: true, post, targets };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Publish failed",
      targets,
    };
  }
}
