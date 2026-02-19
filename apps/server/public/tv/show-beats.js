/**
 * Show Beats Module
 *
 * Handles the computation of show beats from room state changes.
 * These beats drive the TV show layer animations and announcements.
 */

import { detectMoments } from "/shared/moment-detector.js";

/**
 * Clamp a value to a non-negative integer.
 * @param {number} n - Value to clamp
 * @returns {number} - Non-negative integer
 */
function clampNonNegativeInt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

/**
 * Compute which newly placed structures appeared between two game states.
 * @param {object} prevStructures - Previous game structures
 * @param {object} nextStructures - Current game structures
 * @returns {{ placedEdgeIds: string[], placedVertexIds: string[] }}
 */
export function computePlacedStructures(prevStructures, nextStructures) {
  const placedEdgeIds = [];
  const placedVertexIds = [];

  const prevRoads = prevStructures?.roads && typeof prevStructures.roads === "object" ? prevStructures.roads : {};
  const nextRoads = nextStructures?.roads && typeof nextStructures.roads === "object" ? nextStructures.roads : {};
  const prevSettlements = prevStructures?.settlements && typeof prevStructures.settlements === "object" ? prevStructures.settlements : {};
  const nextSettlements = nextStructures?.settlements && typeof nextStructures.settlements === "object" ? nextStructures.settlements : {};

  for (const edgeId of Object.keys(nextRoads)) {
    if (!prevRoads[edgeId]) placedEdgeIds.push(edgeId);
  }

  for (const vertexId of Object.keys(nextSettlements)) {
    const prev = prevSettlements[vertexId];
    const s = nextSettlements[vertexId];
    if (!prev) {
      placedVertexIds.push(vertexId);
      continue;
    }
    if (prev.kind !== s?.kind) placedVertexIds.push(vertexId);
  }

  return { placedEdgeIds, placedVertexIds };
}

/**
 * Compute show beats from room state transitions.
 * Detects moments and converts them to displayable beat objects.
 *
 * @param {object|null} prevRoom - Previous room state
 * @param {object|null} room - Current room state
 * @returns {{ beats: object[], moments: object[], newOfferIds: Set<string> }}
 */
