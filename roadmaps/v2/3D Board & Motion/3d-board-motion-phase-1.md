# 3D Board & Motion — Phase 1: Three.js Wiring + Renderer Toggle + 2D Fallback (P0)

## Goal
Introduce a Three.js renderer path for TV + phone that can be toggled on/off safely, with a clean 2D fallback.

## Non-goals
- No water, no picking, no camera gestures yet.
- No art assets; primitives only.

## Player-facing outcomes
- New setting: “Board Renderer: 3D / 2D”.
- If WebGL is unsupported, the game automatically uses 2D without errors.

## Technical plan
### Server
- Add a safe way to serve Three.js to the browser **without relying on external CDNs**.
- Preferred approach (decision complete):
  - Add `three` as an npm dependency.
  - Expose only the required files via a narrow static route, e.g. `/vendor/three/...`, not the whole `node_modules`.

### Engine
- No changes.

### TV
- Add a renderer toggle in TV settings (same modal that already has reduced motion / QR).
- Replace direct usage of `/shared/board-ui.js` in TV with a “renderer router” module:
  - If setting is 3D and supported → use 3D renderer.
  - Else → use existing `renderBoard`.

### Phone
- Same as TV: a renderer toggle and routing logic.

### Shared
- Create a new module entry point (name is implementation detail, but lock intent):
  - `renderBoard3d(container, board, options)` with the **same options** as `renderBoard`.
- Create a small capability helper:
  - `supportsWebGL()` and `prefersLowPower()` (best-effort).
- Ensure lifecycle:
  - When switching 2D↔3D, destroy old view cleanly and release WebGL context if needed.

## APIs & data shape changes
- Client settings (`/shared/settings.js`) add:
  - `boardRenderer: "auto" | "2d" | "3d"` (default `auto`)
  - `rendererQuality: "auto" | "low" | "medium" | "high"` (default `auto`)

## Acceptance criteria
- TV + phone can toggle 2D/3D and nothing breaks.
- If WebGL is unavailable, 3D option is disabled or falls back gracefully.
- No console spam on repeated room joins or refreshes.

## Manual test scenarios
1) Open TV → join phones → start a game with 3D enabled: no blank board.
2) Toggle 2D↔3D mid-game (TV and phone separately): no crashes, input still works in 2D.
3) Enable reduced motion: does not affect stability (even if it doesn’t change visuals yet).

## Risk & rollback
- Risk: serving Three.js securely/cleanly.
- Rollback: keep Three.js integration behind `boardRenderer !== "3d"` default, ship as opt-in first.

## Status (Implemented)
- Server now serves Three.js locally (no CDN) at `/vendor/three/three.module.js` from the npm `three` dependency.
- Shared renderer routing is in place:
  - `/shared/board-renderer.js` routes 2D ↔ 3D with a clean destroy/recreate lifecycle.
  - `/shared/board-3d.js` implements `renderBoard3d(container, board, options)` (primitives-only, view-only).
  - `/shared/render-capabilities.js` provides `supportsWebGL()` + `prefersLowPower()` helpers.
- TV + phone settings now include a “Board renderer” toggle (2D/3D); 3D is disabled / falls back when WebGL is unavailable.
- Defaults remain opt-in: `boardRenderer: "auto"` stays on 2D until explicitly set to `"3d"`.
