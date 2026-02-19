# Testing & QA — Phase 2: Server Integration Tests (P0)

## Status

- Complete (2026-02-13)

## Goal

Ensure key server behavior (maxPlayers, idempotency) doesn’t regress.

## Technical plan

- Add `npm test` running `node --test`.
- Add server integration tests that:
  - start server on ephemeral port
  - create room, join players, start game
  - verify join capacity respects maxPlayers
  - verify idempotent action behavior

## Acceptance criteria

- Integration tests pass locally and are deterministic.
