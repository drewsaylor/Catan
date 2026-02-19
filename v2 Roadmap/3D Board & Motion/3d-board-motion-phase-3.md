# 3D Board & Motion — Phase 3: Picking + Highlight Parity (Hex/Edge/Vertex) (P0)

## Goal
Match 2D interaction behavior in 3D: selectable highlights + tap/click targets for vertices, edges, and hexes.

## Non-goals
- No camera gestures yet (Phase 4).
- No placement animations yet (Phase 6).

## Player-facing outcomes
- Phone board interactions work in 3D:
  - Tap highlighted vertex/edge to place
  - Tap highlighted hex to move robber
  - Illegal taps trigger the same “Not legal there” feedback

## Technical plan
### Server
- No changes.

### Engine
- No changes.

### TV
- TV is mostly display-only, but ensure any TV interactions (if present) do not regress.

### Phone
- Replace the old SVG hit-testing with 3D raycast hit-testing while keeping the existing game logic:
  - If a hit maps to a selectable id → invoke `onVertexClick/onEdgeClick/onHexClick`
  - Else if captureAll* enabled → invoke `onIllegalClick({kind,id})`

### Shared
- Create a pick layer:
  - Invisible (or low-alpha) meshes for:
    - vertices: small spheres or cylinders at `vertex.x/y`
    - edges: thin boxes/cylinders between vA and vB
    - hexes: the tile top surface
  - Each pick mesh stores `userData.kind` + `userData.id`.
- Implement highlight visuals:
  - Use emissive/glow-ish material or outline pass if available (but keep it simple for P0).
  - Highlight sets:
    - `selectableVertexIds`, `selectableEdgeIds`, `selectableHexIds`
  - `highlightMode` parity (e.g., quick setup stronger glow).
- Tap accuracy rules (decision complete):
  - Prefer direct hits.
  - If no hit but a tap was close, optionally “snap” to nearest selectable within a threshold (mirroring the 2D “touch UX fallback”).

## APIs & data shape changes
- None.

## Acceptance criteria
- In 3D mode, setup placements can be completed entirely from phones.
- Illegal taps still show the same guidance and do not cause unintended actions.
- No double-action from a single tap (guard against pointerdown+click duplication).

## Manual test scenarios
1) Setup round: place settlement + road twice per player using 3D only.
2) Main phase: build road/settlement/city using 3D only.
3) Robber: move robber by tapping highlighted hex.

## Risk & rollback
- Risk: mobile raycast precision / fat-finger failures.
- Rollback: increase snap threshold and enlarge invisible pick meshes; keep visuals unchanged.

## Status (Implemented)
- Shared 3D renderer now supports picking + highlight parity for vertices, edges, and hexes:
  - invisible pick meshes (with `userData.kind` + `userData.id`) + Three.js raycast hit-testing
  - emissive/glow-ish highlights for `selectableVertexIds`, `selectableEdgeIds`, and `selectableHexIds` (with `highlightMode` intensity parity)
  - touch UX fallback: snap to nearest selectable vertex/edge within a threshold
- Phone 3D board interactions now invoke the existing `onVertexClick/onEdgeClick/onHexClick` handlers, and illegal taps still route through `onIllegalClick`.
