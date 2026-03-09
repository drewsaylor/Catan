# Asset Integration — Phase 7: Ports & Docks (P2)

## Goal

Replace port circles with thematic boat icons that indicate trade ratios.

## Non-goals

- No animated boats
- No dock structures on hex edges
- No water animations

## Player-facing outcomes

- Ports display small boat icons instead of colored circles
- Boat cargo visually indicates the resource type
- Trade ratio text (3:1 or 2:1) appears below boat

## Technical plan

### Server

- No changes required

### Engine

- No changes required

### TV

- Uses shared board-ui.js renderer

### Phone

- Uses shared board-ui.js renderer

### Shared

- **board-ui.js port rendering** (already modified):
  ```javascript
  const boatImg = svgEl("image");
  setSvgAttrs(boatImg, {
    href: `/shared/icons/port-boat-${kind}.png`,
    // positioning...
  });
  ```
- **Ratio text** below boat with `.port-ratio` class
- **Port stem line** connects boat to hex edge

### Port Assets

| Kind | File | Description |
|------|------|-------------|
| generic | port-boat-generic.png | Trading boat with anchor flag |
| wood | port-boat-wood.png | Boat with lumber cargo |
| brick | port-boat-brick.png | Boat with brick cargo |
| sheep | port-boat-sheep.png | Boat with wool bales |
| wheat | port-boat-wheat.png | Boat with grain sacks |
| ore | port-boat-ore.png | Boat with ore rocks |

### CSS

```css
.port-boat {
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35));
}

.port-ratio {
  font-family: monospace;
  font-size: 14px;
  font-weight: 700;
  fill: rgba(255, 255, 255, 0.92);
}
```

## APIs & data shape changes

- No API changes
- Port data structure unchanged

## Acceptance criteria

- [ ] All 9 ports display boat icons
- [ ] Generic ports show generic boat with "3:1" text
- [ ] Resource ports show cargo-specific boat with "2:1" text
- [ ] Boats are positioned correctly relative to hex edge
- [ ] Port stem lines still connect to board

## Manual test scenarios

1. Start a game → verify all ports show boats
2. Zoom to port → verify cargo type matches port resource
3. Check ratio text → verify 3:1 and 2:1 display correctly
4. Verify port positions → boats should face outward from board

## Risk & rollback

- **Risk**: Boat icons may be hard to see at small board sizes
- **Risk**: Ratio text may overlap with boats
- **Rollback**: Revert to circle-based port rendering in board-ui.js
