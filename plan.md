# RSS Read Feature — Implementation Plan

## Core Idea

RSS Lobster already **generates** feeds. This feature makes it also **consume** feeds — turning it into a full read/write RSS citizen. Feed items arrive through the existing connector push flow, appearing as messages the user can act on from their chat channel.

**Key constraint: zero LLM tokens by default.** Feed items are pre-structured data (title, link, description, date). Classification is unnecessary — they're always `link` type. The LLM is only invoked when the user explicitly requests a summary via `summarize <slug>`.

## Architecture

### New module: `src/feeds/feeds.ts`

Manages feed subscriptions stored as `feeds.json` in the site directory.

```typescript
interface FeedSubscription {
  url: string;           // Feed URL (RSS or JSON Feed)
  title: string;         // Feed title (from feed metadata)
  siteUrl?: string;      // Feed's site link
  lastChecked?: string;  // ISO timestamp of last successful poll
  lastItemId?: string;   // GUID/URL of most recent seen item (dedup)
  /** How to handle new items: "notify" (send to channel), "draft" (auto-draft), "publish" (auto-publish) */
  mode: "notify" | "draft" | "publish";
  /** Tags to auto-apply to items from this feed */
  tags?: string[];
  /** Check interval override in minutes (default: 15) */
  interval?: number;
}
```

**File-based storage** — `feeds.json` is an array of `FeedSubscription`. Fits the "files as API / git is the database" pattern.

### Feed polling: `src/feeds/poll.ts`

A lightweight RSS/JSON Feed parser. **Zero new dependencies** — uses the built-in `fetch()` (Node 22) and a minimal XML-to-items parser (~80 lines, RSS 2.0 + Atom basics). JSON Feed is just `JSON.parse()`.

```typescript
interface FeedEntry {
  id: string;         // <guid> or <id> or <link>
  title: string;
  link: string;
  summary?: string;   // <description> or <summary> — raw text, truncated
  author?: string;
  publishedAt: string;
}

/** Fetch and parse a feed URL. Returns new items since lastItemId. */
function pollFeed(sub: FeedSubscription): Promise<FeedEntry[]>
```

- Fetches with `If-Modified-Since` + `If-None-Match` (ETag) headers for efficiency
- Parses RSS 2.0, Atom 1.0, and JSON Feed 1.1
- Returns only items newer than `lastItemId`
- 10-second timeout, non-fatal errors (log and skip)

### Integration into start loop: `src/cli/start.ts`

The feed poller runs on the same interval loop as the scheduler (every 60s), checking feeds whose interval has elapsed:

```
Start scheduled draft publisher (every 60s)  ← existing
Start preview cleanup (every 60s)            ← existing
Start feed poller (every 60s, checks per-feed intervals) ← NEW
```

### Push flow — no LLM, minimal tokens

When new feed items arrive, based on `mode`:

**`"notify"` (default):** Format a plain-text message and push it to the user's channel via `channel.reply()`. The user sees it in Telegram/Discord/etc and can choose to reshare it by replying.

```
📖 New from "Simon Willison's Weblog":
How I use LLMs for programming
https://simonwillison.net/2025/...

Reply "share" to reshare, or ignore.
```

**`"draft"`:** Auto-create a draft as `link` type content with the feed item's title, URL, and summary as body. No LLM call — the content is already structured.

**`"publish"`:** Auto-publish as `link` type. Calls `addContent()` directly with pre-built `ClassifiedContent`. Zero LLM tokens.

### Summary on demand

When the user sends `summarize <slug>` via their channel:
1. Pipeline recognizes the command (new command dispatch in `processMessage`)
2. Fetches the draft's `linkUrl`
3. Calls the LLM with a focused prompt: "Summarize this article in 2-3 sentences for a blog post: {title} — {description}"
4. Updates the draft body with the AI summary
5. Replies: "Updated draft with summary. Say `publish {slug}` when ready."

This is the **only** LLM call in the entire read flow, and only when explicitly requested.

### CLI commands: `src/cli/feeds.ts`

```
rsslobster feeds                     # List all subscriptions
rsslobster feeds add <url>           # Subscribe (auto-detects feed URL from HTML <link>)
rsslobster feeds remove <url|title>  # Unsubscribe
rsslobster feeds import <opml-file>  # Import from OPML
rsslobster feeds export              # Export to OPML
```

### New hook: `afterFeedItem`

Fires when a new feed item is received. Receives JSON on stdin:
```json
{ "feedUrl": "...", "title": "...", "link": "...", "summary": "...", "mode": "notify" }
```

Can override `mode` or suppress the item (exit non-zero to skip).

## Files Changed

1. **`src/feeds/feeds.ts`** — NEW (~80 lines). Subscription CRUD (add, remove, list, update, read/write `feeds.json`).
2. **`src/feeds/poll.ts`** — NEW (~200 lines). Feed fetcher + minimal RSS/Atom/JSON Feed parser. Zero dependencies.
3. **`src/feeds/opml.ts`** — NEW (~60 lines). OPML import/export.
4. **`src/feeds/poll.test.ts`** — NEW. Tests for feed parsing and polling.
5. **`src/feeds/feeds.test.ts`** — NEW. Tests for subscription CRUD.
6. **`src/feeds/opml.test.ts`** — NEW. Tests for OPML import/export.
7. **`src/cli/feeds.ts`** — NEW (~100 lines). CLI commands for feed management.
8. **`src/cli/start.ts`** — Add feed polling to the main loop interval. ~20 lines added.
9. **`src/agent/pipeline.ts`** — Add `summarize <slug>` command dispatch. ~15 lines added.
10. **`src/config/types.ts`** — Add `FeedSubscription` and `FeedEntry` types. ~20 lines added.
11. **`src/hooks/hooks.ts`** — Add `"afterFeedItem"` to `HookEvent` type. 1 line.
12. **`src/index.ts`** — Register `feedsCommand`. 2 lines.
13. **`src/cli/start.ts` (LobsterConfig)** — Add `feeds?: { defaultMode?, defaultInterval? }` config. ~5 lines.

## Token Efficiency Summary

| Flow | LLM calls | Tokens |
|------|-----------|--------|
| Feed poll + notify | 0 | 0 |
| Feed poll + auto-draft | 0 | 0 |
| Feed poll + auto-publish | 0 | 0 |
| User reshares via chat | 1 (classify) | ~500 |
| User requests `summarize` | 1 (summarize) | ~300 |

The default flow (notify) uses **zero tokens**. Even auto-publish uses zero — because we know it's a `link` type from the feed structure.

## Implementation Order

1. Types (`config/types.ts`)
2. Subscription CRUD (`feeds/feeds.ts` + tests)
3. Feed parser (`feeds/poll.ts` + tests)
4. OPML import/export (`feeds/opml.ts` + tests)
5. CLI commands (`cli/feeds.ts`)
6. Start loop integration (`cli/start.ts`)
7. Summarize command (`agent/pipeline.ts`)
8. Hook integration (`hooks/hooks.ts`)
9. Register CLI command (`index.ts`)
