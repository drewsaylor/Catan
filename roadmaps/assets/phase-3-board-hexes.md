# Asset Integration — Phase 3: Board Hexes (P1)

## Goal

Replace solid color hex fills with textured terrain images, making each resource type visually distinct.

## Non-goals

- No 3D texture mapping (2D only)
- No normal maps or bump mapping
- No animated textures

## Player-facing outcomes

- Forest hexes show green tree canopy texture
- Hills/brick hexes show clay/terracotta terrain
- Pasture hexes show green meadow with wildflowers
- Fields hexes show golden wheat rows
- Mountain hexes show grey rocky terrain
- Desert hexes show sandy dune texture

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

- **board-ui.js**: Already modified to use SVG pattern fills
  - `createHexPattern(resource)` creates `<pattern>` with `<image>`
  - Pattern ID: `hex-pattern-{resource}`
  - Fallback fill stored in `data-fallback-fill` attribute
- **Generate hex tile images** via scripts/generate-assets.js:
  - Output to `apps/server/public/shared/tiles/`
  - Size: 512x512 (will be scaled to fit hex bounding box)
  - Style: Top-down aerial view, seamless terrain texture

### Asset Prompts

```javascript
{
  name: "hex-wood",
  prompt: "forest floor texture, pine trees from above, green canopy, mossy ground, dense woodland",
  path: "tiles/hex-wood.png",
  size: "512x512",
  category: "hex-tile"
}
```

## APIs & data shape changes

- No API changes
- New files in `tiles/` directory

## Acceptance criteria

- [ ] All 6 hex types display textured backgrounds
- [ ] Textures are visually distinct from each other
- [ ] Token numbers remain readable over textures
- [ ] Fallback to solid colors if images fail to load
- [ ] No visible seams or tiling artifacts

## Manual test scenarios

1. Start a game → verify all hex types show textures
2. Zoom board → verify textures scale cleanly
3. Disable network → verify fallback colors work
4. Check readability of 6/8 tokens over textures

## Risk & rollback

- **Risk**: Textures may make token numbers hard to read
- **Risk**: Pattern fills may have browser compatibility issues
- **Rollback**: Remove pattern fill code, revert to `resourceFill()` solid colors
