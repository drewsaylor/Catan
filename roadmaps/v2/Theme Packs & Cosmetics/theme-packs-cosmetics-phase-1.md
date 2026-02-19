# Theme Packs & Cosmetics — Phase 1: Unified Theme Manifest + Runtime Switching (P1)

## Goal
Define a theme format and apply it consistently to 2D UI + 3D renderer.

## Non-goals
- No theme editor UI yet.
- No large asset packs required to ship (procedural colors OK).

## Player-facing outcomes
- A theme picker (TV host settings; optional on phones).
- Themes change:
  - UI colors (CSS variables)
  - 3D water color / sky tint / tile material params

## Technical plan
### Server
- Serve theme JSON files from a static folder.

### Engine
- No changes.

### TV
- Add theme picker to host/settings UI.

### Phone
- Optional: theme picker; otherwise follow room’s theme if we add room setting (see API below).

### Shared
- Theme manifest (decision complete):
  - `id`, `name`
  - `cssVars`: map of CSS variables to values
  - `world3d`: water/sky/light/material params
- A `loadTheme(id)` helper:
  - applies CSS vars
  - notifies 3D renderer to update materials
- Respect accessibility:
  - high contrast can override some vars
  - colorblind mode can swap resource palettes

## APIs & data shape changes
- Room settings (server room state) add:
  - `settings.themeId` (string)
- New endpoint (host-only):
  - `POST /api/rooms/:code/settings` `{ themeId }` (or extend existing settings endpoint if present)

## Acceptance criteria
- Theme changes propagate to all clients in-room.
- No theme breaks token readability.

## Manual test scenarios
1) Host changes theme in lobby: TV + phones update immediately.
2) Toggle high contrast: theme adapts; text stays readable.
3) Toggle colorblind mode: resource colors remain distinguishable.

## Risk & rollback
- Risk: theme overrides become messy.
- Rollback: ship theme switching as TV-only cosmetic first; phones follow later.
