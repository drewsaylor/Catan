# Asset Integration — Phase 8: Buildings (P2)

## Goal

Add building icons to the phone build menu and structure displays.

## Non-goals

- No 3D building models
- No animated construction effects
- No building upgrades beyond city

## Player-facing outcomes

- Build menu buttons show road/settlement/city icons
- Cost displays include building icons
- Players can quickly identify what they're building

## Technical plan

### Server

- No changes required

### Engine

- No changes required

### TV

- Build cost reference displays could show icons
- No direct build menu (phone-only)

### Phone

- **Build menu buttons**: Add icons to Road/Settlement/City buttons
  - Locate build button rendering in phone.js
  - Add `<img>` elements with building icon paths
- **Cost tooltips**: Show building icon alongside cost breakdown
- **Build confirmation**: Display icon for selected build action

### Shared

- **Verify/regenerate building icons**:
  - `building-road.png` - Cobblestone path segment
  - `building-settlement.png` - Small thatched cottage
  - `building-city.png` - Medieval town with towers

### Building Icon Styling

- Display size: ~32-48px in buttons
- Should be recognizable silhouettes
- Match the overall warm earth tone palette

## APIs & data shape changes

- No API changes
- UI-only integration

## Acceptance criteria

- [ ] Road build button shows road icon
- [ ] Settlement build button shows settlement icon
- [ ] City build button shows city icon
- [ ] Icons are recognizable at button size
- [ ] Icons don't overcrowd buttons

## Manual test scenarios

1. Enter setup phase → verify build buttons show icons
2. Build a settlement → verify icon matches structure placed
3. Upgrade to city → verify city icon is distinct from settlement
4. Check all build buttons → verify no visual clipping

## Risk & rollback

- **Risk**: Icons may make buttons too cluttered
- **Risk**: Icons may not match in-board structure colors
- **Rollback**: Keep text-only buttons
