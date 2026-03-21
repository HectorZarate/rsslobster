# Preview Feature — Implementation Plan (v2, post-review)

## The Insight

RSS Lobster is a static site on Cloudflare Pages. Every file pushed to git gets served. **Preview pages are HTML files in a `_previews/` directory** — same domain, same styles, same rendering pipeline — but invisible to feeds, index, and search. The user gets a shareable link that is pixel-identical to the final published version.

## Key Design Decision: Preview as a Property of Draft

After L6/L8 review, previews are **not a parallel system** to drafts. A preview is a view of a draft. This unifies the mental model:

- **Draft** = "I'm not ready to publish" (content concern)
- **Preview** = "I want to see what this looks like live" (presentation concern)

These are orthogonal. A draft can have an active preview. Creating a preview always creates/uses a draft.

### State Machine

```
                 preview: text           publish {slug}
  input ─────────────────────> DRAFT ──────────────────> PUBLISHED
    │                        (+ preview)                     ^
    │   (isDraft)                                            │
    └──────────────> DRAFT ──── preview {slug} ──> DRAFT ───┘
                   (no preview)                 (+ preview)
```

One entity (draft), one promotion verb (`publish {slug}`), optional preview attachment.

## Architecture

```
User sends "preview: Hello world"
  → Strip prefix, classify content (same LLM pipeline + hooks)
  → Force isDraft=true, set isPreview=true
  → Create draft (or update existing) in drafts/{slug}.json
  → Generate preview HTML via generateHtmlPage() + banner + noindex
  → Write to _previews/{token}.html
  → Store previewId + previewUrl on the Draft object
  → Git commit + push (CF Pages deploys)
  → Bot replies: "Preview: https://domain.com/_previews/{token}.html
                  Publish with: publish {slug}"

User sends "preview {slug}"
  → Find existing draft
  → Generate/refresh preview HTML
  → Deploy → return preview URL

User sends "publish {slug}"
  → Find draft → addContent() → delete _previews/{token}.html if exists
  → Mark draft published → deploy
  → Bot replies: "Published. https://domain.com/{slug}.html"
```

### Why This Works

1. **1:1 fidelity** — Same `generateHtmlPage()`. Same CSS, layout, everything. Only additions: noindex meta + thin banner.
2. **No RSS pollution** — `posts.json`, `feed.xml`, `feed.json` never touched for previews.
3. **Zero infrastructure** — No Workers, no KV, no preview branches. Static HTML served by CF Pages.
4. **Images just work** — Absolute paths from root (`/images/slug-1.jpg`) resolve from `/_previews/` path.
5. **Unified mental model** — One pre-publication entity (draft), preview is optional view.
6. **Shareable** — Preview URL works for anyone with the link.

### Preview Token Design

- 12-char hex via `crypto.randomBytes(6).toString("hex")`
- Unguessable (2^48), not slug-based (no content leakage)
- Short enough for chat messages

### Preview Expiry

- Default TTL: 7 days
- `previewExpiresAt` stored on the Draft object
- Expired previews cleaned by scheduler (same interval as scheduled draft check)
- No `index.json` — preview metadata lives on the draft (eliminates race conditions)

---

## Files to Create/Modify

### New Files

1. **`src/previews/previews.ts`** — Core preview module
2. **`src/cli/previews.ts`** — CLI subcommand
3. **`src/__tests__/previews.test.ts`** — Tests

### Modified Files

4. **`src/config/types.ts`** — Extend `Draft` with preview fields
5. **`src/generator/html.ts`** — Add options bag to `generateHtmlPage()`, add `generatePreviewBanner()`
6. **`src/agent/pipeline.ts`** — Add preview + promote paths through full classification pipeline
7. **`src/agent/classify.ts`** — Add `isPreview` to ClassificationResult
8. **`src/cli/start.ts`** — Handle `preview {slug}` and cleanup in scheduler
9. **`src/deploy/git.ts`** — Refactor `deployToGit()` to accept commit message string
10. **`src/index.ts`** — Register `previews` subcommand
11. **`src/hooks/hooks.ts`** — Add `afterPreview` hook event

