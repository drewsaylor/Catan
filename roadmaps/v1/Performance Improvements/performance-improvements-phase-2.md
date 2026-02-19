# Performance Improvements — Phase 2: Throttle + Avoid Full Re-renders (P0)

## Status

- Complete (2026-02-14)

## Goal

Reduce jank by coalescing bursts of updates and avoiding rebuilding DOM when inputs didn’t change.

## Technical plan

### Shared

- Add render scheduling helper using `requestAnimationFrame` to coalesce updates.

### TV/Phone

- Only re-render:
  - board: when `board/structures/hints/robberHexId` changed
  - log: when the log tail changed
  - players: when ready/connected/VP changed

## Acceptance criteria

- Bursty SSE updates do not cause multiple back-to-back full UI rebuilds.

## Risk & rollback

- Risk: stale UI due to bad equality checks.
- Rollback: conservative “always render” fallback behind a debug flag.
