import type { ClassifiedContent } from "../config/types.js";
import { slugify } from "../config/content.js";

const MICRO_MAX = 280;

export interface AdminFormData {
  body: string;
  targetSite: boolean;
  targetX: boolean;
  imagePath?: string;
  imageFilename?: string;
}

/** Parse URL-encoded form body into structured AdminFormData. */
export function parseAdminForm(raw: string): AdminFormData {
  const params = new URLSearchParams(raw);
  const body = (params.get("body") ?? "").trim();

  return {
    body,
    targetSite: params.get("target_site") === "1",
    targetX: params.get("target_x") === "1",
  };
}

/** Build ClassifiedContent from admin form data. */
export function buildContentFromForm(form: AdminFormData): ClassifiedContent {
  if (!form.body || form.body.trim().length === 0) {
    throw new Error("Body is required");
  }

  if (form.body.length > MICRO_MAX) {
    throw new Error(`Body exceeds ${MICRO_MAX} characters`);
  }

  const now = new Date().toISOString();
  const type = form.imagePath ? "image" : "micro";

  return {
    type,
    body: form.body,
    slug: slugify(form.body),
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}
