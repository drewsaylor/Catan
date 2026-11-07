import assert from "node:assert/strict";
import test from "node:test";

import { formatRollGains, latestRollGains } from "../apps/server/public/shared/roll-gains.js";

const players = [
  { playerId: "a", name: "Ann" },
  { playerId: "b", name: "Ben" }
];

test("latestRollGains reads the bank entry right after the newest roll", () => {
  const log = [
    { type: "roll", message: "Rolled 5" },
    { type: "bank", data: { gains: { a: { ore: 9 } } } },
    { type: "roll", message: "Rolled 8" },
    { type: "bank", data: { gains: { b: { wood: 1 } } } },
    { type: "system", message: "Ended their turn." }
  ];
  assert.deepEqual(latestRollGains(log), { b: { wood: 1 } });
});

test("latestRollGains returns null when the newest roll paid nobody", () => {
  const log = [
    { type: "roll" },
    { type: "bank", data: { gains: { a: { ore: 1 } } } },
    { type: "roll" },
    { type: "bank", message: "No resources produced." }
  ];
  assert.equal(latestRollGains(log), null);
  assert.equal(latestRollGains(undefined), null);
});

test("formatRollGains names each player and skips zero counts", () => {
  const text = formatRollGains({ a: { ore: 2, wood: 0 }, b: { wood: 1, brick: 1 } }, players);
  assert.equal(text, "Ann +2 ore · Ben +1 wood, +1 brick");
  assert.equal(formatRollGains(null, players), "");
  assert.equal(formatRollGains({ a: { ore: 0 } }, players), "");
});
