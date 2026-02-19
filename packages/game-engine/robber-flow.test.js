import assert from "node:assert/strict";
import test from "node:test";

import { PRESET_META, applyAction, createNewGame, getPublicGameSnapshot } from "./index.js";

function makeTurnGame({ playerIds = ["A", "B", "C"], currentPlayerId = "A", subphase = "needs_roll" } = {}) {
  const presetId = PRESET_META[0]?.id ?? "classic-balanced";
  const game = createNewGame({ playerIds, presetId });
  game.phase = "turn";
  game.subphase = subphase;
  game.currentPlayerIndex = Math.max(0, game.turnOrder.indexOf(currentPlayerId));
  return game;
}

test("ROLL_DICE (7): enters robber_move when no discards required + hints", () => {
  const game = makeTurnGame({ playerIds: ["A", "B"], currentPlayerId: "A", subphase: "needs_roll" });
  const beforeRobberHexId = game.robberHexId;

  const res = applyAction(game, { type: "ROLL_DICE", d1: 3, d2: 4 }, "A");
  assert.ok(res.game);
  assert.equal(res.game.subphase, "robber_move");
  assert.equal(res.game.robberHexId, beforeRobberHexId);
  assert.deepEqual(res.game.robber?.discardRequiredByPlayerId, {});
  assert.deepEqual(res.game.robber?.discardSubmittedByPlayerId, {});

  const snap = getPublicGameSnapshot(res.game);
  assert.equal(snap.hints?.expected, "MOVE_ROBBER");
  assert.equal(snap.hints?.prompt, "Move the robber");
  assert.ok(Array.isArray(snap.hints?.legalHexIds));
  assert.ok(!snap.hints.legalHexIds.includes(beforeRobberHexId));
});

test("ROLL_DICE (7): enters robber_discard when discards required + hints include discard state", () => {
  const game = makeTurnGame({ playerIds: ["A", "B", "C"], currentPlayerId: "A", subphase: "needs_roll" });

  const res = applyAction(
    game,
    { type: "ROLL_DICE", d1: 5, d2: 2, discardRequiredByPlayerId: { A: 0, B: 2, C: 3 } },
    "A"
  );
  assert.ok(res.game);
  assert.equal(res.game.subphase, "robber_discard");
  assert.deepEqual(res.game.robber?.discardRequiredByPlayerId, { B: 2, C: 3 });
  assert.deepEqual(res.game.robber?.discardSubmittedByPlayerId, {});

  const snap = getPublicGameSnapshot(res.game);
  assert.equal(snap.hints?.expected, "DISCARD_CARDS");
  assert.deepEqual(snap.hints?.discardRequiredByPlayerId, { B: 2, C: 3 });
  assert.deepEqual(snap.hints?.discardSubmittedByPlayerId, {});
});

test("DISCARD_CARDS: validates totals, tracks submissions, and advances to robber_move", () => {
  const start = makeTurnGame({ playerIds: ["A", "B"], currentPlayerId: "A", subphase: "needs_roll" });
  const rolled = applyAction(start, { type: "ROLL_DICE", d1: 6, d2: 1, discardRequiredByPlayerId: { B: 2 } }, "A");
  assert.ok(rolled.game);
  assert.equal(rolled.game.subphase, "robber_discard");

  assert.deepEqual(applyAction(rolled.game, { type: "DISCARD_CARDS", counts: { wood: 2 } }, "A"), {
    error: { code: "NO_DISCARD_REQUIRED" }
  });

  assert.deepEqual(applyAction(rolled.game, { type: "DISCARD_CARDS", counts: { wood: 1 } }, "B"), {
    error: { code: "BAD_DISCARD" }
  });

  const discarded = applyAction(rolled.game, { type: "DISCARD_CARDS", counts: { wood: 2 } }, "B");
  assert.ok(discarded.game);
  assert.equal(discarded.game.subphase, "robber_move");
  assert.deepEqual(discarded.game.robber?.discardSubmittedByPlayerId, { B: true });

  const snap = getPublicGameSnapshot(discarded.game);
  assert.equal(snap.hints?.expected, "MOVE_ROBBER");
});

