// =============================================================================
// Host Copy - Show & Pacing Phase 2
// =============================================================================
// Provides punchy titles, short quips, and segment copy for the "host personality"
// without needing voice.
//
// Public API:
//   hostCopyForMoment(moment, { audience: "tv"|"phone" }) => { title, subtitle, tone }
//   getSegment(game) => "setup" | "main" | "endgame" | "game_over" | null
//   getWhatsNextCopy(game, { playerId, expected, isMyTurn }) => string
//   getSegmentTransitionCopy(fromSegment, toSegment) => { title, subtitle, tone } | null
// =============================================================================

// -----------------------------------------------------------------------------
// Host Script Table - 2-4 variants per moment kind
// -----------------------------------------------------------------------------
const HOST_SCRIPTS = {
  turn_start: [
    { title: "Your move!", subtitle: "Make it count." },
    { title: "Let's go!", subtitle: "Show them what you've got." },
    { title: "Time to shine!", subtitle: "The board awaits." },
    { title: "You're up!", subtitle: "Take the lead." }
  ],
  dice_roll: [
    { title: "Rolling...", subtitle: "What'll it be?" },
    { title: "Moment of truth!", subtitle: "Let's see those dice." },
    { title: "Here we go!", subtitle: "Luck be with you." },
    { title: "Dice time!", subtitle: "Roll it!" }
  ],
  robber_discard: [
    { title: "Discard Phase", subtitle: "Too many cards!" },
    { title: "Hand check!", subtitle: "Trim the excess." },
    { title: "Discard time", subtitle: "Over 7? Gotta drop some." }
  ],
  robber_move: [
    { title: "Move the Robber", subtitle: "Pick a hex to block." },
    { title: "Robber time!", subtitle: "Where will he go?" },
    { title: "Place the robber", subtitle: "Choose wisely." }
  ],
  robber_steal: [
    { title: "Pick a Victim", subtitle: "Someone's losing a card." },
    { title: "Steal time!", subtitle: "Choose your target." },
    { title: "Take a card", subtitle: "Who's it gonna be?" }
  ],
  robber_moved: [
    { title: "Robber moved", subtitle: "New location set." },
    { title: "Robber placed!", subtitle: "Blocking activated." }
  ],
  robber_stole: [
    { title: "Card stolen!", subtitle: "Resources shuffled." },
    { title: "Theft complete!", subtitle: "One card taken." }
  ],
  robber_stole_empty: [
    { title: "No cards!", subtitle: "Nothing to steal." },
    { title: "Empty-handed", subtitle: "No loot today." }
  ],
  build_road: [
    { title: "Road built!", subtitle: "Expanding!" },
    { title: "New road!", subtitle: "Growing your network." },
    { title: "Placed!", subtitle: "Another road down." }
  ],
  build_settlement: [
    { title: "Settlement!", subtitle: "Staking a claim." },
    { title: "Built!", subtitle: "New territory!" },
    { title: "Settled!", subtitle: "Growing empire." }
  ],
  build_city: [
    { title: "City!", subtitle: "Major upgrade!" },
    { title: "Upgraded!", subtitle: "Double the power." },
    { title: "City built!", subtitle: "Big moves!" }
  ],
  trade_open: [
    { title: "Deal proposed!", subtitle: "Anyone interested?" },
    { title: "Trade offer!", subtitle: "Let's make a deal." },
    { title: "Looking to trade!", subtitle: "Who's in?" }
  ],
  trade_accepted: [
    { title: "It's a deal!", subtitle: "Trade complete." },
    { title: "Accepted!", subtitle: "Cards exchanged." },
    { title: "Done deal!", subtitle: "Everyone's happy." }
  ],
  trade_cancelled: [
    { title: "Trade cancelled", subtitle: "Offer withdrawn." },
    { title: "Nevermind", subtitle: "Deal's off." }
  ],
  trade_rejected: [
    { title: "No deal", subtitle: "Offer rejected." },
    { title: "Rejected!", subtitle: "Not interested." }
  ],
  game_over: [
    { title: "Victory!", subtitle: "We have a winner!" },
    { title: "Game Over!", subtitle: "Champion crowned!" },
    { title: "Winner!", subtitle: "The game is done!" }
  ],
  turn_nudge: [
    { title: "Your move", subtitle: "Time's ticking!" },
    { title: "Still your turn", subtitle: "Make a play!" }
  ],
  segment_setup: [
    { title: "Setup Phase", subtitle: "Place your starting pieces." }
  ],
  segment_main: [
    { title: "Main Game", subtitle: "Build your empire!" }
  ],
  segment_endgame: [
    { title: "Endgame!", subtitle: "Victory is near..." }
  ]
};

