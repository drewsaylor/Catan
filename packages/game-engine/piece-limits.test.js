import assert from "node:assert/strict";
import test from "node:test";

import { PRESET_META, applyAction, createNewGame } from "./index.js";

function makeGame({ playerIds = ["A", "B", "C"], currentPlayerId = "A", subphase = "main" } = {}) {
  const presetId = PRESET_META[0]?.id ?? "classic-balanced";
  const game = createNewGame({ playerIds, presetId });
  game.phase = "turn";
  game.subphase = subphase;
  game.currentPlayerIndex = Math.max(0, game.turnOrder.indexOf(currentPlayerId));
  return game;
}

test("BUILD_ROAD: rejects when out of road pieces", () => {
  const game = makeGame({ playerIds: ["A"], currentPlayerId: "A", subphase: "main" });
  const edges = game.board.edges.slice(0, 16);
  assert.ok(edges.length >= 16, "board must have >= 16 edges");

  game.structures.roads = Object.fromEntries(edges.slice(0, 15).map((e) => [e.id, { playerId: "A" }]));

  const res = applyAction(game, { type: "BUILD_ROAD", edgeId: edges[15].id }, "A");
  assert.deepEqual(res, { error: { code: "OUT_OF_PIECES_ROAD" } });
});

test("DEV_ROAD_BUILDING_PLACE_ROAD: rejects when out of road pieces", () => {
  const game = makeGame({ playerIds: ["A"], currentPlayerId: "A", subphase: "dev_road_building" });
  game.devRoadBuilding = { roadsRemaining: 2 };
  const edges = game.board.edges.slice(0, 16);
  assert.ok(edges.length >= 16, "board must have >= 16 edges");

  game.structures.roads = Object.fromEntries(edges.slice(0, 15).map((e) => [e.id, { playerId: "A" }]));

  const res = applyAction(game, { type: "DEV_ROAD_BUILDING_PLACE_ROAD", edgeId: edges[15].id }, "A");
  assert.deepEqual(res, { error: { code: "OUT_OF_PIECES_ROAD" } });
});

test("BUILD_SETTLEMENT: rejects when out of settlement pieces", () => {
  const game = makeGame({ playerIds: ["A"], currentPlayerId: "A", subphase: "main" });
  const vertices = game.board.vertices.slice(0, 6);
  assert.ok(vertices.length >= 6, "board must have >= 6 vertices");

  game.structures.settlements = Object.fromEntries(vertices.slice(0, 5).map((v) => [v.id, { playerId: "A", kind: "settlement" }]));

  const res = applyAction(game, { type: "BUILD_SETTLEMENT", vertexId: vertices[5].id }, "A");
  assert.deepEqual(res, { error: { code: "OUT_OF_PIECES_SETTLEMENT" } });
});

test("BUILD_CITY: rejects when out of city pieces", () => {
  const game = makeGame({ playerIds: ["A"], currentPlayerId: "A", subphase: "main" });
  const vertices = game.board.vertices.slice(0, 6);
  assert.ok(vertices.length >= 6, "board must have >= 6 vertices");

  game.structures.settlements = {
    [vertices[0].id]: { playerId: "A", kind: "city" },
    [vertices[1].id]: { playerId: "A", kind: "city" },
    [vertices[2].id]: { playerId: "A", kind: "city" },
    [vertices[3].id]: { playerId: "A", kind: "city" },
    [vertices[4].id]: { playerId: "A", kind: "settlement" }
  };

  const res = applyAction(game, { type: "BUILD_CITY", vertexId: vertices[4].id }, "A");
  assert.deepEqual(res, { error: { code: "OUT_OF_PIECES_CITY" } });
});

test("PLACE_SETTLEMENT (setup): rejects when out of settlement pieces", () => {
  const presetId = PRESET_META[0]?.id ?? "classic-balanced";
  const game = createNewGame({ playerIds: ["A"], presetId });
  game.phase = "setup_round_1";
  game.subphase = "setup_settlement";
  game.currentPlayerIndex = 0;

  const vertices = game.board.vertices.slice(0, 6);
  assert.ok(vertices.length >= 6, "board must have >= 6 vertices");

  game.structures.settlements = Object.fromEntries(vertices.slice(0, 5).map((v) => [v.id, { playerId: "A", kind: "settlement" }]));

  const res = applyAction(game, { type: "PLACE_SETTLEMENT", vertexId: vertices[5].id }, "A");
  assert.deepEqual(res, { error: { code: "OUT_OF_PIECES_SETTLEMENT" } });
});

test("PLACE_ROAD (setup): rejects when out of road pieces", () => {
  const presetId = PRESET_META[0]?.id ?? "classic-balanced";
  const game = createNewGame({ playerIds: ["A"], presetId });
  game.phase = "setup_round_1";
  game.subphase = "setup_road";
  game.currentPlayerIndex = 0;

  const edges = game.board.edges.slice(0, 16);
  assert.ok(edges.length >= 16, "board must have >= 16 edges");

  game.structures.roads = Object.fromEntries(edges.slice(0, 15).map((e) => [e.id, { playerId: "A" }]));

  const res = applyAction(game, { type: "PLACE_ROAD", edgeId: edges[15].id }, "A");
  assert.deepEqual(res, { error: { code: "OUT_OF_PIECES_ROAD" } });
});
