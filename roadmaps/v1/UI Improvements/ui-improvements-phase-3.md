# UI Improvements — Phase 3: Theme Tokens + Colorblind Readiness (P1)

## Status

- Complete (2026-02-14)

## Goal

Make the UI more accessible and professional by ensuring information isn’t conveyed only by color.

## Non-goals

- No full accessibility compliance program; focus on high-impact wins.

## Player-facing outcomes

- Optional colorblind-friendly palette.
- Resource badges include icons/patterns so they’re readable without color.

## Technical plan

### Shared CSS/UI

- Add theme tokens (CSS variables) to drive palette changes.
- Add resource icons/patterns in badges on TV + phone.

## Acceptance criteria

- Resource badges remain distinguishable without relying on color.

## Risk & rollback

- Risk: too many style branches.
- Rollback: ship icons first, palette later.
