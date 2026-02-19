# Show & Pacing — Phase 1: Shared Moment Detector (TV + Phone + 3D Hooks) (P1)

## Status (Implemented)

Implemented on 2026-02-14.

## Goal

Centralize “what just happened?” detection into a shared module so TV overlays, phone prompts, and 3D animations stay synchronized.

## Non-goals

- No new server SSE events required.
- No new UI layout redesign.

## Player-facing outcomes

- More consistent toasts/moment cards across devices.
- Fewer double-triggers on reconnect.

## Technical plan

### Server

- No changes.

### Engine

- No changes.

### TV

- Replace ad-hoc moment detection in TV with a shared detector.
- Map moments → show layer actions (moment card, toast, spotlight, confetti).

### Phone

- Use the same shared detector for:
  - “Primary action” nudges
  - small, non-blocking toasts
  - haptic/sfx triggers (respect settings)

### Shared

- Add `detectMoments(prevRoom, nextRoom) -> moments[]`
  - Each moment has:
    - `id` (stable de-dupe key)
    - `kind` (e.g., `turn_start`, `dice_roll`, `build_road`, `robber_moved`, `trade_accepted`, `game_over`)
    - `at` (best-effort timestamp)
    - `data` (ids like edgeId/vertexId/hexId/playerId)
- Provide a simple queue helper:
  - avoid overlapping moment card spam
  - apply cooldowns where needed

## APIs & data shape changes

- None.

## Acceptance criteria

- Moments fire once per underlying state change.
- Refresh/reconnect does not replay old moments endlessly.

## Manual test scenarios

1. Refresh TV mid-turn: no repeated “Turn Start” moment loops.
2. Spam build actions quickly: moments remain ordered and readable.
3. Trade accept/cancel flows: moments remain correct.

## Risk & rollback

- Risk: mismatched moment ids causing duplicates.
- Rollback: keep TV-only detection as fallback while migrating phones later.

## Implementation notes

- Shared moment detector + queue: `apps/server/public/shared/moment-detector.js`
  - `detectMoments(prevRoom, nextRoom) -> moments[]` emits stable `id` keys (revision-scoped) to avoid replay on refresh/reconnect.
  - `createMomentQueue()` provides de-dupe + optional cooldowns to prevent show spam.
- TV wiring: `apps/server/public/tv/tv.js`
  - Replaces ad-hoc beat detection with `detectMoments` and queues show beats via `createMomentQueue`.
  - Maps moments → show-layer actions (moment card, toast, spotlight, confetti).
- Phone wiring: `apps/server/public/phone/phone.js`
  - Uses `detectMoments` + `createMomentQueue` to drive non-blocking toasts and action nudges.
  - Haptics respect settings (`muteAll`, `lowPowerMode`).
- 3D hooks (board pulses): `apps/server/public/shared/board-3d.js` + `apps/server/public/shared/board-renderer.js`
  - `applyBoardMoment3d()` pulses roads/settlements/hexes for build + robber moments.
  - `applyBoardMoment(container, moment)` bridges from TV/phone code to the active 3D renderer (no-op in 2D).
