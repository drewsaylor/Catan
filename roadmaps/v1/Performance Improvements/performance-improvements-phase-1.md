# Performance Improvements — Phase 1: Instrumentation + Budgets (P0)

## Status

- Complete (2026-02-12)

## Goal

Add a lightweight debug overlay to measure render timing and payload size.

## Player-facing outcomes

- No changes for normal players.
- Developers can use `?debug=1` to see performance stats.

## Technical plan

### Shared

- Add `/apps/server/public/shared/perf.js`:
  - `markRenderStart(tag)`
  - `markRenderEnd(tag)`
  - rolling averages + last durations

### TV/Phone

- Wrap `render()` calls to measure durations.
- Add overlay when `?debug=1`.

## Acceptance criteria

- Overlay shows last render ms and average render ms.

## Risk & rollback

- Risk: overlay impacts perf.
- Rollback: keep overlay minimal and off by default.