export function computeShowBeats(prevRoom, room) {
  const game = room?.status === "in_game" ? room?.game || null : null;
  const moments = detectMoments(prevRoom, room);
  const beats = [];
  const newOfferIds = new Set();
  if (!game || !moments.length) return { beats, moments, newOfferIds };

  const byId = new Map((room?.players || []).map((p) => [p.playerId, p]));
  const playerMeta = (pid) => {
    const p = pid ? byId.get(pid) : null;
    return {
      playerId: pid,
      name: p?.name || "Player",
      color: p?.color || "rgba(255,255,255,0.28)"
    };
  };

  for (const m of moments) {
    const kind = m?.kind || "";
    const data = m?.data && typeof m.data === "object" ? m.data : {};
    if (!m?.id || typeof m.id !== "string") continue;

    if (kind === "expected_action") continue;

    if (kind === "game_over") {
      const winnerPlayerId = typeof data.winnerPlayerId === "string" ? data.winnerPlayerId : null;
      const winner = playerMeta(winnerPlayerId);
      beats.push({ id: m.id, type: "game_over", winnerPlayerId, winnerName: winner.name, winnerColor: winner.color });
      continue;
    }

    if (kind === "turn_start") {
      const pid = typeof data.playerId === "string" ? data.playerId : null;
      const p = playerMeta(pid);
      beats.push({ id: m.id, type: "turn_start", playerId: pid, playerName: p.name, playerColor: p.color });
      continue;
    }

    if (kind === "dice_roll") {
      const by = playerMeta(typeof data.byPlayerId === "string" ? data.byPlayerId : null);
      beats.push({
        id: m.id,
        type: "dice_roll",
        at: m.at ?? null,
        sum: data.sum ?? null,
        d1: data.d1 ?? null,
        d2: data.d2 ?? null,
        byPlayerId: by.playerId,
        byName: by.name,
        byColor: by.color
      });
      continue;
    }

    if (kind === "robber_step") {
      const subphase = typeof data.subphase === "string" ? data.subphase : "";
      const required = game.robber?.discardRequiredByPlayerId || {};
      const submitted = game.robber?.discardSubmittedByPlayerId || {};
      const pending = Object.entries(required)
        .filter(([, count]) => Number.isFinite(count) && count > 0)
        .map(([playerId, count]) => ({ ...playerMeta(playerId), count: clampNonNegativeInt(count), submitted: !!submitted[playerId] }));
      beats.push({
        id: m.id,
        type: "robber_step",
        subphase,
        pendingDiscards: pending.filter((p) => !p.submitted),
        totalPendingDiscards: pending.filter((p) => !p.submitted).length
      });
      continue;
    }

    if (kind === "robber_moved") {
      const hexId = typeof data.hexId === "string" ? data.hexId : null;
      beats.push({ id: m.id, type: "robber_moved", hexId });
      continue;
    }

    if (kind === "build_road") {
      const edgeId = typeof data.edgeId === "string" ? data.edgeId : null;
      const p = playerMeta(typeof data.playerId === "string" ? data.playerId : null);
      if (edgeId) beats.push({ id: m.id, type: "build", kind: "road", edgeId, playerId: p.playerId, playerName: p.name, playerColor: p.color });
      continue;
    }
    if (kind === "build_settlement") {
      const vertexId = typeof data.vertexId === "string" ? data.vertexId : null;
      const p = playerMeta(typeof data.playerId === "string" ? data.playerId : null);
      if (vertexId) beats.push({ id: m.id, type: "build", kind: "settlement", vertexId, playerId: p.playerId, playerName: p.name, playerColor: p.color });
      continue;
    }
    if (kind === "build_city") {
      const vertexId = typeof data.vertexId === "string" ? data.vertexId : null;
      const p = playerMeta(typeof data.playerId === "string" ? data.playerId : null);
      if (vertexId) beats.push({ id: m.id, type: "build", kind: "city", vertexId, playerId: p.playerId, playerName: p.name, playerColor: p.color });
      continue;
    }

    if (kind === "trade_open") {
      const offerId = typeof data.offerId === "string" ? data.offerId : null;
      if (offerId) newOfferIds.add(offerId);
      const from = playerMeta(typeof data.fromPlayerId === "string" ? data.fromPlayerId : null);
      const toName = data.to === "all" ? "Everyone" : playerMeta(typeof data.to === "string" ? data.to : null).name;
      beats.push({
        id: m.id,
        type: "trade_open",
        count: 1,
        offer: { give: data.give || null, want: data.want || null },
        fromPlayerId: from.playerId,
        fromName: from.name,
        fromColor: from.color,
        to: data.to === "all" ? "all" : data.to,
        toName
      });
      continue;
    }

    if (kind === "trade_accepted") {
      const from = playerMeta(typeof data.fromPlayerId === "string" ? data.fromPlayerId : null);
      const acceptedBy = playerMeta(typeof data.acceptedByPlayerId === "string" ? data.acceptedByPlayerId : null);
      beats.push({
        id: m.id,
        type: "trade_accepted",
        count: 1,
        fromPlayerId: from.playerId,
        fromName: from.name,
        fromColor: from.color,
        acceptedByPlayerId: acceptedBy.playerId,
        acceptedByName: acceptedBy.name,
        acceptedByColor: acceptedBy.color
      });
      continue;
    }

    if (kind === "trade_cancelled") {
      const from = playerMeta(typeof data.fromPlayerId === "string" ? data.fromPlayerId : null);
      beats.push({ id: m.id, type: "trade_cancelled", count: 1, fromPlayerId: from.playerId, fromName: from.name, fromColor: from.color });
      continue;
    }

    if (kind === "trade_rejected") {
      const from = playerMeta(typeof data.fromPlayerId === "string" ? data.fromPlayerId : null);
      const toName = data.to === "all" ? "Everyone" : playerMeta(typeof data.to === "string" ? data.to : null).name;
      beats.push({
        id: m.id,
        type: "trade_rejected",
        count: 1,
        fromPlayerId: from.playerId,
        fromName: from.name,
        fromColor: from.color,
        to: data.to === "all" ? "all" : data.to,
        toName
      });
      continue;
    }

    if (kind === "robber_discarded") {
      const actor = playerMeta(typeof data.playerId === "string" ? data.playerId : null);
      beats.push({ id: m.id, type: "robber_discarded", playerId: actor.playerId, playerName: actor.name, count: clampNonNegativeInt(data.count ?? 0) });
      continue;
    }

    if (kind === "robber_stole") {
      const from = playerMeta(typeof data.fromPlayerId === "string" ? data.fromPlayerId : null);
      beats.push({
        id: m.id,
        type: "robber_stole",
        fromPlayerId: from.playerId,
        fromName: from.name,
        fromColor: from.color,
        didSteal: data?.didSteal !== false
      });
    }
  }

  return { beats, moments, newOfferIds };
}
