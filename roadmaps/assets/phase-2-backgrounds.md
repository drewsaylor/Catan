# Asset Integration — Phase 2: Backgrounds (P0)

## Goal

Add thematic background images to TV screens for visual polish while maintaining UI readability.

## Non-goals

- No phone backgrounds (too much visual noise on small screens)
- No animated backgrounds
- No parallax or scrolling effects

## Player-facing outcomes

- Attract screen has a warm parchment/map themed background
- Lobby screen has a cozy tavern interior feel
- Game screen has subtle aerial terrain that doesn't distract from the board

## Technical plan

### Server

- No changes required

### Engine

- No changes required

### TV

- **tv/tv.css**: Update `.attractMode` background property
  ```css
  .attractMode {
    background:
      linear-gradient(135deg, rgba(var(--bg0-rgb), 0.75) 0%, rgba(var(--bg1-rgb), 0.75) 100%),
      url("/shared/backgrounds/attract-bg.png") center/cover no-repeat;
  }
  ```
- **tv/tv.css**: Update `.lobbyOverlay` background property
- **tv/tv.css**: Add `body.tv[data-view="game"]` background rule
- Gradient overlays ensure text readability

### Phone

- No changes (backgrounds would be too busy on mobile)

### Shared

- Verify background images exist in `apps/server/public/shared/backgrounds/`
- Regenerate if quality is insufficient:
  - `attract-bg.png` - Aged parchment map, compass rose, sepia tones
  - `lobby-bg.png` - Medieval tavern, warm firelight, wooden beams
  - `game-bg.png` - Subtle aerial island view, muted colors

## APIs & data shape changes

- No API changes
- CSS-only integration

## Acceptance criteria

- [ ] Attract screen shows background with readable UI overlay
- [ ] Lobby screen shows background with readable UI overlay
- [ ] Game screen shows subtle background that doesn't compete with board
- [ ] Backgrounds work with all color themes
- [ ] Backgrounds don't cause layout shift on load

## Manual test scenarios

1. Open TV view → verify attract screen has background
2. Create a room → verify lobby has background
3. Start a game → verify game background is subtle
4. Toggle themes → verify backgrounds work with all themes

## Risk & rollback

- **Risk**: Backgrounds may make text hard to read
- **Risk**: Large images may slow initial load
- **Rollback**: Remove background URLs from CSS, reverting to gradient-only
