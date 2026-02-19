# Gameplay Improvements — Phase 1: 3–6 Players Config + Piece Limits (P0)

## Status
- Complete (2026-02-12)

## Goal
Enable **3–6 players configurable per room** (default 4), and enforce classic **piece limits** to prevent illegal builds.

## Non-goals
- No 5–6 expansion board tiles; keep the standard board (party variant).
- No new rules beyond maxPlayers and piece limits.

## Player-facing outcomes
- Host can set **Max players (3–6)** in the lobby.
- “Room full” is clear and friendly.
- Players can’t build past their piece limits; UI explains why.

## Technical plan
### Server (`apps/server/server.js`)
- Add `room.maxPlayers` default `4`.
- Add `POST /api/rooms/:code/maxPlayers` `{ playerId, maxPlayers }` (host-only).
- Join capacity check uses `room.players.size >= room.maxPlayers`.
- Error string: `Room is full (max X players)`.
- Start gating:
  - require `players >= 3`
  - require `players <= room.maxPlayers`
  - require all ready
  - do **not** require room to be full
- Persistence includes `maxPlayers`.

### Engine (`packages/game-engine/index.js`)
- Add per-player piece limits:
  - roads: 15
  - settlements: 5
  - cities: 4
- Enforce on:
  - `BUILD_ROAD`, `BUILD_SETTLEMENT`, `BUILD_CITY`
  - `DEV_ROAD_BUILDING_PLACE_ROAD`
  - setup placements count toward totals
- Add error codes:
  - `OUT_OF_PIECES_ROAD`
  - `OUT_OF_PIECES_SETTLEMENT`
  - `OUT_OF_PIECES_CITY`

### Phone (`apps/server/public/phone/*`)
- Lobby host controls: add “Max players” select (3–6).
- Join view: show room full as an actionable message.

### TV (`apps/server/public/tv/*`)
- Lobby: show `players/maxPlayers` (e.g., `4/6`).

## APIs & data shape changes
- Room public snapshot: add `maxPlayers`.

## Acceptance criteria
- Host can set maxPlayers before start; it persists across restart.
- Join blocks when full and provides a friendly error.
- Piece limits block illegal builds and provide actionable error text.

## Manual test scenarios
1) Set maxPlayers=6; join 6 phones; start; setup order works.
2) Build roads to 15; next road is rejected with `OUT_OF_PIECES_ROAD`.

## Risk & rollback
- Risk: UI assumptions hard-coded to 4 players.
- Rollback: keep server logic but clamp UI layout to 4 until UI phase lands.
