# Production Quality — Overview

## Goals
- Make 3D shippable on phones: capability checks, quality scaling, perf budgets.
- Improve debugging so regressions are quick to diagnose.
- Keep offline-ish reliability: no external CDNs required.

## Dependencies
- 3D renderer must expose toggles for water/shadows/postFx/etc.

## Phases
- Phase 1 (P0): WebGL capability + auto quality scaler + perf HUD (dev)
- Phase 2 (P1): Geometry/picking regression tests + debug tooling
- Phase 3 (P1): Build/release packaging strategy for Three.js + assets (offline-safe)
