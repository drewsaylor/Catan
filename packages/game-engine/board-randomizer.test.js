import assert from "node:assert/strict";
import test from "node:test";

import { createNewGame } from "./index.js";
import { getPresetDefinition } from "./presets.js";

const STANDARD_COORDS_RADIUS_2 = [
  { q: 0, r: -2 },
  { q: 1, r: -2 },
  { q: 2, r: -2 },
  { q: -1, r: -1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 2, r: -1 },
  { q: -2, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  { q: -2, r: 1 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
  { q: 1, r: 1 },
  { q: -2, r: 2 },
  { q: -1, r: 2 },
  { q: 0, r: 2 }
];

const HEX_NEIGHBOR_DELTAS = [
  { dq: 1, dr: 0 },
  { dq: -1, dr: 0 },
  { dq: 0, dr: 1 },
  { dq: 0, dr: -1 },
  { dq: 1, dr: -1 },
  { dq: -1, dr: 1 }
];

const INDEX_BY_COORD = new Map(STANDARD_COORDS_RADIUS_2.map((c, idx) => [`${c.q},${c.r}`, idx]));

const HEX_NEIGHBOR_INDICES = STANDARD_COORDS_RADIUS_2.map((c) =>
  HEX_NEIGHBOR_DELTAS.map((d) => INDEX_BY_COORD.get(`${c.q + d.dq},${c.r + d.dr}`)).filter((n) => n != null)
);

function cubeDistanceFromCenter({ q, r }) {
  const x = q;
  const z = r;
  const y = -x - z;
  return Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
}

function isCornerHexIndex(idx) {
  const c = STANDARD_COORDS_RADIUS_2[idx] ?? null;
  if (!c) return false;
  const dist = cubeDistanceFromCenter(c);
  if (dist !== 2) return false;
  return c.q === 0 || c.r === 0 || c.q + c.r === 0;
}

function tokenHasHotNumber(token) {
  return token === 6 || token === 8;
}

function assertValidPreset(def, { expectCenterDesert = false } = {}) {
  assert.equal(def.resources.length, 19, "resources must be length 19");
  assert.equal(def.tokens.length, 19, "tokens must be length 19");
  const desertIndex = def.resources.findIndex((r) => r === "desert");
  assert.ok(desertIndex >= 0, "must include a desert");
  assert.equal(def.tokens[desertIndex], null, "desert token must be null");
  if (expectCenterDesert) assert.equal(desertIndex, 9, "center desert expected");
}

test("random-balanced: deterministic given seed", () => {
  const a = getPresetDefinition("random-balanced", { seed: "abc" });
  const b = getPresetDefinition("random-balanced", { seed: "abc" });
  assert.deepEqual(a.resources, b.resources);
  assert.deepEqual(a.tokens, b.tokens);
});

test("random-balanced: avoids adjacent 6/8 tokens", () => {
  const seeds = ["a", "b", "c", "seed-123", "42", "0xdeadbeef"];
  for (const seed of seeds) {
    const def = getPresetDefinition("random-balanced", { seed });
    assertValidPreset(def);

    for (let i = 0; i < 19; i += 1) {
      const token = def.tokens[i];
      if (!tokenHasHotNumber(token)) continue;
      for (const n of HEX_NEIGHBOR_INDICES[i]) {
        if (tokenHasHotNumber(def.tokens[n])) {
          assert.fail(`Adjacent hot tokens for seed ${seed}: ${i}(${token}) next to ${n}(${def.tokens[n]})`);
        }
      }
    }
  }
});

test("random-balanced: avoids desert on corner hexes", () => {
  const seeds = ["a", "b", "c", "seed-123", "42", "0xdeadbeef"];
  for (const seed of seeds) {
    const def = getPresetDefinition("random-balanced", { seed });
    assertValidPreset(def);
    const desertIndex = def.resources.findIndex((r) => r === "desert");
    assert.ok(!isCornerHexIndex(desertIndex), `desert on corner for seed ${seed}: ${desertIndex}`);
  }
});

test("curated presets: valid with center desert", () => {
  const curatedIds = ["classic-balanced", "trade-heavy", "sheep-wheat-boom", "high-ore", "high-brick-wood"];
  for (const presetId of curatedIds) {
    const def = getPresetDefinition(presetId);
    assertValidPreset(def, { expectCenterDesert: true });
  }
});

test("createNewGame: stores boardSeed for random-balanced", () => {
  const game = createNewGame({ playerIds: ["A", "B", "C"], presetId: "random-balanced", boardSeed: "abc" });
  assert.equal(game.presetId, "random-balanced");
  assert.equal(game.boardSeed, "abc");
  assert.equal(game.board.hexes.length, 19);
});
