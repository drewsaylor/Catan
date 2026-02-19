# Codebase Health — Phase 1: Split `phone.js` + `tv.js` into Modules (P1)

## Goal

Make UI changes safer by extracting feature modules with clear boundaries.

## Technical plan

### Phone

- Extract:
  - `phone/trade-ui.js`
  - `phone/dev-cards-ui.js`
  - `phone/board-interaction.js`
  - `phone/settings-ui.js`
- Keep `phone.js` as orchestrator.

### TV

- Extract:
  - `tv/show-beats.js`
  - `tv/layout.js`
  - `tv/offers-panel.js`
- Keep `tv.js` as orchestrator.

## Acceptance criteria

- No behavior regressions; files get smaller and easier to reason about.
