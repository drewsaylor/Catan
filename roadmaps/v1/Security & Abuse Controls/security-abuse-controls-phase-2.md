# Security & Abuse Controls — Phase 2: Optional Host PIN (P1)

> Status: ✅ Completed (2026-02-14)

## Goal

Add a lightweight lock on host-only operations without accounts.

## Technical plan

### Server

- Room can set optional numeric PIN (4–8 digits).
- Required for:
  - changing maxPlayers/houseRules
  - kicking/resetting
  - exporting snapshots

### UI

- Host sets PIN in lobby “Advanced”.
- Host-only actions prompt for PIN if enabled.

## Acceptance criteria

- Host-only endpoints reject requests without correct PIN when enabled.

## Risk & rollback

- Risk: usability friction.
- Rollback: keep PIN disabled by default.
