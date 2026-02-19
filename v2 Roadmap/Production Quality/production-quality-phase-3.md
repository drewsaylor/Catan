# Production Quality — Phase 3: Build/Release Packaging Strategy (Offline-safe) (P1)

## Goal
Make V2 easy to run on a LAN host without relying on external CDNs and without shipping a fragile pile of module files.

## Non-goals
- No full app installer.
- No Docker requirement.

## Player-facing outcomes
- Faster load times (fewer requests), more reliable offline LAN hosting.

## Technical plan
### Server
- Support serving built/bundled assets from a predictable folder (e.g. `/public/build/...`).

### Engine
- No changes.

### TV/Phone
- Load Three.js and 3D modules from the bundled path in production builds.

### Shared
- Add a build script (decision complete):
  - `npm run build` uses a lightweight bundler (e.g., esbuild) to output:
    - `public/build/3d.bundle.js`
    - theme assets copied into `public/build/themes/...`
- Development mode can still serve modules directly for iteration.

## APIs & data shape changes
- None.

## Acceptance criteria
- `npm run dev` works for local iteration.
- `npm run build && npm start` works for “real hosting” without internet access.

## Manual test scenarios
1) Run build and start server: TV + phone load 3D successfully.
2) Throttle network in devtools: build output has fewer requests than module mode.

## Risk & rollback
- Risk: build step complexity.
- Rollback: keep Phase 1 vendor route strategy as fallback; build step becomes optional.
