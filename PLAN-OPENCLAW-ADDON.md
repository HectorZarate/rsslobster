# RSS Lobster — OpenClaw Add-on Plan

## The Skill-Only Path

**Goal:** RSS Lobster as a single OpenClaw skill. Zero new infrastructure. You already run OpenClaw — now it can publish to the open web.

---

## I. Why This Path Exists

The standalone RSS Lobster (see `PLAN.md`) builds its own channel adapters, agent loop, model interface, and CLI. That's ~25 source files replicating what OpenClaw already does.

The add-on path asks: **what if we delete all of that and ship a SKILL.md?**

| Concern | Standalone | OpenClaw Add-on |
|---|---|---|
| Channel adapters | Build our own (Telegram first) | Use OpenClaw's 23+ channels |
| Agent runtime | Build our own (~200 LOC) | Use OpenClaw's embedded agent |
| Model interface | Build our own (OpenAI-compatible) | Use OpenClaw's multi-provider system |
| CLI + onboarding | Build our own | `openclaw skills add rss-lobster` |
| State management | Build our own (files) | Use OpenClaw's session system |
| What we actually build | SKILL.md + templates + generator + git deploy | Same, but no glue code |

**The add-on is ~60% less code.** The tradeoff: you must run OpenClaw.

---

## II. Architecture

```
┌─────────────────────────────────────────────────┐
│                   YOUR PHONE                     │
│  (any of OpenClaw's 23+ supported channels)      │
└──────────────────────┬──────────────────────────┘
                       │ message
                       ▼
┌─────────────────────────────────────────────────┐
│              OPENCLAW GATEWAY                    │
│         (already running on your hardware)       │
│                                                  │
│  Channel ──▶ Agent Runtime ──▶ $rss-lobster      │
│                                  │               │
│                    ┌─────────────┘               │
│                    ▼                             │
│  ┌─────────────────────────────────┐             │
│  │     RSS LOBSTER SKILL           │             │
│  │                                 │             │
│  │  SKILL.md  (classification +    │             │
│  │             publishing rules)   │             │
│  │                                 │             │
│  │  rss-lobster CLI tool:          │             │
│  │    generate  → HTML + RSS       │             │
│  │    publish   → git commit+push  │             │
│  │    drafts    → list/manage      │             │
│  │    init      → scaffold site    │             │
│  │                                 │             │
│  │  Templates: micro, post, image, │             │
│  │             carousel, link      │             │
│  └─────────────────────────────────┘             │
└──────────────────────┬──────────────────────────┘
                       │ git push
                       ▼
┌─────────────────────────────────────────────────┐
│         GIT REPO ──▶ CLOUDFLARE PAGES            │
│         yourname.com/feed.xml                    │
└─────────────────────────────────────────────────┘
```

**Key insight:** OpenClaw skills invoke CLI tools. The SKILL.md teaches the agent *when and how* to call `rss-lobster generate`, `rss-lobster publish`, etc. The agent handles classification and orchestration natively — that's what it does. We just give it the right tool.

---

## III. What We Ship

### 1. The Skill (`skills/rss-lobster/SKILL.md`)

Following OpenClaw's exact skill format:

```yaml
---
name: rss-lobster
description: "Publish to the open web via RSS. Classify messages as micro/post/image/carousel/link, generate HTML + RSS, deploy via git push."
metadata:
  openclaw:
    emoji: "🦞"
    requires:
      bins: ["rss-lobster", "git"]
    install:
      - npm install -g rss-lobster
---
```

The SKILL.md body contains:
- **When to use** — user says "publish", "post this", "draft:", sends an image with caption, shares a URL with commentary
- **Content classification rules** — the 5 types with clear decision tree
- **Commands** — `rss-lobster generate`, `rss-lobster publish`, `rss-lobster drafts`, `rss-lobster init`
- **Workflow examples** — publish a micro, publish a post with title, save a draft, list and publish drafts
- **RSS conventions** — feed structure, required elements, date formats

### 2. The CLI Tool (`rss-lobster` npm package)

A focused CLI that the OpenClaw agent invokes. **Not** an agent itself — just a tool.

