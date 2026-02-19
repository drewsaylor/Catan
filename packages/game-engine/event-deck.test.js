/**
 * Event Deck Tests
 *
 * Tests for event deck creation, drawing, and effect calculations.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  EVENT_TYPES,
  EVENT_IDS,
  createEventDeck,
  getEventById,
  drawEvent,
  shouldDrawEvent,
  applyMarketBoomRatios,
  applyRoadWorkCost,
  findMostCommonResource,
  calculateHarvestFestivalBonuses
} from "./event-deck.js";

describe("EVENT_TYPES and EVENT_IDS", () => {
  test("EVENT_TYPES has expected events", () => {
    assert.ok(EVENT_TYPES.length >= 4);
    const ids = EVENT_TYPES.map((e) => e.id);
    assert.ok(ids.includes("market_boom"));
    assert.ok(ids.includes("road_work"));
    assert.ok(ids.includes("harvest_festival"));
    assert.ok(ids.includes("merchant_ships"));
  });

  test("EVENT_IDS matches EVENT_TYPES ids", () => {
    assert.deepEqual(EVENT_IDS, EVENT_TYPES.map((e) => e.id));
  });

  test("each event has required fields", () => {
    for (const event of EVENT_TYPES) {
      assert.ok(typeof event.id === "string" && event.id.length > 0, `Event missing id`);
      assert.ok(typeof event.name === "string" && event.name.length > 0, `Event ${event.id} missing name`);
      assert.ok(typeof event.description === "string" && event.description.length > 0, `Event ${event.id} missing description`);
      assert.ok(typeof event.shortText === "string" && event.shortText.length > 0, `Event ${event.id} missing shortText`);
    }
  });
});

describe("createEventDeck", () => {
  test("throws without rng function", () => {
    assert.throws(() => createEventDeck(), /rng function is required/);
    assert.throws(() => createEventDeck({}), /rng function is required/);
    assert.throws(() => createEventDeck({ rng: "not a function" }), /rng function is required/);
  });

  test("creates deck with default 2 copies of each event", () => {
    const mockRng = () => 0.5;
    const deck = createEventDeck({ rng: mockRng });

    assert.equal(deck.length, EVENT_TYPES.length * 2);

    // Count occurrences of each event
    const counts = {};
    for (const id of deck) {
      counts[id] = (counts[id] || 0) + 1;
    }
    for (const id of EVENT_IDS) {
      assert.equal(counts[id], 2, `Expected 2 copies of ${id}`);
    }
  });

  test("creates deck with custom copies count", () => {
    const mockRng = () => 0.5;
    const deck = createEventDeck({ rng: mockRng, copies: 3 });

    assert.equal(deck.length, EVENT_TYPES.length * 3);
  });

  test("creates deck with 1 copy", () => {
    const mockRng = () => 0.5;
    const deck = createEventDeck({ rng: mockRng, copies: 1 });

    assert.equal(deck.length, EVENT_TYPES.length);
  });

  test("deck is shuffled (deterministic with seed)", () => {
    let callCount = 0;
    const deterministicRng = () => {
      callCount++;
      // Return predictable values
      return (callCount * 0.1) % 1;
    };

    const deck1 = createEventDeck({ rng: deterministicRng });

    callCount = 0;
    const deck2 = createEventDeck({ rng: deterministicRng });

    // Same RNG should produce same deck
    assert.deepEqual(deck1, deck2);
  });

  test("deck contains only valid event IDs", () => {
    const mockRng = () => Math.random();
    const deck = createEventDeck({ rng: mockRng });

    for (const id of deck) {
      assert.ok(EVENT_IDS.includes(id), `Invalid event ID: ${id}`);
    }
  });
});

describe("getEventById", () => {
  test("returns event for valid ID", () => {
    const event = getEventById("market_boom");
    assert.ok(event);
    assert.equal(event.id, "market_boom");
    assert.equal(event.name, "Market Boom");
  });

  test("returns null for invalid ID", () => {
    assert.equal(getEventById("invalid_id"), null);
    assert.equal(getEventById(""), null);
    assert.equal(getEventById(null), null);
    assert.equal(getEventById(undefined), null);
  });

  test("returns correct event for each ID", () => {
    for (const expectedEvent of EVENT_TYPES) {
      const event = getEventById(expectedEvent.id);
      assert.deepEqual(event, expectedEvent);
    }
  });
});

describe("drawEvent", () => {
  test("draws from end of deck", () => {
    const deck = ["event1", "event2", "event3"];
    const result = drawEvent(deck);

    assert.equal(result.eventId, "event3");
    assert.deepEqual(result.deck, ["event1", "event2"]);
  });

  test("does not mutate original deck", () => {
    const deck = ["event1", "event2", "event3"];
    const originalDeck = [...deck];
    drawEvent(deck);

    assert.deepEqual(deck, originalDeck);
  });

  test("handles single-element deck", () => {
    const deck = ["only_event"];
    const result = drawEvent(deck);

    assert.equal(result.eventId, "only_event");
    assert.deepEqual(result.deck, []);
  });

  test("handles empty deck", () => {
    const result = drawEvent([]);

    assert.equal(result.eventId, null);
    assert.deepEqual(result.deck, []);
  });

  test("handles null/undefined deck", () => {
    assert.deepEqual(drawEvent(null), { eventId: null, deck: [] });
    assert.deepEqual(drawEvent(undefined), { eventId: null, deck: [] });
  });

  test("handles non-array deck", () => {
    assert.deepEqual(drawEvent("not an array"), { eventId: null, deck: [] });
    assert.deepEqual(drawEvent(123), { eventId: null, deck: [] });
  });
});

describe("shouldDrawEvent", () => {
  test("draws on turn 1", () => {
    assert.equal(shouldDrawEvent(1, 3), true);
  });

  test("draws every N turns after turn 1", () => {
    // With everyNTurns=3: draw on turns 1, 4, 7, 10, ...
    assert.equal(shouldDrawEvent(1, 3), true);
    assert.equal(shouldDrawEvent(2, 3), false);
    assert.equal(shouldDrawEvent(3, 3), false);
    assert.equal(shouldDrawEvent(4, 3), true);
    assert.equal(shouldDrawEvent(5, 3), false);
    assert.equal(shouldDrawEvent(6, 3), false);
    assert.equal(shouldDrawEvent(7, 3), true);
  });

  test("works with different intervals", () => {
    // Every 2 turns: 1, 3, 5, 7, ...
    assert.equal(shouldDrawEvent(1, 2), true);
    assert.equal(shouldDrawEvent(2, 2), false);
    assert.equal(shouldDrawEvent(3, 2), true);
    assert.equal(shouldDrawEvent(4, 2), false);

    // Every 5 turns: 1, 6, 11, ...
    assert.equal(shouldDrawEvent(1, 5), true);
    assert.equal(shouldDrawEvent(5, 5), false);
    assert.equal(shouldDrawEvent(6, 5), true);
  });

  test("returns false for turn 0 or negative", () => {
    assert.equal(shouldDrawEvent(0, 3), false);
    assert.equal(shouldDrawEvent(-1, 3), false);
    assert.equal(shouldDrawEvent(-100, 3), false);
  });

  test("uses default interval of 3", () => {
    assert.equal(shouldDrawEvent(1), true);
    assert.equal(shouldDrawEvent(2), false);
    assert.equal(shouldDrawEvent(3), false);
    assert.equal(shouldDrawEvent(4), true);
  });
});

describe("applyMarketBoomRatios", () => {
  test("caps all ratios at 3", () => {
    const baseRatios = { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 };
    const result = applyMarketBoomRatios(baseRatios);

    assert.deepEqual(result, { wood: 3, brick: 3, sheep: 3, wheat: 3, ore: 3 });
  });

  test("preserves ratios already at or below 3", () => {
    const baseRatios = { wood: 2, brick: 3, sheep: 4, wheat: 2, ore: 3 };
    const result = applyMarketBoomRatios(baseRatios);

    assert.deepEqual(result, { wood: 2, brick: 3, sheep: 3, wheat: 2, ore: 3 });
  });

  test("handles empty object", () => {
    const result = applyMarketBoomRatios({});
    assert.deepEqual(result, {});
  });

  test("handles mixed resources", () => {
    const baseRatios = { wood: 2, brick: 4 };
    const result = applyMarketBoomRatios(baseRatios);

    assert.equal(result.wood, 2); // Already below 3
    assert.equal(result.brick, 3); // Capped at 3
  });
});

describe("applyRoadWorkCost", () => {
  test("reduces wood cost by 1", () => {
    const baseCost = { wood: 1, brick: 1 };
    const result = applyRoadWorkCost(baseCost);

    assert.deepEqual(result, { wood: 0, brick: 1 });
  });

  test("wood cannot go below 0", () => {
    const baseCost = { wood: 0, brick: 1 };
    const result = applyRoadWorkCost(baseCost);

    assert.deepEqual(result, { wood: 0, brick: 1 });
  });

  test("does not affect other resources", () => {
    const baseCost = { wood: 2, brick: 3, sheep: 1 };
    const result = applyRoadWorkCost(baseCost);

    assert.equal(result.wood, 1);
    assert.equal(result.brick, 3);
    assert.equal(result.sheep, 1);
  });

  test("handles cost without wood", () => {
    const baseCost = { brick: 1, sheep: 1 };
    const result = applyRoadWorkCost(baseCost);

    assert.deepEqual(result, { brick: 1, sheep: 1 });
  });

  test("does not mutate original", () => {
    const baseCost = { wood: 1, brick: 1 };
    const originalCost = { ...baseCost };
    applyRoadWorkCost(baseCost);

    assert.deepEqual(baseCost, originalCost);
  });
});

describe("findMostCommonResource", () => {
  test("returns most common resource", () => {
    assert.equal(findMostCommonResource({ wood: 5, brick: 3, sheep: 1 }), "wood");
    assert.equal(findMostCommonResource({ wood: 1, brick: 3, sheep: 5 }), "sheep");
  });

  test("returns first resource in case of tie", () => {
    // Resources are checked in order: wood, brick, sheep, wheat, ore
    const result = findMostCommonResource({ wood: 3, brick: 3, sheep: 3 });
    assert.equal(result, "wood"); // First checked
  });

  test("returns null for empty hand", () => {
    assert.equal(findMostCommonResource({}), null);
    assert.equal(findMostCommonResource({ wood: 0, brick: 0 }), null);
  });

  test("returns null for null/undefined", () => {
    assert.equal(findMostCommonResource(null), null);
    assert.equal(findMostCommonResource(undefined), null);
  });

  test("returns null for non-object", () => {
    assert.equal(findMostCommonResource("string"), null);
    assert.equal(findMostCommonResource(123), null);
  });

  test("handles negative values", () => {
    assert.equal(findMostCommonResource({ wood: -1, brick: 1 }), "brick");
  });

  test("handles fractional values by flooring", () => {
    assert.equal(findMostCommonResource({ wood: 1.9, brick: 2.1 }), "brick");
  });
});

describe("calculateHarvestFestivalBonuses", () => {
  test("calculates bonus for each player based on most common resource", () => {
    const privateByPlayerId = {
      A: { hand: { wood: 5, brick: 2 } },
      B: { hand: { sheep: 3, wheat: 1 } },
      C: { hand: { ore: 4, wood: 2 } }
    };

    const bonuses = calculateHarvestFestivalBonuses(privateByPlayerId);

    assert.deepEqual(bonuses.A, { resourceType: "wood", count: 1 });
    assert.deepEqual(bonuses.B, { resourceType: "sheep", count: 1 });
    assert.deepEqual(bonuses.C, { resourceType: "ore", count: 1 });
  });

  test("returns null for players with empty hands", () => {
    const privateByPlayerId = {
      A: { hand: { wood: 3 } },
      B: { hand: {} }
    };

    const bonuses = calculateHarvestFestivalBonuses(privateByPlayerId);

    assert.deepEqual(bonuses.A, { resourceType: "wood", count: 1 });
    assert.equal(bonuses.B, null);
  });

  test("handles Map input", () => {
    const privateByPlayerId = new Map([
      ["A", { hand: { wheat: 4 } }],
      ["B", { hand: { ore: 2 } }]
    ]);

    const bonuses = calculateHarvestFestivalBonuses(privateByPlayerId);

    assert.deepEqual(bonuses.A, { resourceType: "wheat", count: 1 });
    assert.deepEqual(bonuses.B, { resourceType: "ore", count: 1 });
  });

  test("handles null/undefined privateByPlayerId", () => {
    assert.deepEqual(calculateHarvestFestivalBonuses(null), {});
    assert.deepEqual(calculateHarvestFestivalBonuses(undefined), {});
  });

  test("handles player without hand property", () => {
    const privateByPlayerId = {
      A: { hand: { wood: 1 } },
      B: {} // No hand
    };

    const bonuses = calculateHarvestFestivalBonuses(privateByPlayerId);

    assert.deepEqual(bonuses.A, { resourceType: "wood", count: 1 });
    assert.equal(bonuses.B, null);
  });
});
