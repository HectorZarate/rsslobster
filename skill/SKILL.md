# rsslobster — Publishing Skill

You are helping a user publish content to their personal website. The site is powered by **rsslobster**, a static site generator that produces HTML pages and RSS/JSON feeds from structured content.

## Quick Reference

| Command | What it does |
|---|---|
| `rsslobster init` | Scaffold a new site |
| `rsslobster generate` | Publish content (JSON on stdin) |
| `rsslobster drafts create` | Save a draft |
| `rsslobster drafts list` | List all drafts |
| `rsslobster drafts show <slug>` | Show a single draft |
| `rsslobster drafts update <slug>` | Update a draft (JSON patch on stdin) |
| `rsslobster drafts delete <slug>` | Delete a draft |
| `rsslobster drafts schedule <slug> <datetime>` | Schedule for future publication |
| `rsslobster drafts unschedule <slug>` | Revert to draft status |
| `rsslobster drafts publish <slug>` | Publish a draft (generates HTML + feeds) |

All commands accept an optional `[site-dir]` argument (defaults to `.`).

## Content Types

rsslobster supports five content types. Choose the right one based on the user's message:

| Type | When to use | Required fields |
|---|---|---|
| `micro` | Short thoughts, status updates, no title needed | `body` |
| `post` | Longer writing with a title | `title`, `body` |
| `image` | Single image with caption | `body`, `images` |
| `carousel` | Multiple images | `body`, `images` (2+) |
| `link` | Sharing/bookmarking a URL | `body`, `linkUrl` |

## Content JSON Schema

Every piece of content follows this shape:

```json
{
  "type": "micro | post | image | carousel | link",
  "title": "Optional title (required for post)",
  "body": "The content text",
  "slug": "url-friendly-identifier",
  "tags": ["optional", "tags"],
  "images": [
    { "src": "/images/photo.jpg", "alt": "Description" }
  ],
  "linkUrl": "https://example.com",
  "linkTitle": "Optional link title",
  "linkDescription": "Optional link description",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

## Publishing Workflow

### Direct publish

Pipe content JSON to `rsslobster generate`:

```bash
echo '{"type":"micro","body":"Hello world","slug":"hello-world","tags":[],"createdAt":"2025-01-15T10:30:00Z","updatedAt":"2025-01-15T10:30:00Z"}' | rsslobster generate
```

This writes:
- `{slug}.html` — the post page
- `index.html` — updated homepage listing all posts
- `feed.xml` — RSS 2.0 feed (latest 20 posts)
- `feed.json` — JSON Feed 1.1 (latest 20 posts)

### Draft workflow

1. **Create**: pipe content JSON to `rsslobster drafts create`
2. **Iterate**: use `drafts update <slug>` with partial JSON on stdin
3. **Preview**: use `drafts show <slug>` to review
4. **Publish**: `rsslobster drafts publish <slug>` generates HTML + feeds
5. **Schedule**: `rsslobster drafts schedule <slug> <ISO-datetime>` for future publication

### After publishing

Commit the generated files and push to deploy:

```bash
git add -A && git commit -m "Publish: {slug}" && git push
```

The site is static files — any hosting (GitHub Pages, Netlify, Cloudflare Pages, etc.) works.

## Site Setup

### Initialize a new site

```bash
rsslobster init --domain mysite.com --title "My Site" --author "Name" --style minimal
```

Options:
- `--domain` (required): your domain
- `--title` (required): site title
- `--description`: site description
- `--author`: author name
- `--language`: language code (default: `en`)
- `--style`: preset — `minimal`, `brutalist`, `magazine`, or `terminal` (default: `minimal`)
- `--repo`: git remote URL for deploy

### Site config

The site config lives at `rsslobster.json` in the site root:

```json
{
  "domain": "mysite.com",
  "title": "My Site",
  "description": "A personal site",
  "author": "Name",
  "language": "en",
  "style": {
    "preset": "minimal",
    "overrides": {}
  },
  "repo": ""
}
```

### Style presets

| Preset | Aesthetic | Vibe |
|---|---|---|
| `minimal` | Charter serif, cream background, classic blue links | Personal homepage circa 2003 |
| `brutalist` | Times New Roman, black on white, red accents | Raw HTML, zero-CSS energy |
| `magazine` | Charter serif, linen background, dark red accents | Literary webzine |
| `terminal` | Monospace, amber on black, cyan links | BBS / shell |

Style overrides can customize: `fontFamily`, `fontFamilyHeading`, `fontSize`, `lineHeight`, `maxWidth`, colors (`colorText`, `colorBackground`, `colorAccent`, `colorLink`, `colorVisited`, `colorMuted`, `colorBorder`), `borderRadius`, and `customCss`.

## Slug Generation

Generate URL-friendly slugs from the content:
- Lowercase, alphanumeric and hyphens only
- Derived from the title (for posts) or first few words of body (for micros)
- Keep it short — under 60 characters
- Conflicts are auto-resolved by appending `-2`, `-3`, etc.

## Classifying User Messages

When the user sends you a message to publish, classify it:

1. **Is it short (< 280 chars) with no title?** → `micro`
2. **Does it have a title or is it long-form writing?** → `post`
3. **Did they send/attach an image?** → `image` (one) or `carousel` (multiple)
4. **Did they share a URL to bookmark/comment on?** → `link`

Always confirm the classification and content with the user before publishing. Show them a preview of what will be published.

## Directory Structure

A site directory looks like:

```
mysite/
├── rsslobster.json      # Site config
├── posts.json           # Post index (managed by rsslobster)
├── index.html           # Homepage
├── feed.xml             # RSS feed
├── feed.json            # JSON feed
├── drafts/              # Draft JSON files
│   └── my-draft.json
├── images/              # Uploaded images
│   └── photo.jpg
├── hello-world.html     # Published post
└── my-article.html      # Published post
```
