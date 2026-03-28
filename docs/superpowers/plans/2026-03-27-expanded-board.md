# Expanded Board for 5-6 Players — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a radius-3 (37-hex) expanded board that activates automatically for 5-6 player games, with hand-crafted presets and a rethought TV layout with a bottom player bar.

**Architecture:** The board generator (`board.js`) already supports arbitrary radius via `generateHexCoords(radius)`. We parameterize `generateStandardBoard` to accept radius, generalize the preset infrastructure (`presets.js`) to support both radii via a `buildRadiusData(radius)` helper, add expanded preset definitions, wire auto-selection into `createNewGame`, and add a bottom player bar to the TV layout for 5-6 players.

**Tech Stack:** Plain ES modules, Node.js, HTML/CSS/SVG, node:test

**Spec:** `docs/superpowers/specs/2026-03-27-expanded-board-design.md`

---

### Task 1: Parameterize board.js for arbitrary radius

**Files:**
- Modify: `packages/game-engine/board.js`
- Modify: `packages/game-engine/board.test.js`

- [ ] **Step 1: Write failing tests for radius-3 board generation**

Add a new describe block in `board.test.js` for expanded board:

```js
const mockExpandedPresetDef = {
  resources: [
    "wood", "brick", "sheep", "wheat", "ore", "wood", "brick",
    "sheep", "wheat", "desert", "ore", "wood", "brick", "sheep",
    "wheat", "ore", "wood", "sheep", "wheat", "wood", "brick",
    "sheep", "wheat", "ore", "wood", "brick", "sheep", "wheat",
    "ore", "wood", "brick", "sheep", "wheat", "ore", "wood",
    "sheep", "desert"
  ],
  tokens: [
    5, 2, 6, 3, 8, 10, 9, 12, 11, null, 4, 8, 10, 9, 4, 5, 6, 3,
    11, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 3, 4, 5, 9, 10, 11, 12, null
  ]
};

describe("generateStandardBoard with radius 3", () => {
  test("generates 37 hexes", () => {
    const board = generateStandardBoard(mockExpandedPresetDef, { radius: 3 });
    assert.equal(board.hexes.length, 37);
  });

  test("has layout expanded-radius-3", () => {
    const board = generateStandardBoard(mockExpandedPresetDef, { radius: 3 });
    assert.equal(board.layout, "expanded-radius-3");
  });

  test("generates 11 ports", () => {
    const board = generateStandardBoard(mockExpandedPresetDef, { radius: 3 });
    assert.equal(board.ports.length, 11);
  });

  test("each hex has 6 corner vertices", () => {
    const board = generateStandardBoard(mockExpandedPresetDef, { radius: 3 });
    for (const hex of board.hexes) {
      assert.equal(hex.cornerVertexIds.length, 6);
    }
  });

  test("vertices have 2-3 neighbors", () => {
    const board = generateStandardBoard(mockExpandedPresetDef, { radius: 3 });
    for (const v of board.vertices) {
      assert.ok(v.neighborVertexIds.length >= 2 && v.neighborVertexIds.length <= 3);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern "radius 3"`
Expected: FAIL — `generateStandardBoard` does not accept options/radius parameter

- [ ] **Step 3: Modify generateStandardBoard to accept radius**

In `board.js`, change the signature and layout tag:

```js
// Before:
export function generateStandardBoard(presetDef) {
  const coords = generateHexCoords(2);

// After:
export function generateStandardBoard(presetDef, { radius = 2 } = {}) {
  const coords = generateHexCoords(radius);
```

Update the layout field at the bottom of the function:

```js
// Before:
  return {
    layout: "standard-radius-2",

// After:
  const layoutTag = radius <= 2 ? "standard-radius-2" : `expanded-radius-${radius}`;
  return {
    layout: layoutTag,
```

Update the port placement to use the correct port kinds list based on radius:

