export const BUILD_COSTS = {
  BUILD_ROAD: { wood: 1, brick: 1 },
  BUILD_SETTLEMENT: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  BUILD_CITY: { wheat: 2, ore: 3 }
};

export const DEV_CARD_COST = { wheat: 1, sheep: 1, ore: 1 };

/**
 * Get effective build cost, accounting for active events.
 * @param {string} actionType - BUILD_ROAD, BUILD_SETTLEMENT, or BUILD_CITY
 * @param {object} game - Game state with currentEvent
 * @returns {object} - Effective cost object
 */
export function getEffectiveBuildCost(actionType, game) {
  let cost = BUILD_COSTS[actionType] ?? null;
  if (!cost) return null;

  // Road Work event: roads cost 1 less wood
  if (actionType === "BUILD_ROAD" && game?.currentEvent?.id === "road_work") {
    cost = { ...cost, wood: Math.max(0, (cost.wood || 0) - 1) };
  }

  return cost;
}

function clampNonNegativeInt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

export function hasAnyResources(counts) {
  if (!counts || typeof counts !== "object") return false;
  for (const v of Object.values(counts)) {
    if (clampNonNegativeInt(v) > 0) return true;
  }
  return false;
}

export function hasEnoughResources(hand, cost) {
  if (!hand || typeof hand !== "object") return false;
  if (!cost || typeof cost !== "object") return true;
  for (const [k, v] of Object.entries(cost)) {
    const need = clampNonNegativeInt(v);
    if (need <= 0) continue;
    if (clampNonNegativeInt(hand[k]) < need) return false;
  }
  return true;
}

export function gateAction({ game, playerId, you }, action) {
  const type = String(action?.type || "");
  if (!game || !playerId) return { code: "BAD_PHASE" };

  const isCurrent = game.currentPlayerId === playerId;

  function requireCurrent() {
    if (!isCurrent) return { code: "NOT_YOUR_TURN" };
    return null;
  }

  function requireTurnSubphase(subphase) {
    if (game.phase !== "turn") return { code: "BAD_PHASE" };
    if (game.subphase !== subphase) return { code: "BAD_PHASE" };
    return null;
  }

  if (type === "ROLL_DICE") return requireCurrent() || requireTurnSubphase("needs_roll");
  if (type === "END_TURN") return requireCurrent() || requireTurnSubphase("main");

  if (type === "BUY_DEV_CARD") {
    const currentGate = requireCurrent();
    if (currentGate) return currentGate;
    const phaseGate = requireTurnSubphase("main");
    if (phaseGate) return phaseGate;
    if (!hasEnoughResources(you?.hand, DEV_CARD_COST)) return { code: "NOT_ENOUGH_RESOURCES" };
    if (clampNonNegativeInt(game.devDeckCount) <= 0) return { code: "DEV_DECK_EMPTY" };
    return null;
  }

  if (type === "PLAY_DEV_CARD") {
    const currentGate = requireCurrent();
    if (currentGate) return currentGate;
    const phaseGate = requireTurnSubphase("main");
    if (phaseGate) return phaseGate;
    return null;
  }

  let buildCost = BUILD_COSTS[type] ?? null;
  // Apply Road Work event: roads cost 1 less wood
  if (buildCost && type === "BUILD_ROAD" && game?.currentEvent?.id === "road_work") {
    buildCost = { ...buildCost, wood: Math.max(0, (buildCost.wood || 0) - 1) };
  }
  if (buildCost) {
    const currentGate = requireCurrent();
    if (currentGate) return currentGate;
    const phaseGate = requireTurnSubphase("main");
    if (phaseGate) return phaseGate;
    if (!hasEnoughResources(you?.hand, buildCost)) return { code: "NOT_ENOUGH_RESOURCES" };
    return null;
  }

  if (type === "DISCARD_CARDS") {
    if (game.phase !== "turn") return { code: "BAD_PHASE" };
    if (game.subphase !== "robber_discard") return { code: "BAD_PHASE" };
    const required = clampNonNegativeInt(game.hints?.discardRequiredByPlayerId?.[playerId] ?? 0);
    const submitted = !!game.hints?.discardSubmittedByPlayerId?.[playerId];
    if (required <= 0) return { code: "NO_DISCARD_REQUIRED" };
    if (submitted) return { code: "ALREADY_DISCARDED" };
    return null;
  }

  if (type === "MOVE_ROBBER") return requireCurrent() || requireTurnSubphase("robber_move");
  if (type === "STEAL_CARD") return requireCurrent() || requireTurnSubphase("robber_steal");

  if (type === "PLACE_SETTLEMENT") {
    const currentGate = requireCurrent();
    if (currentGate) return currentGate;
    if (game.hints?.expected !== "PLACE_SETTLEMENT") return { code: "BAD_PHASE" };
    return null;
  }

  if (type === "PLACE_ROAD") {
    const currentGate = requireCurrent();
    if (currentGate) return currentGate;
    if (game.hints?.expected !== "PLACE_ROAD") return { code: "BAD_PHASE" };
    return null;
  }

  if (type === "DEV_ROAD_BUILDING_PLACE_ROAD") return requireCurrent() || requireTurnSubphase("dev_road_building");

  return null;
}
