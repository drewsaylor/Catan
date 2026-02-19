# Asset Quality — Phase 2: Board Textures & Hex Tiles (P1)

## Goal

Generate higher-quality hex tile textures for the 3D board using Nano Banana, with ports to 2D fallback and theme compatibility.

## Non-goals

- No structure assets (Phase 3).
- No water/ocean texture changes (handled in V2 3D Board).
- No runtime procedural generation.

## Player-facing outcomes

- Hex tiles (forest, hills, pasture, fields, mountains, desert) have richer, more detailed textures.
- Textures are consistent across 3D and 2D board views.
- All themes (default, high contrast, etc.) render correctly.

## Technical plan

### Server

- No changes required.

### Engine

- No changes required.

### TV

- Update 3D material references to use new textures.
- Ensure 2D fallback uses appropriate texture representations.

### Phone

- Same as TV: update 3D materials and 2D fallback.

### Shared

- Generate new texture files for each hex type:
  - forest.png / forest-diffuse.png
  - hills.png / hills-diffuse.png
  - pasture.png / pasture-diffuse.png
  - fields.png / fields-diffuse.png
  - mountains.png / mountains-diffuse.png
  - desert.png / desert-diffuse.png
- Generate normal maps if 3D renderer supports them.
- Update `asset-prompts/` with texture generation prompts.
- Ensure textures tile seamlessly at hex boundaries.

## APIs & data shape changes

- No API changes.
- New texture files added to assets folder.
- Theme manifest may need updates if textures are theme-specific.

## Acceptance criteria

- All 6 hex types have new textures integrated.
- Textures render correctly in 3D view (TV + phone).
- Textures fall back gracefully in 2D view.
- Textures work with all themes.
- No visible seams at hex tile boundaries.
- asset-prompts/ updated with texture prompts.

## Manual test scenarios

1. Start a 3D game → verify all hex types display new textures.
2. Toggle to 2D view → verify textures/colors are consistent.
3. Enable high contrast mode → verify textures remain readable.
4. Pan/zoom on phone → verify no texture pop-in or artifacts.

## Risk & rollback

- Risk: Textures may be too large, impacting load time.
- Risk: Seams may be visible at hex boundaries.
- Rollback: Keep original textures; switch back via asset path config.
