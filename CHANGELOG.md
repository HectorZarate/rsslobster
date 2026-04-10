# Changelog

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
