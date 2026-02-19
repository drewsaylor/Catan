const LONGEST_ROAD_MIN_LENGTH = 5;

function clampNonNegativeInt(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function computeLongestRoadLengthForPlayer({ edgeById, roads, settlements }, playerId) {
  if (!playerId) return 0;

  const adjacency = new Map();
  for (const [edgeId, road] of Object.entries(roads)) {
    if (!road || typeof road !== "object") continue;
    if (road.playerId !== playerId) continue;

    const edge = edgeById.get(edgeId);
    if (!edge) continue;

    const vA = typeof edge.vA === "string" ? edge.vA : null;
    const vB = typeof edge.vB === "string" ? edge.vB : null;
    if (!vA || !vB) continue;

    if (!adjacency.has(vA)) adjacency.set(vA, []);
    adjacency.get(vA).push({ edgeId, to: vB });

    if (!adjacency.has(vB)) adjacency.set(vB, []);
    adjacency.get(vB).push({ edgeId, to: vA });
  }

  if (adjacency.size === 0) return 0;

  const blockedVertexIds = new Set();
  for (const [vertexId, s] of Object.entries(settlements)) {
    const ownerPlayerId = s?.playerId ?? null;
    if (!ownerPlayerId) continue;
    if (ownerPlayerId !== playerId) blockedVertexIds.add(vertexId);
  }

  const usedEdgeIds = new Set();
  function walk(vertexId, cameFromEdgeId) {
    if (cameFromEdgeId && blockedVertexIds.has(vertexId)) return 0;

    let best = 0;
    const options = adjacency.get(vertexId) || [];
    for (const opt of options) {
      if (usedEdgeIds.has(opt.edgeId)) continue;
      usedEdgeIds.add(opt.edgeId);
      const length = 1 + walk(opt.to, opt.edgeId);
      usedEdgeIds.delete(opt.edgeId);
      if (length > best) best = length;
    }
    return best;
  }

  let bestOverall = 0;
  for (const startVertexId of adjacency.keys()) {
    const length = walk(startVertexId, null);
    if (length > bestOverall) bestOverall = length;
  }

  return bestOverall;
}

export function computeLongestRoadLengthsByPlayerId(game) {
  const turnOrder = Array.isArray(game?.turnOrder) ? game.turnOrder : [];
  const out = Object.fromEntries(turnOrder.map((pid) => [pid, 0]));

  if (!game?.board || !Array.isArray(game.board.edges)) return out;

  const edgeById = new Map();
  for (const e of game.board.edges) {
    if (e?.id && typeof e.id === "string") edgeById.set(e.id, e);
  }

  const roads = game?.structures?.roads && typeof game.structures.roads === "object" ? game.structures.roads : {};
  const settlements = game?.structures?.settlements && typeof game.structures.settlements === "object" ? game.structures.settlements : {};

  for (const pid of turnOrder) {
    out[pid] = computeLongestRoadLengthForPlayer({ edgeById, roads, settlements }, pid);
  }
  return out;
}

export function computeLongestRoadAward(game) {
  const lengthsByPlayerId = computeLongestRoadLengthsByPlayerId(game);

  let maxLength = 0;
  let leaders = [];
  for (const [pid, length] of Object.entries(lengthsByPlayerId)) {
    const n = clampNonNegativeInt(length);
    if (n > maxLength) {
      maxLength = n;
      leaders = [pid];
    } else if (n === maxLength && maxLength > 0) {
      leaders.push(pid);
    }
  }

  if (maxLength <= 0) leaders = [];

  const uniqueLeader = leaders.length === 1 ? leaders[0] : null;
  const qualifies = maxLength >= LONGEST_ROAD_MIN_LENGTH;
  return {
    longestRoadPlayerId: qualifies && uniqueLeader ? uniqueLeader : null,
    longestRoadLength: maxLength,
    leaders,
    minLength: LONGEST_ROAD_MIN_LENGTH
  };
}