---

## Detailed Implementation

### 1. Types (`src/config/types.ts`)

Extend Draft with optional preview fields:

```ts
export interface Draft extends ClassifiedContent {
  status: DraftStatus;
  scheduledAt?: string;
  previewId?: string;        // hex token for active preview
  previewUrl?: string;       // full URL
  previewExpiresAt?: string; // ISO timestamp
}
```

No new `Preview` interface needed — the Draft IS the preview's backing store.

### 2. Classification (`src/agent/classify.ts`)

Add `isPreview` to `ClassificationResult`:

```ts
export interface ClassificationResult {
  // ... existing fields ...
  isDraft: boolean;
  isPreview: boolean;  // NEW
}
```

Update classification prompt rules:
```
- isPreview=true if user says "preview", "preview this", "let me see"
```

In `parseClassificationResponse`, parse `isPreview` with fallback to false.

### 3. HTML Generation (`src/generator/html.ts`)

Add options bag to `generateHtmlPage`:

```ts
export interface HtmlPageOptions {
  /** Extra HTML to inject into <head> */
  extraHead?: string;
  /** HTML to inject at start of <body>, before skip-link */
  bodyPrefix?: string;
}

export function generateHtmlPage(
  content: ClassifiedContent,
  config: SiteConfig,
  options?: HtmlPageOptions,
): string {
  // ... existing code ...
  // Insert options.extraHead after <style> tag
  // Insert options.bodyPrefix after <body> tag, before skip-link
}
```

Add preview banner generator:

```ts
export function previewPageOptions(): HtmlPageOptions {
  return {
    extraHead: '<meta name="robots" content="noindex, nofollow">',
    bodyPrefix: `<div style="position:fixed;top:0;left:0;right:0;background:#1a1a2e;color:#e0e0e0;text-align:center;padding:8px 16px;font:14px/1.4 system-ui,sans-serif;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.3)">Preview — not yet published</div><div style="height:40px"></div>`,
  };
}
```

Banner uses `position: fixed` (not sticky) to avoid stacking context conflicts with site headers. Spacer div prevents content overlap.

### 4. Preview Module (`src/previews/previews.ts`)

```ts
import { randomBytes } from "node:crypto";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ClassifiedContent, Draft, Post, SiteConfig } from "../config/types.js";
import { generateHtmlPage, previewPageOptions } from "../generator/html.js";
import { getDraft, updateDraft, listDrafts } from "../drafts/drafts.js";
import { addContent, readSiteConfig } from "../generator/site.js";

const PREVIEWS_DIR = "_previews";
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateToken(): string {
  return randomBytes(6).toString("hex");
}

async function ensurePreviewsDir(siteDir: string): Promise<void> {
  await mkdir(join(siteDir, PREVIEWS_DIR), { recursive: true });
}

/** Generate a preview for a draft. Updates the draft with preview metadata. */
export async function createPreview(
  siteDir: string,
  draft: Draft,
): Promise<Draft> {
  await ensurePreviewsDir(siteDir);
  const config = await readSiteConfig(siteDir);

  // Reuse existing token or generate new one
  const token = draft.previewId ?? generateToken();
  const previewUrl = `https://${config.domain}/${PREVIEWS_DIR}/${token}.html`;

  // Generate 1:1 HTML with preview banner
  const html = generateHtmlPage(draft, config, previewPageOptions());
  await writeFile(join(siteDir, PREVIEWS_DIR, `${token}.html`), html);

  // Update draft with preview metadata
  const updated = await updateDraft(siteDir, draft.slug, {
    previewId: token,
    previewUrl,
    previewExpiresAt: new Date(Date.now() + DEFAULT_TTL_MS).toISOString(),
  });

  return updated!;
}

