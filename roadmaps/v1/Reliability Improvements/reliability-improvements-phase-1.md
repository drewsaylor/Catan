# Reliability Improvements — Phase 1: Room Revisions + Stale Update Protection (P0)

## Status

- Complete (2026-02-12)

## Goal

Prevent clients from applying stale/out-of-order state updates.

## Technical plan

### Server

- Add `room.revision` incremented on every broadcast.

### TV/Phone

- Track `lastRevisionSeen`.
- Ignore any `state` where `revision <= lastRevisionSeen`.

## Acceptance criteria

- A reconnect loop does not cause the UI to “rewind” to an older state.

## Risk & rollback

- Risk: revision not persisted could reset to 0 on restart.
- Rollback: allow reset on restart but still monotonic during a process lifetime.