// -----------------------------------------------------------------------------
// Phone "What's Next?" Copy - contextual hints per expected action
// -----------------------------------------------------------------------------
const WHATS_NEXT_COPY = {
  // Setup phase
  PLACE_SETTLEMENT: "Place your settlement",
  PLACE_ROAD: "Place your road",

  // Turn main
  ROLL_DICE: "Roll the dice",
  main_phase: "Build, trade, or end turn",

  // Robber flow
  DISCARD_CARDS: "Discard cards",
  MOVE_ROBBER: "Move the robber",
  STEAL_CARD: "Pick someone to steal from",

  // Dev cards
  DEV_ROAD_BUILDING_PLACE_ROAD: "Place free roads",
  DEV_YEAR_OF_PLENTY: "Choose 2 resources",
  DEV_MONOPOLY: "Pick a resource type",

  // Waiting states
  waiting_roll: "Waiting for dice roll...",
  waiting_turn: "Waiting on {player}...",
  waiting_discard: "Waiting for discards...",
  waiting_robber: "Waiting for robber...",
  waiting_steal: "Waiting for steal..."
};

// -----------------------------------------------------------------------------
// Game Segment Detection
// -----------------------------------------------------------------------------

/**
 * Determines the current game segment.
 * @param {object} game - The game state object
 * @returns {"setup"|"main"|"endgame"|"game_over"|null}
 */
export function getSegment(game) {
  if (!game) return null;

  const phase = String(game.phase || "");

  if (phase === "game_over") return "game_over";
  if (phase === "setup_round_1" || phase === "setup_round_2") return "setup";

  // Check for endgame: any player close to winning (within 2 VP)
  const target = Number(game.victoryPointsToWin) || 10;
  const points = game.pointsByPlayerId || {};

  for (const vp of Object.values(points)) {
    const vpNum = Number(vp) || 0;
    if (vpNum >= target - 2) return "endgame";
  }

  return "main";
}

/**
 * Returns segment transition copy when the segment changes.
 * @param {string|null} fromSegment
 * @param {string|null} toSegment
 * @returns {{ title: string, subtitle: string, tone: string }|null}
 */
export function getSegmentTransitionCopy(fromSegment, toSegment) {
  if (!toSegment || fromSegment === toSegment) return null;

  const scripts = HOST_SCRIPTS[`segment_${toSegment}`] || null;
  if (!scripts || !scripts.length) return null;

  const pick = scripts[Math.floor(Math.random() * scripts.length)];
  const tone = toSegment === "endgame" ? "warn" : "info";

  return {
    title: pick.title,
    subtitle: pick.subtitle,
    tone
  };
}

// -----------------------------------------------------------------------------
// Random Variant Selection
// -----------------------------------------------------------------------------

function pickVariant(scripts) {
  if (!scripts || !scripts.length) return null;
  return scripts[Math.floor(Math.random() * scripts.length)];
}

// -----------------------------------------------------------------------------
// Host Copy for Moments
// -----------------------------------------------------------------------------

/**
 * Returns host copy for a moment.
 * @param {object} moment - The moment/beat object
 * @param {{ audience?: "tv"|"phone" }} options
 * @returns {{ title: string, subtitle: string, tone: string }}
 */
