import assert from "node:assert/strict";
import test from "node:test";

import { computeLongestRoadAward, computeLongestRoadLengthsByPlayerId } from "./longest-road.js";

function makeGame({ turnOrder, edges, roads, settlements }) {
  return {
    turnOrder,
    board: { edges },
    structures: { roads, settlements }
  };
}

test("computeLongestRoadLengthsByPlayerId: line and branch", () => {
  const edgesLine = [
    { id: "E0", vA: "V0", vB: "V1" },
    { id: "E1", vA: "V1", vB: "V2" },
    { id: "E2", vA: "V2", vB: "V3" }
  ];
  const gameLine = makeGame({
    turnOrder: ["A"],
    edges: edgesLine,
    roads: { E0: { playerId: "A" }, E1: { playerId: "A" }, E2: { playerId: "A" } },
    settlements: {}
  });
  assert.deepEqual(computeLongestRoadLengthsByPlayerId(gameLine), { A: 3 });

  const edgesBranch = [
    { id: "E0", vA: "V0", vB: "V1" },
    { id: "E1", vA: "V1", vB: "V2" },
    { id: "E2", vA: "V1", vB: "V3" }
  ];
  const gameBranch = makeGame({
    turnOrder: ["A"],
    edges: edgesBranch,
    roads: { E0: { playerId: "A" }, E1: { playerId: "A" }, E2: { playerId: "A" } },
    settlements: {}
  });
  assert.deepEqual(computeLongestRoadLengthsByPlayerId(gameBranch), { A: 2 });
});

test("computeLongestRoadLengthsByPlayerId: cycles and blocking", () => {
  const edgesCycleTail = [
    { id: "E0", vA: "V0", vB: "V1" },
    { id: "E1", vA: "V1", vB: "V2" },
    { id: "E2", vA: "V2", vB: "V3" },
    { id: "E3", vA: "V3", vB: "V0" },
    { id: "E4", vA: "V0", vB: "V4" }
  ];
  const gameCycleTail = makeGame({
    turnOrder: ["A"],
    edges: edgesCycleTail,
    roads: { E0: { playerId: "A" }, E1: { playerId: "A" }, E2: { playerId: "A" }, E3: { playerId: "A" }, E4: { playerId: "A" } },
    settlements: {}
  });
  assert.deepEqual(computeLongestRoadLengthsByPlayerId(gameCycleTail), { A: 5 });

  const edgesBlockedLine = [
    { id: "E0", vA: "V0", vB: "V1" },
    { id: "E1", vA: "V1", vB: "V2" },
    { id: "E2", vA: "V2", vB: "V3" }
  ];
  const gameBlocked = makeGame({
    turnOrder: ["A", "B"],
    edges: edgesBlockedLine,
    roads: { E0: { playerId: "A" }, E1: { playerId: "A" }, E2: { playerId: "A" } },
    settlements: { V1: { playerId: "B", kind: "settlement" } }
  });
  assert.deepEqual(computeLongestRoadLengthsByPlayerId(gameBlocked), { A: 2, B: 0 });
});

test("computeLongestRoadAward: min length and ties", () => {
  const edges = [
    { id: "E0", vA: "V0", vB: "V1" },
    { id: "E1", vA: "V1", vB: "V2" },
    { id: "E2", vA: "V2", vB: "V3" },
    { id: "E3", vA: "V3", vB: "V4" },
    { id: "E4", vA: "V4", vB: "V5" },
    { id: "E5", vA: "W0", vB: "W1" },
    { id: "E6", vA: "W1", vB: "W2" },
    { id: "E7", vA: "W2", vB: "W3" },
    { id: "E8", vA: "W3", vB: "W4" },
    { id: "E9", vA: "W4", vB: "W5" }
  ];

  const tieAtFive = makeGame({
    turnOrder: ["A", "B"],
    edges,
    roads: {
      E0: { playerId: "A" },
      E1: { playerId: "A" },
      E2: { playerId: "A" },
      E3: { playerId: "A" },
      E4: { playerId: "A" },
      E5: { playerId: "B" },
      E6: { playerId: "B" },
      E7: { playerId: "B" },
      E8: { playerId: "B" },
      E9: { playerId: "B" }
    },
    settlements: {}
  });
  assert.equal(computeLongestRoadAward(tieAtFive).longestRoadPlayerId, null);

  const aWins = makeGame({
    turnOrder: ["A", "B"],
    edges,
    roads: {
      E0: { playerId: "A" },
      E1: { playerId: "A" },
      E2: { playerId: "A" },
      E3: { playerId: "A" },
      E4: { playerId: "A" },
      E5: { playerId: "B" },
      E6: { playerId: "B" },
      E7: { playerId: "B" },
      E8: { playerId: "B" }
    },
    settlements: {}
  });
  assert.equal(computeLongestRoadAward(aWins).longestRoadPlayerId, "A");
});