/** Delete preview HTML file and clear preview fields from draft. */
export async function deletePreview(
  siteDir: string,
  slug: string,
): Promise<boolean> {
  const draft = await getDraft(siteDir, slug);
  if (!draft?.previewId) return false;

  try {
    await unlink(join(siteDir, PREVIEWS_DIR, `${draft.previewId}.html`));
  } catch { /* file may already be gone */ }

  await updateDraft(siteDir, slug, {
    previewId: undefined,
    previewUrl: undefined,
    previewExpiresAt: undefined,
  });
  return true;
}

/** Promote a draft to published post. Cleans up preview if exists. */
export async function promotePreview(
  siteDir: string,
  slug: string,
): Promise<Post> {
  const draft = await getDraft(siteDir, slug);
  if (!draft) throw new Error(`Draft "${slug}" not found`);

  // Clean up preview file if one exists
  if (draft.previewId) {
    try {
      await unlink(join(siteDir, PREVIEWS_DIR, `${draft.previewId}.html`));
    } catch { /* ok */ }
  }

  // Publish via normal path
  const post = await addContent(siteDir, draft);
  return post;
}

/** List all drafts that have active (non-expired) previews. */
export async function listActivePreviews(
  siteDir: string,
): Promise<Draft[]> {
  const drafts = await listDrafts(siteDir);
  const now = Date.now();
  return drafts.filter(
    (d) => d.previewId && d.previewExpiresAt &&
      new Date(d.previewExpiresAt).getTime() > now,
  );
}

