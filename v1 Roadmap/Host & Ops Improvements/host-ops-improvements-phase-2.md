# Host & Ops Improvements — Phase 2: Diagnostics + Safe Exports (P1)

## Status
- Complete (2026-02-13)

## Goal
Give the host a safe way to export room state for debugging.

## Technical plan
### Server
- Add `GET /api/rooms/:code/debug/export` host-only:
  - returns public + private state snapshot as JSON

### TV
- Host-only button: “Download room snapshot”.

## Acceptance criteria
- Export never leaks to non-host devices.

## Risk & rollback
- Risk: accidental leak.
- Rollback: require host PIN (Security phase) before enabling.
