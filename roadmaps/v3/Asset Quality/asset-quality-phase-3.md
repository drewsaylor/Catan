# Asset Quality — Phase 3: Structure & Badge Assets (P2)

## Goal

Upgrade visual assets for roads, settlements, cities, dev card backs, and achievement badges using Nano Banana.

## Non-goals

- No 3D mesh changes (only textures/sprites).
- No animation changes.
- No new badge types (only visual upgrade of existing).

## Player-facing outcomes

- Roads, settlements, and cities look more polished and distinct per player color.
- Dev card backs have a professional, consistent look.
- Achievement badges (longest road, largest army) are visually upgraded.

## Technical plan

### Server

- No changes required.

### Engine

- No changes required.

### TV

- Update structure rendering to use new assets.
- Update dev card back display.
- Update badge displays for achievements.

### Phone

- Update structure rendering in build previews.
- Update dev card back in hand display.
- Update badge displays.

### Shared

- Generate new structure assets:
  - road sprites/textures per player color
  - settlement sprites/textures per player color
  - city sprites/textures per player color
- Generate dev card back image.
- Generate badge assets:
  - longest-road-badge.svg / .png
  - largest-army-badge.svg / .png
- Update `asset-prompts/` with structure/badge prompts.

## APIs & data shape changes

- No API changes.
- New asset files added to assets folder.

## Acceptance criteria

- Road, settlement, city assets upgraded for all player colors.
- Dev card backs upgraded and integrated.
- Achievement badges upgraded and integrated.
- Assets render correctly on TV and phone.
- Assets work with colorblind mode (distinct shapes).
- asset-prompts/ updated.

## Manual test scenarios

1. Build roads/settlements/cities → verify new assets display correctly.
2. Draw dev cards → verify card back is updated.
3. Earn longest road / largest army → verify badge displays correctly.
4. Enable colorblind mode → verify structures remain distinguishable.
5. Test all player colors → verify each color variant looks correct.

## Risk & rollback

- Risk: Color variants may not be distinguishable enough.
- Rollback: Keep original assets as backup; revert if needed.
