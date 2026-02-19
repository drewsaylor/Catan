# 3D Board & Motion — Phase 8: Cinematic Camera + Post-FX + Theme Hooks (P2)

## Goal
Push “wow” further with optional cinematic camera moves, lightweight post-FX, and theme hooks for materials/environment.

## Non-goals
- No mandatory effects on phones.
- No complex asset production required to ship the feature (placeholders OK).

## Player-facing outcomes
- TV feels like a show: gentle camera focus on important moments.
- Themes can change “world vibe” (water color, sky tint, tile materials).

## Technical plan
### Server
- No changes.

### Engine
- No changes.

### TV
- Add moment-driven camera “focus beats”:
  - Turn start: ease to current player’s area (or subtle zoom)
  - Build: quick ease to placement region
  - Robber: ease to robber tile
- Add optional post-FX (quality-gated):
  - subtle bloom or vignette

### Phone
- Default to no cinematic camera; allow opt-in if performance allows.

### Shared
- Theme hooks:
  - read theme parameters (see Theme phase 1) and apply to:
    - water shader colors
    - ambient light color
    - tile material roughness/metalness
  - quality gating: disable post-FX on low/medium by default.

## APIs & data shape changes
- Client settings:
  - `cinematicCamera: boolean` (default false on phones, true on TV if quality allows)
  - `postFx: boolean` (default false; enable on TV high quality)

## Acceptance criteria
- Camera moves never cause nausea; reduced motion disables them.
- Post-FX never tanks TV FPS below 30 sustained.

## Manual test scenarios
1) Play a full game with cinematic camera on TV; no motion sickness reports; readable at distance.
2) Reduced motion on TV: no camera motion, still looks good.
3) Phone with low quality: post-FX disabled automatically.

## Risk & rollback
- Risk: performance and comfort.
- Rollback: ship camera moves TV-only, behind a toggle, off by default.
