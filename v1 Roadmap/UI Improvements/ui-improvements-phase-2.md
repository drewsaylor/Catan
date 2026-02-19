# UI Improvements — Phase 2: Phone Layout for 6 Players (P0)

## Status
- Complete (2026-02-14)

## Goal
Keep phone UX usable and fast with **5–6 players**, especially trade and robber victim selection.

## Non-goals
- No major navigation redesign; keep the single-page controller model.

## Player-facing outcomes
- Primary action stays visible and doesn’t collide with the board.
- Trade UI scales to more players without being a wall of buttons.

## Technical plan
### Phone (`apps/server/public/phone/*`)
- Ensure primary action card remains sticky/visible.
- Make trade player list compact and scrollable as needed.
- Avoid full re-rendering of the player list where possible (or throttle updates; see Performance phase).

## APIs & data shape changes
- None.

## Acceptance criteria
- Robber victim selection remains usable with 6 players.
- No critical controls are off-screen on common phones.

## Manual test scenarios
1) With 6 players, create offers to each player; accept/reject; confirm no UI jank.

## Risk & rollback
- Risk: regressions in small screens.
- Rollback: fall back to collapsible sections.