```bash
# Initialize a new site
rss-lobster init --domain mysite.com --title "My Feed" --repo git@github.com:user/mysite.git

# Generate HTML + feeds from structured input (agent pipes JSON)
echo '{"type":"micro","body":"Hello world","tags":["test"]}' | rss-lobster generate

# Commit and push
rss-lobster publish --message "micro: hello-world"

# Draft management
rss-lobster drafts list
rss-lobster drafts show hello-world
rss-lobster drafts publish hello-world

# Preview without deploying
rss-lobster preview
```

### 3. Templates + SOUL.md

Same as standalone — shipped with the npm package, copied to user's site repo on `init`.

---

## IV. Directory Structure (the npm package)

```
rss-lobster/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── cli/
│   │   ├── init.ts           # Scaffold a new site repo
│   │   ├── init.test.ts
│   │   ├── generate.ts       # stdin JSON → HTML + feeds
│   │   ├── generate.test.ts
│   │   ├── publish.ts        # git add + commit + push
│   │   ├── publish.test.ts
│   │   ├── drafts.ts         # Draft management
│   │   ├── drafts.test.ts
│   │   └── preview.ts        # Local preview server
│   ├── generator/
│   │   ├── html.ts           # Content → HTML page
│   │   ├── html.test.ts
│   │   ├── rss.ts            # Posts → feed.xml
│   │   ├── rss.test.ts
│   │   ├── json-feed.ts      # Posts → feed.json
│   │   ├── json-feed.test.ts
│   │   ├── site.ts           # Site directory operations
│   │   └── site.test.ts
│   ├── config/
│   │   ├── types.ts          # SiteConfig, ContentType interfaces
│   │   ├── soul.ts           # SOUL.md parser
│   │   └── soul.test.ts
│   └── templates/
│       ├── index.ts          # Template loader + renderer
│       └── index.test.ts
├── templates/                 # Default HTML templates
│   ├── micro.html
│   ├── post.html
│   ├── image.html
│   ├── carousel.html
│   ├── link.html
│   ├── index.html
│   └── base.html
├── skill/
│   └── SKILL.md              # OpenClaw skill definition
├── test/
│   ├── setup.ts
│   ├── fixtures/
│   └── e2e/
│       └── generate-publish.e2e.test.ts
├── SOUL.md                    # Example identity config
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .github/
    └── workflows/
        └── ci.yml
```

**~18 source files. ~12 test files. Even smaller than standalone.**

The critical difference: no `src/channels/`, no `src/agent/`, no `src/agent/model.ts`. OpenClaw owns all of that.

---

## V. How Classification Works (OpenClaw Does It)

In standalone mode, we call the LLM ourselves for classification. In add-on mode, **OpenClaw's agent IS the classifier.** The SKILL.md teaches it the decision tree:

```markdown
## Content Classification

When the user sends a message to publish, classify it:

| Signal | Type | Action |
|---|---|---|
| Short text, no title, no URL, no image | `micro` | `rss-lobster generate` with type=micro |
| Text starting with "# " or user says "blog post" | `post` | `rss-lobster generate` with type=post |
| Image(s) attached with optional caption | `image` | Save image(s) to site/images/, generate with type=image |
| Multiple images with narrative | `carousel` | Save images, generate with type=carousel |
| URL with commentary | `link` | Fetch OG metadata, generate with type=link |
| Message starts with "Draft:" or "draft:" | any | Save to drafts/ instead of publishing |

Always confirm the classification with the user before publishing.
Ask: "Publish as [type]? [preview of first line]"
```

The agent reads this, classifies the message, constructs the right JSON, pipes it to `rss-lobster generate`, then calls `rss-lobster publish`. Standard OpenClaw tool invocation pattern.

---

## VI. Testing Strategy

Same rigor as standalone, but we test different boundaries.

### What We Test (our code)

| Module | Tests |
|---|---|
| `generate.ts` | CLI stdin → correct file output. All 5 content types |
| `html.ts` | ClassifiedContent → valid HTML. Snapshot tests |
| `rss.ts` | Posts array → valid RSS 2.0 XML |
| `json-feed.ts` | Posts array → valid JSON Feed 1.1 |
| `site.ts` | File operations in tmp dirs |
| `publish.ts` | Correct git commands executed. Tmp repo verification |
| `drafts.ts` | CRUD operations on drafts/ directory |
| `init.ts` | Scaffolds correct directory structure |
| `soul.ts` | SOUL.md parsing |
| `templates/` | Template loading + rendering |

### What We DON'T Test (OpenClaw owns it)

