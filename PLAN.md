# RSS Lobster — Technical Implementation Plan

## v0.1.0 MVP

**Goal:** Send a message to your Lobster via Telegram. It classifies, templates, generates HTML + RSS, git commits, and deploys to Cloudflare Pages. Under 4 seconds end-to-end.

> **Two paths, one codebase.** This is the standalone plan. See `PLAN-OPENCLAW-ADDON.md` for the OpenClaw skill path. Both share the same generator core (Phase 1). The standalone adds its own channels + agent. The add-on ships a SKILL.md and thin CLI, letting OpenClaw handle everything else.

---

## I. Architectural Decisions

### What We Take From OpenClaw

OpenClaw is a 595-file agent runtime with 53 skills, browser automation, and a plugin SDK with 80+ exports. We need exactly four patterns:

| Pattern | OpenClaw Source | RSS Lobster Equivalent |
|---|---|---|
| Channel adapter | `src/channels/` (67 files) | Single `src/channels/telegram.ts` (~150 LOC) |
| Skill system | `src/agents/skills/` (19 files) | Single `src/skills/publish.ts` + `SKILL.md` |
| Agent loop | `src/agents/` (595 files) | Single `src/agent/index.ts` (~200 LOC) |
| CLI + onboarding | `src/cli/` + `src/wizard/` | Single `src/cli/index.ts` with `onboard` + `start` |

Everything else — plugin SDK, session isolation, Lane Queue, browser automation, cron, memory, security, TTS, image-gen, 52 other skills — is deleted.

### Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 22+ | OpenClaw baseline. Top-level await, native fetch, native test runner available |
| Language | TypeScript 5.9+ strict mode | OpenClaw baseline. `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Package manager | pnpm 10+ | OpenClaw baseline. Fast, strict, workspace-ready if needed later |
| Test runner | Vitest 3+ | OpenClaw baseline. Fast, native ESM, coverage built-in |
| Linter | oxlint | OpenClaw baseline. 50-100x faster than ESLint |
| Build | tsdown (esbuild-based) | OpenClaw baseline. Single-file output, fast |
| Model interface | OpenAI-compatible chat completions | Works with Ollama local AND any cloud provider |
| Templating | Mustache-style (handlebars-free) | Zero-dep. String replacement on HTML templates |
| RSS generation | Pure TypeScript, no library | RSS 2.0 XML is trivial. No dependency needed |
| Static site | Plain HTML files + feed.xml + feed.json | No build step. Files ARE the site |
| Deploy | Git push triggers Cloudflare Pages | Zero-config CD. OpenClaw pattern |

### What We Explicitly Do NOT Build

- No web dashboard
- No database (SQLite, Postgres, nothing)
- No user accounts or auth system
- No analytics
- No comments system
- No build step for the site
- No plugin SDK
- No multi-model orchestration
- No session persistence beyond the current message
- No WebSub (deferred to v0.2+)

---

## II. Style System

### UX Standards (FANG L6-L8)

Every generated page follows these non-negotiable UX principles:

| Principle | Implementation | Test Assertion |
|---|---|---|
| **Typography** | Line lengths 45-75ch (max-width 480-800px), line-height 1.4-1.8 | Preset tests validate ranges |
| **Accessibility** | Skip-to-content link, `lang` attribute, WCAG AA contrast, `focus-visible` outlines | HTML tests check `skip-link`, `aria-label`, `focus-visible` |
| **Touch targets** | Minimum 44x44px on all interactive elements (WCAG 2.5.8) | CSS contains `min-height: 44px` |
| **Motion** | `prefers-reduced-motion` media query disables all animation | CSS test checks media query |
| **Performance** | Inline critical CSS, zero external font requests, system font stacks | No `rel="stylesheet"` in output, no Google Fonts |
| **Progressive** | Works without JavaScript entirely. Zero JS shipped | HTML contains no `<script>` tags |
| **Mobile-first** | Viewport meta, responsive images, breakpoint at 480px | HTML tests check viewport meta |
| **Semantic HTML** | `article`, `time`, `nav`, `header`, `main`, not `div` soup | HTML tests check semantic elements |
| **Feed discovery** | RSS + JSON Feed `<link>` tags in every page | HTML tests check autodiscovery |
| **Security** | All user content HTML-escaped. `rel="noopener"` on external links | XSS test with `<script>` in content |

### Style Presets

Four built-in presets, selectable during `rsslobster init`:

| Preset | Font Stack | Personality |
|---|---|---|
| `minimal` (default) | System sans-serif | Clean, readable, invisible chrome |
| `brutalist` | System monospace | Raw, high-contrast, zero border-radius |
| `magazine` | System serif | Warm, literary, larger type |
| `terminal` | System monospace | Green-on-black, hacker aesthetic |

All presets use CSS custom properties (`--font-family`, `--color-text`, `--color-bg`, etc.) so users can override individual values without forking the preset.

### Inherit From Existing Site

During onboarding, users can provide a URL to an existing static site. RSS Lobster fetches it, extracts CSS custom properties and body styles, and uses them as overrides:

```bash
rsslobster init --domain mysite.com --inherit-from https://existingsite.com
```

Extracts: `font-family`, `font-size`, `line-height`, `max-width`, `color`, `background-color`, accent colors. Falls back to `minimal` preset for any property not found.

---

## II-B. Draft System

Complete draft lifecycle — every operation is possible:

| Operation | CLI | What It Does |
|---|---|---|
| **Create** | `echo '...' \| rsslobster drafts create` | Saves classified content to `drafts/{slug}.json` |
| **List** | `rsslobster drafts list [--status draft\|scheduled\|published]` | Lists all drafts, newest first, filterable by status |
| **Show** | `rsslobster drafts show <slug>` | Returns full draft content |
| **Update** | `echo '...' \| rsslobster drafts update <slug>` | Merges partial updates, preserves slug + status |
| **Delete** | `rsslobster drafts delete <slug>` | Permanent delete. Requires exact slug (no fuzzy matching) |
| **Schedule** | `rsslobster drafts schedule <slug> <datetime>` | Sets scheduled status + future datetime. Rejects past dates |
| **Unschedule** | `rsslobster drafts unschedule <slug>` | Reverts to draft status, clears scheduled time |
| **Publish** | `rsslobster drafts publish <slug>` | Generates HTML + feeds from draft, marks as published |
| **Due check** | (internal) `getDueScheduledDrafts()` | Returns scheduled drafts past their time — used by publish loop |

Draft statuses: `draft` → `scheduled` → `published`. Slug conflicts auto-resolve with `-2`, `-3` suffixes.

---

## II-C. Shift-Left Testing (Pre-Commit Hook)

All quality gates run on **every commit** via git pre-commit hook:

```bash
# .git/hooks/pre-commit (auto-installed by `pnpm install` via prepare script)
#!/bin/sh
pnpm check   # = pnpm lint && pnpm typecheck && pnpm test
```

This means:
- **oxlint** — catches lint issues before they reach CI
- **tsc --noEmit** — catches type errors before they reach CI
- **vitest run** — runs all 119+ tests before they reach CI

No broken code can be committed. CI becomes a verification step, not the first line of defense. The `prepare` script in `package.json` auto-creates the hook on `pnpm install`, so contributors get it automatically.

---

## III. Directory Structure

```
rsslobster/
├── src/
│   ├── index.ts                  # CLI entry point
│   ├── cli/
│   │   ├── generate.ts           # stdin JSON → HTML + feeds
│   │   ├── drafts.ts             # Full draft CRUD + schedule + publish
│   │   └── init.ts               # Scaffold site with style selection
│   ├── styles/
│   │   ├── presets.ts             # 4 style presets + resolver + CSS generator
│   │   ├── presets.test.ts        # UX standards validated per preset
│   │   ├── inherit.ts             # Extract styles from existing site URL
│   │   └── inherit.test.ts
│   ├── drafts/
│   │   ├── drafts.ts             # Create, list, get, update, delete, schedule, publish
│   │   └── drafts.test.ts        # 30 tests: CRUD, conflicts, safety
│   ├── generator/
│   │   ├── html.ts               # Content → semantic HTML5 page
│   │   ├── html.test.ts          # 20 tests: all 5 types, a11y, XSS
│   │   ├── rss.ts                # Posts → RSS 2.0 XML
│   │   ├── rss.test.ts
│   │   ├── json-feed.ts          # Posts → JSON Feed 1.1
│   │   ├── json-feed.test.ts
│   │   ├── site.ts               # Site scaffolding + content pipeline
│   │   └── site.test.ts          # 14 tests: scaffold, add, rebuild
│   ├── channels/                  # (Phase 4 — standalone only)
│   ├── agent/                     # (Phase 2 — standalone only)
│   ├── deploy/
│   │   ├── git.ts                # git add, commit, push
│   │   └── git.test.ts
│   └── config/
│       ├── types.ts              # All interfaces: SiteConfig, StyleConfig, Draft, etc.
│       ├── soul.ts               # SOUL.md parser
│       └── soul.test.ts
├── skill/
│   └── SKILL.md                  # OpenClaw skill definition (add-on path)
├── SOUL.md                        # Example identity config
├── package.json                   # prepare script auto-installs pre-commit hook
├── tsconfig.json
├── vitest.config.ts               # 80% coverage thresholds
└── .github/
    └── workflows/
        └── ci.yml
