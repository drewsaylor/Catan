import crypto from "node:crypto";
import { RESOURCE_TYPES, normalizeResourceCounts } from "../shared/resources.js";
import { generateStandardBoard } from "./board.js";
import { computeLongestRoadAward } from "./longest-road.js";
import { PRESET_META, getPresetDefinition, makeSeededRng } from "./presets.js";
import {
  EVENT_TYPES,
  EVENT_IDS,
  createEventDeck,
  getEventById,
  drawEvent,
  shouldDrawEvent,
  applyMarketBoomRatios
} from "./event-deck.js";

const DEFAULT_VICTORY_POINTS_TO_WIN = 10;
const QUICK_VICTORY_POINTS_TO_WIN = 8;
const DEV_CARD_COST = { wheat: 1, sheep: 1, ore: 1 };
const DEV_CARD_TYPES = ["knight", "victory_point", "year_of_plenty", "road_building", "monopoly"];
const DEV_DECK_SIZE = 25;
const LARGEST_ARMY_MIN_KNIGHTS = 3;
const PIECE_LIMITS = { roads: 15, settlements: 5, cities: 4 };

function nowMs() {
  return Date.now();
}

function shuffle(array) {
  // Fisher-Yates with crypto randomness.
  const a = [...array];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const r = crypto.randomBytes(4).readUInt32BE(0);
    const j = r % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function currentPlayerId(game) {
  if (game.phase === "setup_round_1" || game.phase === "setup_round_2") {
    return game.setup.placementOrder[game.setup.placementIndex] ?? null;
  }
  return game.turnOrder[game.currentPlayerIndex] ?? null;
}

function makeLogEntry({ type, message, data, actorPlayerId = null }) {
  return {
    id: crypto.randomUUID(),
    at: nowMs(),
    type,
    actorPlayerId: actorPlayerId ?? null,
    message,
    data: data ?? null
  };
}

function emptyBank() {
  return {
    wood: 19,
    brick: 19,
    sheep: 19,
    wheat: 19,
    ore: 19
  };
}

function clampNonNegativeInt(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeGameMode(input) {
  return input === "quick" ? "quick" : "classic";
}

function normalizeHouseRules(input) {
  if (!isPlainObject(input)) return null;

  /** @type {any} */
  const next = {};

  if ("victoryPointsToWin" in input) {
    const raw = input.victoryPointsToWin;
    if (raw != null && raw !== "") {
      const n = Number(raw);
      const v = Number.isFinite(n) ? Math.floor(n) : null;
      if (v != null && v >= 6 && v <= 15) next.victoryPointsToWin = v;
    }
  }

  return Object.keys(next).length ? next : null;
}

function resolveGameSettings({ gameMode, houseRules }) {
  const resolvedGameMode = normalizeGameMode(gameMode);
  const resolvedHouseRules = normalizeHouseRules(houseRules);
  const baseVictoryPointsToWin =
    resolvedGameMode === "quick" ? QUICK_VICTORY_POINTS_TO_WIN : DEFAULT_VICTORY_POINTS_TO_WIN;

  const override = resolvedHouseRules?.victoryPointsToWin ?? null;
  const overrideNum = Number(override);
  const overrideVp = Number.isFinite(overrideNum) ? Math.floor(overrideNum) : null;
  const victoryPointsToWin =
    overrideVp != null && overrideVp >= 6 && overrideVp <= 15 ? overrideVp : baseVictoryPointsToWin;

  return { gameMode: resolvedGameMode, victoryPointsToWin, houseRules: resolvedHouseRules };
}

function countRoadsByPlayerId(game, playerId) {
  const roads = game?.structures?.roads && typeof game.structures.roads === "object" ? game.structures.roads : {};
  let count = 0;
  for (const r of Object.values(roads)) {
    if (r?.playerId === playerId) count += 1;
  }
  return count;
}

function countSettlementsByPlayerId(game, playerId) {
  const settlements =
    game?.structures?.settlements && typeof game.structures.settlements === "object" ? game.structures.settlements : {};
  let count = 0;
  for (const s of Object.values(settlements)) {
    if (s?.playerId === playerId && s?.kind === "settlement") count += 1;
  }
  return count;
}

function countCitiesByPlayerId(game, playerId) {
  const settlements =
    game?.structures?.settlements && typeof game.structures.settlements === "object" ? game.structures.settlements : {};
  let count = 0;
  for (const s of Object.values(settlements)) {
    if (s?.playerId === playerId && s?.kind === "city") count += 1;
  }
  return count;
}

function sumResourceCounts(counts) {
  if (!counts || typeof counts !== "object") return 0;
  let total = 0;
  for (const r of RESOURCE_TYPES) total += clampNonNegativeInt(counts[r] ?? 0);
  return total;
}

function hasAnyResources(counts) {
  if (!counts || typeof counts !== "object") return false;
  for (const r of RESOURCE_TYPES) {
    if (clampNonNegativeInt(counts[r] ?? 0) > 0) return true;
  }
  return false;
}

function addHandDelta(base, delta) {
  const next = { ...base };
  for (const k of RESOURCE_TYPES) next[k] = clampNonNegativeInt((next[k] ?? 0) + (delta[k] ?? 0));
  return next;
}

function makeDevDeck() {
  return shuffle([
    ...Array(14).fill("knight"),
    ...Array(5).fill("victory_point"),
    ...Array(2).fill("road_building"),
    ...Array(2).fill("year_of_plenty"),
    ...Array(2).fill("monopoly")
  ]);
}

function singleResourceTypeAndCount(counts) {
  if (!counts || typeof counts !== "object") return null;
  let found = null;
  for (const r of RESOURCE_TYPES) {
    const n = clampNonNegativeInt(counts[r] ?? 0);
    if (n <= 0) continue;
    if (found) return null;
    found = { type: r, count: n };
  }
  return found;
}

function computeBankTradeRatiosByGiveResource(game, playerId) {
  const ratios = { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 };

  // Check for Market Boom event - all trades become 3:1
  const currentEvent = game?.currentEvent;
  if (currentEvent?.id === "market_boom") {
    return applyMarketBoomRatios(ratios);
  }

  const ports = Array.isArray(game?.board?.ports) ? game.board.ports : [];
  if (!ports.length || !playerId) return ratios;

  const settlements = game?.structures?.settlements || {};
  function ownsAnyVertex(vertexIds) {
    if (!Array.isArray(vertexIds)) return false;
    for (const vId of vertexIds) {
      const s = settlements[vId];
      if (s?.playerId === playerId) return true;
    }
    return false;
  }

  for (const port of ports) {
    if (!ownsAnyVertex(port?.vertexIds)) continue;
    if (port.kind === "generic") {
      for (const r of RESOURCE_TYPES) ratios[r] = Math.min(ratios[r], 3);
      continue;
    }
    if (RESOURCE_TYPES.includes(port.kind)) {
      ratios[port.kind] = Math.min(ratios[port.kind], 2);
    }
  }

  return ratios;
}

function applyBankAndBuildPrivateUpdates(game, perPlayerDelta) {
  // perPlayerDelta: { [playerId]: { wood:+1, ... } }
  const totals = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  for (const delta of Object.values(perPlayerDelta)) {
    for (const r of RESOURCE_TYPES) totals[r] += clampNonNegativeInt(delta[r] ?? 0);
  }

  const blocked = new Set();
  const nextBank = { ...game.bank };
  for (const r of RESOURCE_TYPES) {
    if (totals[r] <= 0) continue;
    if ((nextBank[r] ?? 0) < totals[r]) blocked.add(r);
  }

  const privateUpdates = [];
  for (const [playerId, delta] of Object.entries(perPlayerDelta)) {
    const allowed = {};
    let any = false;
    for (const r of RESOURCE_TYPES) {
      const v = clampNonNegativeInt(delta[r] ?? 0);
      allowed[r] = blocked.has(r) ? 0 : v;
      if (allowed[r] > 0) any = true;
    }
    if (!any) continue;
    privateUpdates.push({ playerId, handDelta: allowed });
  }

  for (const r of RESOURCE_TYPES) {
    if (blocked.has(r)) continue;
    nextBank[r] = clampNonNegativeInt((nextBank[r] ?? 0) - totals[r]);
  }

  return { nextBank, privateUpdates, blockedResources: [...blocked] };
}

function legalSetupSettlementVertexIds(game) {
  const occupied = game.structures.settlements;
  const legal = [];
  for (const v of game.board.vertices) {
    if (occupied[v.id]) continue;
    const adjacentOccupied = v.neighborVertexIds.some((n) => !!occupied[n]);
    if (adjacentOccupied) continue;
    legal.push(v.id);
  }
  return legal;
}

function legalSetupRoadEdgeIds(game) {
  const last = game.setup.lastSettlementVertexId;
  if (!last) return [];
  const v = game.board.vertices.find((vv) => vv.id === last);
  if (!v) return [];
  const occupiedRoads = game.structures.roads;
  return v.edgeIds.filter((eId) => !occupiedRoads[eId]);
}

function isConnectionVertexForRoad(game, playerId, vertexId) {
  const s = game.structures.settlements[vertexId];
  if (s && s.playerId !== playerId) return false;
  if (s && s.playerId === playerId) return true;
  const v = game.board.vertices.find((vv) => vv.id === vertexId);
  if (!v) return false;
  return v.edgeIds.some((eId) => game.structures.roads[eId]?.playerId === playerId);
}

function isLegalRoadBuild(game, playerId, edge) {
  if (!edge) return false;
  if (game.structures.roads[edge.id]) return false;
  return isConnectionVertexForRoad(game, playerId, edge.vA) || isConnectionVertexForRoad(game, playerId, edge.vB);
}

function isLegalSettlementBuild(game, playerId, vertex) {
  if (!vertex) return false;
  if (game.structures.settlements[vertex.id]) return false;
  const tooClose = vertex.neighborVertexIds.some((n) => !!game.structures.settlements[n]);
  if (tooClose) return false;
  // Must connect to one of your roads.
  return vertex.edgeIds.some((eId) => game.structures.roads[eId]?.playerId === playerId);
}

function legalRobberHexIds(game) {
  const current = game.robberHexId ?? null;
  return game.board.hexes.map((h) => h.id).filter((id) => id && id !== current);
}

function legalRoadBuildEdgeIds(game, playerId) {
  if (!game || !playerId) return [];
  const legal = [];
  for (const edge of game.board.edges) {
    if (!edge?.id) continue;
    if (game.structures.roads[edge.id]) continue;
    if (!isLegalRoadBuild(game, playerId, edge)) continue;
    legal.push(edge.id);
  }
  return legal;
}

function eligibleVictimPlayerIdsForRobberHex(game, hexId, currentPid) {
  const hex = game.board.hexes.find((h) => h.id === hexId);
  if (!hex) return [];
  const victims = new Set();
  for (const vertexId of hex.cornerVertexIds) {
    const s = game.structures.settlements?.[vertexId] ?? null;
    if (!s?.playerId) continue;
    if (s.playerId === currentPid) continue;
    victims.add(s.playerId);
  }
  return [...victims].filter((pid) => game.turnOrder.includes(pid));
}

function computePointsByPlayerId(game) {
  const points = {};
  for (const pid of game.turnOrder || []) points[pid] = 0;

  const settlements = game.structures?.settlements || {};
  for (const s of Object.values(settlements)) {
    if (!s?.playerId) continue;
    const pid = s.playerId;
    if (!(pid in points)) points[pid] = 0;
    points[pid] += s.kind === "city" ? 2 : 1;
  }

  const awards = game.awards || {};
  if (awards.longestRoadPlayerId) points[awards.longestRoadPlayerId] = (points[awards.longestRoadPlayerId] ?? 0) + 2;
  if (awards.largestArmyPlayerId) points[awards.largestArmyPlayerId] = (points[awards.largestArmyPlayerId] ?? 0) + 2;

  return points;
}

function maybeEndGame(nextGame, winnerPlayerId) {
  if (!nextGame || nextGame.phase === "game_over") return;
  if (nextGame.phase !== "turn") return;
  if (!winnerPlayerId) return;

  const target = clampNonNegativeInt(nextGame.victoryPointsToWin ?? DEFAULT_VICTORY_POINTS_TO_WIN);
  if (target <= 0) return;

  const pointsByPlayerId = computePointsByPlayerId(nextGame);
  const points = clampNonNegativeInt(pointsByPlayerId[winnerPlayerId] ?? 0);
  if (points < target) return;

  nextGame.phase = "game_over";
  nextGame.subphase = "game_over";
  nextGame.winnerPlayerId = winnerPlayerId;
  nextGame.log.push(
    makeLogEntry({
      type: "system",
      actorPlayerId: winnerPlayerId,
      message: `Won the game with ${points} VP!`,
      data: { points, target }
    })
  );
}

function maybeUpdateLargestArmy(nextGame, actorPlayerId) {
  if (!nextGame || !actorPlayerId) return;
  const played = nextGame.playedKnightsByPlayerId || {};
  const actorCount = clampNonNegativeInt(played[actorPlayerId] ?? 0);
  if (actorCount < LARGEST_ARMY_MIN_KNIGHTS) return;

  const currentHolder = nextGame.awards?.largestArmyPlayerId ?? null;
  if (currentHolder === actorPlayerId) return;

  const currentCount = currentHolder ? clampNonNegativeInt(played[currentHolder] ?? 0) : 0;
  if (currentHolder && actorCount <= currentCount) return;

  nextGame.awards.largestArmyPlayerId = actorPlayerId;
  nextGame.log.push(
    makeLogEntry({
      type: "award",
      actorPlayerId,
      message: "Took Largest Army.",
      data: { playedKnights: actorCount }
    })
  );
  maybeEndGame(nextGame, actorPlayerId);
}

function maybeUpdateLongestRoad(nextGame) {
  if (!nextGame?.awards) return;

  const prevHolder = nextGame.awards.longestRoadPlayerId ?? null;
  const prevLength = clampNonNegativeInt(nextGame.awards.longestRoadLength ?? 0);

  const computed = computeLongestRoadAward(nextGame);
  const maxLength = clampNonNegativeInt(computed.longestRoadLength ?? 0);
  const nextHolder = computed.longestRoadPlayerId ?? null;
  const nextLength = nextHolder ? maxLength : 0;

  if (prevHolder === nextHolder && prevLength === nextLength) return;

  nextGame.awards.longestRoadPlayerId = nextHolder;
  nextGame.awards.longestRoadLength = nextLength;

  if (prevHolder === nextHolder) return;

  if (nextHolder) {
    nextGame.log.push(
      makeLogEntry({
        type: "award",
        actorPlayerId: nextHolder,
        message: `Took Longest Road (${maxLength}).`,
        data: { length: maxLength }
      })
    );
    if (nextHolder === currentPlayerId(nextGame)) maybeEndGame(nextGame, nextHolder);
    return;
  }

  if (prevHolder) {
    const minLength = clampNonNegativeInt(computed.minLength ?? 0);
    const reason = maxLength < minLength ? "below_min" : "tie";
    nextGame.log.push(
      makeLogEntry({
        type: "award",
        message: "Longest Road is unclaimed.",
        data: { maxLength, leaders: computed.leaders ?? [], reason }
      })
    );
  }
}

function computeHints(game) {
  if (game.phase === "game_over") {
    return { prompt: "Game over", expected: null, legalVertexIds: [], legalEdgeIds: [], legalHexIds: [] };
  }

  if (game.phase === "setup_round_1" || game.phase === "setup_round_2") {
    if (game.subphase === "setup_settlement") {
      return {
        prompt: "Place a settlement",
        expected: "PLACE_SETTLEMENT",
        legalVertexIds: legalSetupSettlementVertexIds(game),
        legalEdgeIds: [],
        legalHexIds: []
      };
    }
    if (game.subphase === "setup_road") {
      return {
        prompt: "Place a road (adjacent to your settlement)",
        expected: "PLACE_ROAD",
        legalVertexIds: [],
        legalEdgeIds: legalSetupRoadEdgeIds(game),
        legalHexIds: []
      };
    }
  }

  if (game.phase === "turn") {
    if (game.subphase === "needs_roll") {
      return { prompt: "Roll dice", expected: "ROLL_DICE", legalVertexIds: [], legalEdgeIds: [], legalHexIds: [] };
    }
    if (game.subphase === "robber_discard") {
      return {
        prompt: "7 rolled: discard, then move the robber.",
        expected: "DISCARD_CARDS",
        legalVertexIds: [],
        legalEdgeIds: [],
        legalHexIds: [],
        discardRequiredByPlayerId: game.robber?.discardRequiredByPlayerId || {},
        discardSubmittedByPlayerId: game.robber?.discardSubmittedByPlayerId || {}
      };
    }
    if (game.subphase === "robber_move") {
      return {
        prompt: "Move the robber",
        expected: "MOVE_ROBBER",
        legalVertexIds: [],
        legalEdgeIds: [],
        legalHexIds: legalRobberHexIds(game)
      };
    }
    if (game.subphase === "robber_steal") {
      return {
        prompt: "Choose someone to steal from",
        expected: "STEAL_CARD",
        legalVertexIds: [],
        legalEdgeIds: [],
        legalHexIds: [],
        legalVictimPlayerIds: game.robber?.eligibleVictimPlayerIds || []
      };
    }
    if (game.subphase === "dev_road_building") {
      const pid = currentPlayerId(game);
      const remaining = clampNonNegativeInt(game.devRoadBuilding?.roadsRemaining ?? 0);
      return {
        prompt:
          remaining > 0
            ? `Road Building: place ${remaining} road${remaining === 1 ? "" : "s"}.`
            : "Road Building: place roads.",
        expected: "DEV_ROAD_BUILDING_PLACE_ROAD",
        legalVertexIds: [],
        legalEdgeIds: legalRoadBuildEdgeIds(game, pid),
        legalHexIds: []
      };
    }
    if (game.subphase === "main") {
      return {
        prompt: "Main phase",
        expected: null,
        legalVertexIds: [],
        legalEdgeIds: [],
        legalHexIds: [],
        bankTradeAvailable: true
      };
    }
  }

  return { prompt: "…", expected: null, legalVertexIds: [], legalEdgeIds: [], legalHexIds: [] };
}

export { PRESET_META };
export { EVENT_TYPES, EVENT_IDS, getEventById };

export function createNewGame({
  playerIds,
  presetId,
  gameMode = "classic",
  houseRules = null,
  boardSeed = null,
  variants = null
}) {
  let normalizedBoardSeed = boardSeed == null ? null : String(boardSeed).trim();
  if (presetId === "random-balanced") {
    if (!normalizedBoardSeed) normalizedBoardSeed = crypto.randomBytes(8).toString("hex");
  } else {
    normalizedBoardSeed = null;
  }

  const preset = getPresetDefinition(presetId, { seed: normalizedBoardSeed });
  const settings = resolveGameSettings({ gameMode, houseRules });
  const board = generateStandardBoard(preset);
  const robberHex = board.hexes.find((h) => h.resource === "desert")?.id ?? board.hexes[0]?.id ?? null;
  const turnOrder = [...playerIds];
  const placementOrder = [...turnOrder, ...[...turnOrder].reverse()];
  const playedKnightsByPlayerId = Object.fromEntries(turnOrder.map((pid) => [pid, 0]));
  const victoryPointsToWin = settings.victoryPointsToWin;

  // Normalize variants with defaults
  const normalizedVariants = {
    eventDeckEnabled: !!variants?.eventDeckEnabled,
    speedTradeEnabled: !!variants?.speedTradeEnabled,
    eventDrawInterval: clampNonNegativeInt(variants?.eventDrawInterval) || 3 // Draw event every N turns
  };

  // Create event deck if enabled, using seeded randomness
  let eventDeck = [];
  if (normalizedVariants.eventDeckEnabled) {
    // Create a seeded RNG for the event deck based on board seed or a new random seed
    const eventSeed = normalizedBoardSeed || crypto.randomBytes(8).toString("hex");
    const rng = makeSeededRng(eventSeed + "-events");
    eventDeck = createEventDeck({ rng, copies: 2 });
  }

  return {
    presetId: preset.id,
    boardSeed: normalizedBoardSeed,
    settings,
    variants: normalizedVariants,
    phase: "setup_round_1",
    board,
    structures: { settlements: {}, roads: {} },
    bank: emptyBank(),
    victoryPointsToWin,
    awards: { longestRoadPlayerId: null, longestRoadLength: 0, largestArmyPlayerId: null },
    winnerPlayerId: null,
    robberHexId: robberHex,
    robber: null,
    devDeck: makeDevDeck(),
    devDiscard: [],
    playedKnightsByPlayerId,
    devCardPlayedThisTurn: false,
    devRoadBuilding: null,
    turnOrder,
    currentPlayerIndex: 0,
    turnNumber: 1,
    subphase: "setup_settlement",
    setup: {
      placementOrder,
      placementIndex: 0,
      lastSettlementVertexId: null,
      settlementsPlacedByPlayerId: {}
    },
    lastRoll: null,
    tradeOffers: [],
    // Event deck state
    eventDeck,
    currentEvent: null,
    log: [
      makeLogEntry({
        type: "system",
        message: "Game started.",
        data: { presetId: preset.id, settings, turnOrder, variants: normalizedVariants }
      })
    ]
  };
}

export function getPublicGameSnapshot(game) {
  const pointsByPlayerId = computePointsByPlayerId(game);
  const victoryPointsToWin = game.victoryPointsToWin ?? DEFAULT_VICTORY_POINTS_TO_WIN;
  const settings = isPlainObject(game.settings)
    ? { ...game.settings, gameMode: normalizeGameMode(game.settings?.gameMode), victoryPointsToWin }
    : {
        gameMode: victoryPointsToWin === QUICK_VICTORY_POINTS_TO_WIN ? "quick" : "classic",
        victoryPointsToWin,
        houseRules: null
      };

  // Normalize variants for public snapshot
  const variants =
    game.variants && typeof game.variants === "object"
      ? {
          eventDeckEnabled: !!game.variants.eventDeckEnabled,
          speedTradeEnabled: !!game.variants.speedTradeEnabled
        }
      : { eventDeckEnabled: false, speedTradeEnabled: false };

  // Include current event details if active
  const currentEvent =
    game.currentEvent && typeof game.currentEvent === "object"
      ? {
          id: game.currentEvent.id,
          name: game.currentEvent.name,
          description: game.currentEvent.description,
          shortText: game.currentEvent.shortText
        }
      : null;

  return {
    presetId: game.presetId,
    boardSeed: typeof game.boardSeed === "string" && game.boardSeed ? game.boardSeed : null,
    settings,
    variants,
    phase: game.phase,
    board: game.board,
    structures: game.structures,
    bank: game.bank,
    awards: game.awards || { longestRoadPlayerId: null, longestRoadLength: 0, largestArmyPlayerId: null },
    devDeckCount: Array.isArray(game.devDeck) ? game.devDeck.length : DEV_DECK_SIZE,
    devDiscardCount: Array.isArray(game.devDiscard) ? game.devDiscard.length : 0,
    playedKnightsByPlayerId: game.playedKnightsByPlayerId || {},
    devCardPlayedThisTurn: !!game.devCardPlayedThisTurn,
    victoryPointsToWin,
    pointsByPlayerId,
    winnerPlayerId: game.winnerPlayerId ?? null,
    robberHexId: game.robberHexId,
    turnOrder: game.turnOrder,
    currentPlayerIndex: game.currentPlayerIndex,
    currentPlayerId: currentPlayerId(game),
    turnNumber: game.turnNumber,
    subphase: game.subphase,
    setup:
      game.phase === "setup_round_1" || game.phase === "setup_round_2"
        ? { placementOrder: game.setup.placementOrder, placementIndex: game.setup.placementIndex }
        : null,
    lastRoll: game.lastRoll,
    tradeOffers: game.tradeOffers,
    // Event deck state
    currentEvent,
    eventDeckCount: Array.isArray(game.eventDeck) ? game.eventDeck.length : 0,
    hints: computeHints(game),
    log: game.log.slice(-50)
  };
}

export function applyAction(game, action, actorPlayerId) {
  const actorIsCurrent = actorPlayerId === currentPlayerId(game);
  const nextGame = {
    ...game,
    awards: { ...(game.awards || { longestRoadPlayerId: null, longestRoadLength: 0, largestArmyPlayerId: null }) },
    structures: {
      settlements: { ...game.structures.settlements },
      roads: { ...game.structures.roads }
    },
    bank: { ...game.bank },
    robber: game.robber
      ? {
          discardRequiredByPlayerId: { ...(game.robber.discardRequiredByPlayerId || {}) },
          discardSubmittedByPlayerId: { ...(game.robber.discardSubmittedByPlayerId || {}) },
          eligibleVictimPlayerIds: [...(game.robber.eligibleVictimPlayerIds || [])]
        }
      : null,
    devDeck: Array.isArray(game.devDeck) ? [...game.devDeck] : makeDevDeck(),
    devDiscard: Array.isArray(game.devDiscard) ? [...game.devDiscard] : [],
    playedKnightsByPlayerId: { ...(game.playedKnightsByPlayerId || {}) },
    devCardPlayedThisTurn: !!game.devCardPlayedThisTurn,
    devRoadBuilding: game.devRoadBuilding ? { ...game.devRoadBuilding } : null,
    setup: game.setup
      ? { ...game.setup, settlementsPlacedByPlayerId: { ...game.setup.settlementsPlacedByPlayerId } }
      : null,
    tradeOffers: (game.tradeOffers || []).map((o) => ({
      ...o,
      give: { ...(o.give || {}) },
      want: { ...(o.want || {}) },
      rejectedByPlayerIds: [...(o.rejectedByPlayerIds || [])]
    })),
    log: [...game.log],
    lastRoll: game.lastRoll ? { ...game.lastRoll } : null,
    // Event deck state
    eventDeck: Array.isArray(game.eventDeck) ? [...game.eventDeck] : [],
    currentEvent: game.currentEvent ? { ...game.currentEvent } : null,
    variants: game.variants ? { ...game.variants } : { eventDeckEnabled: false, speedTradeEnabled: false }
  };

  switch (action.type) {
    case "BUY_DEV_CARD": {
      if (!actorIsCurrent) return { error: { code: "NOT_YOUR_TURN" } };
      if (nextGame.phase !== "turn") return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "main") return { error: { code: "BAD_PHASE" } };

      const card = nextGame.devDeck?.pop?.() ?? null;
      if (!card) return { error: { code: "DEV_DECK_EMPTY" } };

      nextGame.log.push(
        makeLogEntry({
          type: "dev",
          actorPlayerId,
          message: "Bought a development card.",
          data: { cost: DEV_CARD_COST, devDeckCount: nextGame.devDeck.length }
        })
      );
      return { game: nextGame, privateUpdates: [{ playerId: actorPlayerId, devCardDraw: card }] };
    }

    case "PLAY_DEV_CARD": {
      if (!actorIsCurrent) return { error: { code: "NOT_YOUR_TURN" } };
      if (nextGame.phase !== "turn") return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "main") return { error: { code: "BAD_PHASE" } };
      if (nextGame.devCardPlayedThisTurn) return { error: { code: "ALREADY_PLAYED_DEV_CARD" } };

      const card = String(action?.card || "");
      if (!DEV_CARD_TYPES.includes(card) || card === "victory_point") return { error: { code: "BAD_DEV_CARD" } };

      nextGame.devCardPlayedThisTurn = true;
      nextGame.devDiscard.push(card);

      if (card === "knight") {
        nextGame.playedKnightsByPlayerId[actorPlayerId] = clampNonNegativeInt(
          (nextGame.playedKnightsByPlayerId[actorPlayerId] ?? 0) + 1
        );
        const count = clampNonNegativeInt(nextGame.playedKnightsByPlayerId[actorPlayerId] ?? 0);
        nextGame.log.push(
          makeLogEntry({
            type: "dev",
            actorPlayerId,
            message: "Played a Knight.",
            data: { playedKnights: count }
          })
        );
        maybeUpdateLargestArmy(nextGame, actorPlayerId);
        if (nextGame.phase === "game_over") return { game: nextGame, privateUpdates: [] };
        nextGame.subphase = "robber_move";
        nextGame.robber = {
          discardRequiredByPlayerId: {},
          discardSubmittedByPlayerId: {},
          eligibleVictimPlayerIds: []
        };
        return { game: nextGame, privateUpdates: [] };
      }

      if (card === "road_building") {
        const legal = legalRoadBuildEdgeIds(nextGame, actorPlayerId);
        nextGame.log.push(
          makeLogEntry({
            type: "dev",
            actorPlayerId,
            message: "Played Road Building.",
            data: { roadsRemaining: Math.min(2, legal.length) }
          })
        );
        if (legal.length === 0) return { game: nextGame, privateUpdates: [] };
        nextGame.subphase = "dev_road_building";
        nextGame.devRoadBuilding = { roadsRemaining: 2 };
        return { game: nextGame, privateUpdates: [] };
      }

      if (card === "year_of_plenty") {
        const take = normalizeResourceCounts(action?.take);
        const total = sumResourceCounts(take);
        if (total !== 2) return { error: { code: "BAD_DEV_SELECTION" } };
        for (const r of RESOURCE_TYPES) {
          if (clampNonNegativeInt(nextGame.bank?.[r] ?? 0) < clampNonNegativeInt(take[r] ?? 0))
            return { error: { code: "BANK_EMPTY" } };
        }

        for (const r of RESOURCE_TYPES) {
          nextGame.bank[r] = clampNonNegativeInt((nextGame.bank?.[r] ?? 0) - clampNonNegativeInt(take[r] ?? 0));
        }

        nextGame.log.push(
          makeLogEntry({
            type: "dev",
            actorPlayerId,
            message: "Played Year of Plenty.",
            data: { count: 2 }
          })
        );
        return { game: nextGame, privateUpdates: [{ playerId: actorPlayerId, handDelta: take }] };
      }

      if (card === "monopoly") {
        const resourceType = String(action?.resourceType || "");
        if (!RESOURCE_TYPES.includes(resourceType)) return { error: { code: "BAD_DEV_SELECTION" } };
        nextGame.log.push(
          makeLogEntry({
            type: "dev",
            actorPlayerId,
            message: `Played Monopoly (${resourceType}).`,
            data: { resourceType }
          })
        );
        return { game: nextGame, privateUpdates: [] };
      }

      return { error: { code: "BAD_DEV_CARD" } };
    }

    case "DEV_ROAD_BUILDING_PLACE_ROAD": {
      if (!actorIsCurrent) return { error: { code: "NOT_YOUR_TURN" } };
      if (nextGame.phase !== "turn") return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "dev_road_building") return { error: { code: "BAD_PHASE" } };

      const remaining = clampNonNegativeInt(nextGame.devRoadBuilding?.roadsRemaining ?? 0);
      if (remaining <= 0) return { error: { code: "BAD_PHASE" } };

      const edgeId = String(action.edgeId || "");
      const edge = nextGame.board.edges.find((e) => e.id === edgeId);
      if (!edge) return { error: { code: "BAD_EDGE" } };
      if (countRoadsByPlayerId(nextGame, actorPlayerId) >= PIECE_LIMITS.roads)
        return { error: { code: "OUT_OF_PIECES_ROAD" } };
      if (!isLegalRoadBuild(nextGame, actorPlayerId, edge)) return { error: { code: "ILLEGAL_PLACEMENT" } };

      nextGame.structures.roads[edgeId] = { playerId: actorPlayerId };

      const nextRemaining = remaining - 1;
      nextGame.devRoadBuilding.roadsRemaining = nextRemaining;
      nextGame.log.push(
        makeLogEntry({
          type: "build",
          actorPlayerId,
          message: "Built a free road.",
          data: { edgeId, roadsRemaining: nextRemaining }
        })
      );

      const nextLegal = nextRemaining > 0 ? legalRoadBuildEdgeIds(nextGame, actorPlayerId) : [];
      if (nextRemaining <= 0 || nextLegal.length === 0) {
        nextGame.subphase = "main";
        nextGame.devRoadBuilding = null;
      }
      maybeUpdateLongestRoad(nextGame);
      return { game: nextGame, privateUpdates: [] };
    }

    case "BUILD_ROAD": {
      if (!actorIsCurrent) return { error: { code: "NOT_YOUR_TURN" } };
      if (nextGame.phase !== "turn") return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "main") return { error: { code: "BAD_PHASE" } };

      const edgeId = String(action.edgeId || "");
      const edge = nextGame.board.edges.find((e) => e.id === edgeId);
      if (!edge) return { error: { code: "BAD_EDGE" } };
      if (countRoadsByPlayerId(nextGame, actorPlayerId) >= PIECE_LIMITS.roads)
        return { error: { code: "OUT_OF_PIECES_ROAD" } };
      if (!isLegalRoadBuild(nextGame, actorPlayerId, edge)) return { error: { code: "ILLEGAL_PLACEMENT" } };

      nextGame.structures.roads[edgeId] = { playerId: actorPlayerId };
      nextGame.log.push(
        makeLogEntry({
          type: "build",
          actorPlayerId,
          message: "Built a road.",
          data: { edgeId }
        })
      );
      maybeUpdateLongestRoad(nextGame);
      return { game: nextGame, privateUpdates: [] };
    }

    case "BUILD_SETTLEMENT": {
      if (!actorIsCurrent) return { error: { code: "NOT_YOUR_TURN" } };
      if (nextGame.phase !== "turn") return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "main") return { error: { code: "BAD_PHASE" } };

      const vertexId = String(action.vertexId || "");
      const vertex = nextGame.board.vertices.find((v) => v.id === vertexId);
      if (!vertex) return { error: { code: "BAD_VERTEX" } };
      if (countSettlementsByPlayerId(nextGame, actorPlayerId) >= PIECE_LIMITS.settlements)
        return { error: { code: "OUT_OF_PIECES_SETTLEMENT" } };
      if (!isLegalSettlementBuild(nextGame, actorPlayerId, vertex)) return { error: { code: "ILLEGAL_PLACEMENT" } };

      nextGame.structures.settlements[vertexId] = { playerId: actorPlayerId, kind: "settlement" };
      nextGame.log.push(
        makeLogEntry({
          type: "build",
          actorPlayerId,
          message: "Built a settlement.",
          data: { vertexId }
        })
      );
      maybeUpdateLongestRoad(nextGame);
      maybeEndGame(nextGame, actorPlayerId);
      return { game: nextGame, privateUpdates: [] };
    }

    case "BUILD_CITY": {
      if (!actorIsCurrent) return { error: { code: "NOT_YOUR_TURN" } };
      if (nextGame.phase !== "turn") return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "main") return { error: { code: "BAD_PHASE" } };

      const vertexId = String(action.vertexId || "");
      const existing = nextGame.structures.settlements[vertexId];
      if (!existing) return { error: { code: "NO_SETTLEMENT" } };
      if (existing.playerId !== actorPlayerId) return { error: { code: "NOT_YOURS" } };
      if (existing.kind !== "settlement") return { error: { code: "ALREADY_CITY" } };
      if (countCitiesByPlayerId(nextGame, actorPlayerId) >= PIECE_LIMITS.cities)
        return { error: { code: "OUT_OF_PIECES_CITY" } };

      nextGame.structures.settlements[vertexId] = { playerId: actorPlayerId, kind: "city" };
      nextGame.log.push(
        makeLogEntry({
          type: "build",
          actorPlayerId,
          message: "Upgraded to a city.",
          data: { vertexId }
        })
      );
      maybeEndGame(nextGame, actorPlayerId);
      return { game: nextGame, privateUpdates: [] };
    }

    case "PLACE_SETTLEMENT": {
      if (!actorIsCurrent) return { error: { code: "NOT_YOUR_TURN" } };
      if (!(nextGame.phase === "setup_round_1" || nextGame.phase === "setup_round_2"))
        return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "setup_settlement") return { error: { code: "BAD_PHASE" } };

      const vertexId = String(action.vertexId || "");
      const vertex = nextGame.board.vertices.find((v) => v.id === vertexId);
      if (!vertex) return { error: { code: "BAD_VERTEX" } };
      if (countSettlementsByPlayerId(nextGame, actorPlayerId) >= PIECE_LIMITS.settlements)
        return { error: { code: "OUT_OF_PIECES_SETTLEMENT" } };

      const legal = new Set(legalSetupSettlementVertexIds(nextGame));
      if (!legal.has(vertexId)) return { error: { code: "ILLEGAL_PLACEMENT" } };

      nextGame.structures.settlements[vertexId] = { playerId: actorPlayerId, kind: "settlement" };
      nextGame.setup.lastSettlementVertexId = vertexId;
      nextGame.subphase = "setup_road";

      const prev = clampNonNegativeInt(nextGame.setup.settlementsPlacedByPlayerId[actorPlayerId] ?? 0);
      const nextCount = prev + 1;
      nextGame.setup.settlementsPlacedByPlayerId[actorPlayerId] = nextCount;

      nextGame.log.push(
        makeLogEntry({
          type: "build",
          actorPlayerId,
          message: `Placed a settlement (${nextCount}/2).`,
          data: { vertexId, count: nextCount }
        })
      );

      let privateUpdates = [];
      if (nextCount === 2) {
        const perPlayer = { [actorPlayerId]: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 } };
        for (const hexId of vertex.adjacentHexIds) {
          const hex = nextGame.board.hexes.find((h) => h.id === hexId);
          if (!hex) continue;
          if (hex.resource === "desert") continue;
          perPlayer[actorPlayerId][hex.resource] += 1;
        }
        const bankRes = applyBankAndBuildPrivateUpdates(nextGame, perPlayer);
        nextGame.bank = bankRes.nextBank;
        privateUpdates = bankRes.privateUpdates;
        const gains = Object.fromEntries(privateUpdates.map((u) => [u.playerId, u.handDelta]));
        if (Object.keys(gains).length) {
          nextGame.log.push(
            makeLogEntry({
              type: "bank",
              message: "Starting resources distributed.",
              data: { gains }
            })
          );
        }
        if (bankRes.blockedResources.length) {
          nextGame.log.push(
            makeLogEntry({
              type: "bank",
              message: `Bank is empty for: ${bankRes.blockedResources.join(", ")}.`,
              data: { blockedResources: bankRes.blockedResources }
            })
          );
        }
      }
      maybeUpdateLongestRoad(nextGame);
      return { game: nextGame, privateUpdates };
    }

    case "PLACE_ROAD": {
      if (!actorIsCurrent) return { error: { code: "NOT_YOUR_TURN" } };
      if (!(nextGame.phase === "setup_round_1" || nextGame.phase === "setup_round_2"))
        return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "setup_road") return { error: { code: "BAD_PHASE" } };

      const edgeId = String(action.edgeId || "");
      const edge = nextGame.board.edges.find((e) => e.id === edgeId);
      if (!edge) return { error: { code: "BAD_EDGE" } };
      if (countRoadsByPlayerId(nextGame, actorPlayerId) >= PIECE_LIMITS.roads)
        return { error: { code: "OUT_OF_PIECES_ROAD" } };

      const legal = new Set(legalSetupRoadEdgeIds(nextGame));
      if (!legal.has(edgeId)) return { error: { code: "ILLEGAL_PLACEMENT" } };
      if (nextGame.structures.roads[edgeId]) return { error: { code: "EDGE_OCCUPIED" } };

      nextGame.structures.roads[edgeId] = { playerId: actorPlayerId };
      nextGame.log.push(
        makeLogEntry({
          type: "build",
          actorPlayerId,
          message: "Placed a road.",
          data: { edgeId }
        })
      );

      nextGame.setup.lastSettlementVertexId = null;
      nextGame.setup.placementIndex += 1;
      nextGame.subphase = "setup_settlement";

      const n = nextGame.turnOrder.length;
      const total = nextGame.setup.placementOrder.length;
      if (nextGame.setup.placementIndex >= total) {
        nextGame.phase = "turn";
        nextGame.subphase = "needs_roll";
        nextGame.log.push(makeLogEntry({ type: "system", message: "Setup complete. Begin turn 1." }));
      } else {
        nextGame.phase = nextGame.setup.placementIndex < n ? "setup_round_1" : "setup_round_2";
      }

      maybeUpdateLongestRoad(nextGame);
      return { game: nextGame, privateUpdates: [] };
    }

    case "ROLL_DICE": {
      if (!actorIsCurrent) return { error: { code: "NOT_YOUR_TURN" } };
      if (nextGame.phase !== "turn") return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "needs_roll") {
        return { error: { code: "BAD_PHASE" } };
      }

      const d1 = action.d1;
      const d2 = action.d2;
      if (![d1, d2].every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) {
        return { error: { code: "BAD_DICE" } };
      }

      // Draw an event if event deck is enabled and it's time for one
      if (nextGame.variants?.eventDeckEnabled && Array.isArray(nextGame.eventDeck) && nextGame.eventDeck.length > 0) {
        const interval = clampNonNegativeInt(nextGame.variants?.eventDrawInterval) || 3;
        if (shouldDrawEvent(nextGame.turnNumber, interval)) {
          const { eventId, deck: newDeck } = drawEvent(nextGame.eventDeck);
          nextGame.eventDeck = newDeck;
          if (eventId) {
            const eventMeta = getEventById(eventId);
            if (eventMeta) {
              nextGame.currentEvent = {
                id: eventMeta.id,
                name: eventMeta.name,
                description: eventMeta.description,
                shortText: eventMeta.shortText,
                drawnAt: nowMs(),
                turnNumber: nextGame.turnNumber
              };
              nextGame.log.push(
                makeLogEntry({
                  type: "event",
                  message: `Event: ${eventMeta.name} — ${eventMeta.shortText}`,
                  data: { eventId: eventMeta.id, eventName: eventMeta.name, eventDescription: eventMeta.description }
                })
              );
            }
          }
        }
      }

      nextGame.lastRoll = { d1, d2, sum: d1 + d2, at: nowMs(), by: actorPlayerId };
      let privateUpdates = [];

      const sum = d1 + d2;
      nextGame.log.push(
        makeLogEntry({
          type: "roll",
          actorPlayerId,
          message: `Rolled ${sum} (${d1}+${d2}).`,
          data: { d1, d2, sum }
        })
      );
      if (sum === 7) {
        const input =
          action?.discardRequiredByPlayerId && typeof action.discardRequiredByPlayerId === "object"
            ? action.discardRequiredByPlayerId
            : {};
        const discardRequiredByPlayerId = {};
        for (const pid of nextGame.turnOrder) {
          const need = clampNonNegativeInt(input[pid] ?? 0);
          if (need > 0) discardRequiredByPlayerId[pid] = need;
        }
        nextGame.robber = {
          discardRequiredByPlayerId,
          discardSubmittedByPlayerId: {},
          eligibleVictimPlayerIds: []
        };

        nextGame.log.push(makeLogEntry({ type: "system", message: "Rolled 7! Resolve the robber." }));
        nextGame.subphase = Object.keys(discardRequiredByPlayerId).length ? "robber_discard" : "robber_move";
        return { game: nextGame, privateUpdates };
      }

      nextGame.subphase = "main";
      const perPlayer = {};
      for (const hex of nextGame.board.hexes) {
        if (hex.token !== sum) continue;
        if (hex.id === nextGame.robberHexId) continue;
        if (hex.resource === "desert") continue;

        for (const vertexId of hex.cornerVertexIds) {
          const s = nextGame.structures.settlements[vertexId];
          if (!s) continue;
          const gain = s.kind === "city" ? 2 : 1;
          if (!perPlayer[s.playerId]) perPlayer[s.playerId] = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
          perPlayer[s.playerId][hex.resource] += gain;
        }
      }

      const bankRes = applyBankAndBuildPrivateUpdates(nextGame, perPlayer);
      nextGame.bank = bankRes.nextBank;
      privateUpdates = bankRes.privateUpdates;
      const gains = Object.fromEntries(privateUpdates.map((u) => [u.playerId, u.handDelta]));
      if (Object.keys(gains).length) {
        nextGame.log.push(makeLogEntry({ type: "bank", message: "Resources distributed.", data: { gains } }));
      } else {
        nextGame.log.push(makeLogEntry({ type: "bank", message: "No resources produced." }));
      }
      if (bankRes.blockedResources.length) {
        nextGame.log.push(
          makeLogEntry({
            type: "bank",
            message: `Bank is empty for: ${bankRes.blockedResources.join(", ")}.`,
            data: { blockedResources: bankRes.blockedResources }
          })
        );
      }
      return { game: nextGame, privateUpdates };
    }

    case "DISCARD_CARDS": {
      if (nextGame.phase !== "turn") return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "robber_discard") return { error: { code: "BAD_PHASE" } };

      const required = clampNonNegativeInt(nextGame.robber?.discardRequiredByPlayerId?.[actorPlayerId] ?? 0);
      if (required <= 0) return { error: { code: "NO_DISCARD_REQUIRED" } };
      if (nextGame.robber?.discardSubmittedByPlayerId?.[actorPlayerId]) return { error: { code: "ALREADY_DISCARDED" } };

      const counts = normalizeResourceCounts(action?.counts);
      const total = sumResourceCounts(counts);
      if (total !== required) return { error: { code: "BAD_DISCARD" } };

      nextGame.robber.discardSubmittedByPlayerId[actorPlayerId] = true;
      nextGame.log.push(
        makeLogEntry({
          type: "robber",
          actorPlayerId,
          message: `Discarded ${required} card${required === 1 ? "" : "s"}.`,
          data: { discardedCount: required }
        })
      );

      const requiredPids = Object.keys(nextGame.robber?.discardRequiredByPlayerId || {});
      const allDone = requiredPids.every((pid) => !!nextGame.robber.discardSubmittedByPlayerId[pid]);
      if (allDone) nextGame.subphase = "robber_move";

      return { game: nextGame, privateUpdates: [] };
    }

    case "MOVE_ROBBER": {
      if (!actorIsCurrent) return { error: { code: "NOT_YOUR_TURN" } };
      if (nextGame.phase !== "turn") return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "robber_move") return { error: { code: "BAD_PHASE" } };

      const hexId = String(action?.hexId || "");
      const legal = new Set(legalRobberHexIds(nextGame));
      if (!legal.has(hexId)) return { error: { code: "ILLEGAL_TARGET" } };

      nextGame.robberHexId = hexId;
      nextGame.log.push(
        makeLogEntry({
          type: "robber",
          actorPlayerId,
          message: "Moved the robber.",
          data: { hexId }
        })
      );

      const victims = eligibleVictimPlayerIdsForRobberHex(nextGame, hexId, actorPlayerId);
      if (victims.length === 0) {
        nextGame.log.push(
          makeLogEntry({
            type: "robber",
            actorPlayerId,
            message: "No one to steal from.",
            data: { hexId }
          })
        );
        nextGame.subphase = "main";
        nextGame.robber = null;
      } else {
        if (!nextGame.robber)
          nextGame.robber = {
            discardRequiredByPlayerId: {},
            discardSubmittedByPlayerId: {},
            eligibleVictimPlayerIds: []
          };
        nextGame.robber.eligibleVictimPlayerIds = victims;
        nextGame.subphase = "robber_steal";
      }

      return { game: nextGame, privateUpdates: [] };
    }

    case "STEAL_CARD": {
      if (!actorIsCurrent) return { error: { code: "NOT_YOUR_TURN" } };
      if (nextGame.phase !== "turn") return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "robber_steal") return { error: { code: "BAD_PHASE" } };

      const fromPlayerId = String(action?.fromPlayerId || "");
      const legalVictims = new Set(nextGame.robber?.eligibleVictimPlayerIds || []);
      if (!legalVictims.has(fromPlayerId)) return { error: { code: "ILLEGAL_TARGET" } };

      const didSteal = action?.didSteal === false ? false : true;
      nextGame.log.push(
        makeLogEntry({
          type: "robber",
          actorPlayerId,
          message: didSteal ? "Stole a card." : "Tried to steal, but they had no cards.",
          data: { fromPlayerId, didSteal }
        })
      );

      nextGame.subphase = "main";
      nextGame.robber = null;
      return { game: nextGame, privateUpdates: [] };
    }

    case "BANK_TRADE": {
      if (!actorIsCurrent) return { error: { code: "NOT_YOUR_TURN" } };
      if (nextGame.phase !== "turn") return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "main") return { error: { code: "BAD_PHASE" } };

      const give = normalizeResourceCounts(action.give);
      const receive = normalizeResourceCounts(action.receive);
      const giveOne = singleResourceTypeAndCount(give);
      const receiveOne = singleResourceTypeAndCount(receive);
      if (!giveOne || !receiveOne) return { error: { code: "BAD_TRADE" } };
      if (giveOne.type === receiveOne.type) return { error: { code: "BAD_TRADE" } };

      const ratios = computeBankTradeRatiosByGiveResource(nextGame, actorPlayerId);
      const ratio = clampNonNegativeInt(ratios[giveOne.type] ?? 4);
      if (ratio <= 0) return { error: { code: "BAD_TRADE" } };
      if (giveOne.count !== ratio * receiveOne.count) return { error: { code: "BAD_TRADE" } };

      if (clampNonNegativeInt(nextGame.bank?.[receiveOne.type] ?? 0) < receiveOne.count) {
        return { error: { code: "BANK_EMPTY" } };
      }

      nextGame.log.push(
        makeLogEntry({
          type: "trade",
          actorPlayerId,
          message: "Traded with the bank.",
          data: { kind: "bank", ratio, give, want: receive }
        })
      );
      return { game: nextGame, privateUpdates: [] };
    }

    case "END_TURN": {
      if (!actorIsCurrent) return { error: { code: "NOT_YOUR_TURN" } };
      if (nextGame.phase !== "turn") return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "main") return { error: { code: "BAD_PHASE" } };

      // Expire any still-open trade offers made this turn.
      for (const offer of nextGame.tradeOffers) {
        if (offer.status === "open" && offer.fromPlayerId === actorPlayerId) offer.status = "expired";
      }

      // Clear current event at end of turn (event lasted for this turn only)
      const endedEvent = nextGame.currentEvent;
      if (endedEvent) {
        nextGame.log.push(
          makeLogEntry({
            type: "event",
            message: `Event ended: ${endedEvent.name}.`,
            data: { eventId: endedEvent.id, eventName: endedEvent.name }
          })
        );
        nextGame.currentEvent = null;
      }

      nextGame.currentPlayerIndex = (nextGame.currentPlayerIndex + 1) % nextGame.turnOrder.length;
      if (nextGame.currentPlayerIndex === 0) nextGame.turnNumber += 1;
      nextGame.subphase = "needs_roll";
      nextGame.devCardPlayedThisTurn = false;
      nextGame.log.push(
        makeLogEntry({
          type: "turn",
          actorPlayerId,
          message: "Ended their turn.",
          data: { nextPlayerId: currentPlayerId(nextGame), turnNumber: nextGame.turnNumber }
        })
      );
      return { game: nextGame, privateUpdates: [] };
    }

    case "TRADE_OFFER_CREATE": {
      if (!actorIsCurrent) return { error: { code: "NOT_YOUR_TURN" } };
      if (nextGame.phase !== "turn") return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "main") return { error: { code: "BAD_PHASE" } };

      const to = action.to === "all" ? "all" : String(action.to || "");
      if (to !== "all") {
        if (to === actorPlayerId) return { error: { code: "BAD_TRADE_TO" } };
        if (!nextGame.turnOrder.includes(to)) return { error: { code: "BAD_TRADE_TO" } };
      }

      const give = normalizeResourceCounts(action.give);
      const want = normalizeResourceCounts(action.want);
      if (!hasAnyResources(give) || !hasAnyResources(want)) return { error: { code: "BAD_TRADE" } };

      const offer = {
        id: crypto.randomUUID(),
        createdAt: nowMs(),
        fromPlayerId: actorPlayerId,
        to,
        give,
        want,
        status: "open",
        acceptedByPlayerId: null,
        rejectedByPlayerIds: []
      };

      nextGame.tradeOffers.push(offer);
      nextGame.log.push(makeLogEntry({ type: "trade", actorPlayerId, message: "Offered a trade.", data: offer }));
      return { game: nextGame, privateUpdates: [] };
    }

    case "TRADE_OFFER_CANCEL": {
      if (!actorIsCurrent) return { error: { code: "NOT_YOUR_TURN" } };
      if (nextGame.phase !== "turn") return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "main") return { error: { code: "BAD_PHASE" } };

      const offerId = String(action.offerId || "");
      const offer = nextGame.tradeOffers.find((o) => o.id === offerId);
      if (!offer) return { error: { code: "NO_SUCH_OFFER" } };
      if (offer.status !== "open") return { error: { code: "OFFER_CLOSED" } };
      if (offer.fromPlayerId !== actorPlayerId) return { error: { code: "NOT_YOURS" } };

      offer.status = "cancelled";
      nextGame.log.push(makeLogEntry({ type: "trade", actorPlayerId, message: "Cancelled the trade.", data: offer }));
      return { game: nextGame, privateUpdates: [] };
    }

    case "TRADE_OFFER_RESPOND": {
      if (nextGame.phase !== "turn") return { error: { code: "BAD_PHASE" } };
      if (nextGame.subphase !== "main") return { error: { code: "BAD_PHASE" } };
      const offer = nextGame.tradeOffers.find((o) => o.id === action.offerId);
      if (!offer) return { error: { code: "NO_SUCH_OFFER" } };
      if (offer.status !== "open") return { error: { code: "OFFER_CLOSED" } };
      if (offer.fromPlayerId === actorPlayerId) return { error: { code: "CANNOT_ACCEPT_OWN_OFFER" } };
      if (offer.to !== "all" && offer.to !== actorPlayerId) return { error: { code: "NOT_FOR_YOU" } };
      if (offer.rejectedByPlayerIds?.includes(actorPlayerId)) return { error: { code: "ALREADY_REJECTED" } };

      if (action.response === "accept") {
        offer.status = "accepted";
        offer.acceptedByPlayerId = actorPlayerId;
        nextGame.log.push(makeLogEntry({ type: "trade", actorPlayerId, message: "Accepted the trade.", data: offer }));
        return { game: nextGame, privateUpdates: [] };
      }

      if (action.response === "reject") {
        if (!offer.rejectedByPlayerIds.includes(actorPlayerId)) offer.rejectedByPlayerIds.push(actorPlayerId);

        // Targeted offers close on a single rejection. Global offers close when everyone rejects.
        if (offer.to !== "all") {
          offer.status = "rejected";
        } else {
          const everyoneElse = nextGame.turnOrder.filter((pid) => pid !== offer.fromPlayerId);
          if (everyoneElse.every((pid) => offer.rejectedByPlayerIds.includes(pid))) offer.status = "rejected";
        }

        nextGame.log.push(makeLogEntry({ type: "trade", actorPlayerId, message: "Rejected the trade.", data: offer }));
        return { game: nextGame, privateUpdates: [] };
      }

      return { error: { code: "BAD_TRADE_RESPONSE" } };
    }

    default:
      return { error: { code: "UNKNOWN_ACTION" } };
  }
}
