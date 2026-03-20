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
| CLI + onboarding | Build our own | `openclaw skills add rsslobster` |
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
│  Channel ──▶ Agent Runtime ──▶ $rsslobster      │
│                                  │               │
│                    ┌─────────────┘               │
│                    ▼                             │
│  ┌─────────────────────────────────┐             │
│  │     RSS LOBSTER SKILL           │             │
│  │                                 │             │
│  │  SKILL.md  (classification +    │             │
│  │             publishing rules)   │             │
│  │                                 │             │
│  │  rsslobster CLI tool:          │             │
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

**Key insight:** OpenClaw skills invoke CLI tools. The SKILL.md teaches the agent *when and how* to call `rsslobster generate`, `rsslobster publish`, etc. The agent handles classification and orchestration natively — that's what it does. We just give it the right tool.

---

## III. What We Ship

### 1. The Skill (`skills/rsslobster/SKILL.md`)

Following OpenClaw's exact skill format:

```yaml
---
name: rsslobster
description: "Publish to the open web via RSS. Classify messages as micro/post/image/carousel/link, generate HTML + RSS, deploy via git push."
metadata:
  openclaw:
    emoji: "🦞"
    requires:
      bins: ["rsslobster", "git"]
    install:
      - npm install -g rsslobster
---
```

The SKILL.md body contains:
- **When to use** — user says "publish", "post this", "draft:", sends an image with caption, shares a URL with commentary
- **Content classification rules** — the 5 types with clear decision tree
- **Commands** — `rsslobster generate`, `rsslobster publish`, `rsslobster drafts`, `rsslobster init`
- **Workflow examples** — publish a micro, publish a post with title, save a draft, list and publish drafts
- **RSS conventions** — feed structure, required elements, date formats

### 2. The CLI Tool (`rsslobster` npm package)

A focused CLI that the OpenClaw agent invokes. **Not** an agent itself — just a tool.

```bash
# Initialize a new site
rsslobster init --domain mysite.com --title "My Feed" --repo git@github.com:user/mysite.git

# Generate HTML + feeds from structured input (agent pipes JSON)
echo '{"type":"micro","body":"Hello world","tags":["test"]}' | rsslobster generate

# Commit and push
rsslobster publish --message "micro: hello-world"

# Draft management
rsslobster drafts list
rsslobster drafts show hello-world
rsslobster drafts publish hello-world

# Preview without deploying
rsslobster preview
```

### 3. Templates + SOUL.md

Same as standalone — shipped with the npm package, copied to user's site repo on `init`.

---

## IV. Directory Structure (Implemented)

```
rsslobster/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── cli/
│   │   ├── generate.ts       # stdin JSON → HTML + feeds
│   │   ├── drafts.ts         # Full draft CRUD + schedule + publish CLI
│   │   └── init.ts           # Scaffold site with style selection
│   ├── styles/
│   │   ├── presets.ts         # 4 style presets + CSS generator
│   │   ├── presets.test.ts    # UX standards validated per preset
│   │   ├── inherit.ts         # Extract styles from existing site URL
│   │   └── inherit.test.ts
│   ├── drafts/
│   │   ├── drafts.ts         # Create, list, get, update, delete, schedule, unschedule, publish
│   │   └── drafts.test.ts    # 30 tests
│   ├── generator/
│   │   ├── html.ts           # Content → semantic HTML5 page
│   │   ├── html.test.ts      # 20 tests incl. a11y + XSS
│   │   ├── rss.ts            # Posts → RSS 2.0 XML
│   │   ├── rss.test.ts
│   │   ├── json-feed.ts      # Posts → JSON Feed 1.1
│   │   ├── json-feed.test.ts
│   │   ├── site.ts           # Site scaffolding + content pipeline
│   │   └── site.test.ts
│   └── config/
│       └── types.ts          # Full type system: Style, Draft, Post, Feed
├── skill/
│   └── SKILL.md              # OpenClaw skill definition
├── SOUL.md                    # Example identity config
├── package.json               # prepare script auto-installs pre-commit hook
├── tsconfig.json
├── vitest.config.ts           # 80% coverage thresholds
└── .github/
    └── workflows/
        └── ci.yml
```

**Currently: 12 source files, 7 test files, 119 passing tests.** No `src/channels/`, no `src/agent/`, no `src/agent/model.ts` — OpenClaw owns all of that.

---

## V. How Classification Works (OpenClaw Does It)

