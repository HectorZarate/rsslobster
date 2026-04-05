# RSS Lobster

**Publish and read on the open web. Own both sides of the feed.**

[![CI](https://github.com/HectorZarate/rsslobster/actions/workflows/ci.yml/badge.svg)](https://github.com/HectorZarate/rsslobster/actions/workflows/ci.yml)

RSS Lobster is a personal publishing and reading system built on RSS. You publish from your phone to your own site. You subscribe to feeds and read them in the same place. Your content goes out as RSS. Other people's content comes in as RSS. No algorithms. No platform. Just the protocol the web already agreed on.

**Cost:** $12/year for a domain. Hosting: free (Cloudflare Pages, GitHub Pages, etc.).

## Quick start

```bash
npm install -g rsslobster
rsslobster onboard          # domain + style → site in 30 seconds
```

Your site is running at localhost:4321. Now add what you need:

```bash
# Read feeds (works immediately — no setup required)
rsslobster feed add https://simonwillison.net
rsslobster feed

# Publish from your phone
rsslobster enable telegram   # set up your Telegram bot
rsslobster start             # start listening

# Add AI classification
rsslobster enable model      # configure Ollama, OpenAI, or Anthropic

# Auto-deploy
rsslobster enable deploy     # git remote for Cloudflare Pages, GitHub Pages, etc.
```

Each capability is independent. Use what you need, skip what you don't.

## What it does

RSS Lobster does two things:

**1. Publish.** Send a message from any chat app. The lobster classifies it, generates a static HTML page with inlined CSS, updates your RSS and JSON feeds, commits to git, and deploys. Under 4 seconds end-to-end. Zero JavaScript in the output. Your words are never rewritten — the LLM classifies metadata only.

**2. Read.** Subscribe to feeds. Poll them. Get notified of new items. Star what matters. Reblog to any of your sites as link posts. Generate daily or weekly recaps. OPML import/export so you can bring your subscriptions from anywhere and take them when you leave.

The two sides compose: you read something interesting, you reblog it to your site, your subscribers get it in their readers. The open web feedback loop, running on a protocol from 1999.

```
publish:                              read:

  phone → classify → html + rss         subscribe → poll → notify
            ↓                                        ↓
        git push → deploy               star → reblog → publish
            ↓                                        ↓
    live in < 4 seconds                 your site ← link post
```

## Publishing

Send a message. The lobster figures out what it is.

| Type | You send | Output |
|------|----------|--------|
| **Micro** | A short thought | Tweet-style post |
| **Post** | Longer writing | Full article with title |
| **Image** | Photo with caption | Image post with `<figure>` |
| **Carousel** | Multiple photos | Gallery layout |
| **Link** | URL with commentary | Link card with metadata |
| **Video** | Video file | Embedded `<video>` player |
| **Audio** | Audio file | Embedded `<audio>` player |

Classification is automatic. Drafts and scheduling are built in — say "draft" or set a time and it's handled. Every publish pings [WebSub](https://www.w3.org/TR/websub/) so readers that support it (Feedly, NewsBlur, Inoreader) get your content in seconds.

## Reading

```bash
rsslobster feed add https://simonwillison.net    # auto-discovers the feed
rsslobster feed                                    # show unread items
rsslobster feed read 3                             # read item #3
rsslobster feed star 2                             # save for later
rsslobster feed reblog 1 -m "This is excellent"    # reblog as link post
```

Or talk to the lobster directly from chat:

```
You:      subscribe https://danluu.com
Lobster:  Subscribed to "Dan Luu" — 15 item(s) fetched

You:      unread
Lobster:  15 unread:
          1. In defense of simple architectures
             https://danluu.com/simple-architectures/
          2. ...

You:      read 1
Lobster:  In defense of simple architectures
          by Dan Luu
          ...

You:      reblog 1 This is the post I point people to when they want microservices
Lobster:  Reblogged: "In defense of simple architectures"
          → Link post on your site
```

### Feed management

| Command | What it does |
|---------|-------------|
| `feed add <url>` | Subscribe (auto-discovers feed from HTML) |
| `feed remove <url>` | Unsubscribe and remove stored items |
| `feed list` | Unread items, paginated |
| `feed list --subs` | Show subscriptions with unread counts |
| `feed poll` | Fetch all due feeds |
| `feed poll --force` | Fetch all feeds regardless of interval |
| `feed read <n>` | Show item content, mark read |
| `feed star <n>` | Star an item |
| `feed reblog <n>` | Reblog as link post on your site |
| `feed reblog <n> --to blog` | Reblog to a different registered site |
| `feed mark-read --all` | Catch up |
| `feed items --starred` | Show starred items |

### Notifications

Per-feed control over what you get notified about and when.

```bash
rsslobster feed notify                              # show current settings
rsslobster feed notify --schedule daily --deliver-at 09:00
rsslobster feed notify --quiet-start 22:00 --quiet-end 08:00
rsslobster feed mute https://noisy-feed.com/rss
rsslobster feed filter https://important.com/feed --keywords ai rust
```

Schedules: `immediate`, `hourly`, `daily`, `weekly`. High-priority feeds bypass quiet hours. Keyword filters are per-feed (match any term against title + content).

### OPML

```bash
rsslobster feed import subscriptions.opml    # bring your feeds from anywhere
rsslobster feed export > backup.opml          # take them when you leave
```

Folder structure is preserved in both directions.

### Recaps

```bash
rsslobster feed recap              # plain-text daily recap
rsslobster feed recap --enable     # enable AI-powered recaps
```

When an LLM is configured, recaps summarize the most interesting items across your feeds. Saved to disk so you can review past recaps.

## Blogroll

If you have subscriptions, RSS Lobster generates a `/following/` page on your site — a blogroll listing every feed you read, grouped by folder, with RSS links. It updates automatically when you subscribe or unsubscribe.

## Channels

Any messaging platform can be an input source.

| Channel | Status |
|---------|--------|
| **Telegram** | Ready |
| **Webhook** | Ready (curl, IFTTT, Zapier, Shortcuts) |
| **Discord** | Planned |
| **Slack** | Planned |
| **WhatsApp** | Planned |
| **Signal** | Planned |
| **Nostr** | Planned |
| **Matrix** | Planned |
| **IRC** | Planned |

The pipeline is channel-agnostic. It only needs an `InboundMessage`.

## Configuration

Everything lives in `lobster.json`:

```json
{
  "channel": "telegram",
  "telegram": {
    "token": "your-bot-token",
    "allowedUsers": ["12345"]
  },
  "model": {
    "baseUrl": "http://localhost:11434/v1",
    "model": "llama3",
    "apiKey": "ollama"
  },
  "reader": {
    "defaultInterval": 15
  }
}
```

The model config supports any OpenAI-compatible API — Ollama locally, or OpenAI/Anthropic/OpenRouter remotely.

## Style presets

All presets: system fonts, zero external requests, WCAG AA contrast, zero JavaScript.

| Preset | Vibe |
|--------|------|
| **Minimal** | Clean, whitespace-forward |
| **Brutalist** | Raw, monospace, high-contrast |
| **Magazine** | Serif headers, editorial feel |
| **Terminal** | Green-on-black, hacker aesthetic |

Every CSS custom property is overridable. See [DESIGN.md](DESIGN.md) for the full design system.

## Lifecycle hooks

Shell commands that fire at pipeline stages. Receive JSON on stdin, can return JSON to override behavior.

| Hook | Fires when | Example use |
|------|-----------|-------------|
| `afterClassify` | Before publish | Override tags, enforce rules |
| `afterPublish` | HTML + feeds generated | Notify Slack, send analytics |
| `afterDeploy` | Git push complete | Purge CDN, trigger webhook |

## Architecture

```
mysite/
├── rsslobster.json         site config
├── lobster.json            channel + model config
├── posts.json              posts index
├── drafts/                 saved drafts
├── reader/                 feed data (subscriptions, items, config)
│   ├── subscriptions.json
│   ├── unread-index.json
│   ├── config.json
│   └── feeds/              per-feed item storage
└── _site/                  generated output (deploy this)
    ├── index.html
    ├── feed.xml / feed.json
    ├── following/           blogroll
    └── posts/slug/index.html
```

```
src/
├── agent/       LLM classification + pipeline
├── channels/    messaging platform adapters
├── cli/         command handlers
├── comments/    comment rendering, fetching, styles
├── config/      types, paths, workspace registry
├── deploy/      git commit + push
├── drafts/      draft lifecycle
├── generator/   HTML, RSS, JSON Feed, search, SEO
├── hooks/       lifecycle hooks
├── images/      image + media ingestion
├── pages/       custom pages
├── plugins/     plugin system
├── previews/    draft preview flow
├── reader/      RSS reader (subscribe, poll, store, notify, recap)
├── styles/      CSS preset system
└── index.ts     CLI entrypoint
```

### Design principles

- **Files as the API** — git is the database, the filesystem is the state
- **Zero JavaScript in output** — generated sites work without JS
- **AI classifies, never rewrites** — your words are yours
- **RSS in, RSS out** — the same protocol for publishing and reading
- **Composition over abstraction** — functions that take data and return data
- **Concurrency-safe** — per-feed and per-index locks, atomic writes, no corrupt reads

### Internals worth knowing

**Dedup strategy:** Items are deduplicated by `id` (guid/atom id) > `link` > SHA-256 hash of title+content. Three layers, zero duplicates.

**Unread index:** A lightweight cache of unread item references. Fast path for `listItems({read: false})` loads only the feeds that contain unread items. Self-heals on corruption via background rebuild.

**Polling:** Bounded concurrency (5 feeds at a time). Conditional GET with ETag/If-Modified-Since. Exponential backoff for failing feeds (caps at ~24h). Feeds that go permanently offline don't waste your bandwidth.

**Notifications:** Evaluated at ingestion time for immediate delivery, queued for batched schedules. Quiet hours only suppress immediate notifications — batched digests still include all items.

## Multi-site

Register multiple sites and publish across them from one CLI.

```bash
rsslobster sites add blog ~/workspace/myblog
rsslobster sites add photo ~/workspace/myphotos
rsslobster sites
```

Reblog an item from your reader to a specific site:

```bash
rsslobster feed reblog 1 --to blog -m "This is worth reading"
```

Publish directly to a registered site:

```bash
rsslobster publish --to photo --type image "Austin sunset"
```

Cross-site operations are local-only by default. Add `--deploy` to git commit and push the target site. The site registry lives at `~/.rsslobster/sites.json`.

## Comments

Zero-JavaScript comment system. Comments are baked into the static HTML at build time. Readers never hit a server — the CDN serves flat files. When someone submits a comment, a Cloudflare Worker stores it in D1, shows the commenter their comment instantly via HTMLRewriter, and triggers a rebuild that bakes it into the static page for everyone else.

```
submit comment → Worker → D1 → instant feedback (HTMLRewriter)
                            → GitHub Action → regenerate --slug → deploy
                            → ~20 seconds later, static page updated on CDN
```

### Setup

```bash
# 1. Create a Cloudflare D1 database
wrangler d1 create comments

# 2. Deploy the comments Worker (from your site repo)
cd worker
wrangler deploy

# 3. Set the admin secret on the Worker
wrangler secret put ADMIN_SECRET      # for approving/rejecting comments

# 4. Enable comments in rsslobster
rsslobster enable comments
# Enter your Worker URL and admin secret when prompted

# 5. Regenerate your site (adds comment forms to posts)
rsslobster regenerate
```

The Worker handles submission, validation, rate limiting, and spam defense. The static site generator handles rendering. The GitHub Action handles rebuilding.

### Moderation

```bash
rsslobster comments                         # dashboard — counts + mode
rsslobster comments list                    # pending comments across all posts
rsslobster comments list my-post            # pending for one post
rsslobster comments list --status approved  # filter by status
rsslobster comments approve abc123          # approve
rsslobster comments reject abc123           # reject
rsslobster comments spam abc123             # mark as spam
rsslobster comments unapprove abc123        # revert approved → pending
rsslobster comments delete abc123           # permanent delete
rsslobster comments approve-all my-post     # approve all pending for a post
```

### Mode

```bash
rsslobster comments mode              # show current mode
rsslobster comments mode on           # normal — accept comments, display on site
rsslobster comments mode off          # reject all submissions, hide all comments
rsslobster comments mode paused       # accept submissions (as pending), hide from site
```

`paused` is useful during a spam wave: new comments queue up for review but don't appear on the site until you unpause.

### IP banning

```bash
rsslobster comments bans              # list banned IPs
rsslobster comments ban abc123 --reason "spammer"
rsslobster comments unban abc123
```

IPs are stored as SHA-256 hashes — the Worker never stores raw IP addresses.

### Spam defense

Built into the Worker, no configuration needed:

- **Honeypot field** — hidden form field; bots that fill it are silently rejected
- **Rate limiting** — 5 comments per IP per hour (configurable via `RATE_LIMIT` env var)
- **CSRF check** — rejects submissions from foreign origins
- **Length limits** — author (100 chars), body (2–10,000 chars)
- **URL heuristic** — rejects comments with more than 3 URLs
- **Slug validation** — alphanumeric + hyphens only, max 255 chars

### How it works

**Read path (every visitor):** Browser → CDN → flat HTML. No Worker. No compute. Scales to any traffic level.

**Write path (commenter):** Browser POST → Worker → validates + rate limits → D1 INSERT → HTMLRewriter serves the page with fresh comments (commenter sees their comment instantly) → debounced `repository_dispatch` → GitHub Action runs `rsslobster regenerate --slug <post>` → git push → CDN updated.

**Comment statuses:** `pending` → `approved` or `rejected` or `spam`. Only `approved` comments appear on the site.

### Auto-rebuild with GitHub Actions

When the Worker receives a comment, it fires a `repository_dispatch` event to GitHub. This Action rebuilds the affected page and pushes the update — Cloudflare Pages (or any git-based host) deploys automatically.

```yaml
# .github/workflows/rebuild-comments.yml
name: Rebuild page with comments
on:
  repository_dispatch:
    types: [rebuild-comments]

permissions:
  contents: write

jobs:
  rebuild:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22 }

      - name: Install rsslobster
        run: |
          git clone --depth 1 https://github.com/HectorZarate/rsslobster.git /tmp/rsslobster
          cd /tmp/rsslobster
          pnpm install --frozen-lockfile
          pnpm build
          pnpm link --global

      - name: Regenerate page
        run: rsslobster regenerate --slug ${{ github.event.client_payload.slug }} .

      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add _site/
          git diff --cached --quiet && echo "No changes" && exit 0
          git commit -m "rebuild: bake comments into ${{ github.event.client_payload.slug }}"
          git push
```

The Worker needs a GitHub token (`GITHUB_TOKEN` secret via `wrangler secret put`) and the repo name (`GITHUB_REPO` env var) to fire the dispatch. The debounce logic coalesces rapid submissions — dozens of comments in a minute trigger only a few rebuilds.

**Without GitHub Actions:** Comments still work. The commenter sees their comment instantly via HTMLRewriter. Other visitors see it after your next `rsslobster regenerate` + deploy (manual or scheduled).

### Configuration

In `rsslobster.json`:

```json
{
  "commentsEndpoint": "https://your-comments-worker.workers.dev"
}
```

In `lobster.json` (gitignored):

```json
{
  "commentsAdminSecret": "your-secret"
}
```

Worker env vars (set via `wrangler secret put` or `wrangler.toml`):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADMIN_SECRET` | Yes | — | Bearer token for moderation API |
| `MODERATION` | No | `off` | `on` = new comments start as pending. `off` = auto-approve |
| `RATE_LIMIT` | No | `5` | Max comments per IP per hour |
| `SITE_URL` | Yes | — | Your site URL (for redirects and CSRF check) |

### Excluding posts from comments

Add `noRss: true` to a post to exclude it from RSS feeds and the index page while keeping its HTML page (useful for test posts or unlisted content).

### CLI reference

| Command | Description |
|---------|-------------|
| `comments` | Dashboard (pending/approved/rejected/spam counts + mode) |
| `comments list [slug]` | List comments (default: pending) |
| `comments approve <id>` | Approve a comment |
| `comments reject <id>` | Reject a comment |
| `comments spam <id>` | Mark as spam |
| `comments unapprove <id>` | Revert to pending |
| `comments delete <id>` | Permanently delete |
| `comments approve-all <slug>` | Approve all pending for a post |
| `comments mode [on\|off\|paused]` | Show or set mode |
| `comments ban <ip-hash>` | Ban an IP |
| `comments unban <ip-hash>` | Remove ban |
| `comments bans` | List banned IPs |

## CLI reference

| Command | Description |
|---------|-------------|
| `rsslobster` | Status dashboard (in a configured directory) |
| `rsslobster onboard` | Interactive setup (domain + style) |
| `rsslobster enable <cap>` | Enable a capability: `telegram`, `model`, `deploy`, `comments` |
| `rsslobster enable --list` | Show what's configured |
| `rsslobster start` | Start the daemon |
| `rsslobster publish <text>` | Publish from CLI (requires `--type` without a model) |
| `rsslobster dev` | Local preview server (localhost:4321) |
| `rsslobster regenerate` | Rebuild all pages |
| `rsslobster drafts` | Manage drafts |
| `rsslobster comments` | Comment moderation (see [Comments](#comments)) |
| `rsslobster feed` | RSS reader (see [Reading](#reading)) |
| `rsslobster sites` | List, add, remove registered sites |
| `rsslobster publish --to <site>` | Publish to a different registered site |

## Docker

```bash
docker build -t rsslobster .
docker run -v /path/to/site:/site rsslobster
```

## Development

```bash
git clone https://github.com/HectorZarate/rsslobster.git
cd rsslobster && pnpm install
pnpm check    # lint + typecheck + 1047 tests
```

```bash
pnpm lint           # oxlint
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest
pnpm test:watch     # vitest watch mode
pnpm build          # tsdown → dist/
```

Requires Node.js >= 22 and pnpm >= 10. Pre-commit hook runs `pnpm check`.

## Troubleshooting

**`sharp` install failures:** RSS Lobster uses [sharp](https://sharp.pixelplumbing.com/) for image processing. It downloads prebuilt native binaries during install. If this fails (corporate proxy, unusual architecture):

```bash
npm install --ignore-scripts rsslobster
npx sharp install
```

**Node version:** Requires Node.js >= 22. Check with `node --version`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) — Hector Zarate
