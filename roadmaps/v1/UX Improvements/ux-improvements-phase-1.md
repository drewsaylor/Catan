# UX Improvements — Phase 1: Join Flow (QR + Room States) (P0)

**Status:** Completed (2026-02-12)

## Goal
Make joining effortless: scanning a QR beats typing a URL or room code.

## Non-goals
- No network discovery / QR pairing protocols.

## Player-facing outcomes
- TV always shows room code + join URL + **QR code**.
- Phone join errors are friendly and specific.

## Technical plan
### Shared
- Add `/apps/server/public/shared/qr.js` (no dependencies) that generates an SVG QR code for a URL.

### TV
- Render QR in lobby join info.

### Phone
- Show clear state banners for:
  - lobby
  - in-game
  - game-over

## Acceptance criteria
- A new player can join by scanning QR without typing.

## Manual test scenarios
1) Scan QR with 3 different phones; join succeeds quickly.

## Risk & rollback
- Risk: QR rendering bugs on some TVs.
- Rollback: keep QR optional behind a toggle while debugging.
