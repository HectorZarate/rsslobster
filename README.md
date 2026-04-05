# RSS Lobster

**Publish and read on the open web. Own both sides of the feed.**

[![CI](https://github.com/HectorZarate/rsslobster/actions/workflows/ci.yml/badge.svg)](https://github.com/HectorZarate/rsslobster/actions/workflows/ci.yml)

Personal publishing and reading system built on RSS. Send a message from any chat app — the lobster classifies it, generates a static HTML page, updates your feeds, and deploys. Subscribe to other people's feeds and read them in the same place. Zero JavaScript in the output. No algorithms. No platform.

```
publish:                              read:

  phone → classify → html + rss         subscribe → poll → notify
            ↓                                        ↓
        git push → deploy               star → reblog → publish
            ↓                                        ↓
    live in < 4 seconds                 your site ← link post
```

## Features

**Publishing.** Send a message. The lobster classifies the type (micro, post, image, carousel, link, video, audio), generates semantic HTML with inlined CSS, updates RSS and JSON feeds, and deploys. Drafts, scheduling, and WebSub built in.

**Reading.** Subscribe to feeds. Star, reblog, mark read. AI recaps. OPML import/export. Per-feed notification schedules.

**Comments.** Zero-JS comment system baked into static HTML. Cloudflare Worker + D1 for storage, HTMLRewriter for instant feedback, GitHub Actions for auto-rebuilds. CLI moderation with approve, reject, spam, ban, pause, bulk actions. Honeypot, rate limiting, CSRF protection.

**Styles.** Four presets (minimal, brutalist, magazine, terminal). System fonts, WCAG AA, zero external requests. See [DESIGN.md](DESIGN.md).

**Multi-site.** Publish across multiple registered sites from one CLI.

**Hooks.** Shell commands at `afterClassify`, `afterPublish`, `afterDeploy`.

## Setup

Requires Node.js >= 22.

### 1. Create your site

```bash
npm install -g rsslobster
rsslobster onboard
```

### 2. Add capabilities

```bash
rsslobster enable telegram   # publish from your phone
rsslobster enable model      # AI classification (Ollama, OpenAI, Anthropic)
rsslobster enable deploy     # auto-deploy via git push
rsslobster enable comments   # comment system (requires Cloudflare Worker)
```

### 3. Read feeds

```bash
rsslobster feed add https://simonwillison.net
rsslobster feed
rsslobster feed read 3
rsslobster feed reblog 1 -m "Worth reading"
```

### 4. Set up comments

```bash
wrangler d1 create comments
cd worker && wrangler deploy
wrangler secret put ADMIN_SECRET

rsslobster enable comments
rsslobster regenerate
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

Then create a GitHub token so the Worker can trigger rebuilds:

1. Go to https://github.com/settings/personal-access-tokens/new
2. **Repository access** → Only select repositories → pick your site repo
3. **Permissions** → Contents → **Read and write**
4. Generate token and copy it

```bash
cd worker
wrangler secret put GITHUB_TOKEN     # paste the token
```

Set `GITHUB_REPO` in your `worker/wrangler.toml`:

```toml
[vars]
GITHUB_REPO = "yourname/yoursite"
```

Without this, comments still work — the commenter sees their comment instantly via HTMLRewriter, and everyone else sees it after your next `rsslobster regenerate` + deploy.

### 5. Moderate comments

```bash
rsslobster comments                         # dashboard
rsslobster comments list                    # pending queue
rsslobster comments approve <id>
rsslobster comments reject <id>
rsslobster comments spam <id>
rsslobster comments delete <id>
rsslobster comments approve-all <slug>
rsslobster comments mode off                # disable
rsslobster comments mode paused             # accept but hide
rsslobster comments ban <ip-hash>
```

### 6. Deploy

```bash
rsslobster enable deploy
rsslobster publish "Hello"
```

## CLI reference

| Command | Description |
|---------|-------------|
| `onboard` | Interactive setup |
| `enable <cap>` | `telegram`, `model`, `deploy`, `comments` |
| `start` | Start daemon |
| `publish <text>` | Publish from CLI |
| `dev` | Local preview |
| `regenerate [--slug <s>]` | Rebuild pages |
| `comments` | Moderation |
| `feed` | RSS reader |
| `sites` | Multi-site |
| `delete <slug>` | Remove a post |

## Development

```bash
git clone https://github.com/HectorZarate/rsslobster.git
cd rsslobster && pnpm install
pnpm check
```

## License

[MIT](LICENSE) — Hector Zarate
