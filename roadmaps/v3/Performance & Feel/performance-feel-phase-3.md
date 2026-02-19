# Performance & Feel — Phase 3: 3D Performance Tuning (P1)

## Goal

Profile and optimize the Three.js render loop for smooth performance on phones, including LOD, draw call reduction, and quality scaling.

## Non-goals

- No new 3D features.
- No visual quality improvements (maintain current fidelity).
- No changes to 2D fallback.

## Player-facing outcomes

- Consistent frame rate on mid-range phones (45fps+).
- No thermal throttling during normal gameplay sessions.
- Distant objects render efficiently without visual pop-in.

## Technical plan

### Server

- No changes required.

### Engine

- No changes required.

### TV

- Profile render loop and identify bottlenecks.
- Implement any TV-specific optimizations (usually less constrained).

### Phone

- Profile render loop with Chrome DevTools Performance tab.
- Implement LOD (level of detail) for:
  - Hex tile meshes (reduce geometry at distance).
  - Structure meshes (simpler at distance).
- Reduce draw calls:
  - Batch static geometry where possible.
  - Use instanced rendering for repeated elements (roads, settlements).
- Implement frustum culling if not already present.

### Shared

- Create a performance monitoring utility:
  - `getFrameTime()` — measure render time per frame
  - `getDrawCallCount()` — count draw calls
  - `logPerformanceStats()` — debug output for profiling
- Integrate with quality scaler from V2:
  - Auto-reduce quality if frame time exceeds threshold.
  - Expose manual quality override in settings.

## APIs & data shape changes

- No API changes.
- Settings may expose new quality options (LOD level, shadow quality).

## Acceptance criteria

- Phone maintains 45fps+ during normal gameplay.
- Draw calls reduced by 30%+ (measure before/after).
- No visible pop-in when quality scales.
- Thermal throttling does not occur within 40-minute session.
- Performance stats visible in debug mode.

## Manual test scenarios

1. Play on mid-range phone → monitor fps (should stay 45+).
2. Pan/zoom rapidly → verify no stuttering.
3. Build many structures → verify no progressive slowdown.
4. Play 40+ minutes → verify no thermal throttling.
5. Enable debug mode → verify performance stats display.

## Risk & rollback

- Risk: LOD transitions may be visible.
- Risk: Instancing may cause rendering bugs on some devices.
- Rollback: Disable LOD; revert to individual draw calls.