```js
// Before:
  const PORT_KINDS = ["generic", "wood", "generic", "brick", "generic", "sheep", "generic", "wheat", "ore"];

// After:
  const PORT_KINDS = radius >= 3
    ? ["generic", "wood", "generic", "brick", "generic", "sheep", "generic", "wheat", "ore", "generic", "generic"]
    : ["generic", "wood", "generic", "brick", "generic", "sheep", "generic", "wheat", "ore"];
```

- [ ] **Step 4: Run all board tests**

Run: `npm test -- --test-name-pattern "board|Board"`
Expected: All PASS (both radius-2 and radius-3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/board.js packages/game-engine/board.test.js
git commit -m "feat: parameterize board generation for arbitrary radius"
```

---

### Task 2: Build `buildRadiusData` helper in presets.js

**Files:**
- Modify: `packages/game-engine/presets.js`
- Modify: `packages/game-engine/board-randomizer.test.js`

- [ ] **Step 1: Write failing test for buildRadiusData**

Add to `board-randomizer.test.js`:

```js
import { buildRadiusData } from "./presets.js";

describe("buildRadiusData", () => {
  test("radius 2 produces 19 coords", () => {
    const data = buildRadiusData(2);
    assert.equal(data.coords.length, 19);
  });

  test("radius 3 produces 37 coords", () => {
    const data = buildRadiusData(3);
    assert.equal(data.coords.length, 37);
  });

  test("radius 3 has neighbor indices for all 37 hexes", () => {
    const data = buildRadiusData(3);
    assert.equal(data.neighborIndices.length, 37);
    for (const neighbors of data.neighborIndices) {
      assert.ok(neighbors.length >= 2 && neighbors.length <= 6);
    }
  });

  test("radius 3 center hex is at correct index", () => {
    const data = buildRadiusData(3);
    const centerIdx = data.coords.findIndex(c => c.q === 0 && c.r === 0);
    assert.ok(centerIdx >= 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "buildRadiusData"`
Expected: FAIL — `buildRadiusData` not exported

- [ ] **Step 3: Implement buildRadiusData**

In `presets.js`, add and export:

```js
export function buildRadiusData(radius) {
  const coords = [];
  for (let x = -radius; x <= radius; x += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      const z = -x - y;
      if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= radius) {
        coords.push({ q: x, r: z });
      }
    }
  }
  coords.sort((a, b) => a.r - b.r || a.q - b.q);

  const HEX_NEIGHBOR_DELTAS = [
    { dq: 1, dr: 0 }, { dq: -1, dr: 0 },
    { dq: 0, dr: 1 }, { dq: 0, dr: -1 },
    { dq: 1, dr: -1 }, { dq: -1, dr: 1 }
  ];

  const indexByCoord = new Map(coords.map((c, idx) => [`${c.q},${c.r}`, idx]));

  const neighborIndices = coords.map((c) => {
    const list = [];
    for (const d of HEX_NEIGHBOR_DELTAS) {
      const n = indexByCoord.get(`${c.q + d.dq},${c.r + d.dr}`);
      if (n != null) list.push(n);
    }
    list.sort((a, b) => a - b);
    return list;
  });

  function cubeDistFromCenter({ q, r }) {
    const x = q, z = r, y = -x - z;
    return Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
  }

  function isCornerHex(idx) {
    const c = coords[idx];
    if (!c) return false;
    if (cubeDistFromCenter(c) !== radius) return false;
    return c.q === 0 || c.r === 0 || c.q + c.r === 0;
  }

  return { coords, indexByCoord, neighborIndices, isCornerHex, cubeDistFromCenter, hexCount: coords.length };
}
```

Then refactor the existing hardcoded `STANDARD_COORDS_RADIUS_2`, `INDEX_BY_COORD`, `HEX_NEIGHBOR_INDICES`, `isCornerHexIndex`, and `cubeDistanceFromCenter` to delegate to `buildRadiusData(2)`:

```js
const RADIUS_2_DATA = buildRadiusData(2);
const STANDARD_COORDS_RADIUS_2 = RADIUS_2_DATA.coords;
const INDEX_BY_COORD = RADIUS_2_DATA.indexByCoord;
const HEX_NEIGHBOR_INDICES = RADIUS_2_DATA.neighborIndices;

function isCornerHexIndex(idx) {
  return RADIUS_2_DATA.isCornerHex(idx);
}

function cubeDistanceFromCenter(coord) {
  return RADIUS_2_DATA.cubeDistFromCenter(coord);
}
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: All PASS — existing behavior preserved, new tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/presets.js packages/game-engine/board-randomizer.test.js
git commit -m "feat: add buildRadiusData helper for multi-radius preset support"
```

---

### Task 3: Generalize random-balanced generation for radius 3

**Files:**
- Modify: `packages/game-engine/presets.js`
- Modify: `packages/game-engine/board-randomizer.test.js`

- [ ] **Step 1: Write failing test for expanded random-balanced**

```js
describe("random-balanced expanded", () => {
  test("generates 37 resources for radius 3", () => {
    const preset = getPresetDefinition("random-balanced", { seed: "test-expanded", radius: 3 });
    assert.equal(preset.resources.length, 37);
  });

  test("generates 37 tokens for radius 3", () => {
    const preset = getPresetDefinition("random-balanced", { seed: "test-expanded", radius: 3 });
    assert.equal(preset.tokens.length, 37);
  });

  test("has 2 deserts for radius 3", () => {
    const preset = getPresetDefinition("random-balanced", { seed: "test-expanded", radius: 3 });
    const desertCount = preset.resources.filter(r => r === "desert").length;
    assert.equal(desertCount, 2);
  });

  test("no adjacent 6/8 tokens for radius 3", () => {
    const preset = getPresetDefinition("random-balanced", { seed: "test-expanded", radius: 3 });
    const data = buildRadiusData(3);
    for (let i = 0; i < 37; i++) {
      const token = preset.tokens[i];
      if (token !== 6 && token !== 8) continue;
      for (const n of data.neighborIndices[i]) {
        const neighborToken = preset.tokens[n];
        assert.ok(
          neighborToken !== 6 && neighborToken !== 8,
          `Hot tokens adjacent: index ${i} (${token}) and ${n} (${neighborToken})`
        );
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "random-balanced expanded"`
Expected: FAIL — `getPresetDefinition` doesn't accept `radius`

- [ ] **Step 3: Generalize the random-balanced preset generation**

In `presets.js`:

1. Update `getPresetDefinition` signature to accept `radius`:
```js
export function getPresetDefinition(presetId, { seed = null, radius = 2 } = {})
```

2. Update `withDesertAtCenter` to validate against the expected count for the given radius instead of hardcoding 19.

3. Update `generateRandomBalancedPreset` to accept `radius` and use `buildRadiusData(radius)` for coords, neighbor indices, and corner hex detection. Use expanded resource/token bags when `radius >= 3`:

```js
const EXPANDED_RESOURCE_BAG = [
  ...Array(8).fill("wood"),
  ...Array(7).fill("brick"),
  ...Array(8).fill("sheep"),
  ...Array(8).fill("wheat"),
  ...Array(4).fill("ore")
]; // 35 land tiles + 2 deserts = 37 total

const EXPANDED_TOKEN_BAG = [
  2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8,
  9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12,
  3, 4, 5, 9, 10, 11, 12
];
```

4. `chooseDesertIndex` and `tryAssignTokens` take the radius data object instead of using hardcoded globals. For radius 3, choose 2 desert indices instead of 1.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/presets.js packages/game-engine/board-randomizer.test.js
git commit -m "feat: generalize random-balanced preset for radius 3"
```

---

### Task 4: Add hand-crafted expanded presets

**Files:**
- Modify: `packages/game-engine/presets.js`
- Create: `packages/game-engine/expanded-presets.test.js`

- [ ] **Step 1: Write failing tests for expanded presets**

Create `expanded-presets.test.js`:

```js
import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { getPresetDefinition, PRESET_META } from "./presets.js";

const EXPANDED_PRESETS = [
  "classic-balanced-expanded",
  "trade-heavy-expanded",
  "sheep-wheat-boom-expanded",
  "high-ore-expanded",
  "high-brick-wood-expanded"
];

describe("expanded presets", () => {
  for (const presetId of EXPANDED_PRESETS) {
    describe(presetId, () => {
      test("has 37 resources", () => {
        const preset = getPresetDefinition(presetId);
        assert.equal(preset.resources.length, 37);
      });

      test("has 37 tokens", () => {
        const preset = getPresetDefinition(presetId);
        assert.equal(preset.tokens.length, 37);
      });

      test("has exactly 2 deserts", () => {
        const preset = getPresetDefinition(presetId);
        const deserts = preset.resources.filter(r => r === "desert");
        assert.equal(deserts.length, 2);
      });

      test("desert tiles have null tokens", () => {
        const preset = getPresetDefinition(presetId);
        for (let i = 0; i < 37; i++) {
          if (preset.resources[i] === "desert") {
            assert.equal(preset.tokens[i], null);
          }
        }
      });

      test("has correct resource distribution", () => {
        const preset = getPresetDefinition(presetId);
        const counts = {};
        for (const r of preset.resources) counts[r] = (counts[r] || 0) + 1;
        assert.equal(counts.desert, 2);
        const landTiles = 37 - 2;
        const totalLand = (counts.wood || 0) + (counts.brick || 0) +
          (counts.sheep || 0) + (counts.wheat || 0) + (counts.ore || 0);
        assert.equal(totalLand, landTiles);
      });
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "expanded presets"`
Expected: FAIL — expanded preset IDs not found

- [ ] **Step 3: Add expanded presets to PRESET_META and getPresetDefinition**

In `presets.js`, add expanded entries to `PRESET_META`:

```js
{ id: "classic-balanced-expanded", name: "Classic Balanced (Expanded)" },
{ id: "trade-heavy-expanded", name: "Trade Heavy (Expanded)" },
{ id: "sheep-wheat-boom-expanded", name: "Sheep/Wheat Boom (Expanded)" },
{ id: "high-ore-expanded", name: "High Ore (Expanded)" },
{ id: "high-brick-wood-expanded", name: "Brick/Wood Rush (Expanded)" },
```

Add the hand-crafted resource/token arrays for each expanded preset in `getPresetDefinition`. Each must have exactly 37 entries with 2 deserts (null tokens at desert positions). Follow the theme of each original preset but distribute across 37 tiles (e.g., `high-ore-expanded` emphasizes ore tiles, `trade-heavy-expanded` emphasizes variety near ports).

Use a new helper `withExpandedDeserts(resources, tokens, desertIndices)` that validates length === 37 and the desert positions.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/presets.js packages/game-engine/expanded-presets.test.js
git commit -m "feat: add hand-crafted expanded presets for 5-6 players"
```

---

### Task 5: Wire auto-selection into createNewGame

**Files:**
- Modify: `packages/game-engine/index.js`
- Create: `packages/game-engine/expanded-game.test.js`

- [ ] **Step 1: Write failing tests for auto-selection**

Create `expanded-game.test.js`:

```js
import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { createNewGame } from "./index.js";

describe("createNewGame expanded board", () => {
  test("5 players get expanded board", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4", "p5"],
      presetId: "classic-balanced"
    });
    assert.equal(game.board.layout, "expanded-radius-3");
    assert.equal(game.board.hexes.length, 37);
  });

  test("6 players get expanded board", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4", "p5", "p6"],
      presetId: "classic-balanced"
    });
    assert.equal(game.board.layout, "expanded-radius-3");
  });

  test("4 players get standard board", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4"],
      presetId: "classic-balanced"
    });
    assert.equal(game.board.layout, "standard-radius-2");
    assert.equal(game.board.hexes.length, 19);
  });

  test("3 players get standard board", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3"],
      presetId: "classic-balanced"
    });
    assert.equal(game.board.layout, "standard-radius-2");
  });

  test("5 players with random-balanced get expanded board", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4", "p5"],
      presetId: "random-balanced",
      boardSeed: "test-seed"
    });
    assert.equal(game.board.layout, "expanded-radius-3");
    assert.equal(game.board.hexes.length, 37);
  });

  test("setup placement order is correct for 5 players", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4", "p5"],
      presetId: "classic-balanced"
    });
    assert.deepEqual(
      game.setup.placementOrder,
      ["p1", "p2", "p3", "p4", "p5", "p5", "p4", "p3", "p2", "p1"]
    );
  });

  test("expanded board has 11 ports", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4", "p5"],
      presetId: "classic-balanced"
    });
    assert.equal(game.board.ports.length, 11);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "expanded board"`
Expected: FAIL — `createNewGame` doesn't auto-select expanded preset

- [ ] **Step 3: Implement auto-selection in createNewGame**

In `index.js`, modify `createNewGame`:

```js
// After resolving the preset ID but before calling getPresetDefinition:
const isExpanded = playerIds.length >= 5;
const radius = isExpanded ? 3 : 2;

