import assert from "node:assert/strict";
import test from "node:test";

import { PRESET_META, applyAction, createNewGame } from "./index.js";

function makeMainPhaseGame({ playerIds = ["A", "B"], currentPlayerId = "A" } = {}) {
  const presetId = PRESET_META[0]?.id ?? "classic-balanced";
  const game = createNewGame({ playerIds, presetId });
  game.phase = "turn";
  game.subphase = "main";
  game.currentPlayerIndex = Math.max(0, game.turnOrder.indexOf(currentPlayerId));
  return game;
}

test("BANK_TRADE: defaults to 4:1 when player has no port", () => {
  const game = makeMainPhaseGame({ playerIds: ["A"] });
  game.structures.settlements = {};

  assert.ok(applyAction(game, { type: "BANK_TRADE", give: { wood: 4 }, receive: { brick: 1 } }, "A").game);
  assert.deepEqual(applyAction(game, { type: "BANK_TRADE", give: { wood: 3 }, receive: { brick: 1 } }, "A"), {
    error: { code: "BAD_TRADE" }
  });
});

test("BANK_TRADE: generic port enables 3:1", () => {
  const game = makeMainPhaseGame({ playerIds: ["A"] });
  const genericPort = game.board.ports.find((p) => p.kind === "generic");
  assert.ok(genericPort?.vertexIds?.[0], "expected a generic port");
  game.structures.settlements[genericPort.vertexIds[0]] = { playerId: "A", kind: "settlement" };

  assert.ok(applyAction(game, { type: "BANK_TRADE", give: { sheep: 3 }, receive: { ore: 1 } }, "A").game);
  assert.deepEqual(applyAction(game, { type: "BANK_TRADE", give: { sheep: 4 }, receive: { ore: 1 } }, "A"), {
    error: { code: "BAD_TRADE" }
  });
});

test("BANK_TRADE: specific port enables 2:1 for that resource only", () => {
  const game = makeMainPhaseGame({ playerIds: ["A"] });
  const woodPort = game.board.ports.find((p) => p.kind === "wood");
  assert.ok(woodPort?.vertexIds?.[0], "expected a wood port");
  game.structures.settlements[woodPort.vertexIds[0]] = { playerId: "A", kind: "settlement" };

  assert.ok(applyAction(game, { type: "BANK_TRADE", give: { wood: 2 }, receive: { brick: 1 } }, "A").game);
  assert.deepEqual(applyAction(game, { type: "BANK_TRADE", give: { wood: 3 }, receive: { brick: 1 } }, "A"), {
    error: { code: "BAD_TRADE" }
  });

  assert.ok(applyAction(game, { type: "BANK_TRADE", give: { sheep: 4 }, receive: { ore: 1 } }, "A").game);
  assert.deepEqual(applyAction(game, { type: "BANK_TRADE", give: { sheep: 2 }, receive: { ore: 1 } }, "A"), {
    error: { code: "BAD_TRADE" }
  });
});

test("BANK_TRADE: uses best ratio across multiple ports", () => {
  const game = makeMainPhaseGame({ playerIds: ["A"] });
  const genericPort = game.board.ports.find((p) => p.kind === "generic");
  const woodPort = game.board.ports.find((p) => p.kind === "wood");
  assert.ok(genericPort?.vertexIds?.[0], "expected a generic port");
  assert.ok(woodPort?.vertexIds?.[0], "expected a wood port");
  game.structures.settlements[genericPort.vertexIds[0]] = { playerId: "A", kind: "settlement" };
  game.structures.settlements[woodPort.vertexIds[0]] = { playerId: "A", kind: "settlement" };

  assert.ok(applyAction(game, { type: "BANK_TRADE", give: { brick: 3 }, receive: { ore: 1 } }, "A").game);
  assert.ok(applyAction(game, { type: "BANK_TRADE", give: { wood: 2 }, receive: { sheep: 1 } }, "A").game);
  assert.deepEqual(applyAction(game, { type: "BANK_TRADE", give: { wood: 3 }, receive: { sheep: 1 } }, "A"), {
    error: { code: "BAD_TRADE" }
  });
});

test("BANK_TRADE: rejects when bank is empty for requested resource", () => {
  const game = makeMainPhaseGame({ playerIds: ["A"] });
  game.bank.ore = 0;
  assert.deepEqual(applyAction(game, { type: "BANK_TRADE", give: { wood: 4 }, receive: { ore: 1 } }, "A"), {
    error: { code: "BANK_EMPTY" }
  });
});
