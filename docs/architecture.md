# Architecture

## Server (`apps/server/server.js`)

- Node HTTP server handling API endpoints, SSE connections, and static file serving
- In-memory room state with optional disk persistence (`DATA_DIR/rooms/*.json`)
- SSE (Server-Sent Events) for real-time state sync to all connected clients

## Game Engine (`packages/game-engine/`)

Pure state machine - receives actions, returns new game state.

| File              | Purpose                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| `index.js`        | Core game logic, action handling (`applyAction`), public snapshot generation |
| `board.js`        | Hex grid generation, vertex/edge connectivity                                |
| `longest-road.js` | Graph traversal for longest road calculation                                 |
| `event-deck.js`   | Party mode event cards                                                       |
| `presets.js`      | Board layout presets (classic-balanced, trade-heavy)                         |

## Client Apps (`apps/server/public/`)

- `tv/`: Cast-only TV display with no input. A full-bleed board, a HUD (`hud.js`) of player cards along the edges, and moment cards (`show-layer.js`). The lobby screen shows the join QR, room code and player tiles.
- `phone/`: Phone controller - action buttons, hand display, trade UI. `phone.css` holds the phone layout. `host-menu.js` is the host's menu (♛) for kick, make host, pause timer and end game.
- `shared/`: Shared utilities - board renderer, themes, audio, action validation. `stepper.js` turns the resource selects into −/+ steppers. `player-colors.js` gives every player a distinct display colour.

## Shared (`packages/shared/`)

- `resources.js`: Resource type definitions and normalization helpers

## Key Patterns

**Action Flow**: Phone sends action -> Server validates via `applyAction()` -> Server broadcasts state via SSE -> All clients update

**State Privacy**: The server maintains full game state but sends players only their own hand via `privateUpdates`. The `getPublicGameSnapshot()` function strips private data.

**Host Controls**: The `/admin/{kick,timer,host,reset}` endpoints accept either the TV's `adminSecret` or the host player's `playerId`, and both also need the host PIN if one is set (`hostControlError()` in `server.js`). Player ids appear in public state, so the PIN is what protects these endpoints from other phones, the same as for `/start`.

**Build Validation**: `action-gates.js` checks if a player has resources/pieces for actions before sending to server. Server re-validates.
