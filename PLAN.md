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

## II. Directory Structure

```
rsslobster/
├── src/
│   ├── index.ts                  # CLI entry point
│   ├── cli/
│   │   ├── index.ts              # Command router (onboard, start, publish)
│   │   ├── onboard.ts            # Interactive setup wizard
│   │   └── onboard.test.ts
│   ├── channels/
│   │   ├── types.ts              # InboundMessage interface
│   │   ├── telegram.ts           # Telegram Bot API adapter
│   │   └── telegram.test.ts
│   ├── agent/
│   │   ├── index.ts              # Agent loop: classify → template → generate → commit
│   │   ├── classify.ts           # Content type classification
│   │   ├── classify.test.ts
│   │   ├── model.ts              # OpenAI-compatible model client
│   │   └── model.test.ts
│   ├── generator/
│   │   ├── index.ts              # Orchestrates HTML + feed generation
│   │   ├── html.ts               # Renders content type → HTML page
│   │   ├── html.test.ts
│   │   ├── rss.ts                # Generates feed.xml (RSS 2.0)
│   │   ├── rss.test.ts
│   │   ├── json-feed.ts          # Generates feed.json (JSON Feed 1.1)
│   │   ├── json-feed.test.ts
│   │   ├── site.ts               # Manages site/ directory structure
│   │   └── site.test.ts
│   ├── deploy/
│   │   ├── git.ts                # git add, commit, push
│   │   └── git.test.ts
│   ├── config/
│   │   ├── index.ts              # Loads SOUL.md + site config
│   │   ├── soul.ts               # SOUL.md parser (YAML frontmatter + markdown)
│   │   ├── soul.test.ts
│   │   └── types.ts              # SiteConfig, SoulConfig interfaces
│   └── templates/
│       ├── index.ts              # Template loader + Mustache renderer
│       └── index.test.ts
├── templates/                     # Default HTML templates (shipped with package)
│   ├── micro.html
│   ├── post.html
│   ├── image.html
│   ├── carousel.html
│   ├── link.html
│   ├── index.html                # Home page / post listing
│   └── base.html                 # Shared layout wrapper
├── skills/
│   └── publish/
│       └── SKILL.md              # The one skill: classification + publishing rules
├── test/
│   ├── setup.ts                  # Global test setup
│   ├── fixtures/                 # Sample messages, expected outputs
│   │   ├── messages/             # Inbound message fixtures per content type
│   │   ├── sites/                # Expected generated site snapshots
│   │   └── feeds/                # Expected RSS/JSON feed snapshots
│   └── e2e/
│       └── publish-flow.e2e.test.ts  # Full message → published site test
├── SOUL.md                        # Example/default SOUL.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .oxlintrc.json
└── .github/
    └── workflows/
        └── ci.yml                 # Test + lint + build on every push
```

**~25 source files. ~15 test files. That's the whole thing.**

---

## III. Core Interfaces

```typescript
// src/channels/types.ts
export interface InboundMessage {
  id: string
  text: string
  images?: Buffer[]
  timestamp: Date
  channel: 'telegram' // extensible later
  raw: unknown // channel-specific payload for debugging
}

// src/config/types.ts
export interface SiteConfig {
  domain: string
  title: string
  description: string
  author: string
  language: string
  repo: string          // git remote URL
  branch: string        // default: 'main'
  postsDir: string      // default: 'posts'
  feedPath: string      // default: 'feed.xml'
  jsonFeedPath: string  // default: 'feed.json'
}

export interface SoulConfig {
  voice: string         // writing style notes (passed to model)
  defaults: Record<ContentType, Record<string, string>>
  site: SiteConfig
}

// src/agent/classify.ts
export type ContentType = 'micro' | 'post' | 'image' | 'carousel' | 'link'

export interface ClassifiedContent {
  type: ContentType
  title?: string        // undefined for micro
  body: string
  tags?: string[]
  images?: Array<{ data: Buffer; alt: string }>
  linkUrl?: string      // for 'link' type
  linkMeta?: { title: string; description: string; image?: string }
  isDraft: boolean
  slug: string          // URL-safe identifier
  publishedAt: Date
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

## V. Testing Strategy

Following OpenClaw's pattern: Vitest with 70% line coverage minimum, but adapted for a small focused codebase.

### Test Pyramid

```
         ┌───────┐
         │  E2E  │   1-2 tests: full message → site output
         │       │   Uses real git repo (tmp), real templates
        ┌┴───────┴┐
        │ Integr. │  ~10 tests: classify+generate, generate+commit
        │         │  Mock the LLM, real filesystem (tmp dirs)
       ┌┴─────────┴┐
       │   Unit    │  ~30 tests: each module in isolation
       │           │  Pure functions, mocked dependencies
       └───────────┘
```

### Unit Tests (the foundation)

Every module gets a colocated `.test.ts` file. These run in <5 seconds total.

| Module | What We Test |
|---|---|
| `classify.ts` | Given model response JSON, returns correct ContentType. Edge cases: missing title, draft prefix, URL detection, multiple images |
| `html.ts` | Given ClassifiedContent + template, outputs correct HTML. Snapshot tests for each content type |
| `rss.ts` | Given array of posts, outputs valid RSS 2.0 XML. Validates required elements, date formatting, GUID uniqueness, enclosure for images |
| `json-feed.ts` | Given array of posts, outputs valid JSON Feed 1.1. Schema validation |
| `site.ts` | File operations: creates dirs, writes files, reads post index. Uses `tmp` dirs |
| `soul.ts` | Parses SOUL.md with YAML frontmatter. Handles missing fields, malformed input |
| `templates/index.ts` | Template loading, Mustache variable replacement, HTML escaping |
| `model.ts` | HTTP client for OpenAI-compatible API. Tests request formation, response parsing, error handling. Mocked fetch |
| `git.ts` | Constructs correct git commands. Uses real git in tmp repos |

### Integration Tests

| Test | What It Covers |
|---|---|
| Classify → Generate | Real SKILL.md prompt + mocked model → real template rendering → valid HTML + RSS |
| Generate → Deploy | Real file generation → real git commit in tmp repo → verify commit contents |
| Template rendering | All 5 content types with realistic data → snapshot comparison |

### E2E Test

One test that exercises the full pipeline:

1. Creates a tmp directory with git repo + templates
2. Sends a mock InboundMessage
3. Mocks the LLM response (deterministic)
4. Asserts: correct files generated, valid HTML, valid RSS, git commit exists, commit message correct

### Snapshot Testing

Generated HTML and RSS are snapshot-tested. This catches regressions in template rendering without brittle string assertions. Snapshots are committed to the repo and reviewed in PRs.

### CI Pipeline

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
      - run: pnpm lint          # oxlint
      - run: pnpm typecheck     # tsc --noEmit
      - run: pnpm test          # vitest run --coverage
      - run: pnpm build         # tsdown
```

### Coverage Thresholds (from day one)

```
Lines:      80%
Functions:  80%
Branches:   65%
Statements: 80%
```

Higher than OpenClaw's 70% because we have 1/20th the code. No excuse for gaps.

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