test("MOVE_ROBBER: transitions to robber_steal when victims exist + hints include legal victims", () => {
  const start = makeTurnGame({ playerIds: ["A", "B"], currentPlayerId: "A", subphase: "needs_roll" });
  const rolled = applyAction(start, { type: "ROLL_DICE", d1: 4, d2: 3 }, "A");
  assert.ok(rolled.game);
  assert.equal(rolled.game.subphase, "robber_move");

  const targetHex = rolled.game.board.hexes.find(
    (h) => h.id && h.id !== rolled.game.robberHexId && Array.isArray(h.cornerVertexIds) && h.cornerVertexIds.length
  );
  assert.ok(targetHex?.id, "expected a non-current hex");
  const victimVertexId = targetHex.cornerVertexIds[0];
  rolled.game.structures.settlements[victimVertexId] = { playerId: "B", kind: "settlement" };

  const moved = applyAction(rolled.game, { type: "MOVE_ROBBER", hexId: targetHex.id }, "A");
  assert.ok(moved.game);
  assert.equal(moved.game.subphase, "robber_steal");
  assert.deepEqual(new Set(moved.game.robber?.eligibleVictimPlayerIds || []), new Set(["B"]));

  const snap = getPublicGameSnapshot(moved.game);
  assert.equal(snap.hints?.expected, "STEAL_CARD");
  assert.deepEqual(new Set(snap.hints?.legalVictimPlayerIds || []), new Set(["B"]));
});

test("MOVE_ROBBER: transitions to main and clears robber when no victims exist", () => {
  const start = makeTurnGame({ playerIds: ["A", "B"], currentPlayerId: "A", subphase: "needs_roll" });
  const rolled = applyAction(start, { type: "ROLL_DICE", d1: 4, d2: 3 }, "A");
  assert.ok(rolled.game);
  assert.equal(rolled.game.subphase, "robber_move");

  const targetHex = rolled.game.board.hexes.find((h) => h.id && h.id !== rolled.game.robberHexId);
  assert.ok(targetHex?.id, "expected a non-current hex");

  const moved = applyAction(rolled.game, { type: "MOVE_ROBBER", hexId: targetHex.id }, "A");
  assert.ok(moved.game);
  assert.equal(moved.game.subphase, "main");
  assert.equal(moved.game.robber, null);
});

test("STEAL_CARD: validates victim and returns to main", () => {
  const start = makeTurnGame({ playerIds: ["A", "B"], currentPlayerId: "A", subphase: "needs_roll" });
  const rolled = applyAction(start, { type: "ROLL_DICE", d1: 4, d2: 3 }, "A");
  assert.ok(rolled.game);
  assert.equal(rolled.game.subphase, "robber_move");

  const targetHex = rolled.game.board.hexes.find(
    (h) => h.id && h.id !== rolled.game.robberHexId && Array.isArray(h.cornerVertexIds) && h.cornerVertexIds.length
  );
  assert.ok(targetHex?.id, "expected a non-current hex");
  rolled.game.structures.settlements[targetHex.cornerVertexIds[0]] = { playerId: "B", kind: "settlement" };

  const moved = applyAction(rolled.game, { type: "MOVE_ROBBER", hexId: targetHex.id }, "A");
  assert.ok(moved.game);
  assert.equal(moved.game.subphase, "robber_steal");

  assert.deepEqual(applyAction(moved.game, { type: "STEAL_CARD", fromPlayerId: "A" }, "A"), {
    error: { code: "ILLEGAL_TARGET" }
  });

  const stole = applyAction(moved.game, { type: "STEAL_CARD", fromPlayerId: "B", didSteal: false }, "A");
  assert.ok(stole.game);
  assert.equal(stole.game.subphase, "main");
  assert.equal(stole.game.robber, null);
});
