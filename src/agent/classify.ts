import type { ContentType } from "../config/types.js";

const VALID_TYPES: ReadonlySet<string> = new Set<ContentType>([
  "micro",
  "post",
  "image",
  "carousel",
  "link",
]);

const MAX_TAGS = 3;

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

/** Build the classification prompt with few-shot examples. */
export function buildClassificationPrompt(
  text: string,
  imageCount = 0,
): string {
  const imageNote =
    imageCount > 0
      ? `\nThe user attached ${imageCount} image${imageCount > 1 ? "s" : ""} to this message.`
      : "";

  return `Classify this message for a personal blog. Return ONLY a JSON object.

Types:
- "micro": Short text (<280 chars), no title, no URL
- "post": Longer writing or has a title/heading
- "image": Single image with caption
- "carousel": Multiple images
- "link": Shared URL with commentary

Examples:

Input: "The coffee in Lisbon is incredible."
{"type":"micro","body":"The coffee in Lisbon is incredible.","tags":["travel"],"isDraft":false}

Input: "# Why RSS Still Matters\nIn 2025, owning your content..."
{"type":"post","title":"Why RSS Still Matters","body":"In 2025, owning your content...","tags":["rss","indieweb"],"isDraft":false}

Input: "Check out https://example.com/great-article — best thing I read this week"
{"type":"link","body":"Best thing I read this week","tags":["reading"],"isDraft":false,"linkUrl":"https://example.com/great-article"}

Input: "Draft: thinking about writing something on distributed systems"
{"type":"post","body":"thinking about writing something on distributed systems","tags":["tech"],"isDraft":true}

Rules:
- 1-3 lowercase tags max. If nothing fits, empty array.
- isDraft=true ONLY if user says "draft", "save for later", "wip"
- title only for "post" type. null otherwise.
- For "link": extract the URL into linkUrl
- body = the cleaned content text (strip URLs for link type)
${imageNote}
Input: "${text.replace(/"/g, '\\"')}"`;
}

// --- Slug generation ---

/** Generate a URL-friendly slug from text. */
export function slugify(text: string, maxLen = 60): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen);

  // Trim to last word boundary if we truncated
  const trimmed =
    slug.length >= maxLen && slug.includes("-")
      ? slug.slice(0, slug.lastIndexOf("-"))
      : slug;
  return trimmed.replace(/-$/, "");
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
): Promise<ClassificationResult> {
  const prompt = buildClassificationPrompt(text, imagePaths.length);

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