let resolvedPresetId = presetId;
if (isExpanded && presetId !== "random-balanced") {
  const expandedId = `${presetId}-expanded`;
  // Check if expanded variant exists
  const expandedMeta = PRESET_META.find(p => p.id === expandedId);
  resolvedPresetId = expandedMeta ? expandedId : "random-balanced";
}

const preset = getPresetDefinition(resolvedPresetId, {
  seed: normalizedBoardSeed,
  radius
});
const board = generateStandardBoard(preset, { radius });
```

Pass `{ radius }` to `generateStandardBoard` in the existing call.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/index.js packages/game-engine/expanded-game.test.js
git commit -m "feat: auto-select expanded board for 5-6 players"
```

---

### Task 6: TV bottom player bar — HTML and CSS

**Files:**
- Modify: `apps/server/public/tv/index.html`
- Modify: `apps/server/public/tv/tv.css`

- [ ] **Step 1: Add playerBar container to TV HTML**

In `index.html`, add the player bar container after the `.grid` div and before the closing `</div>` of `.wrap`:

```html
        <!-- Bottom player bar for 5-6 players -->
        <div class="playerBar" id="playerBar" style="display: none"></div>
```

- [ ] **Step 2: Replace existing 5-6 player CSS with bottom bar layout**

In `tv.css`, replace all the existing `body.tv[data-player-count-bucket="5-6"]` rules (lines 452-531) with the new bottom player bar layout:

