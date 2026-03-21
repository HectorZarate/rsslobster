# UI Evaluation: Does RSS Lobster Need a UI?

**Date:** 2026-03-21
**Context:** Comparison with [OpenClaw](https://github.com/openclaw/openclaw) UI architecture

## What OpenClaw Has

OpenClaw is a personal AI assistant control plane with a full multi-surface UI:

- Web dashboard + WebChat served from a WebSocket gateway (`ws://127.0.0.1:18789`)
- Native macOS menu bar app (voice, push-to-talk overlay)
- iOS/Android companion apps with Canvas visual workspace
- React frontend, Tailscale for remote access
- Session management, model selection, device pairing, cron/webhook automation

It is a **different product category** — a general-purpose AI agent runtime that needs a UI because users orchestrate complex workflows across devices and channels.

---

## L8 Staff SWE Perspective (Architecture)

**No. RSS Lobster should not add a UI.**

The core value proposition is *zero infrastructure*. The architecture is minimal: 3 production dependencies, git as database, static HTML output, messaging apps as the input layer. Adding a web UI would:

1. **Introduce a runtime dependency** — web server, auth, sessions, state management. New attack surface and ops burden.
2. **Duplicate an existing interface** — Telegram/Discord *is* the UI. The phone in your pocket is the control surface. A dashboard would be a worse version of what messaging apps already do well.
3. **Violate the "files as API" principle** — the project treats git as the database and JSON files as the schema. A UI layer would need to either wrap these (adding indirection) or introduce its own state (splitting the source of truth).
4. **Increase the maintenance surface 3-5x** — frontend code rots faster than backend code. React/Tailwind/bundler churn would dominate the project within a year.

OpenClaw needs a UI because it's a *control plane for multiple agents and devices*. RSS Lobster is a *single-purpose publishing pipeline*. Different problem, different answer.

---

## L7 Senior SWE Perspective (Pragmatics)

**Mostly agree, with one exception worth discussing.**

The CLI + messaging-app model is correct for the publish flow. But there are two pain points that a *very thin* interface could address:

1. **Draft management** — `rsslobster drafts` in the terminal is fine for developers, but if the target audience expands to "anyone who wants a blog," browsing and editing drafts in a terminal is a barrier. A simple draft list/preview accessible via a local HTML page (no server, just `open drafts.html`) could help.
2. **Onboarding** — the `rsslobster onboard` wizard is interactive CLI. For non-technical users, a one-time setup page could lower the barrier.

These are **not a web app UI**. They would be static HTML files generated locally — consistent with the project's zero-dependency philosophy.

---

## UX SWE Perspective

**The messaging app IS the UI. Don't build a worse version of it.**

RSS Lobster's UX insight is that the best interface is the one you already have open. People know how to send a message with a photo and caption. That *is* the "create post" flow — no forms, no WYSIWYG editor, no "save" button.

Where OpenClaw invests in UI (dashboards, canvases, device pairing), RSS Lobster should invest in **better bot responses**: richer confirmations, inline previews, better error messages in the chat itself. The Telegram bot *is* the admin panel.

If we ever need "admin" features (analytics, post management, style customization), the right answer is **more bot commands**, not a web dashboard:

- "Show me my last 10 posts" → bot sends a formatted list
- "Change my style to terminal" → done, confirmed in chat
- "Delete the post about X" → bot confirms and removes

---

## Verdict

| Question | Answer |
|----------|--------|
| Does RSS Lobster need a full UI like OpenClaw? | **No** |
| Are there UX gaps? | Minor (drafts, onboarding) |
| Right fix for those gaps? | Static HTML helpers or richer bot responses |
| Would a UI hurt the project? | Yes — bloats deps, splits source of truth, contradicts core philosophy |

**Recommendation: Stay the course.** The messaging-app-as-UI is RSS Lobster's competitive advantage, not a limitation. Invest in making the bot smarter, not in building a dashboard nobody asked for.
