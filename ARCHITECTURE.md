# RSS Lobster Architecture

## Overview

RSS Lobster is a personal publishing and reading system for the open web. Send a message from any chat app → AI classifies type (micro, post, image, carousel, link, video, audio) → generates semantic HTML with inlined CSS → updates RSS/JSON feeds → deploys via git push. Subscribers use the same CLI to read feeds in a single inbox, with no algorithms, no platform lock-in, zero JavaScript in output.

## Data Flow

```
Publishing Pipeline:
  Channel (Telegram/Discord/etc)
         ↓
  Classification (AI categorizes content type)
         ↓
  Generation (Render HTML + feeds)
         ↓
  Deployment (Git commit + push)
         ↓
  WebSub Ping (notify subscribers)

Reading Pipeline:
  Feed URL
       ↓
  Poll (fetch + parse RSS/Atom)
       ↓
  Deduplicate & Store
       ↓
  Local Inbox (mark read, star, reblog)
       ↓
  Publish to your site
```

## Module Map

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `src/agent` | Classification pipeline & LLM integration | `pipeline.ts`, `classify.ts` |
| `src/channels` | Chat platform adapters (Telegram, Discord, etc) | `channel.ts`, `telegram.ts`, `discord.ts` |
| `src/cli` | Command definitions & subcommands | `generate.ts`, `publish.ts`, `enable.ts` |
| `src/config` | Configuration loading & types | `types.ts`, `lobster.ts`, `paths.ts` |
| `src/deploy` | Git commit/push & WebSub notifications | `git.ts`, `websub.ts` |
| `src/drafts` | Draft versioning & scheduling | `drafts.ts` |
| `src/generator` | HTML, RSS, JSON Feed, SEO generation | `site.ts`, `html.ts`, `rss.ts`, `json-feed.ts` |
| `src/hooks` | Lifecycle callbacks (afterClassify, afterPublish, afterDeploy) | `hooks.ts` |
| `src/images` | Image optimization & ingest (Sharp) | `images.ts`, `media.ts` |
| `src/pages` | Static pages (About, Contact) | `pages.ts` |
| `src/plugins` | Plugin API & lifecycle hooks | `types.ts` |
| `src/previews` | Preview tokens & expiring links | `previews.ts` |
| `src/reader` | RSS reader: polling, deduplication, inbox | `store.ts`, `poll.ts`, `parser.ts` |
| `src/styles` | CSS presets (minimal, brutalist, magazine, terminal) | `presets.ts` |

## Configuration

**rsslobster.json** (committed to repo):
- Site metadata: `domain`, `title`, `author`, `description`
- Style: `preset` (minimal/brutalist/magazine/terminal) + CSS overrides
- Permalink pattern, static pages, plugins
- Comments endpoint, RSS feed info

**lobster.json** (git-ignored, local only):
- Secrets: API keys for Telegram bot, Discord webhook, model API
- Reader config: feed subscriptions, poll intervals
- Deploy credentials: SSH keys for git push

Example `rsslobster.json`:
```json
{
  "domain": "blog.example.com",
  "title": "My Site",
  "author": "Alice",
  "style": {
    "preset": "minimal",
    "overrides": { "colorAccent": "#0066cc" }
  },
  "plugins": [
    { "name": "./plugins/custom.js", "options": { "enabled": true } }
  ]
}
```

## How to Add...

### A New CLI Command

1. Create `src/cli/mycommand.ts`:
```typescript
import { Command } from "commander";

export const myCommand = new Command("mycommand")
  .description("What this does")
  .action(async (opts) => {
    // implementation
  });
```

2. Register in `src/index.ts`:
```typescript
program.addCommand(myCommand);
```

### A New Channel (Messaging Platform)

1. Create `src/channels/mychannel.ts` implementing the `Channel` interface:
```typescript
export interface Channel {
  type: string;
  listen(): AsyncGenerator<InboundMessage>;
  send(userId: string, text: string): Promise<void>;
}
```

2. Update `src/channels/channel.ts`:
   - Add type to `CHANNEL_TYPES`
   - Add to `createChannel()` switch statement
   - Add config in `ChannelConfigs` union

3. Enable via `rsslobster enable mychannel` — stores config in `lobster.json`