```css
/* ==========================================================================
   5-6 Player Layout: Bottom Player Bar
   ========================================================================== */

body.tv[data-player-count-bucket="5-6"] .grid {
  grid-template-columns: 1fr auto;
  gap: 12px;
}

body.tv[data-player-count-bucket="5-6"] .logColumn {
  min-width: 180px;
  max-width: 220px;
}

body.tv[data-player-count-bucket="5-6"] .infoColumn {
  display: none;
}

body.tv[data-player-count-bucket="5-6"] .infoColumn > .card:first-child {
  display: none;
}

body.tv[data-player-count-bucket="5-6"] .boardCard {
  aspect-ratio: 1.25 / 1;
}

body.tv[data-player-count-bucket="5-6"] .playerBar {
  display: flex !important;
  gap: 6px;
  height: 52px;
  flex-shrink: 0;
  margin-top: 8px;
}

.playerBar {
  display: none;
}

.playerBarCard {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
  transition: background 0.2s var(--ease-out), border-color 0.2s var(--ease-out);
}

.playerBarCard .barDot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.playerBarCard .barInfo {
  flex: 1;
  min-width: 0;
}

.playerBarCard .barName {
  color: #fff;
  font-weight: 700;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playerBarCard .barMeta {
  color: rgba(255, 255, 255, 0.5);
  font-size: 9px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playerBarCard.turn {
  border-color: rgba(var(--accent-rgb), 0.4);
}

.playerBarCard .turnBadge {
  display: none;
  position: absolute;
  top: -1px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(var(--accent-rgb), 0.9);
  color: #fff;
  font-size: 8px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 0 0 4px 4px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.playerBarCard.turn .turnBadge {
  display: block;
}
```

