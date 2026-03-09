# Asset Integration — Phase 5: Cards (P1)

## Goal

Add visual icons to development card displays and integrate card background texture.

## Non-goals

- No full card illustrations (just icons)
- No animated card effects
- No resource card changes (just dev cards)

## Player-facing outcomes

- Development card buttons show recognizable icons
- Card type is identifiable at a glance
- Cards have a subtle parchment background texture

## Technical plan

### Server

- No changes required

### Engine

- No changes required

### TV

- Dev card reveal moments could show card icon
- Player hand displays could show card type icons

### Phone

- **phone/phone.js**: Update dev card button rendering
  - Add `<img>` elements with dev card icon paths
  - Example: `/shared/icons/dev-knight.png`
- **phone/index.html**: Update `#devCardsInHand` styling to accommodate icons
- Apply `card-bg.png` as background texture for card displays

### Shared

- **Verify/regenerate dev card icons**:
  - `dev-knight.png` - Armored knight with sword/shield
  - `dev-road-building.png` - Roads crossing
  - `dev-year-of-plenty.png` - Harvest basket
  - `dev-monopoly.png` - Merchant with scales
  - `dev-victory-point.png` - Laurel wreath
- **Card background**: `backgrounds/card-bg.png` (cream parchment)

### Dev Card Types Reference

| Type | Icon | Description |
|------|------|-------------|
| knight | dev-knight.png | Armored figure |
| road_building | dev-road-building.png | Road construction |
| year_of_plenty | dev-year-of-plenty.png | Abundance |
| monopoly | dev-monopoly.png | Trade/merchant |
| victory_point | dev-victory-point.png | Achievement |

## APIs & data shape changes

- No API changes
- UI-only integration

## Acceptance criteria

- [ ] Dev card buttons display icons
- [ ] Icons are recognizable at button size (~48px)
- [ ] Card background texture is subtle and readable
- [ ] Icons match the game's visual style

## Manual test scenarios

1. Buy a dev card → verify icon displays in hand
2. Play a knight → verify icon is shown in action
3. Check all 5 dev card types → verify each has distinct icon
4. View cards on different backgrounds → verify readability

## Risk & rollback

- **Risk**: Icons may crowd button space
- **Risk**: Card background may reduce text readability
- **Rollback**: Keep text-only buttons, remove card background
