# RSS Lobster

**Unplatform yourself.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Message your Lobster on Telegram — it publishes to your site in four seconds. HTML + RSS, deployed, done.

No database. No CMS. Just files, git, and the open web.

**Cost:** $12/year for a domain. Hosting: free.

## How It Works

```
You (Telegram) → Lobster classifies → HTML + RSS generated → git push → live
```

Send a message. The lobster figures out what it is (short post, long article, image, link share), generates a static page, commits to git, and Cloudflare Pages deploys it. Four seconds.

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
