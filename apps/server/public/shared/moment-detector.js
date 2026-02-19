function clampNonNegativeInt(n, fallback = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.floor(v));
}

function stableIdPart(v) {
  return v == null ? "" : String(v);
}

function roomMeta(room) {
  const code = typeof room?.roomCode === "string" ? room.roomCode : "";
  const rev = Number(room?.revision);
  const revision = Number.isFinite(rev) ? Math.floor(rev) : null;
  const serverTimeMs = Number(room?.serverTimeMs);
  const atFallback = Number.isFinite(serverTimeMs) ? Math.floor(serverTimeMs) : null;
  return { code, revision, atFallback };
}

function isInGameRoom(room) {
  return !!room && room.status === "in_game" && !!room.game;
}

function lastLogAt(game) {
  const entries = Array.isArray(game?.log) ? game.log : [];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const at = Number(entries[i]?.at);
    if (Number.isFinite(at)) return Math.floor(at);
  }
  return null;
}

function nowBestEffort(room) {
  const meta = roomMeta(room);
  return meta.atFallback;
}

function makeMomentId({ code, revision }, kind, key) {
  const revPart = revision == null ? "?" : String(revision);
  return `room:${stableIdPart(code)}|rev:${revPart}|${stableIdPart(kind)}|${stableIdPart(key)}`;
}

function normalizeOffer(offer) {
  const o = offer && typeof offer === "object" ? offer : null;
  if (!o) return null;
  const id = typeof o.id === "string" ? o.id : "";
  if (!id) return null;
  return {
    id,
    status: typeof o.status === "string" ? o.status : "",
    fromPlayerId: typeof o.fromPlayerId === "string" ? o.fromPlayerId : null,
    to: o.to === "all" ? "all" : typeof o.to === "string" ? o.to : null,
    acceptedByPlayerId: typeof o.acceptedByPlayerId === "string" ? o.acceptedByPlayerId : null,
    rejectedByPlayerIds: Array.isArray(o.rejectedByPlayerIds)
      ? o.rejectedByPlayerIds.filter((v) => typeof v === "string")
      : [],
    createdAt: clampNonNegativeInt(o.createdAt ?? 0, 0),
    give: o.give && typeof o.give === "object" ? { ...o.give } : null,
    want: o.want && typeof o.want === "object" ? { ...o.want } : null
  };
}