- [ ] **Step 3: Verify CSS loads without errors**

Run: `npm run dev` and open `http://localhost:3000/tv` in a browser. Verify the page loads with no console errors. The player bar won't appear yet (needs JS wiring in next task).

- [ ] **Step 4: Commit**

```bash
git add apps/server/public/tv/index.html apps/server/public/tv/tv.css
git commit -m "feat: add bottom player bar HTML/CSS for 5-6 player TV layout"
```

---

### Task 7: TV bottom player bar — JS wiring

**Files:**
- Modify: `apps/server/public/tv/tv.js`

- [ ] **Step 1: Add playerBar element reference**

Near the top of `tv.js` where other elements are queried (around line 74), add:

```js
const elPlayerBar = qs("#playerBar");
```

- [ ] **Step 2: Add playerBarCard render function**

Add a new function near the existing `playerRow` function (around line 539):

```js
function playerBarCard(p, {
  currentPlayerId,
  pointsByPlayerId,
  victoryPointsToWin,
  winnerPlayerId,
  knightsByPlayerId,
  largestArmyPlayerId,
  longestRoadPlayerId
}) {
  const isTurn = currentPlayerId && p.playerId === currentPlayerId && !winnerPlayerId;
  const dotColor = p.connected ? p.color : "rgba(255,255,255,0.18)";
  const cls = ["playerBarCard"];
  if (isTurn) cls.push("turn");
  if (!p.connected) cls.push("disconnected");

  const points = Math.max(0, Math.floor(pointsByPlayerId?.[p.playerId] ?? 0));
  const target = Math.max(0, Math.floor(victoryPointsToWin ?? 0));
  const knights = knightsByPlayerId?.[p.playerId] ?? 0;
  const hasLargestArmy = p.playerId === largestArmyPlayerId;
  const hasLongestRoad = p.playerId === longestRoadPlayerId;
  const isWinner = winnerPlayerId === p.playerId;

  const parts = [];
  if (target > 0) parts.push(`${points}/${target} VP`);
  else parts.push(`${points} VP`);
  if (knights > 0) parts.push(`\u2694 ${knights}`);
  if (hasLargestArmy) parts.push("\uD83D\uDEE1\uFE0F");
  if (hasLongestRoad) parts.push("\uD83D\uDEE4\uFE0F");
  if (isWinner) parts.push("\uD83C\uDFC6");

  const bgStyle = isTurn
    ? `background:rgba(${cssColorToRgb(p.color)},0.15);`
    : "";

  return `<div class="${cls.join(" ")}" data-player-id="${escapeHtml(p.playerId)}" style="${bgStyle}">
    <span class="barDot" style="background:${dotColor};"></span>
    <div class="barInfo">
      <div class="barName">${escapeHtml(p.name)}</div>
      <div class="barMeta">${escapeHtml(parts.join(" \u00B7 "))}</div>
    </div>
    <span class="turnBadge">Turn</span>
  </div>`;
}
```

