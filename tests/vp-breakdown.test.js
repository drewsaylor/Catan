/**
 * VP Breakdown Tests
 *
 * Tests for victory point calculation and breakdown logic.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { computeVpBreakdownByPlayerId } from "../apps/server/public/shared/vp-breakdown.js";

describe("computeVpBreakdownByPlayerId", () => {
  function makeGame({
    playerIds = ["A", "B", "C"],
    settlements = {},
    awards = {},
    pointsByPlayerId = null,
    finalPointsByPlayerId = null
  } = {}) {
    return {
      turnOrder: playerIds,
      structures: { settlements },
      awards: {
        longestRoadPlayerId: awards.longestRoad || null,
        largestArmyPlayerId: awards.largestArmy || null,
        ...awards
      },
      pointsByPlayerId,
      finalPointsByPlayerId
    };
  }

  test("returns empty breakdown for null game", () => {
    const result = computeVpBreakdownByPlayerId(null);
    assert.deepEqual(result, {});
  });

  test("returns empty breakdown for undefined game", () => {
    const result = computeVpBreakdownByPlayerId(undefined);
    assert.deepEqual(result, {});
  });

  test("uses turnOrder for player IDs when not provided", () => {
    const game = makeGame({ playerIds: ["A", "B", "C"] });
    const result = computeVpBreakdownByPlayerId(game);

    assert.ok("A" in result);
    assert.ok("B" in result);
    assert.ok("C" in result);
    assert.equal(Object.keys(result).length, 3);
  });

  test("uses provided playerIds array", () => {
    const game = makeGame({ playerIds: ["A", "B", "C", "D"] });
    const result = computeVpBreakdownByPlayerId(game, ["A", "B"]);

    assert.ok("A" in result);
    assert.ok("B" in result);
    assert.equal(Object.keys(result).length, 2);
  });

  test("counts settlements correctly", () => {
    const game = makeGame({
      playerIds: ["A", "B"],
      settlements: {
        V0: { playerId: "A", kind: "settlement" },
        V1: { playerId: "A", kind: "settlement" },
        V2: { playerId: "B", kind: "settlement" }
      }
    });

    const result = computeVpBreakdownByPlayerId(game);

    assert.equal(result.A.settlementCount, 2);
    assert.equal(result.B.settlementCount, 1);
  });

  test("counts cities correctly", () => {
    const game = makeGame({
      playerIds: ["A", "B"],
      settlements: {
        V0: { playerId: "A", kind: "city" },
        V1: { playerId: "A", kind: "city" },
        V2: { playerId: "B", kind: "city" }
      }
    });

    const result = computeVpBreakdownByPlayerId(game);

    assert.equal(result.A.cityCount, 2);
    assert.equal(result.B.cityCount, 1);
  });

  test("distinguishes settlements from cities", () => {
    const game = makeGame({
      playerIds: ["A"],
      settlements: {
        V0: { playerId: "A", kind: "settlement" },
        V1: { playerId: "A", kind: "city" },
        V2: { playerId: "A", kind: "settlement" },
        V3: { playerId: "A", kind: "city" }
      }
    });

    const result = computeVpBreakdownByPlayerId(game);

    assert.equal(result.A.settlementCount, 2);
    assert.equal(result.A.cityCount, 2);
  });

  test("awards 2 VP for longest road", () => {
    const game = makeGame({
      playerIds: ["A", "B"],
      awards: { longestRoad: "A" }
    });

    const result = computeVpBreakdownByPlayerId(game);

    assert.equal(result.A.longestRoad, 2);
    assert.equal(result.B.longestRoad, 0);
  });

  test("awards 2 VP for largest army", () => {
    const game = makeGame({
      playerIds: ["A", "B"],
      awards: { largestArmy: "B" }
    });

    const result = computeVpBreakdownByPlayerId(game);

    assert.equal(result.A.largestArmy, 0);
    assert.equal(result.B.largestArmy, 2);
  });

  test("calculates total VP correctly", () => {
    const game = makeGame({
      playerIds: ["A", "B"],
      settlements: {
        V0: { playerId: "A", kind: "settlement" }, // 1 VP
        V1: { playerId: "A", kind: "city" }, // 2 VP
        V2: { playerId: "B", kind: "settlement" } // 1 VP
      },
      awards: { longestRoad: "A", largestArmy: "B" } // 2 VP each
    });

    const result = computeVpBreakdownByPlayerId(game);

    // A: 1 settlement + 2 city + 2 longest road = 5 VP
    assert.equal(result.A.total, 5);

    // B: 1 settlement + 2 largest army = 3 VP
    assert.equal(result.B.total, 3);
  });

  test("uses pointsByPlayerId when available", () => {
    const game = makeGame({
      playerIds: ["A", "B"],
      settlements: {
        V0: { playerId: "A", kind: "settlement" } // 1 visible VP
      },
      pointsByPlayerId: { A: 5, B: 3 } // Total includes hidden VP
    });

    const result = computeVpBreakdownByPlayerId(game);

    assert.equal(result.A.total, 5);
    assert.equal(result.B.total, 3);
  });

  test("prefers finalPointsByPlayerId over pointsByPlayerId", () => {
    const game = makeGame({
      playerIds: ["A"],
      pointsByPlayerId: { A: 5 },
      finalPointsByPlayerId: { A: 10 }
    });

    const result = computeVpBreakdownByPlayerId(game);

    assert.equal(result.A.total, 10);
  });

  test("calculates hidden VP correctly", () => {
    const game = makeGame({
      playerIds: ["A"],
      settlements: {
        V0: { playerId: "A", kind: "settlement" }, // 1 VP
        V1: { playerId: "A", kind: "city" } // 2 VP
      },
      // Total is 5, visible base is 3, so hidden is 2
      pointsByPlayerId: { A: 5 }
    });

    const result = computeVpBreakdownByPlayerId(game);

    assert.equal(result.A.settlementCount, 1);
    assert.equal(result.A.cityCount, 1);
    assert.equal(result.A.hidden, 2); // 5 - 3 = 2 hidden VP
    assert.equal(result.A.total, 5);
  });

  test("hidden VP is never negative", () => {
    const game = makeGame({
      playerIds: ["A"],
      settlements: {
        V0: { playerId: "A", kind: "settlement" },
        V1: { playerId: "A", kind: "settlement" },
        V2: { playerId: "A", kind: "settlement" }
      },
      // Points lower than visible (edge case / stale data)
      pointsByPlayerId: { A: 2 }
    });

    const result = computeVpBreakdownByPlayerId(game);

    // When points are provided, they are used as total, hidden is clamped to 0
    assert.equal(result.A.hidden, 0);
    assert.equal(result.A.total, 2); // Uses pointsByPlayerId as total
  });

  test("handles player with no structures", () => {
    const game = makeGame({
      playerIds: ["A", "B"],
      settlements: {
        V0: { playerId: "A", kind: "settlement" }
      }
    });

    const result = computeVpBreakdownByPlayerId(game);

    assert.equal(result.B.settlementCount, 0);
    assert.equal(result.B.cityCount, 0);
    assert.equal(result.B.longestRoad, 0);
    assert.equal(result.B.largestArmy, 0);
    assert.equal(result.B.hidden, 0);
    assert.equal(result.B.total, 0);
  });

  test("handles malformed structures object", () => {
    const game = makeGame({ playerIds: ["A"] });
    game.structures = null;

    const result = computeVpBreakdownByPlayerId(game);

    assert.equal(result.A.settlementCount, 0);
    assert.equal(result.A.cityCount, 0);
  });

  test("handles settlement without playerId", () => {
    const game = makeGame({
      playerIds: ["A"],
      settlements: {
        V0: { kind: "settlement" }, // Missing playerId
        V1: { playerId: "A", kind: "settlement" }
      }
    });

    const result = computeVpBreakdownByPlayerId(game);

    assert.equal(result.A.settlementCount, 1);
  });

  test("one player can have both awards", () => {
    const game = makeGame({
      playerIds: ["A", "B"],
      awards: { longestRoad: "A", largestArmy: "A" }
    });

    const result = computeVpBreakdownByPlayerId(game);

    assert.equal(result.A.longestRoad, 2);
    assert.equal(result.A.largestArmy, 2);
    assert.equal(result.A.total, 4);
  });

  test("filters invalid playerIds", () => {
    const game = makeGame({ playerIds: ["A", "B"] });
    const result = computeVpBreakdownByPlayerId(game, ["A", "", null, "B", undefined]);

    assert.ok("A" in result);
    assert.ok("B" in result);
    // Empty string, null, undefined should be filtered
    assert.equal(Object.keys(result).length, 2);
  });
});
