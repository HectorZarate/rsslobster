# RSS Lobster

**Publish and read on the open web. Own both sides of the feed.**

[![CI](https://github.com/HectorZarate/rsslobster/actions/workflows/ci.yml/badge.svg)](https://github.com/HectorZarate/rsslobster/actions/workflows/ci.yml)

Personal publishing and reading system built on RSS. Send a message from any chat app — the lobster classifies it, generates a static HTML page, updates your feeds, and deploys. Subscribe to other people's feeds and read them in the same place. Zero JavaScript in the output. No algorithms. No platform.

**Cost:** $12/year for a domain. Hosting: free (Cloudflare Pages, GitHub Pages, etc.).

```
publish:                              read:

  phone → classify → html + rss         subscribe → poll → notify
            ↓                                        ↓
        git push → deploy               star → reblog → publish
            ↓                                        ↓
    live in < 4 seconds                 your site ← link post
```

## Features

**Publishing.** Send a message. The lobster figures out the type (micro, post, image, carousel, link, video, audio), generates semantic HTML with inlined CSS, updates RSS and JSON feeds, commits to git, and deploys. Drafts and scheduling built in. WebSub pings for instant feed updates.

**Reading.** Subscribe to feeds. Poll them. Get notified of new items. Star, reblog, mark read. AI-powered recaps. OPML import/export. Per-feed notification schedules and keyword filters.

**Comments.** Zero-JavaScript comment system baked into static HTML. Cloudflare Worker + D1 for storage, HTMLRewriter for instant feedback, GitHub Actions for auto-rebuilds. Full CLI moderation: approve, reject, spam, ban IPs, pause/resume, bulk actions. 50 comments/sec at 100% success rate. Honeypot, rate limiting, CSRF protection built in.

**Channels.** Telegram and webhooks ready. Discord, Slack, WhatsApp, Signal, Nostr, Matrix, IRC planned. The pipeline only needs an `InboundMessage`.

**Styles.** Four presets (minimal, brutalist, magazine, terminal). System fonts, zero external requests, WCAG AA contrast. Every CSS custom property is overridable. See [DESIGN.md](DESIGN.md).

**Multi-site.** Register multiple sites, publish across them from one CLI. Reblog from reader to any registered site.

**Hooks.** Shell commands that fire at `afterClassify`, `afterPublish`, `afterDeploy`. Receive JSON on stdin.

**Blogroll.** Auto-generated `/following/` page from your subscriptions, grouped by folder.

## Setup

Requires Node.js >= 22.

### 1. Create your site

```bash
npm install -g rsslobster
rsslobster onboard
```

Prompts for domain and style preset. Site is live at localhost:4321.

### 2. Add capabilities

Each is independent. Use what you need.

```bash
rsslobster enable telegram   # publish from your phone
rsslobster enable model      # AI classification (Ollama, OpenAI, Anthropic)
rsslobster enable deploy     # auto-deploy via git push
rsslobster enable comments   # comment system (requires Cloudflare Worker)
```

### 3. Read feeds

Works immediately, no setup required.

```bash
rsslobster feed add https://simonwillison.net
rsslobster feed                                  # unread items
rsslobster feed read 3                           # read item #3
rsslobster feed star 2                           # save for later
rsslobster feed reblog 1 -m "Worth reading"      # reblog as link post
```

### 4. Set up comments

```bash
# In your site repo — create and deploy the comments Worker
wrangler d1 create comments
cd worker && wrangler deploy
wrangler secret put ADMIN_SECRET

# Back in your site directory
rsslobster enable comments     # enter Worker URL + admin secret
rsslobster regenerate          # adds comment forms to posts
```

For auto-rebuilds when comments are submitted, add this GitHub Action:

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

Set `GITHUB_TOKEN` and `GITHUB_REPO` on the Worker (`wrangler secret put`) to enable the dispatch. Without this, comments still work — the commenter sees their comment instantly via HTMLRewriter, and everyone else sees it after your next manual `rsslobster regenerate` + deploy.

### 5. Moderate comments

```bash
rsslobster comments                         # dashboard
rsslobster comments list                    # pending queue
rsslobster comments approve <id>            # approve
rsslobster comments reject <id>             # reject
rsslobster comments spam <id>               # mark spam
rsslobster comments delete <id>             # permanent delete
rsslobster comments approve-all <slug>      # bulk approve
rsslobster comments mode off                # disable comments
rsslobster comments mode paused             # accept but hide
rsslobster comments ban <ip-hash>           # ban IP
```

### 6. Deploy

```bash
rsslobster enable deploy     # configure git remote
rsslobster publish "Hello"   # publishes + deploys automatically
```

Or deploy manually: push `_site/` to any static host.

## CLI reference

| Command | Description |
|---------|-------------|
| `rsslobster` | Status dashboard |
| `onboard` | Interactive setup |
| `enable <cap>` | Enable: `telegram`, `model`, `deploy`, `comments` |
| `start` | Start the daemon |
| `publish <text>` | Publish from CLI |
| `dev` | Local preview (localhost:4321) |
| `regenerate` | Rebuild all pages |
| `regenerate --slug <s>` | Rebuild one page |
| `drafts` | Manage drafts |
| `comments` | Comment moderation |
| `feed` | RSS reader |
| `sites` | Multi-site management |
| `delete <slug>` | Remove a post |

## Development

```bash
git clone https://github.com/HectorZarate/rsslobster.git
cd rsslobster && pnpm install
pnpm check    # lint + typecheck + 1047 tests
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) — Hector Zarate
