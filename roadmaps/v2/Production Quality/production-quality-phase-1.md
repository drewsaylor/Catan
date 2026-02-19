# Production Quality — Phase 1: WebGL Capability + Auto Quality Scaler + Perf HUD (P0)

## Status (Implemented)

Implemented on 2026-02-14.

## Goal

Ensure 3D is reliable across phones by detecting capability and auto-tuning quality settings.

## Non-goals

- No full telemetry backend.
- No remote crash reporting required.

## Player-facing outcomes

- On weak devices, the game automatically chooses a lower quality profile rather than running poorly.

## Technical plan

### Server

- No changes required.

### Engine

- No changes.

### TV

- Default to high quality if available; still clamp to avoid overdraw.

### Phone

- Default to `rendererQuality: "auto"`.
- Add a “Low Power” toggle that forces low settings.

### Shared

- Implement:
  - WebGL support check (hard gate)
  - device heuristics (screen size, pixel ratio, memory hint if available)
  - quality profiles:
    - low: static water, no shadows, low pixel ratio clamp
    - medium: simple water, no postFx
    - high: full water, light shadows
- Add a dev-only perf HUD (query param `?debug=1`):
  - FPS estimate
  - draw calls / triangles (best-effort)
  - current quality profile

## APIs & data shape changes

- Client settings additions (if not already added in 3D Phase 1):
  - `rendererQuality`
  - `lowPowerMode: boolean`

## Acceptance criteria

- Phones don’t overheat quickly from the board view alone.
- Quality selection is deterministic enough to debug (“why did I get low?”).

## Manual test scenarios

1. Open phone 3D on battery saver mode: quality goes low.
2. Toggle low power manually: perf improves, visuals degrade gracefully.
3. Leave game open for 20 minutes: no progressive FPS collapse.

## Risk & rollback

- Risk: heuristics choose wrong quality.
- Rollback: expose a manual selector and ship auto as opt-in at first.

## Implementation notes

- Shared quality/capability module: `apps/server/public/shared/renderer-quality.js`
  - `detectWebGLSupport()` hard-gates WebGL.
  - `getDeviceHeuristics()` + `prefersLowPowerHint()` drive deterministic `resolveQualityProfile()` decisions (includes reasons for “why low?” debugging).
  - `QUALITY_PROFILES` defines `low | medium | high` feature flags + pixel-ratio clamps.
  - `createAutoQualityScaler()` provides a simple FPS-driven up/down scaler for the eventual 3D render loop.
- Client settings additions: `apps/server/public/shared/settings.js`
  - `rendererQuality: "auto" | "low" | "medium" | "high"`
  - `lowPowerMode: boolean`
- Phone UI: `apps/server/public/phone/index.html` + `apps/server/public/phone/phone.js`
  - Adds a “Low power” toggle (persists `lowPowerMode`).
- Dev-only perf HUD (`?debug=1`): `apps/server/public/shared/perf.js`
  - Adds FPS estimate.
  - Adds best-effort WebGL draw-call + triangle counts (hooks canvas `getContext()` and instruments draw calls).
  - Displays the currently resolved quality profile + reasons.
