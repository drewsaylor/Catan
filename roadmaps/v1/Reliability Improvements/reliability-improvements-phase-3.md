# Reliability Improvements — Phase 3: Persistence Hardening + Room Pruning (P1)

## Status

- Complete (2026-02-13)

## Goal

Keep persistence healthy over time in real hosting scenarios.

## Technical plan

### Server

- Add env vars:
  - `DATA_DIR` to control persistence location (default `apps/server/data`)
  - `ROOM_TTL_HOURS` (default `0` = disabled)
- On startup + periodic timer:
  - prune persisted rooms older than TTL
- Corruption handling:
  - if persisted JSON fails to parse, rename to `*.corrupt.<timestamp>.json` and continue

## Acceptance criteria

- Old rooms do not accumulate forever on disk.

## Risk & rollback

- Risk: accidental deletion.
- Rollback: set `ROOM_TTL_HOURS=0` (disabled).