Add a small helper to convert named CSS colors to RGB for the tinted background:

```js
function cssColorToRgb(color) {
  const map = {
    red: "192,57,43", blue: "41,128,185", white: "236,240,241",
    orange: "230,126,34", green: "39,174,96", brown: "142,109,71"
  };
  return map[color] || "255,255,255";
}
```

- [ ] **Step 3: Wire playerBar rendering into the main render loop**

In the main render function (around line 2813 where `elPlayers.innerHTML` is set), add the player bar rendering after the existing player list rendering:

```js
// After: elPlayers.innerHTML = room.players.map(...).join("");
// Add:
if (elPlayerBar && room.players.length >= 5) {
  elPlayerBar.innerHTML = room.players
    .map((p) =>
      playerBarCard(p, {
        currentPlayerId,
        pointsByPlayerId,
        victoryPointsToWin,
        winnerPlayerId,
        knightsByPlayerId: room.game?.playedKnightsByPlayerId || {},
        largestArmyPlayerId: room.game?.awards?.largestArmyPlayerId || null,
        longestRoadPlayerId: room.game?.awards?.longestRoadPlayerId || null
      })
    )
    .join("");
}
```

- [ ] **Step 4: Update spotlight references for 5-6 player layout**

The show-beats system spotlights `elPlayers` elements. When using the bottom bar, spotlights should target `elPlayerBar` instead. In the spotlight call sites (around lines 1169, 1192, 1258, 1331, 1453), update the element lookup to check both containers:

