import assert from "node:assert/strict";
import test from "node:test";

import { PRESET_META, applyAction, createNewGame } from "./index.js";

function makeMainPhaseGame({ playerIds = ["A", "B", "C"], currentPlayerId = "A" } = {}) {
  const presetId = PRESET_META[0]?.id ?? "classic-balanced";
  const game = createNewGame({ playerIds, presetId });
  game.phase = "turn";
  game.subphase = "main";
  game.currentPlayerIndex = Math.max(0, game.turnOrder.indexOf(currentPlayerId));
  return game;
}

test("TRADE_OFFER_CREATE: validates recipient and resource shapes", () => {
  const game = makeMainPhaseGame({ playerIds: ["A", "B"], currentPlayerId: "A" });

  assert.deepEqual(applyAction(game, { type: "TRADE_OFFER_CREATE", to: "A", give: { wood: 1 }, want: { brick: 1 } }, "A"), {
    error: { code: "BAD_TRADE_TO" }
  });
  assert.deepEqual(applyAction(game, { type: "TRADE_OFFER_CREATE", to: "Z", give: { wood: 1 }, want: { brick: 1 } }, "A"), {
    error: { code: "BAD_TRADE_TO" }
  });
  assert.deepEqual(applyAction(game, { type: "TRADE_OFFER_CREATE", to: "B", give: {}, want: { brick: 1 } }, "A"), { error: { code: "BAD_TRADE" } });
  assert.deepEqual(applyAction(game, { type: "TRADE_OFFER_CREATE", to: "B", give: { wood: 1 }, want: {} }, "A"), { error: { code: "BAD_TRADE" } });

  const ok = applyAction(game, { type: "TRADE_OFFER_CREATE", to: "B", give: { wood: 1 }, want: { brick: 1 } }, "A");
  assert.ok(ok.game);
  assert.equal(ok.game.tradeOffers.length, 1);
  assert.equal(ok.game.tradeOffers[0].fromPlayerId, "A");
  assert.equal(ok.game.tradeOffers[0].to, "B");
  assert.equal(ok.game.tradeOffers[0].status, "open");
});

test("TRADE_OFFER_CANCEL: only owner can cancel an open offer", () => {
  const game = makeMainPhaseGame({ playerIds: ["A", "B"], currentPlayerId: "A" });
  const created = applyAction(game, { type: "TRADE_OFFER_CREATE", to: "B", give: { wood: 1 }, want: { brick: 1 } }, "A");
  assert.ok(created.game);
  const offerId = created.game.tradeOffers[0].id;

  assert.deepEqual(applyAction(created.game, { type: "TRADE_OFFER_CANCEL", offerId }, "B"), { error: { code: "NOT_YOUR_TURN" } });

  const cancelled = applyAction(created.game, { type: "TRADE_OFFER_CANCEL", offerId }, "A");
  assert.ok(cancelled.game);
  assert.equal(cancelled.game.tradeOffers[0].status, "cancelled");

  assert.deepEqual(applyAction(cancelled.game, { type: "TRADE_OFFER_CANCEL", offerId }, "A"), { error: { code: "OFFER_CLOSED" } });
  assert.deepEqual(applyAction(cancelled.game, { type: "TRADE_OFFER_CANCEL", offerId: "nope" }, "A"), { error: { code: "NO_SUCH_OFFER" } });
});

test("TRADE_OFFER_RESPOND: enforces targeting and closes offers correctly", () => {
  const game = makeMainPhaseGame({ playerIds: ["A", "B", "C"], currentPlayerId: "A" });
  const created = applyAction(game, { type: "TRADE_OFFER_CREATE", to: "B", give: { wood: 1 }, want: { brick: 1 } }, "A");
  assert.ok(created.game);
  const offerId = created.game.tradeOffers[0].id;

  assert.deepEqual(applyAction(created.game, { type: "TRADE_OFFER_RESPOND", offerId, response: "accept" }, "A"), {
    error: { code: "CANNOT_ACCEPT_OWN_OFFER" }
  });
  assert.deepEqual(applyAction(created.game, { type: "TRADE_OFFER_RESPOND", offerId, response: "accept" }, "C"), { error: { code: "NOT_FOR_YOU" } });

  const rejected = applyAction(created.game, { type: "TRADE_OFFER_RESPOND", offerId, response: "reject" }, "B");
  assert.ok(rejected.game);
  assert.equal(rejected.game.tradeOffers[0].status, "rejected");

  assert.deepEqual(applyAction(rejected.game, { type: "TRADE_OFFER_RESPOND", offerId, response: "accept" }, "B"), { error: { code: "OFFER_CLOSED" } });
});

test("TRADE_OFFER_RESPOND: global offers close only after everyone rejects", () => {
  const game = makeMainPhaseGame({ playerIds: ["A", "B", "C"], currentPlayerId: "A" });
  const created = applyAction(game, { type: "TRADE_OFFER_CREATE", to: "all", give: { wood: 1 }, want: { brick: 1 } }, "A");
  assert.ok(created.game);
  const offerId = created.game.tradeOffers[0].id;

  const bReject = applyAction(created.game, { type: "TRADE_OFFER_RESPOND", offerId, response: "reject" }, "B");
  assert.ok(bReject.game);
  assert.equal(bReject.game.tradeOffers[0].status, "open");
  assert.deepEqual(applyAction(bReject.game, { type: "TRADE_OFFER_RESPOND", offerId, response: "reject" }, "B"), { error: { code: "ALREADY_REJECTED" } });

  const cReject = applyAction(bReject.game, { type: "TRADE_OFFER_RESPOND", offerId, response: "reject" }, "C");
  assert.ok(cReject.game);
  assert.equal(cReject.game.tradeOffers[0].status, "rejected");
});

test("END_TURN: expires only the current player's open offers", () => {
  const game = makeMainPhaseGame({ playerIds: ["A", "B"], currentPlayerId: "A" });
  const created = applyAction(game, { type: "TRADE_OFFER_CREATE", to: "B", give: { wood: 1 }, want: { brick: 1 } }, "A");
  assert.ok(created.game);

  const accepted = applyAction(created.game, { type: "TRADE_OFFER_RESPOND", offerId: created.game.tradeOffers[0].id, response: "accept" }, "B");
  assert.ok(accepted.game);
  assert.equal(accepted.game.tradeOffers[0].status, "accepted");

  const created2 = applyAction(accepted.game, { type: "TRADE_OFFER_CREATE", to: "all", give: { sheep: 1 }, want: { ore: 1 } }, "A");
  assert.ok(created2.game);
  assert.equal(created2.game.tradeOffers.length, 2);
  assert.equal(created2.game.tradeOffers[1].status, "open");

  const ended = applyAction(created2.game, { type: "END_TURN" }, "A");
  assert.ok(ended.game);
  assert.equal(ended.game.subphase, "needs_roll");
  assert.equal(ended.game.currentPlayerIndex, 1);
  assert.equal(ended.game.tradeOffers[0].status, "accepted");
  assert.equal(ended.game.tradeOffers[1].status, "expired");
});
