# RSS Lobster

**Unplatform yourself.**

[![CI](https://github.com/HectorZarate/rsslobster/actions/workflows/ci.yml/badge.svg)](https://github.com/HectorZarate/rsslobster/actions/workflows/ci.yml)

Send a message from your chat app to your RSS Lobster. This publishes a post to your own website with an RSS feed, the update goes out to your subscribers in seconds. Work on drafts, schedule and preview posts, all for the price of a domain. No hosting costs because RSS Lobster outputs a static site, which are free to host on popular providers like CloudFlare Pages, Digital Ocean, and Github Pages.  


**Cost:** $12/year for a domain. Hosting: free (Cloudflare Pages).

## Quick Start

```bash
npm install -g rsslobster
rsslobster onboard     # interactive setup — domain, style, channel
rsslobster start       # listen for messages, publish on receive
```

That's it. Send a message from Telegram. It's live.

## How It Works

```
Message (Telegram, Discord, …)
  ↓
Classify (LLM determines content type)
  ↓
Generate (HTML page + RSS + JSON Feed)
  ↓
Deploy (git commit → git push → Cloudflare Workers)
  ↓
Live (< 4 seconds end-to-end)
```

You send a message from any supported channel. The lobster classifies it (micro post, long article, image, link share, video, audio), generates a static HTML page with inlined CSS, updates the RSS and JSON feeds, commits to git, and Cloudflare deploys it. Zero JavaScript in the output. WCAG AA accessible. Print-friendly. Your content is never rewritten by AI — the LLM classifies metadata only.

## Content Types

| Type | You send… | Output |
|------|-----------|--------|
| **Micro** | A short thought | Tweet-style post |
| **Post** | Longer writing | Full article with title |
| **Image** | A photo with caption | Image post with `<figure>` |
| **Carousel** | Multiple photos | Gallery layout |
| **Link** | A URL with commentary | Link post with metadata |
| **Video** | A video file | Embedded `<video>` player |
| **Audio** | An audio file | Embedded `<audio>` player |

Classification is automatic — the LLM reads your message and picks the right type.

## Channels

Any messaging platform can be an input source. Pick whichever you already use.

| Channel | Status | Integration |
|---------|--------|-------------|
| **Telegram** | ✅ Ready | Bot via @BotFather |
| **Webhook** | ✅ Ready | Universal — curl, IFTTT, Zapier, Shortcuts |
| **Discord** | 🔲 Planned | Bot via Developer Portal |
| **Slack** | 🔲 Planned | App via Socket Mode |
| **WhatsApp** | 🔲 Planned | Business Cloud API |
| **Signal** | 🔲 Planned | Via signal-cli REST API |
| **Nostr** | 🔲 Planned | Decentralized relay protocol |
| **Matrix** | 🔲 Planned | Open protocol, self-hostable |
| **IRC** | 🔲 Planned | Classic text-first protocol |

The pipeline is channel-agnostic — it only needs an `InboundMessage`. Stubs for all channels are ready for contributors.

## Configuration

All config lives in `lobster.json` at your site root:

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
  }
}
```

Swap `"channel": "telegram"` for any other channel type. The model config supports any OpenAI-compatible API — use any model locally, or point to OpenAI/Anthropic/OpenRouter/etc.

## Style Presets

Choose during setup. All presets use system fonts, zero external requests, and meet WCAG AA contrast requirements.

| Preset | Vibe |
|--------|------|
| **Minimal** | Clean, whitespace-forward |
| **Brutalist** | Raw, monospace, high-contrast |
| **Magazine** | Serif headers, editorial feel |
| **Terminal** | Green-on-black, hacker aesthetic |

Presets are fully customizable — override any CSS custom property in your site config. See [DESIGN.md](DESIGN.md) for the full design system specification.

Example output for each preset lives in [`examples/`](examples/).

## Drafts & Scheduling

Say "draft" or "save for later" in your message and it's saved instead of published:

```
You: "draft: Thoughts on decentralization — the web was designed to be…"
Lobster: "Saved as draft: thoughts-on-decentralization"
```

Manage drafts via CLI:

```bash
rsslobster drafts              # list all drafts
rsslobster publish <slug>      # publish immediately
```

Drafts can be scheduled for future publication. The scheduler checks every 60 seconds and auto-publishes when the time arrives.

## Instant Updates (WebSub)

RSS Lobster integrates with [WebSub](https://www.w3.org/TR/websub/) (formerly PubSubHubbub) for real-time feed updates. When you publish a post, the hub is pinged automatically — readers that support WebSub (Feedly, NewsBlur, Inoreader) get your new content in seconds, not hours.

No configuration needed. Both `feed.xml` and `feed.json` declare the hub, and every successful deploy triggers a ping to `pubsubhubbub.appspot.com`.

## Lifecycle Hooks

Three hook points for extending the pipeline. Each hook is a shell command that receives JSON on stdin and can output JSON to override behavior.

| Hook | Fires when | Use case |
|------|-----------|----------|
| `afterClassify` | Content classified, before publish | Override tags, modify title, enforce rules |
| `afterPublish` | HTML + feeds generated | Notify Slack, send analytics, ping services |
| `afterDeploy` | Git push complete | Purge CDN, trigger webhook, log deployment |

Configure in `lobster.json`:

```json
{
  "hooks": {
    "afterDeploy": "curl -X POST https://your-webhook.com"
  }
}
```

## Docker

```bash
docker build -t rsslobster .
docker run -v /path/to/your/site:/site -p 3000:3000 rsslobster
```

Multi-stage build, runs as non-root, Node.js 22 slim base.

## CLI Reference

| Command | Description |
|---------|-------------|
| `rsslobster onboard [dir]` | Interactive setup wizard |
| `rsslobster init [dir]` | Non-interactive scaffold (`--domain`, `--title`, `--style`, etc.) |
| `rsslobster start [dir]` | Start the daemon — listen for messages and publish |
| `rsslobster publish <text>` | Publish directly from CLI — no LLM needed |
| `rsslobster dev [dir]` | Local preview server (serves `_site/` on localhost:4321) |
| `rsslobster regenerate [dir]` | Rebuild all pages from existing posts (after style changes) |
| `rsslobster generate [dir]` | Generate HTML + feeds from JSON on stdin |
| `rsslobster drafts` | List and manage drafts |

## Architecture

```
mysite/                     ← your site (git repo)
├── rsslobster.json          ← site config (domain, title, style)
├── posts.json               ← posts index
├── drafts/                  ← saved drafts
└── _site/                   ← generated output (deploy this)
    ├── index.html
    ├── favicon.svg
    ├── og-image.png
    ├── feed.xml / feed.json
    ├── search-index.json
    ├── sitemap.xml / robots.txt
    └── posts/slug/index.html
