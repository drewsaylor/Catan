# Asset Integration — Phase 9: Robber (P2)

## Goal

Display robber icon with hex highlight effect instead of simple red circle.

## Non-goals

- No animated robber movement
- No robber sound effects
- No custom robber skins

## Player-facing outcomes

- Robber hex shows a thematic bandit figure icon
- Robber hex has a visible red glow/border for clear identification
- Robber is easy to spot even on textured hexes

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

- **board-ui.js robber rendering** (already modified):
  ```javascript
  const robberGroup = svgEl("g");
  robberGroup.setAttribute("class", "robber");

  // Hex highlight polygon
  const highlightPoly = svgEl("polygon");
  highlightPoly.setAttribute("class", "robber-highlight");
  highlightPoly.setAttribute("points", pts);
  robberGroup.appendChild(highlightPoly);

  // Robber icon image
  const robberIcon = svgEl("image");
  setSvgAttrs(robberIcon, {
    href: "/shared/icons/robber.png",
    // positioning centered on hex...
  });
  robberGroup.appendChild(robberIcon);
  ```

### CSS (shared/styles.css)

```css
.robber-highlight {
  fill: rgba(255, 92, 122, 0.15);
  stroke: rgba(255, 92, 122, 0.85);
  stroke-width: 4;
  vector-effect: non-scaling-stroke;
  filter: drop-shadow(0 0 8px rgba(255, 92, 122, 0.5));
}

.robber image {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
}
```

### Robber Asset

- `robber.png` - Hooded bandit figure in dark cloak
- Transparent background
- Should be recognizable at small sizes
- Dark silhouette works over various hex textures

## APIs & data shape changes

- No API changes
- Robber hex ID already tracked in game state

## Acceptance criteria

- [ ] Robber hex shows icon instead of red circle
- [ ] Hex highlight border is visible
- [ ] Robber is identifiable on all hex types
- [ ] Robber moves correctly during steal phase
- [ ] Desert (initial robber position) looks correct

## Manual test scenarios

1. Start game → verify robber displays on desert
2. Roll 7 → move robber → verify icon moves with selection
3. Check robber visibility on each hex type
4. Zoom board → verify robber scales appropriately

## Risk & rollback

- **Risk**: Robber icon may be hard to see on dark hexes
- **Risk**: Highlight effect may have performance impact
- **Rollback**: Revert to simple red circle rendering
