# UI Improvements — Phase 1: TV Layout for 6 Players (P0)

## Status

- Complete (2026-02-12)

## Goal

Make the TV UI readable and uncluttered with **5–6 players**.

## Non-goals

- No major visual redesign; keep the current “Catan LAN” style.

## Player-facing outcomes

- Player list fits and remains readable at 6 players.
- Current player and winner highlights remain obvious.

## Technical plan

### TV (`apps/server/public/tv/*`)

- Update layout CSS so player list becomes a responsive grid when player count is 5–6.
- Ensure offers/log panels remain readable; reduce padding/gaps only in 5–6 mode.
- In `tv.js`, set `document.body.dataset.playerCountBucket = "3-4" | "5-6"` based on room state and drive CSS from it.

## APIs & data shape changes

- None.

## Acceptance criteria

- No overlap/clipping on 1080p at 6 players.
- No regressions on 3–4 players.

## Manual test scenarios

1. Start 6-player game; run through robber/trade/win moments.

## Risk & rollback

- Risk: CSS complexity.
- Rollback: keep a simpler compact mode triggered only at 6.
