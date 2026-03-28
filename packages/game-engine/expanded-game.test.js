import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { createNewGame } from "./index.js";

describe("createNewGame expanded board", () => {
  test("5 players get expanded board", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4", "p5"],
      presetId: "classic-balanced"
    });
    assert.equal(game.board.layout, "expanded-radius-3");
    assert.equal(game.board.hexes.length, 37);
  });

  test("6 players get expanded board", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4", "p5", "p6"],
      presetId: "classic-balanced"
    });
    assert.equal(game.board.layout, "expanded-radius-3");
  });

  test("4 players get standard board", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4"],
      presetId: "classic-balanced"
    });
    assert.equal(game.board.layout, "standard-radius-2");
    assert.equal(game.board.hexes.length, 19);
  });

  test("3 players get standard board", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3"],
      presetId: "classic-balanced"
    });
    assert.equal(game.board.layout, "standard-radius-2");
  });

  test("5 players with random-balanced get expanded board", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4", "p5"],
      presetId: "random-balanced",
      boardSeed: "test-seed"
    });
    assert.equal(game.board.layout, "expanded-radius-3");
    assert.equal(game.board.hexes.length, 37);
  });

  test("setup placement order is correct for 5 players", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4", "p5"],
      presetId: "classic-balanced"
    });
    assert.deepEqual(
      game.setup.placementOrder,
      ["p1", "p2", "p3", "p4", "p5", "p5", "p4", "p3", "p2", "p1"]
    );
  });

  test("expanded board has 11 ports", () => {
    const game = createNewGame({
      playerIds: ["p1", "p2", "p3", "p4", "p5"],
      presetId: "classic-balanced"
    });
    assert.equal(game.board.ports.length, 11);
  });
});
