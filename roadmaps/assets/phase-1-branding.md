# Asset Integration — Phase 1: Branding (P0)

## Goal

Create a distinctive game logo and integrate it across all screens, establishing visual identity for Catan LAN.

## Non-goals

- No custom fonts or typography changes
- No animated logo variations
- No app icon for mobile (web-only)

## Player-facing outcomes

- Attract screen displays a visual logo instead of plain text
- Lobby screen header shows the logo
- Browser tabs show a recognizable favicon
- Phone join screen displays branding

## Technical plan

### Server

- Add `favicon.ico` to `apps/server/public/`
- Update `index.html` files to reference favicon

### Engine

- No changes required

### TV

- **tv/index.html:184**: Replace `<h1 class="attractTitle">Catan LAN</h1>` with `<img>` element
- **tv/tv.css**: Update `.attractTitle` to handle image sizing
- **Lobby overlay**: Add logo to `.lobbyTitle` area

### Phone

- **phone/index.html**: Add logo to connection/join screens
- Consider compact logo variant for mobile header

### Shared

- Update `scripts/generate-assets.js` to generate:
  - `logo.png` (512x512, transparent)
  - `logo-wide.png` (1024x256, transparent, for headers)
- Generate favicon from logo

## APIs & data shape changes

- No API changes
- New files: `favicon.ico`, possibly `logo-wide.png`

## Acceptance criteria

- [ ] Logo displays on TV attract screen
- [ ] Logo displays on TV lobby screen
- [ ] Favicon appears in browser tabs
- [ ] Logo works over both light and dark backgrounds
- [ ] Logo is readable at small sizes (32px)

## Manual test scenarios

1. Open TV attract screen → verify logo replaces "Catan LAN" text
2. Create a room → verify lobby shows logo in header
3. Check browser tab → verify favicon is visible
4. Open phone join screen → verify branding is present

## Risk & rollback

- **Risk**: Generated logo may not be readable or distinctive
- **Risk**: Logo may not work well at small favicon sizes
- **Rollback**: Keep text fallback, conditionally show based on image load success
