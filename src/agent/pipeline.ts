import type { InboundMessage } from "../channels/types.js";
import type { ClassifiedContent, Draft, Post } from "../config/types.js";
import { classifyContent, type CallModel } from "./classify.js";
import { addContent } from "../generator/site.js";
import { createDraft, getDraft } from "../drafts/drafts.js";
import { deployToGit, type DeployResult } from "../deploy/git.js";
import { ingestImages } from "../images/images.js";
import { ingestMedia } from "../images/media.js";
import {
  createPreview,
  promotePreview,
} from "../previews/previews.js";
import {
  fireHooks,
  parseHookOverride,
  type HooksConfig,
} from "../hooks/hooks.js";

export interface PipelineConfig {
  siteDir: string;
  callModel: CallModel;
  /** Whether to git commit+push after generation. Default true. */
  deploy?: boolean;
  /** Lifecycle hooks configuration */
  hooks?: HooksConfig;
}

export interface PipelineResult {
  post?: Post;
  draft?: Draft;
  /** Draft with active preview (set when preview flow is used) */
  preview?: Draft;
  deployed: boolean;
  deployResult?: DeployResult;
  reply: string;
  error?: string;
}

/** Process a single inbound message through the full pipeline. */
export async function processMessage(
  message: InboundMessage,
  config: PipelineConfig,
): Promise<PipelineResult> {
  const shouldDeploy = config.deploy !== false;

  // --- Command dispatch (before classification) ---

  // Handle "publish {slug}" — promote a draft (with or without preview)
  const publishMatch = message.text.match(/^publish\s+(\S+)$/i);
  if (publishMatch) {
    return handlePublishCommand(publishMatch[1]!, config, shouldDeploy);
  }

  // Handle "preview {slug}" — preview an existing draft (no colon = existing slug)
  const previewSlugMatch = message.text.match(/^preview\s+(\S+)$/i);
  if (previewSlugMatch) {
    return handlePreviewExistingDraft(previewSlugMatch[1]!, config, shouldDeploy);
  }

  // --- Strip "preview:" prefix, mark for preview flow ---
  let wantsPreview = false;
  const previewPrefix = message.text.match(/^preview:\s*/i);
  if (previewPrefix) {
    wantsPreview = true;
    message = { ...message, text: message.text.slice(previewPrefix[0].length) };
  }

  // Step 1: Classify
  const mediaMimeTypes = message.mediaFiles.map((m) => m.mimeType);
  let classification;
  try {
    classification = await classifyContent(
      message.text,
      message.images.map((img) => img.localPath),
      config.callModel,
      mediaMimeTypes,
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : "Classification failed";
    return { deployed: false, reply: `Failed to process: ${error}`, error };
  }

  // Hook: afterClassify — can override classification fields
  const classifyHookOutput = await fireHooks(
    "afterClassify",
    config.hooks,
    { ...classification },
    config.siteDir,
    classification.type,
  );
  const overrides = parseHookOverride(classifyHookOutput);
  if (overrides) {
    if (typeof overrides["body"] === "string") classification.body = overrides["body"];
    if (typeof overrides["title"] === "string") classification.title = overrides["title"];
    if (typeof overrides["slug"] === "string") classification.slug = overrides["slug"];
    if (Array.isArray(overrides["tags"])) {
      classification.tags = (overrides["tags"] as unknown[]).filter(
        (t): t is string => typeof t === "string",
      );
    }
    if (typeof overrides["isDraft"] === "boolean") classification.isDraft = overrides["isDraft"];
  }

  // Override for preview flow: previews are always backed by drafts
  if (wantsPreview || classification.isPreview) {
    classification.isDraft = true;
  }

  // Step 2: Ingest images into site/images/ directory
  const images = await ingestImages(
    config.siteDir,
    message.images,
    classification.slug,
  );

  // Step 2b: Ingest media (video/audio) into site/media/ directory
  const media = message.mediaFiles.length > 0
    ? await ingestMedia(config.siteDir, message.mediaFiles, classification.slug)
    : [];

  // Step 3: Build ClassifiedContent
  const now = new Date().toISOString();
  const content: ClassifiedContent = {
    type: classification.type,
    title: classification.title,
    body: classification.body,
    slug: classification.slug,
    tags: classification.tags,
    images: images.length > 0 ? images : undefined,
    media: media.length > 0 ? media : undefined,
    linkUrl: classification.linkUrl,
    linkTitle: classification.linkTitle,
    linkDescription: classification.linkDescription,
    createdAt: now,
    updatedAt: now,
  };

  // Step 4: Route — preview, draft, or publish
  if (wantsPreview || classification.isPreview) {
    return handlePreviewNew(content, config, shouldDeploy);
  }

  if (classification.isDraft) {
    try {
      const draft = await createDraft(config.siteDir, content);
      return {
        draft,
        deployed: false,
        reply: `Saved as draft. Say "publish ${draft.slug}" when ready.`,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Draft save failed";
      return { deployed: false, reply: `Failed to save draft: ${error}`, error };
    }
  }

  // Step 5: Generate HTML + feeds
  let post: Post;
  try {
    post = await addContent(config.siteDir, content);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Generation failed";
    return { deployed: false, reply: `Failed to generate: ${error}`, error };
  }

  // Hook: afterPublish
  await fireHooks(
    "afterPublish",
    config.hooks,
    { url: post.url, slug: classification.slug, type: classification.type, tags: classification.tags },
    config.siteDir,
    classification.type,
  );

  // Step 6: Deploy (if enabled)
  let deployResult: DeployResult | undefined;
  if (shouldDeploy) {
    deployResult = await deployToGit(
      config.siteDir,
      `publish: ${classification.type} — ${classification.slug}`,
    );
  }

  const deployed = deployResult?.committed === true && !deployResult.pushError;
  const reply = deployed
    ? `Published. ${post.url}`
    : `Published locally. ${post.url}`;

  // Hook: afterDeploy
  if (shouldDeploy) {
    await fireHooks(
      "afterDeploy",
      config.hooks,
      {
        url: post.url,
        slug: classification.slug,
        committed: deployResult?.committed ?? false,
        pushError: deployResult?.pushError,
      },
      config.siteDir,
      classification.type,
    );
  }

  return { post, deployed, deployResult, reply };
}

// --- Preview & Promote helpers ---

/** Create a new preview from freshly classified content. */
async function handlePreviewNew(
  content: ClassifiedContent,
  config: PipelineConfig,
  shouldDeploy: boolean,
): Promise<PipelineResult> {
  try {
    const draft = await createDraft(config.siteDir, content);
    const preview = await createPreview(config.siteDir, draft);

    // Hook: afterPreview
    await fireHooks(
      "afterPreview",
      config.hooks,
      { previewUrl: preview.previewUrl, slug: preview.slug, type: preview.type, tags: preview.tags },
      config.siteDir,
      preview.type,
    );

    // Deploy preview
    let deployResult: DeployResult | undefined;
    if (shouldDeploy) {
      deployResult = await deployToGit(config.siteDir, `preview: ${preview.slug}`);
    }

    const deployed = deployResult?.committed === true && !deployResult.pushError;
    return {
      preview,
      deployed,
      deployResult,
      reply: `Preview: ${preview.previewUrl}\nPublish with: publish ${preview.slug}`,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Preview failed";
    return { deployed: false, reply: `Failed to create preview: ${error}`, error };
  }
}

/** Generate a preview for an existing draft by slug. */
async function handlePreviewExistingDraft(
  slug: string,
  config: PipelineConfig,
  shouldDeploy: boolean,
): Promise<PipelineResult> {
  try {
    const draft = await getDraft(config.siteDir, slug);
    if (!draft) {
      return {
        deployed: false,
        reply: `Draft "${slug}" not found.`,
        error: `Draft "${slug}" not found`,
      };
    }

    const preview = await createPreview(config.siteDir, draft);

    // Hook: afterPreview
    await fireHooks(
      "afterPreview",
      config.hooks,
      { previewUrl: preview.previewUrl, slug: preview.slug, type: preview.type, tags: preview.tags },
      config.siteDir,
      preview.type,
    );

    let deployResult: DeployResult | undefined;
    if (shouldDeploy) {
      deployResult = await deployToGit(config.siteDir, `preview: ${preview.slug}`);
    }

    const deployed = deployResult?.committed === true && !deployResult.pushError;
    return {
      preview,
      deployed,
      deployResult,
      reply: `Preview: ${preview.previewUrl}\nPublish with: publish ${preview.slug}`,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Preview failed";
    return { deployed: false, reply: `Failed to preview: ${error}`, error };
  }
}

/** Promote a draft to published post. */
async function handlePublishCommand(
  slug: string,
  config: PipelineConfig,
  shouldDeploy: boolean,
): Promise<PipelineResult> {
  try {
    const post = await promotePreview(config.siteDir, slug);

    // Hook: afterPublish
    await fireHooks(
      "afterPublish",
      config.hooks,
      { url: post.url, slug: post.slug, type: post.type, tags: post.tags },
      config.siteDir,
      post.type,
    );

    let deployResult: DeployResult | undefined;
    if (shouldDeploy) {
      deployResult = await deployToGit(
        config.siteDir,
        `publish: ${post.type} — ${post.slug}`,
      );
    }

    const deployed = deployResult?.committed === true && !deployResult.pushError;
    const reply = deployed
      ? `Published. ${post.url}`
      : `Published locally. ${post.url}`;

    // Hook: afterDeploy
    if (shouldDeploy) {
      await fireHooks(
        "afterDeploy",
        config.hooks,
        {
          url: post.url,
          slug: post.slug,
          committed: deployResult?.committed ?? false,
          pushError: deployResult?.pushError,
        },
        config.siteDir,
        post.type,
      );
    }

    return { post, deployed, deployResult, reply };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Publish failed";
    return { deployed: false, reply: `Failed to publish: ${error}`, error };
  }
}
