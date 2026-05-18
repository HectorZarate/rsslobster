# Changelog

## 0.4.2 — 2026-05-18

### Idempotent regen cleanup
- `rebuildFeeds` now removes stale `_site/feed.xml` and `_site/feed.json` when transitioning to zero posts, so re-running `regenerate` on an empty-posts site no longer leaves orphaned feed files from a previous state.
- `rebuildIndex` now removes stale `_site/posts/index.html` in the same scenario, keeping the output directory consistent on repeated regen runs.

### Type tightening
- `writePages` signature now accepts `readonly Post[]` instead of a structural union, making the contract more precise without any behavioural change.

## 0.4.1 — 2026-05-03

### Static landing page support
- Sites with zero posts (resume / portfolio / single-page sites) no longer ship empty post-archive scaffolding on every regen.
- `rebuildFeeds` skips writing `_site/feed.xml` and `_site/feed.json` when there are no posts.
- `rebuildIndex` skips `_site/posts/index.html` when `config.homepage` is set and there are no posts; root `index.html` still gets written on sites without a homepage page (existing behavior preserved for fresh scaffolds).
- `generateStylesheet` now accepts `{ hasPosts: boolean }` and omits `.post-thumb` / `.post-nav` / `.post-nav-prev` / `.post-nav-next` rules when false. `generatePageHtml` and `writePages` thread this through automatically based on the post count, so `rsslobster regenerate` on a posts-empty site produces a slimmer page payload without any config change.

### Internals
- 12 new tests covering the elision behavior; 4 existing tests updated where the contract changed.

## 0.4.0 — 2026-04-14

### Comment pagination
- Zero-JavaScript comment pagination at build time — 200 comments per page (configurable via `commentsPerPage` in rsslobster.json)
- URL structure: `/posts/slug/2/` for page 2, post content visible on all pages
- `<link rel="prev/next">` in head for SEO, prev/next navigation links
- Stale page cleanup when comment count drops on regeneration

### CLI improvements
- `publish` no longer requires `--type` — defaults to `micro` so `rsslobster publish "Hello"` works
- `init` is now an alias for `onboard` — one setup command, no confusion
- `--site-dir` flag standardized across all commands (positional still works for backward compat)
- `--deploy` replaces `--no-deploy` — publishing is local-only by default, opt in with `--deploy`
- `enable` help text now lists `comments` as a capability
- `comments dashboard` subcommand prints authenticated admin URL
- Bare `rsslobster` with no args documented in help text
- `--version` now reports correct version

### Generator improvements
- Index page previews for titled posts use first sentence only (no table/list bleed)
- Mojibake repair: double-encoded UTF-8 is auto-fixed on ingest and regeneration
- Delete cleanup: orphaned image/media files removed, adjacent post nav rebuilt

### Documentation
- ARCHITECTURE.md for OSS contributors — data flow, module map, how-to-add guides

### Internals
- Upgraded ziscus to 0.5.0 (CSRF fix, dashboard pagination, GDPR, security headers)
- 1160 tests (up from 1094), all passing

## 0.3.0 — 2026-04-09

### Comments system
- Full comment moderation: mode/bans/spam/bulk approve, dashboard
- Extracted comment rendering to the `ziscus` package (now ^0.4.0)
- Honeypot removed; AI moderation pipeline
- Configurable comment section ID
- Static-page comment support

### New CLI commands
- `rsslobster style <preset>` — change the site style preset on an existing site
- `rsslobster delete <slug>` — delete a post (multi-feed safe)
- `rsslobster post-to-x <slug>` — cross-post to X via the Twitter API
- `rsslobster admin` — local admin server for browser-based publishing

### New library modules
- `src/images/upload.ts` — pure helpers for handling image uploads (MIME validation, slug-safe filenames, post type derivation)
- `src/channels/x-worker.ts` — Worker-compatible OAuth 1.0a + tweet posting using WebCrypto (HMAC-SHA1, RFC 3986 encoding)

### Generator improvements
- Image and carousel posts now render thumbnails on the index page
- Prev/next post navigation at the bottom of every post page
- `stripMarkdown` for `<title>`, `<meta description>`, OG tags, Twitter cards, and JSON-LD (no more raw `**bold**` in meta tags)
- Image preview rendering uses inline markdown so emphasis renders correctly
- Markdown table styles in all presets
- Refined terminal preset for better contrast and readability

### Bug fixes
- Post pages no longer emit empty `<span></span>` placeholders in the post navigation when there's only a prev or only a next
- Index page post body previews render inline markdown instead of raw `**`
- Meta description truncation respects markdown syntax
- Thumbnail rendering is keyboard-skippable (`tabindex="-1"`) so screen readers prefer the title link

### Internals
- L8 review pass on the comment system: trust boundaries, structural filter, rate limiting
- README rewrite (553 → 189 lines)
- Switched from local file link to published `ziscus` package

## 0.2.0

Previous release. See git history.