```js
// Replace patterns like:
const rowEl = elPlayers?.querySelector?.(`[data-player-id="${beat?.playerId}"]`) || null;
// With:
const rowEl = elPlayerBar?.querySelector?.(`[data-player-id="${beat?.playerId}"]`)
  || elPlayers?.querySelector?.(`[data-player-id="${beat?.playerId}"]`)
  || null;
```

- [ ] **Step 5: Test manually**

Run: `npm run dev`, open TV view, create a room, join 5+ phones (or use dev tools to fake player count). Verify:
- Bottom player bar appears with 5+ players
- Active player has tinted background and "TURN" badge
- 3-4 players still use the old sidebar layout

- [ ] **Step 6: Commit**

```bash
git add apps/server/public/tv/tv.js
git commit -m "feat: wire bottom player bar rendering for 5-6 player TV layout"
```

---

### Task 8: Lobby preview for expanded board

**Files:**
- Modify: `apps/server/public/tv/lobby-overlay.js`
- Modify: `apps/server/public/tv/tv.js`

- [ ] **Step 1: Update lobby board preview to reflect player count**

In `lobby-overlay.js`, find where the lobby board preview is generated. Update it to use the expanded preset and radius when 5+ players are in the room.

Look for the function that renders `lobbyBoardPreview` and add logic:

```js
const playerCount = room?.players?.length ?? 0;
const isExpanded = playerCount >= 5;
const radius = isExpanded ? 3 : 2;
// When generating the preview board, pass { radius } to generateStandardBoard
// and use the expanded preset variant
```

This may require importing `generateStandardBoard` and `getPresetDefinition` in the lobby overlay, or passing the preview board from `tv.js` where the imports already exist.

- [ ] **Step 2: Verify lobby preview updates when 5th player joins**

Run: `npm run dev`, open TV lobby, join 4 players (standard board preview), then join a 5th. The preview should switch to the expanded board.

- [ ] **Step 3: Commit**

```bash
git add apps/server/public/tv/lobby-overlay.js apps/server/public/tv/tv.js
git commit -m "feat: lobby preview shows expanded board for 5+ players"
```

---

### Task 9: Integration test — full 5-player game through setup

**Files:**
- Modify: `packages/game-engine/expanded-game.test.js`

- [ ] **Step 1: Write integration test for 5-player setup flow**

Add to `expanded-game.test.js`:

