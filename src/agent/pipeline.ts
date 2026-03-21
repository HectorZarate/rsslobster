import type { InboundMessage } from "../channels/types.js";
import type { ClassifiedContent, Draft, Post } from "../config/types.js";
import { classifyContent, type CallModel } from "./classify.js";
import { addContent } from "../generator/site.js";
import { createDraft } from "../drafts/drafts.js";
import { deployToGit, type DeployResult } from "../deploy/git.js";
import { ingestImages } from "../images/images.js";
import { ingestMedia } from "../images/media.js";

export interface PipelineConfig {
  siteDir: string;
  callModel: CallModel;
  /** Whether to git commit+push after generation. Default true. */
  deploy?: boolean;
}

export interface PipelineResult {
  post?: Post;
  draft?: Draft;
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

  // Step 4: Draft or publish
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

  // Step 6: Deploy (if enabled)
  let deployResult: DeployResult | undefined;
  if (shouldDeploy) {
    deployResult = await deployToGit(
      config.siteDir,
      classification.type,
      classification.slug,
    );
  }

  const deployed = deployResult?.committed === true && !deployResult.pushError;
  const reply = deployed
    ? `Published. ${post.url}`
    : `Published locally. ${post.url}`;

  return { post, deployed, deployResult, reply };
}
