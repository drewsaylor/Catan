# Asset Quality — Phase 1: Resource & UI Icon Refresh (P0)

## Goal

Regenerate the 5 resource icons and UI icons using Google's Nano Banana model, producing SVG + PNG assets with a cohesive, professional look.

## Non-goals

- No hex tile textures yet (Phase 2).
- No structure assets yet (Phase 3).
- No animation or motion changes.

## Player-facing outcomes

- Resource icons (brick, wheat, sheep, wood, ore) look crisp and professional.
- UI icons (settings, help, host controls) match the overall visual style.
- Icons work well in both light and dark themes.

## Technical plan

### Server

- No changes required.

### Engine

- No changes required.

### TV

- Replace existing resource icons in resource displays.
- Replace UI icons in settings/help/host control areas.

### Phone

- Replace resource icons in hand display and trade dialogs.
- Replace UI icons in settings and navigation.

### Shared

- Update `/shared/assets/` or `/public/assets/` with new SVG + PNG files.
- Update `asset-prompts/` with Nano Banana-specific prompts for reproducibility.
- Ensure icon naming conventions remain consistent for easy integration.

## APIs & data shape changes

- No API changes.
- Asset file paths remain the same; only file contents change.

## Acceptance criteria

- All 5 resource icons regenerated and integrated (brick, wheat, sheep, wood, ore).
- UI icons regenerated and integrated (settings, help, host controls).
- Icons render correctly at multiple sizes (phone cards, TV displays).
- Icons work with colorblind mode (distinct shapes, not just colors).
- asset-prompts/ updated with Nano Banana prompts.

## Manual test scenarios

1. Start a game → verify resource icons display correctly on TV and phone.
2. Open settings → verify settings icon is updated.
3. Enable colorblind mode → verify icons remain distinguishable.
4. Toggle between themes → verify icons work in all themes.

## Risk & rollback

- Risk: New icons may not match existing visual style.
- Rollback: Keep original icons as backup; revert file contents if needed.