```js
import { applyAction } from "./index.js";

describe("5-player game setup flow", () => {
  test("completes setup with 10 placements (5 forward + 5 reverse)", () => {
    let game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4", "p5"],
      presetId: "classic-balanced"
    });

    assert.equal(game.phase, "setup_round_1");
    assert.equal(game.setup.placementOrder.length, 10);

    // Each player places a settlement + road in round 1 (5 placements)
    // Then reverse order in round 2 (5 more)
    for (let i = 0; i < 10; i++) {
      const pid = game.setup.placementOrder[game.setup.placementIndex];
      assert.ok(pid, `placement ${i} should have a player`);

      // Place settlement on first legal vertex
      const legalVertices = game.board.vertices.filter(v => {
        if (game.structures.settlements[v.id]) return false;
        return !v.neighborVertexIds.some(n => !!game.structures.settlements[n]);
      });
      assert.ok(legalVertices.length > 0, `placement ${i}: should have legal vertices`);

      let result = applyAction(game, { type: "PLACE_SETTLEMENT", vertexId: legalVertices[0].id }, pid);
      assert.ok(result.game, `placement ${i}: settlement should succeed`);
      game = result.game;

      // Place road on first legal edge
      const lastVertex = game.board.vertices.find(v => v.id === game.setup.lastSettlementVertexId);
      const legalEdges = lastVertex.edgeIds.filter(eId => !game.structures.roads[eId]);
      assert.ok(legalEdges.length > 0, `placement ${i}: should have legal edges`);

      result = applyAction(game, { type: "PLACE_ROAD", edgeId: legalEdges[0] }, pid);
      assert.ok(result.game, `placement ${i}: road should succeed`);
      game = result.game;
    }

    assert.equal(game.phase, "turn");
    assert.equal(game.subphase, "needs_roll");
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npm test -- --test-name-pattern "5-player game setup"`
Expected: PASS

- [ ] **Step 3: Add longest-road test for expanded board**

Add to `packages/game-engine/longest-road.test.js`:

```js
import { computeLongestRoadLengthsByPlayerId } from "./longest-road.js";

describe("longest road on expanded board", () => {
  test("calculates longest road correctly on radius-3 board", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4", "p5"],
      presetId: "classic-balanced"
    });

    // Place a chain of roads for p1 on the expanded board
    // Find 5 connected edges from a starting vertex
    const startVertex = game.board.vertices[0];
    let currentVertexId = startVertex.id;
    const placedEdges = [];

    for (let i = 0; i < 5; i++) {
      const vertex = game.board.vertices.find(v => v.id === currentVertexId);
      const edge = vertex.edgeIds.find(eId => !placedEdges.includes(eId));
      if (!edge) break;
      game.structures.roads[edge] = { playerId: "p1" };
      placedEdges.push(edge);
      const edgeObj = game.board.edges.find(e => e.id === edge);
      currentVertexId = edgeObj.vA === currentVertexId ? edgeObj.vB : edgeObj.vA;
    }

    const result = computeLongestRoadLengthsByPlayerId(game);
    assert.ok(result.p1 >= placedEdges.length,
      `Expected longest road >= ${placedEdges.length}, got ${result.p1}`);
  });
});
```

- [ ] **Step 4: Run longest-road tests**

Run: `npm test -- --test-name-pattern "longest road"`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/expanded-game.test.js packages/game-engine/longest-road.test.js
git commit -m "test: add 5-player setup flow and longest-road integration tests"
```

---

### Task 10: Final verification and cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All PASS

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Run formatter**

Run: `npm run format`

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev` and verify:
1. Create a room, join 4 players — standard 19-hex board, 3-column sidebar layout
2. Create a room, join 5-6 players — expanded 37-hex board, bottom player bar
3. Lobby preview updates when player count crosses the 5-player threshold
4. Game plays through setup and into turns on expanded board
5. Dice rolls, resource distribution, robber, and trading all work on expanded board

- [ ] **Step 5: Commit any formatting/lint fixes**

```bash
git add -A
git commit -m "chore: lint and format fixes for expanded board feature"
```