/** Clean up expired preview HTML files and clear their draft metadata. */
export async function cleanExpiredPreviews(
  siteDir: string,
): Promise<number> {
  const drafts = await listDrafts(siteDir);
  const now = Date.now();
  let cleaned = 0;

  for (const draft of drafts) {
    if (draft.previewId && draft.previewExpiresAt &&
        new Date(draft.previewExpiresAt).getTime() <= now) {
      await deletePreview(siteDir, draft.slug);
      cleaned++;
    }
  }
  return cleaned;
}
```

### 5. Deploy Refactor (`src/deploy/git.ts`)

Refactor `deployToGit` to accept a commit message:

```ts
/** Full deploy: stage all, commit, push. */
export async function deployToGit(
  siteDir: string,
  commitMessage: string,
): Promise<DeployResult> {
  const status = await gitStatus(siteDir);
  if (status.clean) return { committed: false };

  await gitAdd(siteDir);
  const hash = await gitCommit(siteDir, commitMessage);

  try {
    await gitPush(siteDir);
  } catch (err) {
    const pushError = err instanceof Error ? err.message : "Unknown push error";
    return { committed: true, hash, pushError };
  }
  return { committed: true, hash };
}
```

Update all call sites:
- `pipeline.ts`: `deployToGit(siteDir, \`publish: ${type} — ${slug}\`)`
- Preview: `deployToGit(siteDir, \`preview: ${slug}\`)`
- Promote: `deployToGit(siteDir, \`publish: ${type} — ${slug}\`)` (same as normal)
- Cleanup: `deployToGit(siteDir, "chore: clean expired previews")`

### 6. Pipeline (`src/agent/pipeline.ts`)

Add preview and promote paths. Both go through classification + hooks:

```ts
export async function processMessage(
  message: InboundMessage,
  config: PipelineConfig,
): Promise<PipelineResult> {
  // --- Command dispatch (before classification) ---

  // Handle "publish {slug}" — promote draft (with or without preview)
  const publishMatch = message.text.match(/^publish\s+(\S+)$/i);
  if (publishMatch) {
    return handlePublishCommand(publishMatch[1], config);
  }

  // Handle "preview {slug}" — preview existing draft
  const previewExistingMatch = message.text.match(/^preview\s+(\S+)$/i);
  if (previewExistingMatch && !previewExistingMatch[1].includes(" ")) {
    return handlePreviewExistingDraft(previewExistingMatch[1], config);
  }

  // --- Strip preview prefix, mark for preview flow ---
  let wantsPreview = false;
  const previewPrefix = message.text.match(/^(?:preview:)\s*/i);
  if (previewPrefix) {
    wantsPreview = true;
    message = { ...message, text: message.text.slice(previewPrefix[0].length) };
  }

  // Step 1: Classify (same as before — full pipeline with hooks)
  // ... existing classification code ...

  // After hooks, override for preview flow
  if (wantsPreview || classification.isPreview) {
    classification.isDraft = true;  // previews are always backed by drafts
  }

  // ... existing image/media ingest ...
  // ... build ClassifiedContent ...

  // Step 4: Route — preview, draft, or publish
  if (wantsPreview || classification.isPreview) {
    return handlePreviewNew(content, config);
  }

  if (classification.isDraft) {
    // ... existing draft path ...
  }

  // ... existing publish path ...
}
```

### 7. Hooks (`src/hooks/hooks.ts`)

Add `afterPreview` event:

```ts
export type HookEvent = "afterClassify" | "afterPublish" | "afterDeploy" | "afterPreview";

export interface HooksConfig {
  afterClassify?: HookDefinition[];
  afterPublish?: HookDefinition[];
  afterDeploy?: HookDefinition[];
  afterPreview?: HookDefinition[];
}
```

Fire `afterPreview` with `{ previewUrl, slug, type, tags }`.
Do NOT fire `afterPublish` for previews.

### 8. Scheduler (`src/cli/start.ts`)

Add preview cleanup to the existing 60s scheduler interval:

```ts
const schedulerInterval = setInterval(async () => {
  try {
    const published = await publishDueScheduled(siteDir);
    // ... existing logging ...
  } catch { /* non-fatal */ }

  // Clean expired previews
  try {
    const cleaned = await cleanExpiredPreviews(siteDir);
    if (cleaned > 0) {
      await deployToGit(siteDir, "chore: clean expired previews");
      console.log(pc.dim(`  🧹 Cleaned ${cleaned} expired preview(s)`));
    }
  } catch { /* non-fatal */ }
}, 60_000);
```

### 9. CLI Subcommand (`src/cli/previews.ts`)

```
rsslobster previews list         — show drafts with active previews
rsslobster previews show <slug>  — show preview URL for a draft
rsslobster previews delete <slug> — remove preview (keeps draft)
rsslobster previews clean        — remove all expired previews
```

Note: `publish` stays on the `drafts` command since previews ARE drafts.

### 10. Register (`src/index.ts`)

```ts
import { previewsCommand } from "./cli/previews.js";
program.addCommand(previewsCommand);
```

---

## Edge Cases

- **Image/media paths**: Absolute from root, work from `/_previews/`. No change needed.
- **Re-preview**: Reuses existing token, overwrites HTML file. Same URL, fresh content.
- **Publish after expiry**: Draft still exists, preview HTML may be gone. Publish works fine (doesn't need preview file).
- **Slug collision on promote**: `addContent()` handles deduplication. Image paths in content reference original slug's images which still exist at those paths.
- **Config drift between preview and publish**: Accepted. `generateHtmlPage` uses current config at publish time. Preview is a snapshot, not a contract.
- **Hooks**: `afterClassify` fires for previews (goes through full classification). `afterPublish` does NOT fire. `afterPreview` fires. `afterDeploy` fires for the preview deploy.

## What This Does NOT Do (By Design)

- No preview branches
- No server-side auth on preview URLs
- No edit-in-place (re-preview is the flow, reuses same token/URL)
- No local-only preview mode (future enhancement)

---

## Testing Strategy

- `createPreview`: generates HTML with banner + noindex, updates draft with previewId
- `deletePreview`: removes HTML file, clears draft preview fields
- `promotePreview`: calls addContent, cleans up preview file
- `cleanExpiredPreviews`: removes expired, keeps active
- `listActivePreviews`: filters by expiry
- HTML fidelity: preview body content matches non-preview body content
- Pipeline: `preview:` prefix routes to preview flow, still runs hooks
- Pipeline: `publish {slug}` promotes and cleans up
- Deploy refactor: existing tests still pass with message string