export function detectMoments(prevRoom, nextRoom) {
  if (!isInGameRoom(nextRoom)) return [];
  if (!prevRoom || typeof prevRoom !== "object") return [];

  const meta = roomMeta(nextRoom);
  const prevGame = isInGameRoom(prevRoom) ? prevRoom.game : null;
  const game = nextRoom.game;
  const moments = [];

  const atFallback = nowBestEffort(nextRoom);

  if (game.phase === "game_over" && prevGame?.phase !== "game_over") {
    const winnerPlayerId = typeof game.winnerPlayerId === "string" ? game.winnerPlayerId : null;
    const key = `winner:${stableIdPart(winnerPlayerId)}|turn:${stableIdPart(game.turnNumber)}`;
    moments.push({
      id: makeMomentId(meta, "game_over", key),
      kind: "game_over",
      at: atFallback,
      data: { winnerPlayerId }
    });
    return moments;
  }

  const pid = typeof game.currentPlayerId === "string" ? game.currentPlayerId : null;
  const prevPid = typeof prevGame?.currentPlayerId === "string" ? prevGame.currentPlayerId : null;
  if (pid && pid !== prevPid) {
    const phase = String(game.phase || "");
    const turnNumber = clampNonNegativeInt(game.turnNumber ?? 0, 0);
    const placementIndex = clampNonNegativeInt(game.setup?.placementIndex ?? 0, 0);
    const scopeKey =
      phase === "setup_round_1" || phase === "setup_round_2"
        ? `setup:${phase}:${placementIndex}:${pid}`
        : phase === "turn"
          ? `turn:${turnNumber}:${pid}`
          : `${phase}:${turnNumber}:${pid}`;
    const timerAt = Number(nextRoom?.timer?.turnStartedAt);
    const at = Number.isFinite(timerAt) ? Math.floor(timerAt) : atFallback;
    moments.push({
      id: makeMomentId(meta, "turn_start", scopeKey),
      kind: "turn_start",
      at,
      data: { playerId: pid }
    });
  }

  if (!prevGame) return moments;

  const rollAt = Number(game.lastRoll?.at ?? NaN);
  const prevRollAt = Number(prevGame.lastRoll?.at ?? NaN);
  if (Number.isFinite(rollAt) && (!Number.isFinite(prevRollAt) || rollAt !== prevRollAt)) {
    moments.push({
      id: makeMomentId(meta, "dice_roll", Math.floor(rollAt)),
      kind: "dice_roll",
      at: Math.floor(rollAt),
      data: {
        byPlayerId: typeof game.lastRoll?.by === "string" ? game.lastRoll.by : null,
        sum: Number.isFinite(game.lastRoll?.sum) ? Math.floor(game.lastRoll.sum) : null,
        d1: Number.isFinite(game.lastRoll?.d1) ? Math.floor(game.lastRoll.d1) : null,
        d2: Number.isFinite(game.lastRoll?.d2) ? Math.floor(game.lastRoll.d2) : null
      }
    });
  }

  const expected = game?.hints?.expected ?? null;
  const prevExpected = prevGame?.hints?.expected ?? null;
  if (expected !== prevExpected && expected != null) {
    const key = `expected:${stableIdPart(expected)}|sub:${stableIdPart(game.subphase)}|turn:${stableIdPart(game.turnNumber)}`;
    moments.push({
      id: makeMomentId(meta, "expected_action", key),
      kind: "expected_action",
      at: atFallback,
      data: { expected: String(expected), playerId: pid }
    });
  }

  const sub = String(game.subphase || "");
  const prevSub = String(prevGame.subphase || "");
  if (sub && sub !== prevSub && sub.startsWith("robber_")) {
    const key = `sub:${sub}|turn:${stableIdPart(game.turnNumber)}|roll:${Number.isFinite(rollAt) ? Math.floor(rollAt) : ""}`;
    moments.push({
      id: makeMomentId(meta, "robber_step", key),
      kind: "robber_step",
      at: atFallback,
      data: { subphase: sub }
    });
  }

  const robberHexId = typeof game.robberHexId === "string" ? game.robberHexId : null;
  const prevRobberHexId = typeof prevGame.robberHexId === "string" ? prevGame.robberHexId : null;
  if (robberHexId && robberHexId !== prevRobberHexId) {
    moments.push({
      id: makeMomentId(meta, "robber_moved", robberHexId),
      kind: "robber_moved",
      at: atFallback,
      data: { hexId: robberHexId }
    });
  }

  const prevRoads =
    prevGame.structures?.roads && typeof prevGame.structures.roads === "object" ? prevGame.structures.roads : {};
  const nextRoads = game.structures?.roads && typeof game.structures.roads === "object" ? game.structures.roads : {};
  for (const [edgeId, road] of Object.entries(nextRoads)) {
    if (!edgeId || !road) continue;
    if (prevRoads?.[edgeId]) continue;
    const playerId = typeof road.playerId === "string" ? road.playerId : null;
    moments.push({
      id: makeMomentId(meta, "build_road", edgeId),
      kind: "build_road",
      at: atFallback,
      data: { edgeId, playerId }
    });
  }

  const prevSettlements =
    prevGame.structures?.settlements && typeof prevGame.structures.settlements === "object"
      ? prevGame.structures.settlements
      : {};
  const nextSettlements =
    game.structures?.settlements && typeof game.structures.settlements === "object" ? game.structures.settlements : {};
  for (const [vertexId, settlement] of Object.entries(nextSettlements)) {
    if (!vertexId || !settlement) continue;
    const prev = prevSettlements?.[vertexId] || null;
    const playerId = typeof settlement.playerId === "string" ? settlement.playerId : null;
    const kind = settlement.kind === "city" ? "city" : "settlement";
    if (!prev) {
      moments.push({
        id: makeMomentId(meta, "build_settlement", vertexId),
        kind: "build_settlement",
        at: atFallback,
        data: { vertexId, playerId }
      });
    } else if (prev.kind !== kind && kind === "city") {
      moments.push({
        id: makeMomentId(meta, "build_city", vertexId),
        kind: "build_city",
        at: atFallback,
        data: { vertexId, playerId }
      });
    }
  }

  const prevOffers = Array.isArray(prevGame.tradeOffers)
    ? prevGame.tradeOffers.map(normalizeOffer).filter(Boolean)
    : [];
  const nextOffers = Array.isArray(game.tradeOffers) ? game.tradeOffers.map(normalizeOffer).filter(Boolean) : [];
  const prevById = new Map(prevOffers.map((o) => [o.id, o]));

  for (const offer of nextOffers) {
    const prevOffer = prevById.get(offer.id);
    if (!prevOffer) {
      if (offer.status === "open") {
        moments.push({
          id: makeMomentId(meta, "trade_open", offer.id),
          kind: "trade_open",
          at: offer.createdAt || atFallback,
          data: {
            offerId: offer.id,
            fromPlayerId: offer.fromPlayerId,
            to: offer.to,
            give: offer.give,
            want: offer.want
          }
        });
      }
      continue;
    }

    if (offer.status && offer.status !== prevOffer.status) {
      const kind =
        offer.status === "accepted"
          ? "trade_accepted"
          : offer.status === "cancelled"
            ? "trade_cancelled"
            : offer.status === "rejected"
              ? "trade_rejected"
              : null;
      if (!kind) continue;
      moments.push({
        id: makeMomentId(meta, kind, offer.id),
        kind,
        at: offer.createdAt || atFallback,
        data: {
          offerId: offer.id,
          fromPlayerId: offer.fromPlayerId,
          to: offer.to,
          acceptedByPlayerId: offer.acceptedByPlayerId,
          rejectedByPlayerIds: offer.rejectedByPlayerIds,
          give: offer.give,
          want: offer.want
        }
      });
    }
  }

  const prevLogCutoff = lastLogAt(prevGame);
  const nextLog = Array.isArray(game.log) ? game.log : [];
  for (const entry of nextLog) {
    if (!entry || entry.type !== "robber") continue;
    const entryAtRaw = Number(entry?.at ?? NaN);
    const entryAt = Number.isFinite(entryAtRaw) ? Math.floor(entryAtRaw) : null;
    if (prevLogCutoff != null && entryAt != null && entryAt <= prevLogCutoff) continue;

    if (entry?.data?.discardedCount) {
      const count = clampNonNegativeInt(entry.data.discardedCount ?? 0, 0);
      const actorPlayerId = typeof entry.actorPlayerId === "string" ? entry.actorPlayerId : null;
      const key = `${stableIdPart(entryAt)}:${stableIdPart(actorPlayerId)}:${count}`;
      moments.push({
        id: makeMomentId(meta, "robber_discarded", key),
        kind: "robber_discarded",
        at: entryAt ?? atFallback,
        data: { playerId: actorPlayerId, count }
      });
    }

    if (entry?.data?.fromPlayerId) {
      const fromPlayerId = typeof entry.data.fromPlayerId === "string" ? entry.data.fromPlayerId : null;
      const didSteal = entry?.data?.didSteal !== false;
      const key = `${stableIdPart(entryAt)}:${stableIdPart(fromPlayerId)}:${didSteal ? "1" : "0"}`;
      moments.push({
        id: makeMomentId(meta, "robber_stole", key),
        kind: "robber_stole",
        at: entryAt ?? atFallback,
        data: { fromPlayerId, didSteal }
      });
    }
  }

  // Detect event drawn moment
  const currentEvent = game.currentEvent && typeof game.currentEvent === "object" ? game.currentEvent : null;
  const prevEvent = prevGame?.currentEvent && typeof prevGame.currentEvent === "object" ? prevGame.currentEvent : null;
  const currentEventId = currentEvent?.id || null;
  const prevEventId = prevEvent?.id || null;

  if (currentEventId && currentEventId !== prevEventId) {
    const key = `event:${stableIdPart(currentEventId)}|turn:${stableIdPart(game.turnNumber)}`;
    moments.push({
      id: makeMomentId(meta, "event_drawn", key),
      kind: "event_drawn",
      at: atFallback,
      data: {
        eventId: currentEventId,
        eventName: currentEvent.name || null,
        eventDescription: currentEvent.description || null,
        eventShortText: currentEvent.shortText || null,
        turnNumber: game.turnNumber
      }
    });
  }

  // Detect event ended moment (event was active but is now null)
  if (prevEventId && !currentEventId) {
    const key = `eventEnd:${stableIdPart(prevEventId)}|turn:${stableIdPart(game.turnNumber)}`;
    moments.push({
      id: makeMomentId(meta, "event_ended", key),
      kind: "event_ended",
      at: atFallback,
      data: {
        eventId: prevEventId,
        eventName: prevEvent.name || null,
        turnNumber: game.turnNumber
      }
    });
  }

  return moments;
}

