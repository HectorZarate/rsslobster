import type { ContentType } from "../config/types.js";

const VALID_TYPES = new Set<ContentType>([
  "micro",
  "post",
  "image",
  "carousel",
  "link",
]);

export interface ClassificationResult {
  type: ContentType;
  title?: string;
  body: string;
  slug: string;
  tags: string[];
  isDraft: boolean;
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
}

/** Function signature for calling any OpenAI-compatible chat completions API. */
export type CallModel = (
  systemPrompt: string,
  temperature?: number,
) => Promise<string>;

/** Build the system+user prompt for classification. */
export function buildClassificationPrompt(
  text: string,
  hasImages?: boolean,
): string {
  const imageNote = hasImages
    ? "\nThe user attached one or more images to this message."
    : "";

  return `You are a content classifier for a personal publishing tool. Classify the following message into one of these types:

- "micro": Short text (< 280 chars), no title, no URL, no image — like a tweet
- "post": Longer writing with a title, or the user explicitly says "blog post"
- "image": A single image with a caption${hasImages ? " (images are attached)" : ""}
- "carousel": Multiple images with narrative${hasImages ? " (images are attached)" : ""}
- "link": A shared URL with commentary

Respond with ONLY valid JSON (no markdown fences):
{
  "type": "micro|post|image|carousel|link",
  "title": "string or null",
  "body": "the content text",
  "tags": ["lowercase", "tags"],
  "isDraft": false,
  "linkUrl": "URL if type is link, omit otherwise",
  "linkTitle": "link title if available",
  "linkDescription": "link description if available"
}

Rules:
- 1-3 tags max, lowercase, hyphenated if multi-word
- isDraft=true only if the user says "draft", "save for later", etc.
- For "post" type, extract the title from the first line or heading
- For "link" type, extract the URL from the message
- body should be the cleaned content text
${imageNote}

User message:
${text}`;
}

/** Generate a URL-friendly slug from text. */
function slugify(text: string, maxLen = 60): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen);

  // Don't end on a partial word or hyphen
  const trimmed =
    slug.length >= maxLen && slug.includes("-")
      ? slug.slice(0, slug.lastIndexOf("-"))
      : slug;
  return trimmed.replace(/-$/, "");
}

/** Parse the LLM's JSON response into a ClassificationResult. */
export function parseClassificationResponse(
  response: string,
): ClassificationResult {
  // Strip markdown code fences if present
  let cleaned = response.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid classification JSON: ${response.slice(0, 100)}`);
  }

  const type = parsed["type"] as string;
  if (!type || !VALID_TYPES.has(type as ContentType)) {
    throw new Error(
      `Invalid content type: "${type}". Must be one of: ${[...VALID_TYPES].join(", ")}`,
    );
  }

  const body = (parsed["body"] as string) ?? "";
  const title = (parsed["title"] as string) ?? undefined;
  const slug = slugify(title ?? body);

  if (!slug) {
    throw new Error("Could not generate slug from content");
  }

  return {
    type: type as ContentType,
    title,
    body,
    slug,
    tags: Array.isArray(parsed["tags"])
      ? (parsed["tags"] as string[])
      : [],
    isDraft: (parsed["isDraft"] as boolean) ?? false,
    linkUrl: (parsed["linkUrl"] as string) ?? undefined,
    linkTitle: (parsed["linkTitle"] as string) ?? undefined,
    linkDescription: (parsed["linkDescription"] as string) ?? undefined,
  };
}

/** Classify a user message by calling the model. */
export async function classifyContent(
  text: string,
  imagePaths: string[],
  callModel: CallModel,
): Promise<ClassificationResult> {
  const prompt = buildClassificationPrompt(text, imagePaths.length > 0);
  const response = await callModel(prompt, 0);
  return parseClassificationResponse(response);
}
