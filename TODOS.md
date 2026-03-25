# TODOS

All items completed.

## ~~CLI test coverage~~ ✓
**Done.** 42 tests in `src/cli/feeds.test.ts` covering all subcommands, helper functions (`shortFeedName`, `relativeDate`), last-listing persistence, pagination, error paths, and output formatting. Helpers exported for direct unit testing.

## ~~Feed URL normalization~~ ✓
**Done.** `normalizeUrl()` in `src/reader/paths.ts` — strips trailing slashes, upgrades http→https, lowercases hostname. Applied in `subscribe()`, `unsubscribe()`, `getSubscription()`, `updateSubscription()`, `recordFetchError()`. 3 new tests + 1 updated test in `subscriptions.test.ts`.

## ~~ANSI color/formatting in CLI output~~ ✓
**Done.** `picocolors` formatting in `src/cli/feeds.ts` — bold titles, dim URLs/dates/metadata, yellow unread counts, green new counts, cyan feed names, red errors. Matches `start.ts` usage pattern. Subtle and reader-appropriate.

## ~~Blogroll / following page generator~~ ✓
**Done.** `generateBlogrollPage()` in `src/generator/html.ts` renders `_site/following/index.html` from subscriptions. Groups by folder, links to siteUrl with RSS icon per entry. Wired into `regenerateSite()` and `addContent()`. 8 new tests in `html.test.ts`.

## ~~Unread index for performance~~ ✓
**Done.** `reader/unread-index.json` maintained by `ingestItems()`, `markRead()`, `markUnread()`, `markAllRead()`, `removeItemsForFeed()`. `listItems({read: false})` uses index fast path — loads only needed feed files instead of all. `rebuildUnreadIndex()` exported for recovery. All 45 store tests pass.
