function clampNonNegativeInt(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function settlementAndCityCounts(structures) {
  const out = { settlementsByPlayerId: {}, citiesByPlayerId: {} };
  const settlements = structures?.settlements && typeof structures.settlements === "object" ? structures.settlements : {};
  for (const s of Object.values(settlements)) {
    if (!s?.playerId) continue;
    const pid = s.playerId;
    if (s.kind === "city") out.citiesByPlayerId[pid] = clampNonNegativeInt((out.citiesByPlayerId[pid] ?? 0) + 1);
    else out.settlementsByPlayerId[pid] = clampNonNegativeInt((out.settlementsByPlayerId[pid] ?? 0) + 1);
  }
  return out;
}

function ensurePlayerIds(game, playerIds) {
  if (Array.isArray(playerIds) && playerIds.length) return playerIds.filter((pid) => typeof pid === "string" && pid);
  const fromGame = Array.isArray(game?.turnOrder) ? game.turnOrder : [];
  return fromGame.filter((pid) => typeof pid === "string" && pid);
}

function totalPointsFromGame(game, pid) {
  const totals =
    (game?.finalPointsByPlayerId && typeof game.finalPointsByPlayerId === "object" ? game.finalPointsByPlayerId : null) ||
    (game?.pointsByPlayerId && typeof game.pointsByPlayerId === "object" ? game.pointsByPlayerId : null) ||
    null;
  return clampNonNegativeInt(totals?.[pid] ?? 0);
}

export function computeVpBreakdownByPlayerId(game, playerIds = null) {
  const ids = ensurePlayerIds(game, playerIds);
  const breakdown = Object.fromEntries(ids.map((pid) => [pid, { settlementCount: 0, cityCount: 0, longestRoad: 0, largestArmy: 0, hidden: 0, total: 0 }]));
  if (!game || typeof game !== "object") return breakdown;

  const { settlementsByPlayerId, citiesByPlayerId } = settlementAndCityCounts(game.structures);
  const awards = game.awards || {};
  const longestPid = typeof awards.longestRoadPlayerId === "string" ? awards.longestRoadPlayerId : null;
  const largestPid = typeof awards.largestArmyPlayerId === "string" ? awards.largestArmyPlayerId : null;

  for (const pid of ids) {
    const settlementCount = clampNonNegativeInt(settlementsByPlayerId?.[pid] ?? 0);
    const cityCount = clampNonNegativeInt(citiesByPlayerId?.[pid] ?? 0);
    const longestRoad = pid && pid === longestPid ? 2 : 0;
    const largestArmy = pid && pid === largestPid ? 2 : 0;
    const base = clampNonNegativeInt(settlementCount + cityCount * 2 + longestRoad + largestArmy);
    const total = totalPointsFromGame(game, pid) || base;
    const hidden = Math.max(0, clampNonNegativeInt(total - base));

    breakdown[pid] = { settlementCount, cityCount, longestRoad, largestArmy, hidden, total };
  }

  return breakdown;
}

