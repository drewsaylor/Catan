// =============================================================================
// Tips Catalog - Contextual tips for different game phases
// =============================================================================
// Provides bite-sized tips keyed by context (lobby, setup, robber, trading, etc.)
// Used by both TV attract mode and phone lobby tip carousel.

/**
 * @typedef {'lobby' | 'setup' | 'turn' | 'robber' | 'trading' | 'devCards' | 'general'} TipContext
 */

/**
 * @typedef {Object} Tip
 * @property {string} id - Unique identifier for the tip
 * @property {string} text - The tip text to display
 * @property {string[]} contexts - Which contexts this tip applies to
 */

/**
 * All available tips in the catalog.
 * @type {Tip[]}
 */
const ALL_TIPS = [
  // --- Lobby Tips ---
  {
    id: "lobby_join",
    text: "Scan the QR or enter the room code on your phone to join.",
    contexts: ["lobby"]
  },
  {
    id: "lobby_ready",
    text: "Tap 'Ready' on your phone when you're set to play.",
    contexts: ["lobby"]
  },
  {
    id: "lobby_host_start",
    text: "The host starts the game once everyone is ready.",
    contexts: ["lobby"]
  },
  {
    id: "lobby_max_players",
    text: "Up to 6 players can join a single game.",
    contexts: ["lobby"]
  },
  {
    id: "lobby_theme",
    text: "The host can change the visual theme in host controls.",
    contexts: ["lobby"]
  },
  {
    id: "lobby_quick_mode",
    text: "Quick mode has turn timers and faster setup.",
    contexts: ["lobby"]
  },

  // --- Setup Tips ---
  {
    id: "setup_settlement_first",
    text: "Place your first settlement on a glowing intersection.",
    contexts: ["setup"]
  },
  {
    id: "setup_road_after",
    text: "After placing a settlement, place a road touching it.",
    contexts: ["setup"]
  },
  {
    id: "setup_no_touching",
    text: "Settlements must be at least 2 edges apart from each other.",
    contexts: ["setup"]
  },
  {
    id: "setup_resources",
    text: "Your second settlement gives you starting resources!",
    contexts: ["setup"]
  },
  {
    id: "setup_numbers",
    text: "6 and 8 are rolled most often. 2 and 12 are rare.",
    contexts: ["setup"]
  },
  {
    id: "setup_diversity",
    text: "Try to place near different resource types.",
    contexts: ["setup"]
  },

  // --- Turn Tips ---
  {
    id: "turn_roll_first",
    text: "Every turn starts with rolling the dice.",
    contexts: ["turn"]
  },
  {
    id: "turn_build_trade",
    text: "After rolling, you can build, trade, or play dev cards.",
    contexts: ["turn"]
  },
  {
    id: "turn_end",
    text: "Tap 'End Turn' when you're done with your actions.",
    contexts: ["turn"]
  },
  {
    id: "turn_roads",
    text: "Roads cost 1 wood + 1 brick.",
    contexts: ["turn"]
  },
  {
    id: "turn_settlements",
    text: "Settlements cost 1 wood + 1 brick + 1 sheep + 1 wheat.",
    contexts: ["turn"]
  },
  {
    id: "turn_cities",
    text: "Cities cost 3 ore + 2 wheat. They give 2 resources per roll!",
    contexts: ["turn"]
  },

  // --- Robber Tips ---
  {
    id: "robber_seven",
    text: "When a 7 is rolled, the robber activates.",
    contexts: ["robber"]
  },
  {
    id: "robber_discard",
    text: "Players with 8+ cards must discard half (rounded down).",
    contexts: ["robber"]
  },
  {
    id: "robber_move",
    text: "Move the robber to block a hex from producing.",
    contexts: ["robber"]
  },
  {
    id: "robber_steal",
    text: "After moving the robber, steal 1 random card from an adjacent player.",
    contexts: ["robber"]
  },
  {
    id: "robber_desert",
    text: "The robber starts on the desert, which never produces.",
    contexts: ["robber"]
  },
  {
    id: "robber_knight",
    text: "Playing a Knight card also lets you move the robber.",
    contexts: ["robber"]
  },

  // --- Trading Tips ---
  {
    id: "trading_propose",
    text: "Propose trades to other players on your turn.",
    contexts: ["trading"]
  },
  {
    id: "trading_accept",
    text: "You can accept or reject incoming trade offers.",
    contexts: ["trading"]
  },
  {
    id: "trading_bank",
    text: "Trade 4 of any resource to the bank for 1 of another.",
    contexts: ["trading"]
  },
  {
    id: "trading_ports",
    text: "Ports let you trade at better rates (3:1 or 2:1).",
    contexts: ["trading"]
  },
  {
    id: "trading_negotiate",
    text: "Good trades help everyone. Win-win deals get accepted!",
    contexts: ["trading"]
  },

  // --- Dev Card Tips ---
  {
    id: "dev_buy",
    text: "Dev cards cost 1 ore + 1 sheep + 1 wheat.",
    contexts: ["devCards"]
  },
  {
    id: "dev_knight",
    text: "Knights move the robber and count toward Largest Army.",
    contexts: ["devCards"]
  },
  {
    id: "dev_roads",
    text: "Road Building lets you place 2 free roads.",
    contexts: ["devCards"]
  },
  {
    id: "dev_yop",
    text: "Year of Plenty gives you any 2 resources from the bank.",
    contexts: ["devCards"]
  },
  {
    id: "dev_monopoly",
    text: "Monopoly takes all of one resource type from all players.",
    contexts: ["devCards"]
  },
  {
    id: "dev_vp",
    text: "Victory Point cards give +1 VP (hidden until game end).",
    contexts: ["devCards"]
  },
  {
    id: "dev_one_per_turn",
    text: "You can only play one dev card per turn.",
    contexts: ["devCards"]
  },

  // --- General Tips ---
  {
    id: "general_longest_road",
    text: "Longest Road (5+ roads) gives +2 VP.",
    contexts: ["general", "turn"]
  },
  {
    id: "general_largest_army",
    text: "Largest Army (3+ knights) gives +2 VP.",
    contexts: ["general", "turn", "devCards"]
  },
  {
    id: "general_vp_target",
    text: "First to reach the VP target wins!",
    contexts: ["general"]
  },
  {
    id: "general_expand",
    text: "Expand early to claim good spots before others.",
    contexts: ["general", "setup"]
  },
  {
    id: "general_balance",
    text: "Balance your resources for flexible building options.",
    contexts: ["general"]
  }
];

