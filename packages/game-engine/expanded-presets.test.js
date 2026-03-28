import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { getPresetDefinition } from "./presets.js";

const EXPANDED_PRESETS = [
  "classic-balanced-expanded",
  "trade-heavy-expanded",
  "sheep-wheat-boom-expanded",
  "high-ore-expanded",
  "high-brick-wood-expanded"
];

const EXPECTED_SORTED_TOKENS = [
  2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 11, 11, 12, 12, 12
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
        const deserts = preset.resources.filter((r) => r === "desert");
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

      test("has correct token distribution", () => {
        const preset = getPresetDefinition(presetId);
        const sorted = preset.tokens.filter((t) => t !== null).sort((a, b) => a - b);
        assert.deepEqual(sorted, EXPECTED_SORTED_TOKENS);
      });

      test("has correct resource distribution", () => {
        const preset = getPresetDefinition(presetId);
        const counts = {};
        for (const r of preset.resources) counts[r] = (counts[r] || 0) + 1;
        assert.equal(counts.desert, 2);
        const totalLand =
          (counts.wood || 0) + (counts.brick || 0) + (counts.sheep || 0) + (counts.wheat || 0) + (counts.ore || 0);
        assert.equal(totalLand, 35);
      });
    });
  }
});
