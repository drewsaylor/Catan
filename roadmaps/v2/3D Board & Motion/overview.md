# 3D Board & Motion — Overview

## Goals

- 3D board on **TV + phones** (Three.js) with interaction parity.
- **Water around the board** (animated ocean), plus island edge/shoreline.
- Satisfying motion: builds pop, robber moves, dice roll feels “alive”.
- 2D fallback always available; reduced motion respected.

## Dependencies

- Production Quality — Phase 1 (capability + quality scaler).
- Existing settings: reduced motion / high contrast / colorblind must continue to work.

## Phases

- Phase 1 (P0): Three.js wiring + renderer toggle + 2D fallback
- Phase 2 (P0): Static 3D board mesh (hexes/tokens/ports/robber marker)
- Phase 3 (P0): Picking + highlight parity (hex/edge/vertex)
- Phase 4 (P0): Camera controls parity (pan/zoom + suppress misclick)
- Phase 5 (P0): Ocean + island border (water around board)
- Phase 6 (P1): Piece meshes + placement animations (roads/settlements/cities/robber)
- Phase 7 (P1): Dice + resource flyouts + board FX
- Phase 8 (P2): Cinematic camera + post-processing + theme hooks
