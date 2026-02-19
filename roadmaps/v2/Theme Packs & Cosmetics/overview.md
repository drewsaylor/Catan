# Theme Packs & Cosmetics — Overview

## Goals

- Make the game feel like a “product”: cohesive looks, easy theme switching.
- Themes must apply to both:
  - 2D CSS UI (TV + phone)
  - 3D world (water, lights, tile materials)

## Dependencies

- 3D renderer needs material hooks for theme params.
- Existing colorblind/high contrast must remain usable.

## Phases

- Phase 1 (P1): Unified theme manifest + runtime theme switching (2D+3D)
- Phase 2 (P2): Theme pack pipeline + first premium-ish themes (no external CDN)
