# Reliability Improvements — Phase 2: Idempotent Actions (Duplicate Tap Safe) (P0)

## Status
- Complete (2026-02-13)

## Goal
Make actions safe to retry and safe against double taps.

## Technical plan
### Phone
- Send `actionId` (UUID) on every `/action` call.

### Server
- Keep bounded in-memory LRU per room:
  - key: `${playerId}:${actionId}`
  - value: last response payload
- If duplicate arrives, return the stored payload and do not re-apply.

## Acceptance criteria
- Double-tapping “End turn” cannot end multiple turns.
- Duplicate build requests do not double-charge resources or double-place pieces.

## Risk & rollback
- Risk: memory growth.
- Rollback: cap LRU size and drop oldest entries.
