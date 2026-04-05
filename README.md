# RSS Lobster

**Publish and read on the open web. Own both sides of the feed.**

[![CI](https://github.com/HectorZarate/rsslobster/actions/workflows/ci.yml/badge.svg)](https://github.com/HectorZarate/rsslobster/actions/workflows/ci.yml)

Personal publishing and reading system built on RSS. Send a message from any chat app, get a static site with feeds. Subscribe to other people's feeds in the same place. Zero JS output. No algorithms. No platform.

```
read:                                 publish:

  subscribe → poll → notify             phone → classify → html + rss
              ↓                                   ↓
  star → reblog → publish               git push → deploy
              ↓                                   ↓
  your site ← link post                 live in < 4 seconds
```

## Quick Start

Requires Node.js >= 22.

```bash
npm install -g rsslobster
rsslobster onboard
```

---

## RSS Reader

Subscribe to RSS and Atom feeds. Star, reblog, mark read. AI recaps on your schedule. OPML import/export.

```bash
rsslobster feed add https://simonwillison.net
rsslobster feed                        # inbox
rsslobster feed read 3                 # open entry
rsslobster feed reblog 1 -m "Worth reading"
```

### CLI

| Command | Description |
|---------|-------------|
| `feed` | Inbox, add, read, star, reblog, mark read, OPML |

---

## RSS Publisher

Send a message. The lobster classifies type (micro, post, image, carousel, link, video, audio), generates semantic HTML with inlined CSS, updates RSS and JSON feeds, and deploys.

```bash
rsslobster publish "Hello"
rsslobster start                       # daemon for chat-app publishing
```

### Capabilities

```bash
rsslobster enable telegram   # publish from your phone
rsslobster enable model      # AI classification (Ollama, OpenAI, Anthropic)
rsslobster enable deploy     # auto-deploy via git push
rsslobster enable comments   # comment system (Cloudflare Worker)
```

### Styles

Four presets: minimal, brutalist, magazine, terminal. System fonts, WCAG AA, zero external requests. See [DESIGN.md](DESIGN.md).

### Multi-site

Publish across multiple registered sites from one CLI.

### Hooks

Shell commands at `afterClassify`, `afterPublish`, `afterDeploy`.

### Deploy

```bash
rsslobster enable deploy
rsslobster publish "Hello"
```

### Comments

Zero-JS comment system baked into static HTML. Cloudflare Worker + D1 storage, HTMLRewriter for instant feedback, GitHub Actions auto-rebuilds. Honeypot, rate limiting, CSRF.

#### Setup

```bash
wrangler d1 create comments
cd worker && wrangler deploy
wrangler secret put ADMIN_SECRET

rsslobster enable comments
rsslobster regenerate
```

For auto-rebuilds on new comments, add this GitHub Action:

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

Create a GitHub token so the Worker can trigger rebuilds:

1. Go to https://github.com/settings/personal-access-tokens/new
2. **Repository access** → Only select repositories → pick your site repo
3. **Permissions** → Contents → **Read and write**
4. Generate token and copy it

```bash
cd worker
wrangler secret put GITHUB_TOKEN     # paste the token
```

Set `GITHUB_REPO` in `worker/wrangler.toml`:

```toml
[vars]
GITHUB_REPO = "yourname/yoursite"
```

Without this, comments still work — the commenter sees theirs instantly via HTMLRewriter; everyone else sees it after your next `rsslobster regenerate` + deploy.

#### Moderation

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

### CLI

| Command | Description |
|---------|-------------|
| `onboard` | Interactive setup |
| `enable <cap>` | `telegram`, `model`, `deploy`, `comments` |
| `start` | Start daemon |
| `publish <text>` | Publish from CLI |
| `dev` | Local preview |
| `regenerate [--slug <s>]` | Rebuild pages |
| `comments` | Moderation |
| `sites` | Multi-site management |
| `delete <slug>` | Remove a post |

---

## Development

```bash
git clone https://github.com/HectorZarate/rsslobster.git
cd rsslobster && pnpm install
pnpm check
```

## License

[MIT](LICENSE) — Hector Zarate