- Channel message reception
- Agent classification logic (tested via SKILL.md prompt quality)
- Model inference
- Session management

### E2E Test

```
JSON on stdin → rss-lobster generate → files on disk → rss-lobster publish → git commit exists
```

No mocked LLM needed. The CLI is deterministic — JSON in, files out.

### SKILL.md Quality Testing

We can't unit-test a prompt, but we can:
1. **Fixture-based evaluation:** Feed sample messages through OpenClaw with our skill, verify correct tool calls
2. **Regression suite:** Maintain a set of input→expected-classification pairs
3. **Manual smoke test:** Part of the release checklist

---

## VII. Implementation Phases

### Phase 1: Generator + Templates (shared with standalone)

Identical to standalone Phase 1. The generator code is the same regardless of path.

- `src/generator/*` + tests
- `src/templates/*` + tests
- `templates/*.html`
- `src/config/types.ts`
- Test infrastructure

### Phase 2: CLI Tool

- `src/cli/generate.ts` — reads JSON from stdin, calls generator, writes files
- `src/cli/publish.ts` — git add + commit + push
- `src/cli/drafts.ts` — list, show, publish, delete drafts
- `src/cli/init.ts` — scaffold site repo with templates + SOUL.md
- `src/index.ts` — CLI entry point with commander
- All with tests

### Phase 3: SKILL.md + Integration

- `skill/SKILL.md` — the OpenClaw skill definition
- `SOUL.md` — example config
- Integration testing with OpenClaw (manual + fixture-based)
- npm package configuration for `rss-lobster` global install

### Phase 4: CI + Distribution

- `.github/workflows/ci.yml`
- npm publish setup
- OpenClaw skill registry submission (ClawHub)
- README with both install paths documented

---

## VIII. The Two-Path Strategy

The beauty: **Phase 1 is identical for both paths.** The generator, templates, RSS/JSON feed code, site management, config parsing — all shared.

```
                    ┌─────────────────────┐
                    │  SHARED CORE        │
                    │                     │
                    │  generator/html.ts  │
                    │  generator/rss.ts   │
                    │  generator/json.ts  │
                    │  generator/site.ts  │
                    │  templates/         │
                    │  config/            │
                    └────────┬────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
            ┌───────▼──────┐  ┌──────▼───────┐
            │  STANDALONE  │  │  OPENCLAW    │
            │              │  │  ADD-ON      │
            │  channels/   │  │              │
            │  agent/      │  │  cli/ (thin) │
            │  cli/ (full) │  │  SKILL.md    │
            │  model.ts    │  │              │
            └──────────────┘  └──────────────┘
```

We build Phase 1 once. Then fork:
- **Standalone** adds channels, agent, model client, full CLI
- **Add-on** adds thin CLI (stdin→files→git), SKILL.md

Both ship from the same repo. The `package.json` exports both:
- `rss-lobster` CLI (works standalone OR as OpenClaw tool)
- `rss-lobster/skill` (SKILL.md for OpenClaw users)

---

## IX. Install Experience

### OpenClaw User (add-on path)

```bash
# One command
openclaw skills add rss-lobster

# Or manual
npm install -g rss-lobster
# Copy skill/SKILL.md to ~/.openclaw/skills/rss-lobster/

# Initialize your site
rss-lobster init --domain mysite.com --title "My Feed"

# Done. Message your OpenClaw bot on any channel:
# "publish: The coffee in Lisbon is incredible."
```

### Non-OpenClaw User (standalone path)

```bash
npm install -g rss-lobster
rss-lobster onboard    # Full wizard: channel, model, domain, first post
rss-lobster start      # Daemon mode
```

---

## X. Why Both Paths Matter

**The add-on path** gets RSS Lobster to OpenClaw's existing users immediately. They already have channels, they already have an agent, they just need the publish skill. Fastest time-to-value.

**The standalone path** serves people who don't want to run OpenClaw. They want one thing — publish to the web from their phone — and they don't want a 53-skill AI assistant to do it. The lobster is small. The lobster is focused.

**Shipping both from one codebase** means the generator, templates, and feed logic are tested once, maintained once, and improved once. The divergence is only at the edges: how messages arrive (OpenClaw channels vs. our Telegram adapter) and how classification happens (OpenClaw agent vs. our single LLM call).

---

*One codebase. Two paths. Same claw.*
