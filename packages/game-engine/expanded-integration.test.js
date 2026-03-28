import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { createNewGame, applyAction } from "./index.js";
import { computeLongestRoadLengthsByPlayerId } from "./longest-road.js";

function findLegalSetupVertex(game) {
  const occupied = game.structures.settlements;
  for (const v of game.board.vertices) {
    if (occupied[v.id]) continue;
    const adjacentOccupied = v.neighborVertexIds.some((n) => !!occupied[n]);
    if (adjacentOccupied) continue;
    return v.id;
  }
  return null;
}

function findLegalSetupRoadEdge(game) {
  const last = game.setup.lastSettlementVertexId;
  if (!last) return null;
  const v = game.board.vertices.find((vv) => vv.id === last);
  if (!v) return null;
  for (const eId of v.edgeIds) {
    if (!game.structures.roads[eId]) return eId;
  }
  return null;
}

function completeSetup(game) {
  let g = game;
  const totalPlacements = g.setup.placementOrder.length;
  for (let i = 0; i < totalPlacements; i++) {
    const playerId = g.setup.placementOrder[g.setup.placementIndex];

    const vertexId = findLegalSetupVertex(g);
    assert.ok(vertexId, `placement ${i}: no legal vertex found`);

    const sResult = applyAction(g, { type: "PLACE_SETTLEMENT", vertexId }, playerId);
    assert.ok(!sResult.error, `placement ${i} settlement: ${JSON.stringify(sResult.error)}`);
    g = sResult.game;

    const edgeId = findLegalSetupRoadEdge(g);
    assert.ok(edgeId, `placement ${i}: no legal road edge found`);

    const rResult = applyAction(g, { type: "PLACE_ROAD", edgeId }, playerId);
    assert.ok(!rResult.error, `placement ${i} road: ${JSON.stringify(rResult.error)}`);
    g = rResult.game;
  }
  return g;
}

function findUnoccupiedEdgeChain(game, length, ownerId) {
  const edgeById = new Map(game.board.edges.map((e) => [e.id, e]));
  const occupiedEdges = new Set(Object.keys(game.structures.roads));

  // Vertices with opponent settlements block road continuity
  const blockedVertices = new Set();
  for (const [vId, s] of Object.entries(game.structures.settlements)) {
    if (s.playerId !== ownerId) blockedVertices.add(vId);
  }

  const vertexEdges = new Map();
  for (const e of game.board.edges) {
    if (occupiedEdges.has(e.id)) continue;
    if (!vertexEdges.has(e.vA)) vertexEdges.set(e.vA, []);
    vertexEdges.get(e.vA).push(e.id);
    if (!vertexEdges.has(e.vB)) vertexEdges.set(e.vB, []);
    vertexEdges.get(e.vB).push(e.id);
  }

  const used = new Set();
  function walk(vertex, depth) {
    if (depth >= length) return [];
    for (const eId of vertexEdges.get(vertex) || []) {
      if (used.has(eId)) continue;
      const e = edgeById.get(eId);
      const next = e.vA === vertex ? e.vB : e.vA;
      // Don't walk through opponent settlements
      if (blockedVertices.has(next) && depth + 1 < length) continue;
      used.add(eId);
      const rest = walk(next, depth + 1);
      if (rest !== null) return [eId, ...rest];
      used.delete(eId);
    }
    return null;
  }

  for (const v of game.board.vertices) {
    if (blockedVertices.has(v.id)) continue;
    const chain = walk(v.id, 0);
    if (chain && chain.length === length) return chain;
  }
  return null;
}

describe("5-player expanded board integration", () => {
  test("5-player setup: all 10 placements complete", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4", "p5"],
      presetId: "classic-balanced"
    });

    assert.equal(game.board.layout, "expanded-radius-3");
    assert.equal(game.phase, "setup_round_1");
    assert.equal(game.subphase, "setup_settlement");
    assert.equal(game.setup.placementOrder.length, 10);
    assert.deepEqual(game.setup.placementOrder, ["p1", "p2", "p3", "p4", "p5", "p5", "p4", "p3", "p2", "p1"]);

    const g = completeSetup(game);

    assert.equal(g.phase, "turn");
    assert.equal(g.subphase, "needs_roll");
    assert.equal(Object.keys(g.structures.settlements).length, 10);
    assert.equal(Object.keys(g.structures.roads).length, 10);

    // Each player should have exactly 2 settlements
    for (const pid of ["p1", "p2", "p3", "p4", "p5"]) {
      const count = Object.values(g.structures.settlements).filter((s) => s.playerId === pid).length;
      assert.equal(count, 2, `${pid} should have 2 settlements, got ${count}`);
    }

    // Each player should have exactly 2 roads
    for (const pid of ["p1", "p2", "p3", "p4", "p5"]) {
      const count = Object.values(g.structures.roads).filter((r) => r.playerId === pid).length;
      assert.equal(count, 2, `${pid} should have 2 roads, got ${count}`);
    }
  });

  test("longest road works on expanded board", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4", "p5"],
      presetId: "classic-balanced"
    });

    const g = completeSetup(game);

    // After setup, each player has 2 disconnected roads (1 per settlement),
    // so each player's longest road should be 1
    const lengths = computeLongestRoadLengthsByPlayerId(g);
    for (const pid of ["p1", "p2", "p3", "p4", "p5"]) {
      assert.equal(lengths[pid], 1, `${pid} should have longest road length 1 after setup, got ${lengths[pid]}`);
    }

    // Now manually inject a chain of 5 connected roads for p1
    const chainLength = 5;
    const chain = findUnoccupiedEdgeChain(g, chainLength, "p1");
    assert.ok(chain, `could not find a chain of ${chainLength} connected edges`);
    assert.equal(chain.length, chainLength);

    // Clear any existing roads on these edges (shouldn't conflict, but be safe)
    // and assign the chain to p1
    for (const eId of chain) {
      g.structures.roads[eId] = { playerId: "p1" };
    }

    const updatedLengths = computeLongestRoadLengthsByPlayerId(g);
    assert.ok(
      updatedLengths.p1 >= chainLength,
      `p1 should have longest road >= ${chainLength}, got ${updatedLengths.p1}`
    );

    // Other players should still have length 1
    for (const pid of ["p2", "p3", "p4", "p5"]) {
      assert.equal(updatedLengths[pid], 1, `${pid} should still have longest road 1, got ${updatedLengths[pid]}`);
    }
  });
});