In standalone mode, we call the LLM ourselves for classification. In add-on mode, **OpenClaw's agent IS the classifier.** The SKILL.md teaches it the decision tree:

```markdown
## Content Classification

When the user sends a message to publish, classify it:

| Signal | Type | Action |
|---|---|---|
| Short text, no title, no URL, no image | `micro` | `rsslobster generate` with type=micro |
| Text starting with "# " or user says "blog post" | `post` | `rsslobster generate` with type=post |
| Image(s) attached with optional caption | `image` | Save image(s) to site/images/, generate with type=image |
| Multiple images with narrative | `carousel` | Save images, generate with type=carousel |
| URL with commentary | `link` | Fetch OG metadata, generate with type=link |
| Message starts with "Draft:" or "draft:" | any | Save to drafts/ instead of publishing |

Always confirm the classification with the user before publishing.
Ask: "Publish as [type]? [preview of first line]"
```

The agent reads this, classifies the message, constructs the right JSON, pipes it to `rsslobster generate`, then calls `rsslobster publish`. Standard OpenClaw tool invocation pattern.

---

## VI. Testing Strategy

Same shared core, same rigor. **119 tests already passing.** Pre-commit hook enforces quality on every commit.

### Shift-Left: Pre-Commit Hook

```bash
# Auto-installed by pnpm install
.git/hooks/pre-commit → pnpm check (lint + typecheck + 119 tests)
```

### What We Test (our code — already implemented)

| File | Tests | Coverage |
|---|---|---|
| `presets.test.ts` | 34 | Style presets, UX range validation (max-width, line-height, font-size), CSS generation, a11y features |
| `inherit.test.ts` | 6 | CSS extraction from existing sites |
| `drafts.test.ts` | 30 | Full CRUD + schedule/unschedule + publish + conflict resolution + safety checks |
| `html.test.ts` | 20 | All 5 content types, semantic HTML, a11y (skip-link, ARIA, focus), XSS prevention |
| `rss.test.ts` | 7 | RSS 2.0 XML generation, entity escaping |
| `json-feed.test.ts` | 8 | JSON Feed 1.1 spec compliance |
| `site.test.ts` | 14 | Scaffold, add content, rebuild feeds, 20-item feed limit |

### UX Standards Enforced By Tests

- Typography: max-width 480-800px, line-height 1.4-1.8, font-size >= 15px
- Accessibility: skip-link, `lang`, `aria-label`, `focus-visible`, 44px touch targets
- Performance: inline CSS only (no external requests), zero JS, lazy loading
- Security: XSS prevention, `rel="noopener"`
- Responsive: viewport meta, mobile breakpoint, `prefers-reduced-motion`

### What We DON'T Test (OpenClaw owns it)

- Channel message reception
- Agent classification logic (tested via SKILL.md prompt quality)
- Model inference
- Session management

### SKILL.md Quality Testing

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
- npm package configuration for `rsslobster` global install

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
- `rsslobster` CLI (works standalone OR as OpenClaw tool)
- `rsslobster/skill` (SKILL.md for OpenClaw users)

---

## IX. Install Experience

### OpenClaw User (add-on path)

```bash
# One command
openclaw skills add rsslobster

# Or manual
npm install -g rsslobster
# Copy skill/SKILL.md to ~/.openclaw/skills/rsslobster/

# Initialize your site
rsslobster init --domain mysite.com --title "My Feed"

# Done. Message your OpenClaw bot on any channel:
# "publish: The coffee in Lisbon is incredible."
```

### Non-OpenClaw User (standalone path)

```bash
npm install -g rsslobster
rsslobster onboard    # Full wizard: channel, model, domain, first post
rsslobster start      # Daemon mode
```

---

## X. Why Both Paths Matter

**The add-on path** gets RSS Lobster to OpenClaw's existing users immediately. They already have channels, they already have an agent, they just need the publish skill. Fastest time-to-value.

**The standalone path** serves people who don't want to run OpenClaw. They want one thing — publish to the web from their phone — and they don't want a 53-skill AI assistant to do it. The lobster is small. The lobster is focused.

**Shipping both from one codebase** means the generator, templates, and feed logic are tested once, maintained once, and improved once. The divergence is only at the edges: how messages arrive (OpenClaw channels vs. our Telegram adapter) and how classification happens (OpenClaw agent vs. our single LLM call).

---

*One codebase. Two paths. Same claw.*
