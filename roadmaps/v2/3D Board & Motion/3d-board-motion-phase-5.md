# 3D Board & Motion — Phase 5: Ocean + Island Border (Water Around the Board) (P0)

## Goal
Add the signature “wow” feature: animated ocean water around the island, plus an island edge/shoreline so the board feels like a world.

## Non-goals
- No post-processing bloom yet (Phase 8).
- No complex art assets required (procedural shaders/textures OK).

## Player-facing outcomes
- The board sits in an ocean with subtle wave motion.
- The island edge feels intentional (shore/foam) and improves readability.

## Technical plan
### Server
- No changes.

### Engine
- No changes.

### TV
- Ocean should be visible in the board region even from across the room (don’t make it too subtle).

### Phone
- Ocean animation must be performance-aware:
  - reduced motion disables wave animation
  - low quality uses simpler material

### Shared
- Implement ocean as a mesh that surrounds the board bounds:
  - A large plane (or ring) under the island.
- Wave animation approach (decision complete):
  - Use a small custom `ShaderMaterial` with a `time` uniform, or a scrolling normal-map-like effect drawn procedurally.
  - Provide quality levels:
    - low: static gradient
    - medium: simple UV scroll
    - high: time-based waves
- Add island border:
  - Either a “coast ring” mesh around the convex hull of hex corners, or a subtle rim under tiles.
  - Add foam at coastline (can be a simple alpha ring).

## APIs & data shape changes
- None.

## Acceptance criteria
- Water is visible and “alive” on TV.
- On phones, water does not cause sustained FPS drops below target.
- Reduced motion turns water animation off.

## Manual test scenarios
1) Toggle reduced motion on phone and TV: water motion stops immediately.
2) Run a 20-minute game on phone in 3D: verify no progressive slowdown.
3) Verify readability: hex colors and tokens remain clear against water.

## Risk & rollback
- Risk: mobile shader perf.
- Rollback: ship low/medium water first (no shader), add high later behind quality gating.
