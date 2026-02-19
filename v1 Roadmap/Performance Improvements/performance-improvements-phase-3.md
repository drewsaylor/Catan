# Performance Improvements — Phase 3: Board Renderer Optimization (P1)

## Status
- Complete (2026-02-14)

## Goal
Avoid full `innerHTML` redraws of the board by separating static and dynamic layers.

## Technical plan
### Shared (`apps/server/public/shared/board-ui.js`)
- Add new API:
  - `createBoardView(container, board)` → `{ update(options), destroy() }`
- Static layer:
  - hex polygons, ports, hit areas
- Dynamic layer:
  - roads/settlements/cities, hints, robber
- Keep existing `renderBoard` as a wrapper until TV/phone migrate.

## Acceptance criteria
- Pan/zoom + taps remain responsive even during frequent updates.

## Risk & rollback
- Risk: large refactor.
- Rollback: ship incremental improvements first (throttling + selective re-render).