### A New Style Preset

1. Create `src/styles/presets/mypreset.css` with CSS variables:
   - `--color-text`, `--color-bg`, `--color-accent`, `--font-family`, etc.

2. Update `src/styles/presets.ts`:
   - Import CSS file
   - Register in `PRESETS` map
   - Add to `StylePreset` type

3. Use: `rsslobster style mypreset` or set in `rsslobster.json`

### A Plugin

1. Create `my-plugin.js` (or TypeScript with build step):
```typescript
export async function activate(api, options) {
  api.injectHTML((content, config) => ({
    head: '<meta name="custom" content="value">',
  }));
  
  api.on("afterPublish", ({ post }, ctx) => {
    console.log(`Published: ${post.title}`);
  });
}
```

2. Register in `rsslobster.json`:
```json
{
  "plugins": [
    { "name": "./my-plugin.js", "options": { "foo": "bar" } }
  ]
}
```

## Testing

Tests live next to source: `foo.ts` → `foo.test.ts`. Uses Vitest.

```bash
pnpm test                # run once
pnpm test:watch         # watch mode
pnpm test:coverage      # coverage report (80% threshold enforced)
```

Key patterns:
- Test classification pipeline: does AI categorize posts correctly?
- Test HTML generation: semantic structure, Open Graph tags, WCAG AA compliance
- Test feeds: RSS/JSON Feed validity, deduplication, ordering
- Test reader: feed polling, item dedup, inbox state

## Key Design Decisions

| Decision | Why |
|----------|-----|
| **Files not database** | Git is the database. All state (posts.json, lobster.json) is human-readable JSON on disk. No SQLite/Postgres needed. Offline-first, easy backups. |
| **Zero JS in output** | Generated HTML works without JavaScript. No build tools required for readers. Progressive enhancement only. |
| **Commander not oclif** | Simpler, smaller dependency. Enough for current CLI surface. Easy to add subcommands & options. |
| **markdown-it not unified** | Familiar ecosystem. Built-in syntax highlighting (shiki), math (temml). Fewer abstraction layers. |
| **Composition over abstraction** | Functions take data, return data. Pipelines (message → draft → post → deploy) are explicit & easy to trace. No magical middleware. |
| **Single site directory = repo** | Each site is a git repo. Config, posts, feeds, previews all on disk. Natural backups & version control. Cloudflare Pages auto-deploys on git push. |
| **Plugins via functions not plugins-folder** | Load modules dynamically at runtime. Errors caught & logged. No plugin discovery magic. |

## Comments Integration (ziscus)

rsslobster integrates with [ziscus](https://github.com/HectorZarate/ziscus), a zero-JS comment system.

**How it works:**

1. Site owner sets `commentsEndpoint` in `rsslobster.json` (e.g. `"https://mysite.com"`)
2. At build time (`regenerateSite`), rsslobster calls `fetchComments(slug, endpoint)` from the `ziscus` npm package
3. The ziscus Cloudflare Worker serves `GET /comments/:slug` → approved comments as JSON
4. rsslobster passes comments to `generateHtmlPage()` which calls `renderCommentList()` + `renderCommentForm()` from ziscus
5. Comments are baked into static HTML — zero JavaScript at runtime
6. The HTML form POSTs to `{endpoint}/submit` — the Worker validates, stores in D1, and triggers a rebuild

**Pagination (200 comments/page, configurable via `commentsPerPage`):**

- `paginateComments()` in `src/generator/pagination.ts` splits comments into pages
- `regenerateSite()` generates multiple HTML files: `posts/slug/index.html`, `posts/slug/2/index.html`, etc.
- `cleanStaleCommentPages()` removes old page directories when comment count drops
- Requires a directory-based permalink (e.g. `/posts/:slug/index.html`); flat permalinks log a warning

**Key boundary:** rsslobster imports `ziscus` (the npm embed package) at build time. The ziscus Worker runs independently in production. The only runtime coupling is the `commentsEndpoint` URL.

## Related Projects

- **ziscus** — Comments system (baked into static HTML, zero JS). Cloudflare Worker + D1. Published as `ziscus` on npm.
- **Recommended Deploy** — Cloudflare Pages for static sites, Cloudflare Workers for comments API.
