# Expanded Board for 5-6 Players

## Overview

Add an expanded board (radius 3, 37 hexes) that activates automatically when 5-6 players join a game, following the official Catan 5-6 player expansion rules. Includes a rethought TV layout with a bottom player bar for the larger player count.

## Decisions

- **Board size**: Official expansion — radius 3 (37 hexes), 2 deserts, 11 ports
- **Trigger**: Automatic based on player count (5-6 players get expanded, 3-4 get standard)
- **Presets**: Hand-crafted expanded variants for each existing preset, plus random-balanced support
- **Special building phase**: Not included — same turn structure as 3-4 player games
- **TV layout**: Bottom player bar for 5-6 players; 3-4 players keep existing 3-column layout

## Section 1: Board Generation (Game Engine)

### `board.js`

`generateStandardBoard` accepts a `radius` parameter (default 2). The existing `generateHexCoords(radius)` function already supports arbitrary radius. When radius is 3, it produces 37 hex coordinates. The vertex/edge/port computation is generic and works with any hex set.

The returned board object includes a `layout` field:
- `"standard-radius-2"` for 3-4 player games (19 hexes)
- `"expanded-radius-3"` for 5-6 player games (37 hexes)

### `presets.js`

Each existing preset gets an expanded variant with a `-expanded` suffix:

| Preset | Standard (19 hexes) | Expanded (37 hexes) |
|--------|-------------------|-------------------|
| `classic-balanced` | `classic-balanced` | `classic-balanced-expanded` |
| `trade-heavy` | `trade-heavy` | `trade-heavy-expanded` |
| `sheep-wheat-boom` | `sheep-wheat-boom` | `sheep-wheat-boom-expanded` |
| `high-ore` | `high-ore` | `high-ore-expanded` |
| `high-brick-wood` | `high-brick-wood` | `high-brick-wood-expanded` |
| `random-balanced` | `random-balanced` | `random-balanced` (auto-detects radius) |

**Expanded resource distribution (37 tiles, must sum to 37):**
- 8 wood, 7 brick, 8 sheep, 8 wheat, 4 ore, 2 desert

**Expanded number tokens (35 tokens, 2 deserts get none):**
- Full explicit list: 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 3, 4, 5, 9, 10, 11, 12
- (Standard 18 tokens: 2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12)
- (Additional 17 tokens: 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 3, 4, 5, 9, 10, 11, 12)

**Expanded ports (11 total):**
- 6 generic 3:1 + 5 specific 2:1 (one per resource)

### `presets.js` refactoring for radius 3

The existing random-balanced logic is hardcoded for radius 2 (19 tiles). The following must be generalized to support both radii:
- `STANDARD_COORDS_RADIUS_2` / `INDEX_BY_COORD` / `HEX_NEIGHBOR_INDICES` — create equivalent radius-3 versions or parameterize by radius
- `withDesertAtCenter` — remove the `r.length !== 19` assertion; validate against the expected count for the given radius
- `chooseDesertIndex` / `isCornerHexIndex` — parameterize to work with radius-3 coordinate lists
- `tryAssignTokens` — generalize the 19-slot arrays and neighbor lookups to work with 37 slots

Approach: create a `buildRadiusData(radius)` helper that generates coords, neighbor indices, and corner hex detection for any radius. The existing radius-2 data becomes `buildRadiusData(2)` and expanded uses `buildRadiusData(3)`. This avoids duplicating logic.

### `index.js`

`createNewGame` checks `playerIds.length`:
- If `>= 5`: appends `-expanded` to `presetId`, passes `radius: 3` to `generateStandardBoard`
- If `< 5`: uses standard preset and `radius: 2` (current behavior)
- Fallback: if no expanded variant found, uses `random-balanced` with expanded resource/token pools

Piece limits remain unchanged (15 roads, 5 settlements, 4 cities per player). Bank resources stay at 19 each. These match official expansion rules.

Setup placement order for N players: `[1, 2, ..., N, N, ..., 2, 1]` (already works for any N).

## Section 2: TV Layout — Bottom Player Bar

When `data-player-count-bucket="5-6"`, the TV layout switches from 3-column to a 2-region layout:

### Main area (top)
- **Board column**: Expanded board auto-fills via SVG viewBox, aspect ratio adjusts for the wider hex grid
- **Sidebar column**: Dice display + scrolling game log (no player list here)

### Player bar (bottom)
- Fixed height (~52px), horizontal flexbox of equal-width player cards
- Each card shows: color dot, player name (truncated), VP count, knight count (if any), award icons
- Active player card gets:
  - Tinted background using the player's color at low opacity
  - Colored border
  - "TURN" badge positioned at top-center of the card
- Trade offers and event cards overlay on the board area when active

### CSS structure
- New rules under `body.tv[data-player-count-bucket="5-6"]` replace the existing 5-6 player CSS (lines 452-531 of `tv.css` which style the sidebar player grid — these are superseded by the bottom bar approach)
- `grid-template-columns` changes from `auto 1fr 1fr` to `1fr auto` (board + sidebar)
- New `.playerBar` element added below the grid
- The existing `#players` list is hidden; a new `#playerBar` container renders the horizontal cards

### 3-4 player games
No changes. The existing 3-column layout with sidebar player list is preserved.

## Section 3: Server & Lobby Integration

### Server (`server.js`)
- No new endpoints needed. `createNewGame` already receives `playerIds` from the room's player list.
- The engine internally decides board size based on player count.

### Lobby preview
- When 5+ players have joined, the lobby board preview (`lobbyBoardPreview`) renders an expanded board preview so players see the larger layout before starting.
- The lobby generates a temporary preview board using the selected preset's expanded variant.

### Board layout detection
- Clients can check `board.layout` to determine which board size is active:
  - `"standard-radius-2"` = 19 hexes
  - `"expanded-radius-3"` = 37 hexes

## Section 4: Phone UI

No phone layout changes needed:
- The phone controller doesn't render the full board — it shows action buttons, hand display, and trade UI which are player-count-agnostic.
- The phone's board view (for placing settlements/roads) uses the same SVG renderer which adapts via `viewBox` — a larger board renders with more hexes at the same zoom level.

## Section 5: Testing

### Unit tests
- `board.test.js`: Verify radius 3 produces 37 hexes, correct vertex count (~96), correct edge count (~132), and 11 properly placed ports
- Preset tests: Each expanded preset has exactly 37 resources and 37 tokens with correct distribution
- `random-balanced`: Expanded pools work with the adjacency constraint (no adjacent 6/8) at radius 3
- `longest-road.js`: Verify longest road calculation works on the expanded graph

### Integration tests
- Full game with 5-6 players through setup rounds (placement order 1-2-3-4-5-6-6-5-4-3-2-1)
- Verify auto-selection of expanded board when `playerIds.length >= 5`
- Verify standard board when `playerIds.length < 5`

### Manual testing
- TV bottom player bar at 1920x1080 and 3840x2160
- Lobby preview switches to expanded board when 5th player joins
- Board readability — tokens and resources legible on expanded board at TV distance

## Out of Scope

- Special building phase (official expansion rule — excluded for party game simplicity)
- Host-selectable board size override (always auto by player count)
- New tile art for expanded board (reuses existing hex tile images)
- Changes to dev card deck size (stays at 25)
