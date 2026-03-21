# RSS Lobster

**Unplatform yourself.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Send a message from your favorite chat app — the lobster classifies it, generates HTML + RSS, and deploys it. Four seconds to published.

No database. No CMS. Just files, git, and the open web.

**Cost:** $12/year for a domain. Hosting: free.

## How It Works

```
You (any channel) → Lobster classifies → HTML + RSS generated → git push → live
```

Send a message from Telegram, Discord, Slack, or any supported channel. The lobster figures out what it is (short post, long article, image, link share), generates a static page, commits to git, and Cloudflare Pages deploys it.

## Channels

RSS Lobster is built around a channel abstraction — any messaging platform can be an input source. Pick whichever you already use.

| Channel | Status | Notes |
|---------|--------|-------|
| **Telegram** | ✅ Ready | Full implementation — bot via @BotFather |
| **Discord** | 🔲 Stub | Bot via Developer Portal |
| **Slack** | 🔲 Stub | App via Socket Mode |
| **WhatsApp** | 🔲 Stub | Business Cloud API |
| **Signal** | 🔲 Stub | Via signal-cli REST API |
| **Nostr** | 🔲 Stub | Decentralized — connect to relays |
| **Matrix** | 🔲 Stub | Open protocol, self-hostable |
| **Webhook** | 🔲 Stub | Universal — curl, IFTTT, Zapier, Shortcuts |
| **IRC** | 🔲 Stub | Classic. Text-first. No dependencies |

The channel is configured in `lobster.json`:

```json
{
  "channel": "telegram",
  "telegram": { "token": "...", "allowedUsers": ["12345"] },
  "model": { "baseUrl": "http://localhost:11434/v1", "model": "llama3", "apiKey": "ollama" }
}
```

Swap `"channel": "telegram"` for `"discord"`, `"slack"`, `"webhook"`, etc. — the pipeline, classification, and deployment are all channel-agnostic.

## Install

```bash
npm install -g rsslobster
rsslobster onboard
rsslobster start
```

## Content Types

| Type | You send... |
|------|------------|
| **Micro** | A short thought (tweet-length) |
| **Post** | Longer writing with a title |
| **Image** | A photo with a caption |
| **Carousel** | Multiple photos |
| **Link** | A URL with commentary |

## Style Presets

Pick one during setup. All use system fonts, zero external requests, WCAG AA contrast.

- **Minimal** — clean, whitespace-forward
- **Brutalist** — raw, monospace, high-contrast
- **Magazine** — serif headers, editorial feel
- **Terminal** — green-on-black, hacker aesthetic

## Adding a Channel

Each channel implements the `Channel` interface (`src/channels/types.ts`):

```typescript
interface Channel {
  readonly type: ChannelType;
  poll(handler: MessageHandler, signal?: AbortSignal): Promise<void>;
  reply(chatId: string, text: string): Promise<void>;
  downloadImages(message: InboundMessage): Promise<void>;
}
```

The stubs in `src/channels/` are ready for implementation. Pick one, fill in the API calls, and open a PR. The pipeline doesn't care where the message came from — it just needs an `InboundMessage`.

## Development

```bash
git clone https://github.com/HectorZarate/rsslobster.git
cd rsslobster
pnpm install
pnpm check    # lint + typecheck + test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) — Hector Zarate