/**
 * Get tips for a specific context.
 * @param {TipContext} context - The context to get tips for
 * @param {Object} [options] - Options
 * @param {number} [options.limit=6] - Maximum number of tips to return
 * @param {boolean} [options.shuffle=true] - Whether to shuffle the tips
 * @returns {Tip[]} Array of tips for the context
 */
export function getTipsForContext(context, { limit = 6, shuffle = true } = {}) {
  let tips = ALL_TIPS.filter((tip) => tip.contexts.includes(context));

  if (shuffle) {
    tips = shuffleArray([...tips]);
  }

  return tips.slice(0, limit);
}

/**
 * Get tips for multiple contexts, merged and deduplicated.
 * @param {TipContext[]} contexts - Array of contexts to get tips for
 * @param {Object} [options] - Options
 * @param {number} [options.limit=6] - Maximum number of tips to return
 * @param {boolean} [options.shuffle=true] - Whether to shuffle the tips
 * @returns {Tip[]} Array of tips for the contexts
 */
export function getTipsForContexts(contexts, { limit = 6, shuffle = true } = {}) {
  const seen = new Set();
  let tips = [];

  for (const context of contexts) {
    for (const tip of ALL_TIPS) {
      if (tip.contexts.includes(context) && !seen.has(tip.id)) {
        seen.add(tip.id);
        tips.push(tip);
      }
    }
  }

  if (shuffle) {
    tips = shuffleArray(tips);
  }

  return tips.slice(0, limit);
}

/**
 * Get a random tip from the catalog.
 * @param {TipContext[]} [excludeContexts=[]] - Contexts to exclude
 * @returns {Tip|null} A random tip or null if none available
 */
export function getRandomTip(excludeContexts = []) {
  const excluded = new Set(excludeContexts);
  const eligible = ALL_TIPS.filter((tip) => !tip.contexts.some((c) => excluded.has(c)));
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

/**
 * Fisher-Yates shuffle.
 * @template T
 * @param {T[]} arr - Array to shuffle
 * @returns {T[]} Shuffled array (same reference, mutated)
 */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Get all available contexts.
 * @returns {TipContext[]}
 */
export function getAvailableContexts() {
  return ["lobby", "setup", "turn", "robber", "trading", "devCards", "general"];
}

/**
 * Get all tips in the catalog.
 * @returns {Tip[]}
 */
export function getAllTips() {
  return [...ALL_TIPS];
}
