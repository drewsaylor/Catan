/**
 * Action Gates Tests
 *
 * Tests for resource validation and action gating logic.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

// Import the functions to test
import {
  BUILD_COSTS,
  DEV_CARD_COST,
  getEffectiveBuildCost,
  hasAnyResources,
  hasEnoughResources,
  gateAction
} from "../apps/server/public/shared/action-gates.js";

describe("BUILD_COSTS and DEV_CARD_COST constants", () => {
  test("BUILD_COSTS has correct road cost", () => {
    assert.deepEqual(BUILD_COSTS.BUILD_ROAD, { wood: 1, brick: 1 });
  });

  test("BUILD_COSTS has correct settlement cost", () => {
    assert.deepEqual(BUILD_COSTS.BUILD_SETTLEMENT, { wood: 1, brick: 1, sheep: 1, wheat: 1 });
  });

  test("BUILD_COSTS has correct city cost", () => {
    assert.deepEqual(BUILD_COSTS.BUILD_CITY, { wheat: 2, ore: 3 });
  });

  test("DEV_CARD_COST is correct", () => {
    assert.deepEqual(DEV_CARD_COST, { wheat: 1, sheep: 1, ore: 1 });
  });
});

describe("getEffectiveBuildCost", () => {
  test("returns base cost when no event is active", () => {
    const game = { currentEvent: null };
    assert.deepEqual(getEffectiveBuildCost("BUILD_ROAD", game), { wood: 1, brick: 1 });
    assert.deepEqual(getEffectiveBuildCost("BUILD_SETTLEMENT", game), { wood: 1, brick: 1, sheep: 1, wheat: 1 });
    assert.deepEqual(getEffectiveBuildCost("BUILD_CITY", game), { wheat: 2, ore: 3 });
  });

  test("returns null for unknown action type", () => {
    const game = { currentEvent: null };
    assert.equal(getEffectiveBuildCost("INVALID", game), null);
    assert.equal(getEffectiveBuildCost("", game), null);
  });

  test("applies road_work discount to roads", () => {
    const game = { currentEvent: { id: "road_work" } };
    const cost = getEffectiveBuildCost("BUILD_ROAD", game);
    assert.deepEqual(cost, { wood: 0, brick: 1 });
  });

  test("road_work does not affect settlement cost", () => {
    const game = { currentEvent: { id: "road_work" } };
    const cost = getEffectiveBuildCost("BUILD_SETTLEMENT", game);
    assert.deepEqual(cost, { wood: 1, brick: 1, sheep: 1, wheat: 1 });
  });

  test("road_work does not affect city cost", () => {
    const game = { currentEvent: { id: "road_work" } };
    const cost = getEffectiveBuildCost("BUILD_CITY", game);
    assert.deepEqual(cost, { wheat: 2, ore: 3 });
  });
});

describe("hasAnyResources", () => {
  test("returns false for null/undefined", () => {
    assert.equal(hasAnyResources(null), false);
    assert.equal(hasAnyResources(undefined), false);
  });

  test("returns false for non-object", () => {
    assert.equal(hasAnyResources("string"), false);
    assert.equal(hasAnyResources(123), false);
  });

  test("returns false for empty hand", () => {
    assert.equal(hasAnyResources({}), false);
    assert.equal(hasAnyResources({ wood: 0, brick: 0 }), false);
  });

  test("returns true when hand has resources", () => {
    assert.equal(hasAnyResources({ wood: 1 }), true);
    assert.equal(hasAnyResources({ wood: 0, brick: 1 }), true);
    assert.equal(hasAnyResources({ wheat: 5, ore: 3 }), true);
  });

  test("handles negative values as zero", () => {
    assert.equal(hasAnyResources({ wood: -1 }), false);
    assert.equal(hasAnyResources({ wood: -5, brick: 0 }), false);
  });

  test("handles non-integer values", () => {
    assert.equal(hasAnyResources({ wood: 1.5 }), true);
    assert.equal(hasAnyResources({ wood: 0.9 }), false); // floors to 0
  });
});

describe("hasEnoughResources", () => {
  test("returns false for null/undefined hand", () => {
    assert.equal(hasEnoughResources(null, { wood: 1 }), false);
    assert.equal(hasEnoughResources(undefined, { wood: 1 }), false);
  });

  test("returns true for null/undefined cost", () => {
    assert.equal(hasEnoughResources({ wood: 1 }, null), true);
    assert.equal(hasEnoughResources({ wood: 1 }, undefined), true);
  });

  test("returns true for empty cost", () => {
    assert.equal(hasEnoughResources({ wood: 1 }, {}), true);
    assert.equal(hasEnoughResources({}, {}), true);
  });

  test("returns true when hand has exact resources", () => {
    assert.equal(hasEnoughResources({ wood: 1, brick: 1 }, { wood: 1, brick: 1 }), true);
  });

  test("returns true when hand has more than needed", () => {
    assert.equal(hasEnoughResources({ wood: 5, brick: 3 }, { wood: 1, brick: 1 }), true);
  });

  test("returns false when hand is missing resources", () => {
    assert.equal(hasEnoughResources({ wood: 0, brick: 1 }, { wood: 1, brick: 1 }), false);
    assert.equal(hasEnoughResources({ wood: 1 }, { wood: 1, brick: 1 }), false);
  });

  test("validates road cost correctly", () => {
    const roadCost = BUILD_COSTS.BUILD_ROAD;
    assert.equal(hasEnoughResources({ wood: 1, brick: 1 }, roadCost), true);
    assert.equal(hasEnoughResources({ wood: 0, brick: 1 }, roadCost), false);
    assert.equal(hasEnoughResources({ wood: 1, brick: 0 }, roadCost), false);
  });

  test("validates settlement cost correctly", () => {
    const settlementCost = BUILD_COSTS.BUILD_SETTLEMENT;
    assert.equal(hasEnoughResources({ wood: 1, brick: 1, sheep: 1, wheat: 1 }, settlementCost), true);
    assert.equal(hasEnoughResources({ wood: 1, brick: 1, sheep: 1, wheat: 0 }, settlementCost), false);
  });

  test("validates city cost correctly", () => {
    const cityCost = BUILD_COSTS.BUILD_CITY;
    assert.equal(hasEnoughResources({ wheat: 2, ore: 3 }, cityCost), true);
    assert.equal(hasEnoughResources({ wheat: 2, ore: 2 }, cityCost), false);
    assert.equal(hasEnoughResources({ wheat: 1, ore: 3 }, cityCost), false);
  });

  test("validates dev card cost correctly", () => {
    assert.equal(hasEnoughResources({ wheat: 1, sheep: 1, ore: 1 }, DEV_CARD_COST), true);
    assert.equal(hasEnoughResources({ wheat: 1, sheep: 1, ore: 0 }, DEV_CARD_COST), false);
  });
});

describe("gateAction", () => {
  function makeGame({ phase = "turn", subphase = "main", currentPlayerId = "A" } = {}) {
    return {
      phase,
      subphase,
      currentPlayerId,
      devDeckCount: 10,
      hints: {}
    };
  }

  function makeYou({ hand = {} } = {}) {
    return { hand };
  }

  test("returns BAD_PHASE for null game", () => {
    const result = gateAction({ game: null, playerId: "A", you: makeYou() }, { type: "ROLL_DICE" });
    assert.deepEqual(result, { code: "BAD_PHASE" });
  });

  test("returns BAD_PHASE for null playerId", () => {
    const result = gateAction({ game: makeGame(), playerId: null, you: makeYou() }, { type: "ROLL_DICE" });
    assert.deepEqual(result, { code: "BAD_PHASE" });
  });

  test("ROLL_DICE requires current player in needs_roll subphase", () => {
    const game = makeGame({ subphase: "needs_roll", currentPlayerId: "A" });

    // Correct player, correct phase
    assert.equal(gateAction({ game, playerId: "A", you: makeYou() }, { type: "ROLL_DICE" }), null);

    // Wrong player
    assert.deepEqual(gateAction({ game, playerId: "B", you: makeYou() }, { type: "ROLL_DICE" }), { code: "NOT_YOUR_TURN" });

    // Wrong phase
    const mainPhaseGame = makeGame({ subphase: "main", currentPlayerId: "A" });
    assert.deepEqual(gateAction({ game: mainPhaseGame, playerId: "A", you: makeYou() }, { type: "ROLL_DICE" }), {
      code: "BAD_PHASE"
    });
  });

  test("END_TURN requires current player in main subphase", () => {
    const game = makeGame({ subphase: "main", currentPlayerId: "A" });

    assert.equal(gateAction({ game, playerId: "A", you: makeYou() }, { type: "END_TURN" }), null);
    assert.deepEqual(gateAction({ game, playerId: "B", you: makeYou() }, { type: "END_TURN" }), { code: "NOT_YOUR_TURN" });
  });

  test("BUY_DEV_CARD requires resources and non-empty deck", () => {
    const game = makeGame({ subphase: "main", currentPlayerId: "A" });
    const richYou = makeYou({ hand: { wheat: 1, sheep: 1, ore: 1 } });
    const poorYou = makeYou({ hand: { wheat: 0, sheep: 0, ore: 0 } });

    // Has resources
    assert.equal(gateAction({ game, playerId: "A", you: richYou }, { type: "BUY_DEV_CARD" }), null);

    // Not enough resources
    assert.deepEqual(gateAction({ game, playerId: "A", you: poorYou }, { type: "BUY_DEV_CARD" }), {
      code: "NOT_ENOUGH_RESOURCES"
    });

    // Empty deck
    const emptyDeckGame = { ...game, devDeckCount: 0 };
    assert.deepEqual(gateAction({ game: emptyDeckGame, playerId: "A", you: richYou }, { type: "BUY_DEV_CARD" }), {
      code: "DEV_DECK_EMPTY"
    });
  });

  test("BUILD_ROAD requires resources", () => {
    const game = makeGame({ subphase: "main", currentPlayerId: "A" });
    const hasResources = makeYou({ hand: { wood: 1, brick: 1 } });
    const noResources = makeYou({ hand: { wood: 0, brick: 0 } });

    assert.equal(gateAction({ game, playerId: "A", you: hasResources }, { type: "BUILD_ROAD" }), null);
    assert.deepEqual(gateAction({ game, playerId: "A", you: noResources }, { type: "BUILD_ROAD" }), {
      code: "NOT_ENOUGH_RESOURCES"
    });
  });

  test("BUILD_ROAD with road_work event costs less wood", () => {
    const game = makeGame({ subphase: "main", currentPlayerId: "A" });
    game.currentEvent = { id: "road_work" };
    const onlyBrick = makeYou({ hand: { wood: 0, brick: 1 } });

    // With road_work, wood cost is 0
    assert.equal(gateAction({ game, playerId: "A", you: onlyBrick }, { type: "BUILD_ROAD" }), null);
  });

  test("BUILD_SETTLEMENT requires resources", () => {
    const game = makeGame({ subphase: "main", currentPlayerId: "A" });
    const hasResources = makeYou({ hand: { wood: 1, brick: 1, sheep: 1, wheat: 1 } });
    const noResources = makeYou({ hand: {} });

    assert.equal(gateAction({ game, playerId: "A", you: hasResources }, { type: "BUILD_SETTLEMENT" }), null);
    assert.deepEqual(gateAction({ game, playerId: "A", you: noResources }, { type: "BUILD_SETTLEMENT" }), {
      code: "NOT_ENOUGH_RESOURCES"
    });
  });

  test("BUILD_CITY requires resources", () => {
    const game = makeGame({ subphase: "main", currentPlayerId: "A" });
    const hasResources = makeYou({ hand: { wheat: 2, ore: 3 } });
    const noResources = makeYou({ hand: { wheat: 1, ore: 2 } });

    assert.equal(gateAction({ game, playerId: "A", you: hasResources }, { type: "BUILD_CITY" }), null);
    assert.deepEqual(gateAction({ game, playerId: "A", you: noResources }, { type: "BUILD_CITY" }), {
      code: "NOT_ENOUGH_RESOURCES"
    });
  });

  test("DISCARD_CARDS requires robber_discard subphase", () => {
    const game = makeGame({ subphase: "robber_discard", currentPlayerId: "B" });
    game.hints = {
      discardRequiredByPlayerId: { A: 4 },
      discardSubmittedByPlayerId: {}
    };

    // Player A needs to discard
    assert.equal(gateAction({ game, playerId: "A", you: makeYou() }, { type: "DISCARD_CARDS" }), null);

    // Player B doesn't need to discard
    assert.deepEqual(gateAction({ game, playerId: "B", you: makeYou() }, { type: "DISCARD_CARDS" }), {
      code: "NO_DISCARD_REQUIRED"
    });

    // Player A already discarded
    game.hints.discardSubmittedByPlayerId = { A: true };
    assert.deepEqual(gateAction({ game, playerId: "A", you: makeYou() }, { type: "DISCARD_CARDS" }), {
      code: "ALREADY_DISCARDED"
    });
  });

  test("MOVE_ROBBER requires robber_move subphase", () => {
    const game = makeGame({ subphase: "robber_move", currentPlayerId: "A" });

    assert.equal(gateAction({ game, playerId: "A", you: makeYou() }, { type: "MOVE_ROBBER" }), null);
    assert.deepEqual(gateAction({ game, playerId: "B", you: makeYou() }, { type: "MOVE_ROBBER" }), {
      code: "NOT_YOUR_TURN"
    });
  });

  test("STEAL_CARD requires robber_steal subphase", () => {
    const game = makeGame({ subphase: "robber_steal", currentPlayerId: "A" });

    assert.equal(gateAction({ game, playerId: "A", you: makeYou() }, { type: "STEAL_CARD" }), null);
    assert.deepEqual(gateAction({ game, playerId: "B", you: makeYou() }, { type: "STEAL_CARD" }), {
      code: "NOT_YOUR_TURN"
    });
  });

  test("PLACE_SETTLEMENT requires expected hint", () => {
    const game = makeGame({ phase: "setup", subphase: "setup", currentPlayerId: "A" });
    game.hints = { expected: "PLACE_SETTLEMENT" };

    assert.equal(gateAction({ game, playerId: "A", you: makeYou() }, { type: "PLACE_SETTLEMENT" }), null);

    game.hints.expected = "PLACE_ROAD";
    assert.deepEqual(gateAction({ game, playerId: "A", you: makeYou() }, { type: "PLACE_SETTLEMENT" }), {
      code: "BAD_PHASE"
    });
  });

  test("PLACE_ROAD requires expected hint", () => {
    const game = makeGame({ phase: "setup", subphase: "setup", currentPlayerId: "A" });
    game.hints = { expected: "PLACE_ROAD" };

    assert.equal(gateAction({ game, playerId: "A", you: makeYou() }, { type: "PLACE_ROAD" }), null);

    game.hints.expected = "PLACE_SETTLEMENT";
    assert.deepEqual(gateAction({ game, playerId: "A", you: makeYou() }, { type: "PLACE_ROAD" }), {
      code: "BAD_PHASE"
    });
  });

  test("returns null for unknown action type", () => {
    const game = makeGame({ subphase: "main", currentPlayerId: "A" });
    assert.equal(gateAction({ game, playerId: "A", you: makeYou() }, { type: "UNKNOWN_ACTION" }), null);
    assert.equal(gateAction({ game, playerId: "A", you: makeYou() }, { type: "" }), null);
  });
});
