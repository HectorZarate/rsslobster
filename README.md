# RSS Lobster

**Unplatform yourself.**

[![CI](https://github.com/HectorZarate/rsslobster/actions/workflows/ci.yml/badge.svg)](https://github.com/HectorZarate/rsslobster/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A5%2022-brightgreen)](https://nodejs.org)

Send a message from your chat app. Get a published website with RSS — in four seconds.

No database. No CMS. No JavaScript in the output. Just semantic HTML, RSS, and git.

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
Deploy (git commit → git push → Cloudflare Pages)
  ↓
Live (< 4 seconds end-to-end)
```

You send a message from any supported channel. The lobster classifies it (micro post, long article, image, link share, video, audio), generates a static HTML page with inlined CSS, updates the RSS and JSON feeds, commits to git, and Cloudflare Pages deploys it. Zero JavaScript in the output. WCAG AA accessible. Print-friendly.

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
| **Discord** | 🔲 Planned | Bot via Developer Portal |
| **Slack** | 🔲 Planned | App via Socket Mode |
| **WhatsApp** | 🔲 Planned | Business Cloud API |
| **Signal** | 🔲 Planned | Via signal-cli REST API |
| **Nostr** | 🔲 Planned | Decentralized relay protocol |
| **Matrix** | 🔲 Planned | Open protocol, self-hostable |
| **Webhook** | 🔲 Planned | Universal — curl, IFTTT, Zapier, Shortcuts |
| **IRC** | 🔲 Planned | Classic text-first protocol |

All stubs are implemented and ready for contributors. The pipeline is channel-agnostic — it only needs an `InboundMessage`.

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

Swap `"channel": "telegram"` for any other channel type. The model config supports any OpenAI-compatible API — use Ollama locally, or point to OpenAI/Anthropic.

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
| `rsslobster generate [dir]` | Generate HTML + feeds from JSON on stdin |
| `rsslobster drafts` | List and manage drafts |
| `rsslobster publish <slug>` | Publish a specific draft |

## Architecture

```
src/
├── agent/          # LLM classification + publishing pipeline
├── channels/       # Messaging platform adapters (9 channels)
├── cli/            # Command handlers (onboard, start, generate, etc.)
├── config/         # Types and content utilities
├── deploy/         # Git operations (stage, commit, push)
├── drafts/         # Draft lifecycle management
├── generator/      # HTML, RSS, JSON Feed, search index generation
├── hooks/          # Lifecycle hooks (afterClassify, afterPublish, afterDeploy)
├── images/         # Image ingestion and processing
├── styles/         # CSS preset system + inheritance
└── index.ts        # CLI entrypoint
```

**Design principles:**
- Files as the API — git is the database
- Composition over abstraction
- Zero JavaScript in output
- Minimal runtime dependencies (3 production deps)
- Test-first development (80% coverage thresholds)

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