export function createMomentQueue({
  maxQueue = 24,
  maxSeen = 256,
  cooldownMsByKind = null,
  cooldownKey = null,
  now = () => Date.now()
} = {}) {
  const queue = [];
  const seenAtById = new Map();
  const cooldownAtByKey = new Map();
  let handler = null;
  let running = false;

  function pruneSeen() {
    while (seenAtById.size > Math.max(24, clampNonNegativeInt(maxSeen ?? 0, 256))) {
      const first = seenAtById.keys().next().value;
      if (!first) break;
      seenAtById.delete(first);
    }
  }

  function shouldAccept(m) {
    const id = typeof m?.id === "string" ? m.id : "";
    if (!id) return false;
    if (seenAtById.has(id)) return false;

    const kind = typeof m?.kind === "string" ? m.kind : typeof m?.type === "string" ? m.type : "";
    const cdByKind = cooldownMsByKind && typeof cooldownMsByKind === "object" ? cooldownMsByKind : null;
    const cdMs = cdByKind && kind ? clampNonNegativeInt(cdByKind[kind] ?? 0, 0) : 0;
    const t = clampNonNegativeInt(now(), Date.now());

    if (cdMs > 0 && kind) {
      const key = typeof cooldownKey === "function" ? String(cooldownKey(m) || kind) : kind;
      const lastAt = clampNonNegativeInt(cooldownAtByKey.get(key) ?? 0, 0);
      if (t - lastAt < cdMs) return false;
      cooldownAtByKey.set(key, t);
    }

    seenAtById.set(id, t);
    pruneSeen();
    return true;
  }

  async function run() {
    if (running) return;
    if (typeof handler !== "function") return;
    running = true;
    try {
      while (queue.length) {
        const next = queue.shift();
        try {
          await handler(next);
        } catch {
          // Ignore handler errors so the queue keeps moving.
        }
      }
    } finally {
      running = false;
    }
  }

  function enqueue(items) {
    const list = Array.isArray(items) ? items : items ? [items] : [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      if (!shouldAccept(item)) continue;
      queue.push(item);
      const cap = Math.max(1, clampNonNegativeInt(maxQueue ?? 0, 24));
      if (queue.length > cap) queue.splice(0, queue.length - cap);
    }
    run();
  }

  function setHandler(fn) {
    handler = typeof fn === "function" ? fn : null;
    run();
  }

  function clear() {
    queue.length = 0;
    seenAtById.clear();
    cooldownAtByKey.clear();
  }

  return {
    enqueue,
    setHandler,
    clear,
    pendingCount: () => queue.length
  };
}