export function hostCopyForMoment(moment, { audience = "tv" } = {}) {
  if (!moment || typeof moment !== "object") {
    return { title: "", subtitle: "", tone: "info" };
  }

  const kind = String(moment.kind || moment.type || "");
  const data = moment.data && typeof moment.data === "object" ? moment.data : {};

  // Default fallback
  let result = { title: "", subtitle: "", tone: "info" };

  // --- Turn Start ---
  if (kind === "turn_start") {
    const playerName = moment.playerName || data.playerName || "Player";
    const variant = pickVariant(HOST_SCRIPTS.turn_start);
    if (variant) {
      result = {
        title: `${playerName}'s Turn`,
        subtitle: variant.subtitle,
        tone: "info"
      };
    }
    return result;
  }

  // --- Dice Roll ---
  if (kind === "dice_roll") {
    const sum = Number(moment.sum ?? data.sum ?? NaN);
    const d1 = Number(moment.d1 ?? data.d1 ?? NaN);
    const d2 = Number(moment.d2 ?? data.d2 ?? NaN);
    const isSeven = sum === 7;

    const variant = pickVariant(HOST_SCRIPTS.dice_roll);
    const subtitle = Number.isFinite(d1) && Number.isFinite(d2) ? `${d1}+${d2}` : "";

    result = {
      title: Number.isFinite(sum) ? `Rolled ${sum}` : "Dice rolled",
      subtitle: isSeven ? "Robber activated!" : subtitle,
      tone: isSeven ? "warn" : "info"
    };
    return result;
  }

  // --- Robber Steps ---
  if (kind === "robber_step") {
    const subphase = String(moment.subphase || data.subphase || "");

    if (subphase === "robber_discard") {
      const variant = pickVariant(HOST_SCRIPTS.robber_discard);
      if (variant) {
        result = { title: variant.title, subtitle: variant.subtitle, tone: "warn" };
      }
    } else if (subphase === "robber_move") {
      const variant = pickVariant(HOST_SCRIPTS.robber_move);
      if (variant) {
        result = { title: variant.title, subtitle: variant.subtitle, tone: "warn" };
      }
    } else if (subphase === "robber_steal") {
      const variant = pickVariant(HOST_SCRIPTS.robber_steal);
      if (variant) {
        result = { title: variant.title, subtitle: variant.subtitle, tone: "warn" };
      }
    }
    return result;
  }

  // --- Robber Moved ---
  if (kind === "robber_moved") {
    const variant = pickVariant(HOST_SCRIPTS.robber_moved);
    if (variant) {
      result = { title: variant.title, subtitle: variant.subtitle, tone: "warn" };
    }
    return result;
  }

  // --- Robber Stole ---
  if (kind === "robber_stole") {
    const didSteal = moment.didSteal !== false && data.didSteal !== false;
    const fromName = moment.fromName || data.fromName || "Player";

    if (didSteal) {
      const variant = pickVariant(HOST_SCRIPTS.robber_stole);
      if (variant) {
        result = { title: `Stole from ${fromName}`, subtitle: "", tone: "warn" };
      }
    } else {
      const variant = pickVariant(HOST_SCRIPTS.robber_stole_empty);
      if (variant) {
        result = { title: variant.title, subtitle: fromName, tone: "info" };
      }
    }
    return result;
  }

  // --- Robber Discarded ---
  if (kind === "robber_discarded") {
    const playerName = moment.playerName || data.playerName || "Player";
    const count = Math.max(0, Math.floor(Number(moment.count ?? data.count ?? 0)));
    result = {
      title: `${playerName} discarded`,
      subtitle: `${count} card${count === 1 ? "" : "s"}`,
      tone: "warn"
    };
    return result;
  }

  // --- Build ---
  if (kind === "build" || kind === "build_road" || kind === "build_settlement" || kind === "build_city") {
    const buildKind = moment.kind === "build" ? String(moment.buildKind || data.kind || "road") : kind.replace("build_", "");
    const scripts = HOST_SCRIPTS[`build_${buildKind}`] || HOST_SCRIPTS.build_road;
    const variant = pickVariant(scripts);
    const playerName = moment.playerName || data.playerName || "";

    if (variant) {
      result = {
        title: variant.title,
        subtitle: playerName || variant.subtitle,
        tone: "good"
      };
    }
    return result;
  }

  // --- Trade Open ---
  if (kind === "trade_open") {
    const variant = pickVariant(HOST_SCRIPTS.trade_open);
    const fromName = moment.fromName || data.fromName || "Player";
    const toName = moment.toName || data.toName || "Everyone";

    if (variant) {
      result = {
        title: variant.title,
        subtitle: `${fromName} \u2192 ${toName}`,
        tone: "info"
      };
    }
    return result;
  }

  // --- Trade Accepted ---
  if (kind === "trade_accepted") {
    const variant = pickVariant(HOST_SCRIPTS.trade_accepted);
    const fromName = moment.fromName || data.fromName || "Player";
    const acceptedByName = moment.acceptedByName || data.acceptedByName || "Player";

    if (variant) {
      result = {
        title: variant.title,
        subtitle: `${fromName} + ${acceptedByName}`,
        tone: "good"
      };
    }
    return result;
  }

  // --- Trade Cancelled ---
  if (kind === "trade_cancelled") {
    const variant = pickVariant(HOST_SCRIPTS.trade_cancelled);
    const fromName = moment.fromName || data.fromName || "Player";

    if (variant) {
      result = {
        title: variant.title,
        subtitle: fromName,
        tone: "bad"
      };
    }
    return result;
  }

  // --- Trade Rejected ---
  if (kind === "trade_rejected") {
    const variant = pickVariant(HOST_SCRIPTS.trade_rejected);
    const fromName = moment.fromName || data.fromName || "Player";
    const toName = moment.toName || data.toName || "Player";

    if (variant) {
      result = {
        title: variant.title,
        subtitle: `${fromName} \u2192 ${toName}`,
        tone: "bad"
      };
    }
    return result;
  }

  // --- Game Over ---
  if (kind === "game_over") {
    const winnerName = moment.winnerName || data.winnerName || "Winner";
    const variant = pickVariant(HOST_SCRIPTS.game_over);

    if (variant) {
      result = {
        title: `${winnerName} wins!`,
        subtitle: variant.subtitle,
        tone: "good"
      };
    }
    return result;
  }

  // --- Turn Nudge ---
  if (kind === "turn_nudge") {
    const playerName = moment.playerName || data.playerName || "Player";
    const expected = moment.expected || data.expected || null;
    const variant = pickVariant(HOST_SCRIPTS.turn_nudge);

    let subtitle = variant?.subtitle || "Make a play!";
    if (expected === "ROLL_DICE") {
      subtitle = "Tap Roll dice.";
    }

    result = {
      title: variant?.title || "Your move",
      subtitle: `${playerName}, ${subtitle.toLowerCase()}`,
      tone: "warn"
    };
    return result;
  }

  return result;
}

