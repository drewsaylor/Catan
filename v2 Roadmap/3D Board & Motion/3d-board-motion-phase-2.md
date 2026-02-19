# 3D Board & Motion — Phase 2: Static 3D Board Mesh (Hexes/Tokens/Ports/Robber Marker) (P0)

## Goal
Render the full board in 3D (still static) using data from `game.board`: hex tiles, number tokens, ports, and a simple robber marker.

## Non-goals
- No click/tap picking yet.
- No camera pan/zoom gestures yet.
- No “real” 3D models; use primitives and simple materials.

## Player-facing outcomes
- The 3D board is immediately recognizable and readable:
  - tile colors match resources
  - token numbers readable from couch distance (TV) and on phone
  - ports visible and labeled

## Technical plan
### Server
- No changes beyond Phase 1’s vendor routing.

### Engine
- No changes.

### TV
- Render uses 3D path when enabled.
- Ensure layout fits existing TV UI (board area sizing stays stable).

### Phone
- Render uses 3D path when enabled.
- Keep the existing fullscreen board affordance (if present) with the 3D canvas.

### Shared
- Build “world space” aligned to current board coordinates:
  - Use `board.vertices[].x/y` as X/Y in world.
  - Z is elevation (tile thickness, token height, etc).
- Recommended camera choice (decision complete):
  - Use `OrthographicCamera` with a fixed tilt/rotation (2.5D) for readability and easier picking later.
- Mesh plan:
  - **Hex tiles:** extruded hex mesh per hex (19 total) with subtle bevel.
  - **Tokens:** a flat plane with a canvas-generated texture (number + pips), slightly above tile.
  - **Ports:** small 3D marker near coastline (simple cylinder/flag + label plane).
  - **Robber marker:** simple pawn/cylinder positioned above the robber hex center.
- Implement the same “board key” caching behavior as 2D:
  - If board layout hasn’t changed, reuse geometry and only update “stateful” parts.

## APIs & data shape changes
- None.

## Acceptance criteria
- TV and phone show the same board layout and token positions as 2D.
- Robber marker appears on `robberHexId`.
- 3D scene maintains target FPS in an empty lobby and during normal state updates.

## Manual test scenarios
1) Start a room and verify the 3D board appears before game start (or at least at game start).
2) Play through setup placements (still using 2D if needed): verify 3D scene updates (roads/settlements may still be simple placeholders or absent until Phase 6).
3) Roll dice; robber shows on correct hex.

## Risk & rollback
- Risk: token readability (especially on phones).
- Rollback: tokens can be temporarily rendered as an HTML overlay anchored by projecting world coords to screen.

## Status (Implemented)
- Shared 3D renderer now draws a static full board from `game.board`:
  - beveled extruded hex tiles (resource colors)
  - canvas-textured number tokens (numbers + pips)
  - port markers with labels
  - robber marker at `robberHexId`
- Uses an `OrthographicCamera` (fixed 2.5D tilt) and reuses geometry via the same board-key caching behavior as 2D.