```

---

## IV. Core Interfaces (Implemented)

```typescript
// src/config/types.ts — the full type system

export type ContentType = "micro" | "post" | "image" | "carousel" | "link";
export type DraftStatus = "draft" | "scheduled" | "published";
export type StylePreset = "minimal" | "brutalist" | "magazine" | "terminal";

export interface SiteConfig {
  domain: string;
  title: string;
  description: string;
  author: string;
  language: string;
  style: StyleConfig;        // NEW: style system
  repo: string;
}

export interface StyleConfig {
  preset?: StylePreset;      // Built-in preset
  inheritFrom?: string;      // URL to inherit styles from
  overrides?: StyleOverrides; // Custom overrides on top
}

export interface StyleOverrides {
  fontFamily?: string;
  fontSize?: string;
  lineHeight?: string;
  maxWidth?: string;
  colorText?: string;
  colorBackground?: string;
  colorAccent?: string;
  colorMuted?: string;
  borderRadius?: string;
  customCss?: string;
}

export interface ClassifiedContent {
  type: ContentType;
  title?: string;
  body: string;
  slug: string;
  tags: string[];
  images?: ImageAttachment[];
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Draft extends ClassifiedContent {
  status: DraftStatus;
  scheduledAt?: string;      // ISO 8601 for scheduled drafts
}

export interface Post extends ClassifiedContent {
  url: string;
  publishedAt: string;
}
```

---

## IV. The Pipeline (4 Seconds)

```
InboundMessage
  │
  ▼
┌─────────────┐   ~500ms   ┌──────────────┐   ~50ms    ┌───────────┐   ~500ms   ┌──────────┐
│  Classify   │ ──────────▶ │  Generate    │ ─────────▶ │  Commit   │ ─────────▶ │  Reply   │
│  (LLM call) │            │  HTML + RSS  │            │  git push │            │  ✓ Live! │
└─────────────┘            └──────────────┘            └───────────┘            └──────────┘

Total budget: <4s (local model) or <6s (cloud model)
```

### Step 1: Classify (~500ms local, ~2s cloud)

Single LLM call. System prompt from SKILL.md. User message = the raw text. Response = structured JSON:

```json
{
  "type": "micro",
  "title": null,
  "body": "The coffee here in Lisbon is the best I've ever had.",
  "tags": ["travel", "lisbon"],
  "isDraft": false
}
```

Temperature 0. Structured output (JSON mode). The SKILL.md constrains the model to classification + extraction — no creative generation. This is why a 4B model works.

### Step 2: Generate (~50ms)

Pure computation, no LLM. Takes ClassifiedContent, loads the matching template, does string replacement, writes:

- `site/posts/{slug}/index.html` — the permalink page
- `site/index.html` — regenerated listing page
- `site/feed.xml` — regenerated RSS 2.0 feed
- `site/feed.json` — regenerated JSON Feed 1.1

All files written to disk synchronously. The site directory IS the deployable artifact.

### Step 3: Deploy (~500ms–3s)

```bash
git add -A site/
git commit -m "publish: {type} — {slug}"
git push origin main
```

Cloudflare Pages webhook fires on push. CDN propagation is ~1-2s globally.

### Step 4: Reply

Send confirmation back through the channel: "Published: https://yourname.com/posts/{slug}"

---

## VI. Testing Strategy

### Shift-Left: Pre-Commit Hook (Primary Gate)

Tests run **before every commit**, not just in CI:

```bash
# Auto-installed by pnpm install (prepare script)
.git/hooks/pre-commit → pnpm check (lint + typecheck + test)
```

CI is a backup, not the frontline. No broken code enters the repo.

### Current Test Suite: 119 Tests Across 7 Files

| File | Tests | What It Validates |
|---|---|---|
| `presets.test.ts` | 34 | All 4 presets have required properties; **UX ranges enforced** (max-width 480-800px, line-height 1.4-1.8, font-size >= 15px); resolveStyle defaults + overrides; CSS vars + stylesheet generation; skip-link, focus-visible, reduced-motion, 44px touch targets, scroll-snap |
| `inherit.test.ts` | 6 | Extracts CSS vars from `:root`, body styles; prefers CSS vars over body; handles alternate naming; strips undefined keys |
| `drafts.test.ts` | 30 | Create, list, get, update, delete; slug conflict resolution; schedule (rejects past dates, invalid dates); unschedule; mark published; due scheduled drafts; **UX safety**: exact slug for delete, consistent ordering, full feedback on every operation |
| `html.test.ts` | 20 | All 5 content types; **UX standards**: viewport meta, skip-link, semantic HTML, feed autodiscovery, inline CSS (no external requests), ARIA labels on carousel, `loading="lazy"`, `rel="noopener"`, machine-readable `<time>`, XSS prevention |
| `rss.test.ts` | 7 | Valid RSS 2.0 XML, channel metadata, atom:link self, items with all fields, enclosures, empty feed, XML entity escaping |
| `json-feed.test.ts` | 8 | Valid JSON Feed 1.1, feed_url, authors, items mapping, attachments, empty feed, valid JSON output |
| `site.test.ts` | 14 | Scaffold creates all dirs + files; addContent writes HTML + updates index + rebuilds feeds; newest-first ordering; feed limits to 20 items |

### UX-Specific Test Categories

Tests explicitly validate FANG-grade UX standards:

**Accessibility (WCAG 2.1 AA)**
- Skip-to-content link present on every page
- `lang` attribute on `<html>`
- `aria-label` on carousel region
- `alt` text on all images
- `focus-visible` outlines in CSS
- Touch targets >= 44px (WCAG 2.5.8)

**Performance**
- Zero external CSS/font requests (inline `<style>`, system fonts)
- Zero JavaScript shipped
- `loading="lazy"` on images
- No `rel="stylesheet"` links

**Responsive**
- Viewport meta tag present
- Mobile breakpoint at 480px
- `prefers-reduced-motion` media query
- Responsive images (`max-width: 100%`)

**Security**
- XSS test: `<script>alert("xss")</script>` in content produces escaped output
- `rel="noopener"` on external links

### Coverage Thresholds (from day one)

```
Lines:      80%
Functions:  80%
Branches:   80%
Statements: 80%
```

### CI Pipeline (Backup)

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm check     # lint + typecheck + test (same as pre-commit)
      - run: pnpm build     # tsdown
```

---

## VI. Implementation Phases

### Phase 1: Foundation (generate + test infrastructure)

Build the output side first. No channels, no LLM, no git. Just: given structured data, produce correct HTML + RSS.

**Files:**
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `.oxlintrc.json`
- `src/config/types.ts` — core interfaces
- `src/templates/index.ts` + test — template loader + renderer
- `templates/*.html` — all 5 content type templates + base + index
- `src/generator/html.ts` + test — HTML page generation
- `src/generator/rss.ts` + test — RSS 2.0 feed generation
- `src/generator/json-feed.ts` + test — JSON Feed 1.1 generation
- `src/generator/site.ts` + test — site directory management
- `test/setup.ts`, `test/fixtures/` — test infrastructure

**Exit criteria:** `pnpm test` passes. Given a `ClassifiedContent` object, produces valid HTML page + valid RSS feed + valid JSON feed. All snapshot tests green.

### Phase 2: Agent (classify with LLM)

**Files:**
- `src/agent/model.ts` + test — OpenAI-compatible HTTP client
- `src/agent/classify.ts` + test — content classification
- `src/agent/index.ts` — orchestrator (classify → generate)
- `skills/publish/SKILL.md` — the system prompt
- `SOUL.md` — example identity config
- `src/config/soul.ts` + test — SOUL.md parser

**Exit criteria:** Given a raw text string + mocked LLM, correctly classifies and generates a full site output. Drafts saved to `drafts/` directory without publishing.

### Phase 3: Deploy (git operations)

**Files:**
- `src/deploy/git.ts` + test — git add, commit, push
- Integration: agent → generator → git

**Exit criteria:** Full pipeline in tmp git repo. Message in → files generated → committed → push would succeed (verified with local bare repo).

### Phase 4: Channel (Telegram adapter)

**Files:**
- `src/channels/types.ts` — InboundMessage interface
- `src/channels/telegram.ts` + test — Telegram Bot API long-polling adapter
- Wire into agent pipeline

**Exit criteria:** Can receive a real Telegram message, process it through the pipeline, reply with the published URL. Manual test with a real bot.

### Phase 5: CLI + Onboarding

**Files:**
- `src/cli/index.ts` — command router
- `src/cli/onboard.ts` + test — interactive wizard
- `src/index.ts` — entry point

**Exit criteria:** `npx rsslobster onboard` walks through setup. `npx rsslobster start` runs the daemon. Under 10 minutes from install to first published post.

### Phase 6: E2E + Polish

**Files:**
- `test/e2e/publish-flow.e2e.test.ts`
- `.github/workflows/ci.yml`
- README.md updates

**Exit criteria:** CI green. E2E test passes. `npm install -g rsslobster && rsslobster onboard && rsslobster start` works on a clean machine.

---

## VII. Key Engineering Principles

### 1. Test-first, not test-after

Every module is written test-first. The test file is created before the implementation file. This is non-negotiable for an open source project that needs to be trustworthy to contributors.

### 2. Zero dependencies where possible

RSS 2.0 XML generation does not need a library. HTML templates do not need Handlebars. URL slug generation does not need `slugify`. The fewer dependencies, the fewer supply chain risks, the faster the install, the easier the audit.

### 3. Composition over abstraction

No base classes. No inheritance hierarchies. No "AbstractChannelAdapterFactory". Functions that take data and return data. Interfaces for contracts. That's it.

### 4. Files are the API

The site directory is the output. SOUL.md is the config. SKILL.md is the prompt. Templates are HTML files. Everything is human-readable, version-controlled, and editable with any text editor.

### 5. Fail loud, fail fast

No silent error swallowing. If the LLM returns invalid JSON, throw. If the git push fails, throw. If the template is missing a variable, throw. The user should always know what happened.

### 6. One way to do things

One channel adapter pattern. One template format. One deploy method. One config format. Consistency over flexibility at this stage.

---

## VIII. Dependency Budget

Target: <10 runtime dependencies.

| Dependency | Purpose | Why Not Zero-Dep |
|---|---|---|
| `hono` | HTTP server for Telegram webhook (if needed) | Lighter than Express, proven |
| `node-telegram-bot-api` or raw fetch | Telegram Bot API | Evaluate: may use raw fetch instead |
| `gray-matter` | YAML frontmatter parsing for SOUL.md | Battle-tested, small |
| `commander` | CLI argument parsing | Standard, tiny |
| `picocolors` | Terminal colors for CLI | 0 dependencies, 1KB |

**Dev dependencies:** `typescript`, `vitest`, `tsdown`, `oxlint`

That's it. If we can cut `gray-matter` by writing a 30-line YAML frontmatter parser, we do it.

---

## IX. What Success Looks Like

```bash
$ npm install -g rsslobster
$ rsslobster onboard
  → Domain? mysite.com
  → Telegram bot token? (paste from @BotFather)
  → Model? Ollama (local) / OpenAI / Anthropic
  → Site title? My Feed
  → First post? "Hello world. The lobster is live."
  ✓ Published to https://mysite.com/posts/hello-world
  ✓ RSS feed: https://mysite.com/feed.xml
$ rsslobster start
  Listening for messages...
```

Then from your phone, message the Telegram bot:

> "The coffee here in Lisbon is the best I've ever had."

4 seconds later: live on the web, in your RSS feed, at your domain.

---

*~25 source files. ~15 test files. <10 dependencies. One claw. Publish.*
