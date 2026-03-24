import type { ContentType } from "../config/types.js";
import { VALID_TYPES, MAX_TAGS, slugify } from "../config/content.js";

export interface ClassificationResult {
  type: ContentType;
  title?: string;
  body: string;
  slug: string;
  tags: string[];
  isDraft: boolean;
  /** True when user wants to preview before publishing */
  isPreview: boolean;
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
}

/** Function signature for calling any OpenAI-compatible chat completions API. */
export type CallModel = (
  systemPrompt: string,
  temperature?: number,
) => Promise<string>;

/** Build the classification prompt with few-shot examples. */
export function buildClassificationPrompt(
  text: string,
  imageCount = 0,
  mediaCount = 0,
  mediaMimeTypes: string[] = [],
): string {
  const imageNote =
    imageCount > 0
      ? `\nThe user attached ${imageCount} image${imageCount > 1 ? "s" : ""} to this message.`
      : "";

  const mediaNote =
    mediaCount > 0
      ? `\nThe user attached ${mediaCount} media file${mediaCount > 1 ? "s" : ""} (${mediaMimeTypes.join(", ")}).`
      : "";

  return `Classify this message for a personal blog. Return ONLY a JSON object.

Types:
- "micro": Short text (<280 chars), no title, no URL
- "post": Longer writing or has a title/heading
- "image": Single image with caption
- "carousel": Multiple images
- "link": Shared URL with commentary
- "video": Video clip with optional caption
- "audio": Voice note or audio recording with optional caption

Examples:

Input: "The coffee in Lisbon is incredible."
{"type":"micro","body":"The coffee in Lisbon is incredible.","tags":["travel"],"isDraft":false}

Input: "# Why RSS Still Matters\nIn 2025, owning your content..."
{"type":"post","title":"Why RSS Still Matters","body":"In 2025, owning your content...","tags":["rss","indieweb"],"isDraft":false}

Input: "Check out https://example.com/great-article — best thing I read this week"
{"type":"link","body":"Best thing I read this week","tags":["reading"],"isDraft":false,"linkUrl":"https://example.com/great-article"}

Input: "Draft: thinking about writing something on distributed systems"
{"type":"post","body":"thinking about writing something on distributed systems","tags":["tech"],"isDraft":true,"isPreview":false}

Input: "Preview this: my take on why RSS still matters in 2026"
{"type":"post","body":"my take on why RSS still matters in 2026","tags":["rss"],"isDraft":false,"isPreview":true}

Rules:
- 1-3 lowercase tags max. If nothing fits, empty array.
- isDraft=true ONLY if user says "draft", "save for later", "wip"
- isPreview=true ONLY if user says "preview", "preview this", "let me see"
- title only for "post" type. null otherwise.
- For "link": extract the URL into linkUrl
- body = MUST be the EXACT original input text, unmodified. Never rewrite, summarize, or clean the user's words.
- If a video file is attached, use type "video"
- If an audio/voice file is attached, use type "audio"
${imageNote}${mediaNote}
Input: "${text.replace(/"/g, '\\"')}"`;
}

// --- Response parsing ---

/** Extract a JSON object from potentially messy LLM output. */
function extractJson(response: string): string {
  let cleaned = response.trim();

  // Strip markdown code fences
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    return cleaned.trim();
  }

  // Try to find a JSON object in the response
  const braceStart = cleaned.indexOf("{");
  const braceEnd = cleaned.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    return cleaned.slice(braceStart, braceEnd + 1);
  }

  return cleaned;
}

/** Sanitize tags: lowercase, trim, filter non-strings, enforce max. */
function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0)
    .slice(0, MAX_TAGS);
}

/** Parse the LLM's JSON response into a ClassificationResult. */
export function parseClassificationResponse(
  response: string,
): ClassificationResult {
  const jsonStr = extractJson(response);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid classification JSON: ${response.slice(0, 120)}`);
  }

  // Validate type
  const type = typeof parsed["type"] === "string" ? parsed["type"] : "";
  if (!VALID_TYPES.has(type)) {
    throw new Error(
      `Invalid content type: "${type}". Must be: ${[...VALID_TYPES].join(", ")}`,
    );
  }

  // Extract fields with proper null coalescing
  const body = typeof parsed["body"] === "string" ? parsed["body"] : "";
  const rawTitle = parsed["title"];
  const title =
    typeof rawTitle === "string" && rawTitle.length > 0
      ? rawTitle
      : undefined;
  const slug = slugify(title ?? body);

  if (!slug) {
    throw new Error("Could not generate slug from content");
  }

  return {
    type: type as ContentType,
    title,
    body,
    slug,
    tags: sanitizeTags(parsed["tags"]),
    isDraft: parsed["isDraft"] === true,
    isPreview: parsed["isPreview"] === true,
    linkUrl:
      typeof parsed["linkUrl"] === "string" ? parsed["linkUrl"] : undefined,
    linkTitle:
      typeof parsed["linkTitle"] === "string"
        ? parsed["linkTitle"]
        : undefined,
    linkDescription:
      typeof parsed["linkDescription"] === "string"
        ? parsed["linkDescription"]
        : undefined,
  };
}

/** Classify a user message by calling the model. Retries once on parse failure. */
export async function classifyContent(
  text: string,
  imagePaths: string[],
  callModel: CallModel,
  mediaMimeTypes: string[] = [],
): Promise<ClassificationResult> {
  const prompt = buildClassificationPrompt(text, imagePaths.length, mediaMimeTypes.length, mediaMimeTypes);

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await callModel(prompt, 0);
    try {
      return parseClassificationResponse(response);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError;
}
