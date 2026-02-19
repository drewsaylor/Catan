# 3D Board & Motion — Phase 4: Camera Controls Parity (Pan/Zoom + Suppress Misclick) (P0)

## Goal
Bring back the “controller feel” of phone board interaction: pan/zoom that is fast, stable, and doesn’t cause accidental placements.

## Non-goals
- No cinematic camera moves yet (Phase 8).
- No water yet (Phase 5).

## Player-facing outcomes
- On phones, players can pan/zoom the 3D board comfortably (one thumb + pinch).
- Panning/zooming doesn’t accidentally place pieces.

## Technical plan
### Server
- No changes.

### Engine
- No changes.

### TV
- TV may remain mostly fixed-camera, but support a basic zoom-to-fit on resize.
- Optional: allow host to “reset view” for readability.

### Phone
- Implement touch controls:
  - One-finger drag: pan
  - Pinch: zoom
  - Double-tap: reset view
- Implement “suppress click after drag/pinch” like current phone board logic.
- Implement “focus assist” equivalents used in quick setup:
  - When expected action changes, optionally frame selectable edges/vertices.

### Shared
- Create a camera controller module used by TV + phone:
  - maintains `target`, `zoom`, and clamps bounds to board extents.
  - respects `rendererQuality` (lower quality can reduce update rate).
- Ensure that world-to-screen projections remain stable for picking.

## APIs & data shape changes
- None.

## Acceptance criteria
- Pan/zoom is smooth and responsive on mid-range phones.
- No accidental placements during drag/pinch.
- Reset view always returns to a sensible framing.

## Manual test scenarios
1) During setup, pan/zoom repeatedly while trying to place pieces: verify no accidental placements.
2) During robber move, pinch/zoom then tap a highlighted hex: tap should work reliably.
3) Rotate phone (if applicable): camera refits and stays usable.

## Risk & rollback
- Risk: gesture conflicts across iOS/Android.
- Rollback: ship pan+zoom first, add focus assist later; widen pick meshes slightly to compensate.
