# Hotstar Sync

Watch JioHotstar together, in sync — a free, open-source browser extension in the spirit of Teleparty.

Two or more people press play on the same title and stay in sync: play, pause, and seek propagate to everyone, late joiners catch up automatically, and you can see who's in the room. Everyone streams from **their own** JioHotstar account — the extension synchronizes only the playback controls, never the video itself.

> **Status:** early development. Phase 0 (discovery + architecture) is complete and the player integration is verified against the live site. Milestone 1 (extension skeleton) is not yet scaffolded.

## What it does

- Start a watch party from any JioHotstar title you can legally watch
- Share an invite link / room code; others join and are matched to the same title
- Play / pause / seek stay synchronized across the room
- Late joiners are brought to the current playback position
- See who's in the room (presence)

V1 scope is deliberately **presence + synchronization only** — no chat, reactions, or voice.

## How it works (short version)

Each viewer's browser runs a content script that drives the page's native `<video>` element through a thin **adapter** — the only code that knows anything about JioHotstar's DOM. Playback intents (play / pause / seek) are sent over a WebSocket to a **Cloudflare Durable Object** — one per room — which is the single source of truth: it holds the canonical playback state, stamps every change with a server clock and a monotonic revision, and broadcasts the result. Each client compares its position to the authoritative state and corrects drift (ignore small drift, gently nudge the playback rate for medium drift, hard-seek for large drift).

Because the Durable Object is single-threaded, "anyone can control" needs no distributed locking — commands are simply serialized in arrival order.

A detailed architecture document and ADR log are maintained alongside this project.

## Tech stack

| Layer | Technology |
| --- | --- |
| Extension | WXT · Vite · TypeScript (strict) · Manifest V3 |
| UI | Preact + scoped CSS (shadow DOM) |
| Realtime backend | Cloudflare Workers + Durable Objects |
| Transport | WebSocket (WSS), JSON messages |
| Shared protocol | TypeScript types (+ Zod validation) |
| Tests | Vitest (unit) · Playwright (e2e, later) |
| Tooling | pnpm workspaces · ESLint · Prettier · Wrangler |

Everything is TypeScript end to end; the wire-message types are a shared package that both the extension and the server compile against, so a protocol mismatch is a build error rather than a runtime bug.

## Key decisions

- **Cloudflare Durable Objects** for realtime — one authoritative actor per room
- **Democratic control** — anyone can play / pause / seek; the DO serializes
- **Presence + sync only** for V1
- **Chrome first**, with the code kept cross-browser-clean (Firefox / Safari later)
- **No accounts** — anonymous session id + display name + signed room token
- The adapter drives the **native `<video>`** element; it never touches DRM or the stream

## Getting started

> Setup lands with Milestone 1. This section fills in once the extension is scaffolded.

Prerequisites:

- Node.js >= 20
- pnpm >= 9
- Google Chrome
- A JioHotstar account (to test against real content)

Planned workflow (once scaffolded):

```bash
pnpm install
pnpm dev        # build the extension in watch mode
# then load the built extension unpacked at chrome://extensions
```

## Privacy & legal

- We never request or store JioHotstar credentials, and we never touch the video stream, decrypted media, or DRM keys.
- Each participant watches using their own account and entitlement. The extension synchronizes playback controls only; it does not share or rebroadcast content.
- Data sent to the backend is limited to what a room needs: a room id, an anonymous user id, a display name, the title / episode id being watched, and play / pause / seek events with positions.

This is not legal advice; automating any website can interact with its terms of service, and that is documented so users can make an informed choice.

## Roadmap

1. Extension skeleton + dev workflow
2. JioHotstar player detection + debug panel
3. Local synchronization simulator
4. Backend: rooms, presence, WebSocket
5. Real end-to-end synchronization
6. Production hardening (auth, validation, reconnect, rate limiting, logging)
7. Cross-browser testing
8. Packaging & distribution

## License

Intended for release under the MIT License. A `LICENSE` file will be added before the first public release.
