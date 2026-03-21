# RSS Lobster

**Unplatform yourself.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.9%2B-blue.svg)](https://www.typescriptlang.org)

A lightweight publishing platform for personal websites. Message your Lobster on Telegram, Signal, iMessage, or WhatsApp — it builds HTML + RSS and deploys to your site in four seconds.

No database. No CMS. Just files, git, and the open web.

---

## Why

You post on platforms you don't control. You don't need them anymore. Own your website, publish from your phone, and let RSS handle subscriptions.

**Cost:** $12/year for a domain. Hosting and reader: free.

## Quick Start

```bash
# Install
pnpm add rsslobster

# Initialize a new site
rsslobster init --domain yourname.com --title "Your Name"

# Generate your site from content
cat posts.json | rsslobster generate --site-dir ./my-site

# Manage drafts
rsslobster drafts list --site-dir ./my-site
rsslobster drafts publish <slug> --site-dir ./my-site
```

## Content Types

| Type | Description |
|------|-------------|
| **Micro** | Short-form text (tweet-length) |
| **Post** | Long-form article with title |
| **Image** | Single image with caption |
| **Carousel** | Multiple images |
| **Link** | Shared URL with commentary |

## Style Presets

Four built-in presets with WCAG AA compliance, system font stacks, and zero external dependencies:

- **Minimal** — clean, whitespace-forward
- **Brutalist** — raw, monospace, high-contrast
- **Magazine** — serif headers, editorial feel
- **Terminal** — green-on-black, hacker aesthetic

## Architecture

```
src/
├── cli/          # CLI commands (generate, init, drafts)
├── config/       # TypeScript interfaces
├── drafts/       # Draft CRUD + scheduling
├── generator/    # HTML, RSS 2.0, JSON Feed 1.1
└── styles/       # Style presets + CSS inheritance
```

**Key decisions:**
- Static HTML output — no JavaScript required in the browser
- Git as the database — everything version-controlled
- 3 runtime dependencies (`commander`, `gray-matter`, `picocolors`)
- Pure TypeScript feed generation — no XML libraries

## Development

### Prerequisites

- [Node.js](https://nodejs.org) >= 22.0.0
- [pnpm](https://pnpm.io) >= 10

### Setup

```bash
git clone https://github.com/HectorZarate/rsslobster.git
cd rsslobster
pnpm install
```

### Commands

```bash
pnpm check          # Lint + typecheck + test (runs on pre-commit)
pnpm test           # Run tests
pnpm test:watch     # Run tests in watch mode
pnpm test:coverage  # Run tests with coverage report
pnpm lint           # Lint with oxlint
pnpm typecheck      # TypeScript type checking
pnpm build          # Build with tsdown
```

### Testing

119+ tests with 80% coverage thresholds enforced via a pre-commit hook. Tests cover:

- All 5 content types and HTML generation
- RSS 2.0 and JSON Feed 1.1 spec compliance
- Draft lifecycle (create, update, schedule, publish, delete)
- Style presets and UX standards (typography, accessibility, touch targets)
- XSS prevention and input sanitization

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, coding standards, and how to submit changes.

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) — Hector Zarate
