# Production Quality — Phase 2: Geometry/Picking Regression Tests + Debug Tooling (P1)

## Goal

Prevent “3D breaks interactions” regressions by adding deterministic tests and simple debug overlays.

## Non-goals

- No full screenshot diff test harness required.

## Player-facing outcomes

- None directly, but fewer regressions.

## Technical plan

### Server

- No changes.

### Engine

- No changes.

### TV/Phone

- Add a debug toggle (`?debugPick=1`) that shows:
  - pick meshes (wireframe)
  - last picked id/kind
  - selectable counts

### Shared

- Add Node `node:test` coverage for:
  - board-to-geometry mapping (counts, positions)
  - edge/vertex pick mesh placement sanity
  - theme manifest validation (if theme system exists)
- Add a small runtime validator:
  - ensure selectable ids exist in board data; log once if not.

## APIs & data shape changes

- None.

## Acceptance criteria

- Tests run in CI/local (`npm test`) and catch obvious geometry regressions.
- Debug pick overlay helps diagnose “taps don’t work” quickly.

## Manual test scenarios

1. Use debugPick overlay on phone: verify ids match real gameplay actions.
2. Run through setup placements with debugPick on: no missed taps.

## Risk & rollback

- Risk: tests become brittle.
- Rollback: keep tests structural (counts/exists), avoid pixel-perfect assertions.
