/**
 * Event Deck System for Party Variants
 *
 * Events are drawn at the start of certain turns and apply effects for that turn.
 * Events are server-authoritative and affect game rules temporarily.
 */

// Event definitions - keep simple and unambiguous
export const EVENT_TYPES = [
  {
    id: "market_boom",
    name: "Market Boom",
    description: "Bank trades are 3:1 this turn (all players).",
    shortText: "3:1 bank trades"
  },
  {
    id: "road_work",
    name: "Road Work",
    description: "Roads cost 1 less wood this turn.",
    shortText: "Cheaper roads"
  },
  {
    id: "harvest_festival",
    name: "Harvest Festival",
    description: "Each player gets +1 of their most common resource.",
    shortText: "+1 top resource"
  },
  {
    id: "merchant_ships",
    name: "Merchant Ships",
    description: "Ports give +1 bonus resource on trades this turn.",
    shortText: "Port bonus"
  }
];

export const EVENT_IDS = EVENT_TYPES.map((e) => e.id);

/**
 * Create a shuffled event deck using seeded randomness.
 * @param {object} options
 * @param {Function} options.rng - Random number generator (returns 0-1)
 * @param {number} options.copies - Number of copies of each event (default 2)
 * @returns {string[]} - Array of event IDs
 */
export function createEventDeck({ rng, copies = 2 } = {}) {
  if (typeof rng !== "function") {
    throw new Error("rng function is required for deterministic event deck");
  }

  const deck = [];
  for (let i = 0; i < copies; i++) {
    for (const event of EVENT_TYPES) {
      deck.push(event.id);
    }
  }

  // Fisher-Yates shuffle with provided RNG
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

/**
 * Get event metadata by ID.
 * @param {string} eventId
 * @returns {object|null}
 */
export function getEventById(eventId) {
  return EVENT_TYPES.find((e) => e.id === eventId) || null;
}

/**
 * Draw an event from the deck. Returns the event ID and the updated deck.
 * @param {string[]} deck - Current event deck
 * @returns {{ eventId: string|null, deck: string[] }}
 */
export function drawEvent(deck) {
  if (!Array.isArray(deck) || deck.length === 0) {
    return { eventId: null, deck: [] };
  }

  const nextDeck = [...deck];
  const eventId = nextDeck.pop();
  return { eventId, deck: nextDeck };
}

/**
 * Check if an event should be drawn this turn.
 * Events are drawn every N turns (configurable), starting from turn 1.
 * @param {number} turnNumber - Current turn number
 * @param {number} everyNTurns - Draw event every N turns (default 3)
 * @returns {boolean}
 */
export function shouldDrawEvent(turnNumber, everyNTurns = 3) {
  if (turnNumber <= 0) return false;
  // Draw on turn 1, then every N turns
  return turnNumber === 1 || turnNumber % everyNTurns === 1;
}

/**
 * Calculate modified bank trade ratio when Market Boom is active.
 * Returns 3 for all resources regardless of ports.
 * @param {object} baseRatios - Original ratios by resource type
 * @returns {object} - Modified ratios (all 3:1)
 */
export function applyMarketBoomRatios(baseRatios) {
  const modified = {};
  for (const r of Object.keys(baseRatios)) {
    modified[r] = Math.min(3, baseRatios[r]);
  }
  return modified;
}

/**
 * Calculate road cost reduction when Road Work is active.
 * @param {object} baseCost - Original road cost
 * @returns {object} - Modified cost (1 less wood, minimum 0)
 */
export function applyRoadWorkCost(baseCost) {
  const modified = { ...baseCost };
  if (modified.wood > 0) {
    modified.wood = Math.max(0, modified.wood - 1);
  }
  return modified;
}

/**
 * Find the most common resource in a hand.
 * @param {object} hand - Resource counts { wood, brick, sheep, wheat, ore }
 * @returns {string|null} - Resource type with highest count, or null if empty
 */
export function findMostCommonResource(hand) {
  if (!hand || typeof hand !== "object") return null;

  const resources = ["wood", "brick", "sheep", "wheat", "ore"];
  let maxResource = null;
  let maxCount = 0;

  for (const r of resources) {
    const count = Math.max(0, Math.floor(hand[r] || 0));
    if (count > maxCount) {
      maxCount = count;
      maxResource = r;
    }
  }

  return maxResource;
}

/**
 * Calculate harvest festival bonuses for all players.
 * @param {Map|object} privateByPlayerId - Map of playerId -> { hand: {...} }
 * @returns {object} - { [playerId]: { resourceType: string, count: 1 } | null }
 */
export function calculateHarvestFestivalBonuses(privateByPlayerId) {
  const bonuses = {};

  const entries =
    privateByPlayerId instanceof Map ? [...privateByPlayerId.entries()] : Object.entries(privateByPlayerId || {});

  for (const [playerId, priv] of entries) {
    const hand = priv?.hand;
    const topResource = findMostCommonResource(hand);
    if (topResource) {
      bonuses[playerId] = { resourceType: topResource, count: 1 };
    } else {
      bonuses[playerId] = null;
    }
  }

  return bonuses;
}
