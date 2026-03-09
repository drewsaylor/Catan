# AI Asset Integration — Overview

## Goals

- Integrate AI-generated visual assets throughout the Catan LAN game UI
- Replace placeholder graphics with cohesive, thematic imagery
- Ensure all icons work with transparency for compositing
- Add visual polish to TV screens with backgrounds and branding
- Maintain accessibility and theme compatibility

## Dependencies

- `scripts/generate-assets.js` for asset generation
- LiteLLM Air Proxy Sidecar at localhost:8888 for image generation
- Existing theme system for compatibility testing

## Phases

| Phase | Name | Priority | Files |
|-------|------|----------|-------|
| 1 | Branding | P0 | Logo, favicon integration |
| 2 | Backgrounds | P0 | TV screen backgrounds |
| 3 | Board Hexes | P1 | Hex tile terrain textures |
| 4 | Resources | P1 | Resource icon regeneration |
| 5 | Cards | P1 | Development card icons |
| 6 | Awards | P2 | Longest road, largest army |
| 7 | Ports & Docks | P2 | Port boat icons |
| 8 | Buildings | P2 | Structure icons |
| 9 | Robber | P2 | Robber icon + highlight |

## Asset Generator

All assets are generated via `node scripts/generate-assets.js` which uses:
- **Model**: Gemini 2.5 Flash Image via LiteLLM
- **Endpoint**: http://localhost:8888/v1/images/generations
- **Rate limit**: 3 seconds between requests

## File Locations

- Icons: `apps/server/public/shared/icons/`
- Tiles: `apps/server/public/shared/tiles/`
- Backgrounds: `apps/server/public/shared/backgrounds/`
