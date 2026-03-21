# Plan: Multi-Channel Connector Stubs for RSS Lobster

## Context

RSS Lobster currently only supports Telegram as an input channel. OpenClaw supports 20+ channels (Discord, Slack, WhatsApp, Signal, Matrix, IRC, Mastodon/Nostr, Webhook, Email, etc.). We need to add connector stubs for the most valuable channels and update the README to reflect multi-channel ambitions.

## Scope — What We Ship

We're adding **stubs** (not full implementations) for the channels that provide the highest value-to-effort ratio for a personal publishing tool. We pick 6 channels beyond Telegram that map well to "send a message, publish to your site":

| Channel | Why | Complexity |
|---------|-----|------------|
| **Discord** | Huge community, bot API similar to Telegram | Low |
| **Slack** | Workplace publishing, Events API well-documented | Low |
| **Mastodon** | Fediverse native, aligns with "unplatform yourself" | Low |
| **Matrix** | Open protocol, privacy-focused crowd | Low |
| **Webhook** | Universal glue — IFTTT, Zapier, CLI, custom scripts | Lowest |
| **IRC** | Classic, minimal, beloved by the target audience | Low |

## Architecture Decisions

1. **Introduce a `Channel` interface** in `src/channels/types.ts` that formalizes what Telegram implicitly does: `start(handler, signal)`, `sendReply(chatId, text)`, `downloadImages(message)`. This gives all channels a contract.

2. **Each stub gets its own file** in `src/channels/` (e.g., `discord.ts`, `slack.ts`). Each exports the same shape. The stub functions throw `"Not yet implemented"` errors with a clear message pointing to the GitHub issue/contributing guide.

3. **Add a `channel` field to `lobster.json`** config to select which channel to use at runtime. Default: `"telegram"` for backward compatibility. The `LobsterConfig` type in `start.ts` gets updated.

4. **`start.ts` becomes channel-agnostic** — it reads the config, instantiates the right channel, and passes it to the pipeline. The pipeline already works with `InboundMessage` which is channel-agnostic.

5. **README gets rewritten** to position RSS Lobster as multi-channel from the start, with Telegram as the first fully-implemented channel and others coming soon.

## Files Changed

### New Files
- `src/channels/channel.ts` — `Channel` interface + factory function `createChannel(config)`
- `src/channels/discord.ts` — Discord stub
- `src/channels/slack.ts` — Slack stub
- `src/channels/mastodon.ts` — Mastodon stub
- `src/channels/matrix.ts` — Matrix stub
- `src/channels/webhook.ts` — Webhook stub (simplest — just an HTTP server)
- `src/channels/irc.ts` — IRC stub

### Modified Files
- `src/channels/types.ts` — Add `Channel` interface, `ChannelType` union, generalize comments
- `src/channels/telegram.ts` — Wrap existing functions into `Channel` interface
- `src/cli/start.ts` — Use `createChannel()` instead of hardcoded Telegram imports
- `src/cli/onboard.ts` — Add channel selection step
- `README.md` — Rewrite to be channel-agnostic

## Implementation Order

1. Update `src/channels/types.ts` with `Channel` interface and `ChannelType`
2. Create `src/channels/channel.ts` with factory
3. Wrap Telegram into `Channel` interface
4. Create all 6 stub files
5. Update `start.ts` to use factory
6. Update `onboard.ts` to ask for channel choice
7. Rewrite README
8. Run `pnpm check` to verify nothing breaks

## What We Explicitly Don't Do
- No full implementations of new channels (stubs only)
- No changes to the pipeline, generator, or deploy logic
- No new dependencies
- No changes to existing tests beyond what's needed for the refactor
