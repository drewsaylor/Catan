# Theme Packs & Cosmetics — Phase 2: Theme Pack Pipeline + First Themes (P2)

## Goal

Make themes shippable as packs (textures/materials, optional SFX swaps) without bundler pain.

## Non-goals

- No marketplace/modding.
- No remote downloads.

## Player-facing outcomes

- 2–3 distinct theme packs (examples):
  - Classic Night
  - Neon Arcade
  - Deep Sea (stronger water vibe)

## Technical plan

### Server

- Define theme pack folder structure served statically:
  - `/public/themes/<themeId>/theme.json`
  - `/public/themes/<themeId>/textures/...` (optional)
- Ensure correct cache headers for static assets.

### Engine

- No changes.

### TV/Phone

- Theme picker lists installed themes from a server-provided list (static JSON index).

### Shared

- Optional texture loading:
  - allow themes to specify texture URLs for water normal map / tile texture
  - quality gating: skip textures on low quality

## APIs & data shape changes

- Add `GET /themes/index.json` returning installed theme ids/names (static file OK).

## Acceptance criteria

- Themes load quickly on LAN.
- Missing textures fail gracefully (falls back to colors).

## Manual test scenarios

1. Switch themes during a game: no crashes, materials update.
2. Use low quality on phone: theme still looks good (no missing visuals).

## Risk & rollback

- Risk: asset bloat.
- Rollback: ship color-only themes first, add textures later.
