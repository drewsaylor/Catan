import assert from "node:assert/strict";
import test from "node:test";

import { PRESET_META, applyAction, createNewGame } from "./index.js";

function makeMainPhaseGame({ playerIds = ["A", "B", "C"], currentPlayerId = "A" } = {}) {
  const presetId = PRESET_META[0]?.id ?? "classic-balanced";
  const game = createNewGame({ playerIds, presetId });
  game.phase = "turn";
  game.subphase = "main";
  game.currentPlayerIndex = Math.max(0, game.turnOrder.indexOf(currentPlayerId));
  game.devCardPlayedThisTurn = false;
  game.devDiscard = [];
  game.devRoadBuilding = null;
  game.playedKnightsByPlayerId = Object.fromEntries(game.turnOrder.map((pid) => [pid, 0]));
  game.awards = { longestRoadPlayerId: null, longestRoadLength: 0, largestArmyPlayerId: null };
  return game;
}

test("BUY_DEV_CARD: draws from deck", () => {
  const game = makeMainPhaseGame({ playerIds: ["A", "B", "C"], currentPlayerId: "A" });
  game.devDeck = ["knight"];

  const result = applyAction(game, { type: "BUY_DEV_CARD" }, "A");
  assert.ok(result.game);
  assert.equal(result.game.devDeck.length, 0);
  assert.deepEqual(result.privateUpdates, [{ playerId: "A", devCardDraw: "knight" }]);
  assert.equal(result.game.devCardPlayedThisTurn, false);
});

test("PLAY_DEV_CARD: only one per turn", () => {
  const game = makeMainPhaseGame({ playerIds: ["A", "B"], currentPlayerId: "A" });

  const first = applyAction(game, { type: "PLAY_DEV_CARD", card: "year_of_plenty", take: { wood: 2 } }, "A");
  assert.ok(first.game);
  assert.equal(first.game.devCardPlayedThisTurn, true);

  const second = applyAction(first.game, { type: "PLAY_DEV_CARD", card: "knight" }, "A");
  assert.deepEqual(second, { error: { code: "ALREADY_PLAYED_DEV_CARD" } });
});

test("PLAY_DEV_CARD: Knight increments knights and awards Largest Army at 3", () => {
  const game = makeMainPhaseGame({ playerIds: ["A", "B"], currentPlayerId: "A" });
  game.playedKnightsByPlayerId = { A: 2, B: 0 };

  const result = applyAction(game, { type: "PLAY_DEV_CARD", card: "knight" }, "A");
  assert.ok(result.game);
  assert.equal(result.game.playedKnightsByPlayerId.A, 3);
  assert.equal(result.game.awards.largestArmyPlayerId, "A");
  assert.equal(result.game.subphase, "robber_move");
});

test("PLAY_DEV_CARD: Year of Plenty validates and updates bank", () => {
  const okGame = makeMainPhaseGame({ playerIds: ["A"], currentPlayerId: "A" });
  okGame.bank = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };

  const ok = applyAction(okGame, { type: "PLAY_DEV_CARD", card: "year_of_plenty", take: { wood: 2 } }, "A");
  assert.ok(ok.game);
  assert.equal(ok.game.bank.wood, 0);
  assert.deepEqual(ok.privateUpdates, [{ playerId: "A", handDelta: { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 } }]);

  const badTotal = makeMainPhaseGame({ playerIds: ["A"], currentPlayerId: "A" });
  badTotal.bank = { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 };
  assert.deepEqual(applyAction(badTotal, { type: "PLAY_DEV_CARD", card: "year_of_plenty", take: { wood: 1 } }, "A"), {
    error: { code: "BAD_DEV_SELECTION" }
  });

  const emptyBank = makeMainPhaseGame({ playerIds: ["A"], currentPlayerId: "A" });
  emptyBank.bank = { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  assert.deepEqual(applyAction(emptyBank, { type: "PLAY_DEV_CARD", card: "year_of_plenty", take: { wood: 2 } }, "A"), {
    error: { code: "BANK_EMPTY" }
  });
});

test("PLAY_DEV_CARD: Road Building places up to two roads", () => {
  const game = makeMainPhaseGame({ playerIds: ["A"], currentPlayerId: "A" });
  game.board = {
    edges: [
      { id: "E0", vA: "V0", vB: "V1" },
      { id: "E1", vA: "V1", vB: "V2" }
    ],
    vertices: [
      { id: "V0", edgeIds: ["E0"] },
      { id: "V1", edgeIds: ["E0", "E1"] },
      { id: "V2", edgeIds: ["E1"] }
    ]
  };
  game.structures = { roads: {}, settlements: { V0: { playerId: "A", kind: "settlement" } } };

  const play = applyAction(game, { type: "PLAY_DEV_CARD", card: "road_building" }, "A");
  assert.ok(play.game);
  assert.equal(play.game.subphase, "dev_road_building");
  assert.equal(play.game.devRoadBuilding?.roadsRemaining, 2);

  const r1 = applyAction(play.game, { type: "DEV_ROAD_BUILDING_PLACE_ROAD", edgeId: "E0" }, "A");
  assert.ok(r1.game);
  assert.ok(r1.game.structures.roads.E0);
  assert.equal(r1.game.devRoadBuilding?.roadsRemaining, 1);
  assert.equal(r1.game.subphase, "dev_road_building");

  const r2 = applyAction(r1.game, { type: "DEV_ROAD_BUILDING_PLACE_ROAD", edgeId: "E1" }, "A");
  assert.ok(r2.game);
  assert.ok(r2.game.structures.roads.E1);
  assert.equal(r2.game.subphase, "main");
  assert.equal(r2.game.devRoadBuilding, null);
});

