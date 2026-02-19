import assert from "node:assert/strict";
import test from "node:test";

import { PRESET_META, applyAction, createNewGame, getPublicGameSnapshot } from "./index.js";

function makeMainPhaseGame({ playerIds = ["A", "B"], currentPlayerId = "A" } = {}) {
  const presetId = PRESET_META[0]?.id ?? "classic-balanced";
  const game = createNewGame({ playerIds, presetId });
  game.phase = "turn";
  game.subphase = "main";
  game.currentPlayerIndex = Math.max(0, game.turnOrder.indexOf(currentPlayerId));
  return game;
}

function findEdgePath(board, edgeCount) {
  const adjacency = new Map();
  for (const e of board.edges || []) {
    if (!e?.id || !e?.vA || !e?.vB) continue;
    if (!adjacency.has(e.vA)) adjacency.set(e.vA, []);
    if (!adjacency.has(e.vB)) adjacency.set(e.vB, []);
    adjacency.get(e.vA).push({ edgeId: e.id, to: e.vB });
    adjacency.get(e.vB).push({ edgeId: e.id, to: e.vA });
  }

  function dfs(vertexId, remaining, usedEdgeIds) {
    if (remaining <= 0) return [];
    const options = adjacency.get(vertexId) || [];
    for (const opt of options) {
      if (usedEdgeIds.has(opt.edgeId)) continue;
      usedEdgeIds.add(opt.edgeId);
      const tail = dfs(opt.to, remaining - 1, usedEdgeIds);
      if (tail) return [opt.edgeId, ...tail];
      usedEdgeIds.delete(opt.edgeId);
    }
    return null;
  }

  for (const startVertexId of adjacency.keys()) {
    const edgeIds = dfs(startVertexId, edgeCount, new Set());
    if (edgeIds) return { startVertexId, edgeIds };
  }
  return null;
}

test("createNewGame: supports houseRules.victoryPointsToWin override (6–15)", () => {
  const presetId = PRESET_META[0]?.id ?? "classic-balanced";
  const game = createNewGame({
    playerIds: ["A", "B"],
    presetId,
    gameMode: "classic",
    houseRules: { victoryPointsToWin: 6 }
  });
  assert.equal(game.victoryPointsToWin, 6);
  assert.deepEqual(game.settings, {
    gameMode: "classic",
    victoryPointsToWin: 6,
    houseRules: { victoryPointsToWin: 6 }
  });

  const snap = getPublicGameSnapshot(game);
  assert.equal(snap.settings?.victoryPointsToWin, 6);
});

test("BUILD_CITY: ends the game when current player reaches victoryPointsToWin", () => {
  const game = makeMainPhaseGame({ playerIds: ["A"], currentPlayerId: "A" });
  game.victoryPointsToWin = 2;
  const vertexId = game.board.vertices[0].id;
  game.structures.settlements[vertexId] = { playerId: "A", kind: "settlement" };

  const res = applyAction(game, { type: "BUILD_CITY", vertexId }, "A");
  assert.ok(res.game);
  assert.equal(res.game.phase, "game_over");
  assert.equal(res.game.subphase, "game_over");
  assert.equal(res.game.winnerPlayerId, "A");
});

test("Largest Army: ends the game when taking the award reaches victoryPointsToWin", () => {
  const game = makeMainPhaseGame({ playerIds: ["A", "B"], currentPlayerId: "A" });
  game.victoryPointsToWin = 4;
  const vertexId = game.board.vertices[0].id;
  game.structures.settlements[vertexId] = { playerId: "A", kind: "city" }; // 2 VP
  game.playedKnightsByPlayerId = { A: 2, B: 0 };
  game.awards = { ...(game.awards || {}), largestArmyPlayerId: null };

  const res = applyAction(game, { type: "PLAY_DEV_CARD", card: "knight" }, "A");
  assert.ok(res.game);
  assert.equal(res.game.phase, "game_over");
  assert.equal(res.game.subphase, "game_over");
  assert.equal(res.game.winnerPlayerId, "A");
  assert.equal(res.game.awards.largestArmyPlayerId, "A");

  const snap = getPublicGameSnapshot(res.game);
  assert.equal(snap.hints?.prompt, "Game over");
});

test("Longest Road: ends the game when taking the award reaches victoryPointsToWin", () => {
  const game = makeMainPhaseGame({ playerIds: ["A", "B"], currentPlayerId: "A" });
  game.victoryPointsToWin = 3;
  const path = findEdgePath(game.board, 5);
  assert.ok(path?.startVertexId && Array.isArray(path.edgeIds) && path.edgeIds.length === 5, "expected a 5-edge path");
  game.structures.settlements[path.startVertexId] = { playerId: "A", kind: "settlement" }; // 1 VP

  let state = game;
  for (const edgeId of path.edgeIds) {
    const res = applyAction(state, { type: "BUILD_ROAD", edgeId }, "A");
    assert.ok(res.game, `expected BUILD_ROAD to succeed for edgeId=${edgeId}`);
    state = res.game;
  }

  assert.equal(state.awards.longestRoadPlayerId, "A");
  assert.equal(state.phase, "game_over");
  assert.equal(state.subphase, "game_over");
  assert.equal(state.winnerPlayerId, "A");
});

test("Hidden VP interaction: victory point dev cards are drawn privately and do not change public VP", () => {
  const game = makeMainPhaseGame({ playerIds: ["A"], currentPlayerId: "A" });
  game.victoryPointsToWin = 10;

  const ids = game.board.vertices.slice(0, 5).map((v) => v.id);
  game.structures.settlements[ids[0]] = { playerId: "A", kind: "city" };
  game.structures.settlements[ids[1]] = { playerId: "A", kind: "city" };
  game.structures.settlements[ids[2]] = { playerId: "A", kind: "city" };
  game.structures.settlements[ids[3]] = { playerId: "A", kind: "city" };
  game.structures.settlements[ids[4]] = { playerId: "A", kind: "settlement" };

  const before = getPublicGameSnapshot(game);
  assert.equal(before.pointsByPlayerId.A, 9);
  assert.equal(before.phase, "turn");
  assert.equal(before.winnerPlayerId, null);

  game.devDeck = ["victory_point"];
  const res = applyAction(game, { type: "BUY_DEV_CARD" }, "A");
  assert.ok(res.game);
  assert.deepEqual(res.privateUpdates, [{ playerId: "A", devCardDraw: "victory_point" }]);
  assert.equal(res.game.phase, "turn");
  assert.equal(res.game.winnerPlayerId, null);

  const after = getPublicGameSnapshot(res.game);
  assert.equal(after.pointsByPlayerId.A, 9);
});

test("PLAY_DEV_CARD: victory_point cards are not playable", () => {
  const game = makeMainPhaseGame({ playerIds: ["A"], currentPlayerId: "A" });
  assert.deepEqual(applyAction(game, { type: "PLAY_DEV_CARD", card: "victory_point" }, "A"), {
    error: { code: "BAD_DEV_CARD" }
  });
});