```

```
src/
├── agent/          # LLM classification + publishing pipeline
├── channels/       # Messaging platform adapters
├── cli/            # Command handlers (onboard, start, dev, publish, etc.)
├── config/         # Types, permalink patterns, output paths
├── deploy/         # Git operations (stage, commit, push)
├── drafts/         # Draft lifecycle management
├── generator/      # HTML, RSS, JSON Feed, search, favicon, OG image
├── hooks/          # Lifecycle hooks (afterClassify, afterPublish, afterDeploy)
├── images/         # Image and media ingestion
├── styles/         # CSS preset system + inheritance
└── index.ts        # CLI entrypoint
```

**Design principles:**
- Files as the API — git is the database
- Config and state at root, output in `_site/` — clean separation
- Zero JavaScript in output
- AI classifies metadata, never rewrites your words
- Test-first development (560+ tests)

## Adding a Channel

Each channel implements the `Channel` interface:

```typescript
interface Channel {
  readonly type: ChannelType;
  poll(handler: MessageHandler, signal?: AbortSignal): Promise<void>;
  reply(chatId: string, text: string): Promise<void>;
  downloadAttachments(message: InboundMessage): Promise<void>;
}
```

The stubs in `src/channels/` are ready to fill in. Pick one, implement the API calls, and open a PR. The pipeline doesn't care where the message came from — it just needs an `InboundMessage`.

## Development

```bash
git clone https://github.com/HectorZarate/rsslobster.git
cd rsslobster
pnpm install
pnpm check          # lint (oxlint) + typecheck (tsc) + test (vitest) — all in one
```

Individual commands:

```bash
pnpm lint           # oxlint src/
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest run
pnpm test:watch     # vitest (watch mode)
pnpm test:coverage  # coverage report
pnpm build          # tsdown → dist/
```

Requires Node.js ≥ 22 and pnpm ≥ 10. Pre-commit hook runs `pnpm check` automatically.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) — Hector Zarate