// -----------------------------------------------------------------------------
// Phone "What's Next?" Copy
// -----------------------------------------------------------------------------

/**
 * Returns a short contextual hint for the phone based on expected action.
 * @param {object} game - The game state object
 * @param {{ playerId?: string, expected?: string, isMyTurn?: boolean, currentPlayerName?: string }} options
 * @returns {string}
 */
export function getWhatsNextCopy(game, { playerId, expected, isMyTurn, currentPlayerName } = {}) {
  if (!game) return "";

  const phase = String(game.phase || "");
  const subphase = String(game.subphase || "");
  const exp = expected || game.hints?.expected || "";

  // Game over
  if (phase === "game_over") {
    return "";
  }

  // My turn - give action prompts
  if (isMyTurn) {
    // Check for specific expected actions
    if (WHATS_NEXT_COPY[exp]) {
      return WHATS_NEXT_COPY[exp];
    }

    // Main phase default
    if (phase === "turn" && subphase === "main") {
      return WHATS_NEXT_COPY.main_phase;
    }

    return "";
  }

  // Not my turn - waiting states
  const name = currentPlayerName || "the current player";

  if (exp === "DISCARD_CARDS") {
    // Check if I need to discard
    const required = Number(game.hints?.discardRequiredByPlayerId?.[playerId] ?? 0);
    const submitted = !!game.hints?.discardSubmittedByPlayerId?.[playerId];

    if (required > 0 && !submitted) {
      return `Discard ${required} card${required === 1 ? "" : "s"}`;
    }
    return WHATS_NEXT_COPY.waiting_discard;
  }

  if (exp === "ROLL_DICE") {
    return WHATS_NEXT_COPY.waiting_roll;
  }

  if (exp === "MOVE_ROBBER") {
    return WHATS_NEXT_COPY.waiting_robber;
  }

  if (exp === "STEAL_CARD") {
    return WHATS_NEXT_COPY.waiting_steal;
  }

  return WHATS_NEXT_COPY.waiting_turn.replace("{player}", name);
}

// -----------------------------------------------------------------------------
// Segment State Tracker (for detecting transitions)
// -----------------------------------------------------------------------------

/**
 * Creates a segment tracker to detect segment transitions.
 * @returns {{ update: (game: object) => { changed: boolean, from: string|null, to: string|null } }}
 */
export function createSegmentTracker() {
  let lastSegment = null;

  return {
    /**
     * Update the tracker with new game state.
     * @param {object} game
     * @returns {{ changed: boolean, from: string|null, to: string|null, copy: object|null }}
     */
    update(game) {
      const current = getSegment(game);
      const changed = current !== lastSegment && lastSegment !== null;
      const from = lastSegment;
      const to = current;

      lastSegment = current;

      return {
        changed,
        from,
        to,
        copy: changed ? getSegmentTransitionCopy(from, to) : null
      };
    },

    /** Get current segment without updating. */
    current() {
      return lastSegment;
    },

    /** Reset the tracker. */
    reset() {
      lastSegment = null;
    }
  };
}
