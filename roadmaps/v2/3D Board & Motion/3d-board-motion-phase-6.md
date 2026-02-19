# 3D Board & Motion — Phase 6: Piece Meshes + Placement Animations (P1)

## Goal

Replace “flat” representations with 3D pieces and satisfying placement animations: roads, settlements, cities, robber.

## Non-goals

- No dice animation yet (Phase 7).
- No theme packs assets required (procedural materials OK).

## Player-facing outcomes

- Building feels satisfying:
  - roads slide/snap into place
  - settlements pop in
  - cities upgrade with a clear morph/stack
- Robber move is legible and animated.

## Technical plan

### Server

- No changes.

### Engine

- No changes.

### TV

- Emphasize build placements with slightly stronger animation than phones (but respect reduced motion).

### Phone

- Keep animations short and non-blocking; they should never delay input.

### Shared

- Represent pieces:
  - Roads: extruded plank or beveled bar aligned to edge direction.
  - Settlements: small house-like prism.
  - Cities: taller stacked prism with a ring/roof.
  - Robber: pawn-like cylinder + cap.
- Animation rules (decision complete):
  - If `placedEdgeIds/placedVertexIds` includes id, animate from scale 0.6→1.0 and slight overshoot (unless reduced motion).
  - Robber move: lerp position with short ease-out.
- Ensure color comes from `players[].color` and remains readable in high contrast mode.

## APIs & data shape changes

- None.

## Acceptance criteria

- Piece placement animations trigger exactly once per placement.
- Reduced motion disables movement/overshoot (fade-only is OK).
- Pieces remain readable on phone screens.

## Manual test scenarios

1. Build multiple roads quickly; animations don’t queue-jam or lag input.
2. Upgrade settlement→city; animation triggers and state stays correct.
3. Roll 7 → move robber: robber moves clearly to the new tile.

## Risk & rollback

- Risk: animation jitter if state updates arrive mid-animation.
- Rollback: snap to final state immediately and only animate “new placements” (not all state changes).
