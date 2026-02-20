import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";

import { createNewGame, applyAction, getPublicGameSnapshot, PRESET_META } from "../../packages/game-engine/index.js";
import { computeLongestRoadAward } from "../../packages/game-engine/longest-road.js";
import { RESOURCE_TYPES, emptyHand, normalizeResourceCounts } from "../../packages/shared/resources.js";
import { BUILD_COSTS, DEV_CARD_COST, hasAnyResources, hasEnoughResources } from "./public/shared/action-gates.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoDir = path.join(__dirname, "../..");
const publicDir = path.join(__dirname, "public");
const buildDir = path.join(publicDir, "build");
const vendorThreeDir = path.join(repoDir, "node_modules", "three", "build");
const dataDir = process.env.DATA_DIR ? path.resolve(String(process.env.DATA_DIR)) : path.join(__dirname, "data");
const persistRoomsDir = path.join(dataDir, "rooms");
const feedbackDir = path.join(dataDir, "feedback");
const PERSIST_SCHEMA_VERSION = 1;

const LOG_LEVEL = normalizeLogLevel(process.env.LOG_LEVEL);
const ROOM_TTL_HOURS = normalizeRoomTtlHours(process.env.ROOM_TTL_HOURS);
const ROOM_TTL_MS = ROOM_TTL_HOURS > 0 ? ROOM_TTL_HOURS * 60 * 60 * 1000 : 0;

const PORT = Number(process.env.PORT || 3000);
const HOST = String(process.env.HOST || "0.0.0.0");
const MAX_JSON_BYTES = Math.max(4096, Math.min(1024 * 1024, Number(process.env.MAX_JSON_BYTES || 65536) || 65536));

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PLAYER_COLORS = ["red", "blue", "white", "orange", "green", "brown"];
const PRESETS = PRESET_META;
const THEME_PACKS = [
  { id: "aurora", name: "Aurora" },
  { id: "ember", name: "Ember" },
  { id: "ocean", name: "Ocean" },
  { id: "classic-night", name: "Classic Night" },
  { id: "neon-arcade", name: "Neon Arcade" },
  { id: "deep-sea", name: "Deep Sea" }
];
const DICE_PROFILES = ["standard", "high_conflict"];
const SCENARIOS = [
  {
    id: "classic",
    name: "Classic",
    description: "Standard rules • Balanced board • First to 10 VP.",
    rulesSummary: "Classic • 10 VP • Standard dice.",
    presetId: "classic-balanced",
    boardSeed: null,
    gameMode: "classic",
    victoryPointsToWin: null,
    houseRules: null,
    themeId: "aurora",
    diceProfile: "standard"
  },
  {
    id: "quick",
    name: "Quick",
    description: "Shorter game • First to 8 VP • Faster turn nudges.",
    rulesSummary: "Quick • 8 VP • Standard dice.",
    presetId: "classic-balanced",
    boardSeed: null,
    gameMode: "quick",
    victoryPointsToWin: null,
    houseRules: null,
    themeId: "ember",
    diceProfile: "standard"
  },
  {
    id: "traders-paradise",
    name: "Trader's Paradise",
    description: "Ports + variety • Make deals early • First to 10 VP.",
    rulesSummary: "Trader's Paradise • 10 VP • Trade-heavy board.",
    presetId: "trade-heavy",
    boardSeed: null,
    gameMode: "classic",
    victoryPointsToWin: null,
    houseRules: null,
    themeId: "ocean",
    diceProfile: "standard"
  },
  {
    id: "high-conflict",
    name: "High Conflict",
    description: "More robber pressure • Deny routes • First to 10 VP.",
    rulesSummary: "High Conflict • 10 VP • More 7s (robber).",
    presetId: "high-brick-wood",
    boardSeed: null,
    gameMode: "classic",
    victoryPointsToWin: null,
    houseRules: null,
    themeId: "ember",
    diceProfile: "high_conflict",
    variants: null
  },
  {
    id: "party-mode",
    name: "Party Mode",
    description: "Random events every 3 turns • Memorable moments • First to 10 VP.",
    rulesSummary: "Party Mode • 10 VP • Event deck.",
    presetId: "random-balanced",
    boardSeed: null,
    gameMode: "classic",
    victoryPointsToWin: null,
    houseRules: null,
    themeId: "aurora",
    diceProfile: "standard",
    variants: { eventDeckEnabled: true, speedTradeEnabled: false }
  }
];
const DEFAULT_SCENARIO_ID = SCENARIOS[0]?.id ?? "classic";
const DEV_CARD_TYPES = ["knight", "year_of_plenty", "road_building", "monopoly", "victory_point"];
const DEV_CARD_PLAYABLE_TYPES = DEV_CARD_TYPES.filter((t) => t !== "victory_point");
const ACTION_IDEMPOTENCY_MAX_ENTRIES = 220;
const EMOTE_TYPES = ["nice", "ouch", "gg"];
const EMOTE_COOLDOWN_MS = 850;
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION_ID_RE = /^[A-Za-z0-9._-]{1,120}$/;
const HOST_PIN_RE = /^\d{4,8}$/;

/** @type {Map<string, any>} */
const rooms = new Map();
const persistStateByRoomCode = new Map();
let persistDirsReadyPromise = null;
let isShuttingDown = false;
const rateStateByKey = new Map();
let lastRateStatePruneAt = 0;

const TRUST_PROXY = /^(1|true|yes|on)$/i.test(String(process.env.TRUST_PROXY || ""));
const RATE_LIMIT_JOIN = {
  capacity: Math.max(1, clampNonNegativeInt(envNumber(process.env.JOIN_RATE_CAPACITY, 24))),
  refillPerSec: Math.max(0.1, envNumber(process.env.JOIN_RATE_REFILL_PER_SEC, 12))
};
const RATE_LIMIT_ACTION = {
  capacity: Math.max(1, clampNonNegativeInt(envNumber(process.env.ACTION_RATE_CAPACITY, 60))),
  refillPerSec: Math.max(0.1, envNumber(process.env.ACTION_RATE_REFILL_PER_SEC, 30))
};
const RATE_LIMIT_EMOTE = {
  capacity: Math.max(1, clampNonNegativeInt(envNumber(process.env.EMOTE_RATE_CAPACITY, 16))),
  refillPerSec: Math.max(0.1, envNumber(process.env.EMOTE_RATE_REFILL_PER_SEC, 8))
};
const RATE_STATE_TTL_MS = 15 * 60 * 1000;
const RATE_STATE_PRUNE_INTERVAL_MS = 60 * 1000;

function nowMs() {
  return Date.now();
}

const serverStartMs = nowMs();

function envNumber(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeIp(ip) {
  const raw = typeof ip === "string" ? ip : "";
  if (raw.startsWith("::ffff:")) return raw.slice("::ffff:".length);
  return raw || "unknown";
}

function clampNonNegativeInt(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

const LOG_RANK = { debug: 10, info: 20, warn: 30, error: 40, silent: 50 };

function normalizeLogLevel(input) {
  const v = String(input || "info")
    .toLowerCase()
    .trim();
  if (v === "debug" || v === "info" || v === "warn" || v === "error" || v === "silent") return v;
  return "info";
}

function normalizeRoomTtlHours(input) {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

function logAt(level, ...args) {
  if ((LOG_RANK[level] ?? 100) < (LOG_RANK[LOG_LEVEL] ?? 20)) return;
  if (level === "error") return console.error(...args);
  if (level === "warn") return console.warn(...args);
  return console.log(...args);
}

function logDebug(...args) {
  logAt("debug", ...args);
}

function logInfo(...args) {
  logAt("info", ...args);
}

function logWarn(...args) {
  logAt("warn", ...args);
}

function logError(...args) {
  logAt("error", ...args);
}

function normalizeMaxPlayers(input) {
  const n = clampNonNegativeInt(Number(input));
  if (n >= 3 && n <= 6) return n;
  if (n > 6) return 6;
  return 4;
}

function hasControlChars(input) {
  return CONTROL_CHARS_RE.test(String(input ?? ""));
}

function stripControlChars(input) {
  return String(input ?? "").replace(/[\x00-\x1F\x7F]/g, "");
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const HOUSE_RULES_ERROR = {
  INVALID: Symbol("house_rules_invalid"),
  VICTORY_POINTS_RANGE: Symbol("house_rules_victory_points_range")
};

function normalizeHouseRules(input, { strict = false } = {}) {
  if (input == null) return null;
  if (!isPlainObject(input)) return strict ? HOUSE_RULES_ERROR.INVALID : null;

  /** @type {any} */
  const next = {};

  if ("victoryPointsToWin" in input) {
    const raw = input.victoryPointsToWin;
    if (raw != null && raw !== "") {
      const n = Number(raw);
      const v = Number.isFinite(n) ? Math.floor(n) : null;
      if (v == null || v < 6 || v > 15) return strict ? HOUSE_RULES_ERROR.VICTORY_POINTS_RANGE : null;
      next.victoryPointsToWin = v;
    }
  }

  if ("emotesEnabled" in input) {
    const raw = input.emotesEnabled;
    if (raw === false) next.emotesEnabled = false;
    else if (raw === true || raw == null) {
      // Default is enabled; omit from overrides.
    } else {
      return strict ? HOUSE_RULES_ERROR.INVALID : null;
    }
  }

  return Object.keys(next).length ? next : null;
}

function normalizeDiceProfile(input) {
  const v = String(input ?? "").trim();
  return DICE_PROFILES.includes(v) ? v : "standard";
}

function scenarioHouseRules(scenario) {
  const sc = scenario && typeof scenario === "object" ? scenario : null;
  if (!sc) return null;

  /** @type {any} */
  const input = {};
  if (sc.victoryPointsToWin != null) input.victoryPointsToWin = sc.victoryPointsToWin;
  if (isPlainObject(sc.houseRules)) Object.assign(input, sc.houseRules);

  return normalizeHouseRules(input);
}

function scenarioBoardSeed(scenario) {
  const sc = scenario && typeof scenario === "object" ? scenario : null;
  if (!sc) return null;
  return normalizeBoardSeed(sc.boardSeed);
}

function getScenarioById(scenarioId) {
  if (typeof scenarioId !== "string") return null;
  const id = scenarioId.trim();
  if (!id) return null;
  return SCENARIOS.find((s) => s.id === id) ?? null;
}

function roomSettingsMatchScenario(room, scenario) {
  if (!room || typeof room !== "object") return false;
  const sc = scenario && typeof scenario === "object" ? scenario : null;
  if (!sc) return false;

  const presetId = PRESETS.some((p) => p.id === sc.presetId) ? sc.presetId : null;
  const themeId = THEME_PACKS.some((t) => t.id === sc.themeId) ? sc.themeId : null;
  if (!presetId || !themeId) return false;

  const expectedGameMode = sc.gameMode === "quick" ? "quick" : "classic";
  const expectedDiceProfile = normalizeDiceProfile(sc.diceProfile);
  const expectedHouseRules = scenarioHouseRules(sc);
  const expectedBoardSeed = presetId === "random-balanced" ? scenarioBoardSeed(sc) : null;

  const actualGameMode = room.gameMode === "quick" ? "quick" : "classic";
  const actualDiceProfile = normalizeDiceProfile(room.diceProfile);
  const actualHouseRules = normalizeHouseRules(room.houseRules);
  const actualBoardSeed = room.presetId === "random-balanced" ? normalizeBoardSeed(room.boardSeed) : null;

  if (room.presetId !== presetId) return false;
  if (room.themeId !== themeId) return false;
  if (actualGameMode !== expectedGameMode) return false;
  if (actualDiceProfile !== expectedDiceProfile) return false;
  if (!!actualHouseRules !== !!expectedHouseRules) return false;
  if (actualHouseRules && expectedHouseRules) {
    for (const k of new Set([...Object.keys(actualHouseRules), ...Object.keys(expectedHouseRules)])) {
      if (actualHouseRules[k] !== expectedHouseRules[k]) return false;
    }
  }
  if (actualBoardSeed !== expectedBoardSeed) return false;

  return true;
}

function inferScenarioIdFromRoom(room) {
  for (const sc of SCENARIOS) {
    if (roomSettingsMatchScenario(room, sc)) return sc.id;
  }
  return null;
}

function normalizeVariants(input) {
  if (!input || typeof input !== "object") {
    return { eventDeckEnabled: false, speedTradeEnabled: false };
  }
  return {
    eventDeckEnabled: !!input.eventDeckEnabled,
    speedTradeEnabled: !!input.speedTradeEnabled
  };
}

function applyScenarioToRoom(room, scenario) {
  const sc = scenario && typeof scenario === "object" ? scenario : null;
  if (!room || typeof room !== "object" || !sc) return false;

  const presetId = PRESETS.some((p) => p.id === sc.presetId) ? sc.presetId : null;
  const themeId = THEME_PACKS.some((t) => t.id === sc.themeId) ? sc.themeId : null;
  if (!presetId || !themeId) return false;

  room.scenarioId = sc.id;
  room.presetId = presetId;
  room.themeId = themeId;
  room.gameMode = sc.gameMode === "quick" ? "quick" : "classic";
  room.diceProfile = normalizeDiceProfile(sc.diceProfile);
  room.boardSeed = presetId === "random-balanced" ? scenarioBoardSeed(sc) : null;
  room.houseRules = scenarioHouseRules(sc);
  room.variants = normalizeVariants(sc.variants);
  return true;
}

const HIGH_CONFLICT_FORCE_SEVEN_CHANCE = 0.04;

function rollD6() {
  return (crypto.randomBytes(1)[0] % 6) + 1;
}

function rollDiceSum7() {
  const pairs = [
    [1, 6],
    [2, 5],
    [3, 4],
    [4, 3],
    [5, 2],
    [6, 1]
  ];
  const idx = crypto.randomBytes(1)[0] % pairs.length;
  const [d1, d2] = pairs[idx];
  return { d1, d2 };
}

function rollDiceForRoom(room) {
  const profile = normalizeDiceProfile(room?.diceProfile);
  if (profile === "high_conflict") {
    const roll = crypto.randomBytes(4).readUInt32BE(0) / 2 ** 32;
    if (roll < HIGH_CONFLICT_FORCE_SEVEN_CHANCE) return rollDiceSum7();
  }
  return { d1: rollD6(), d2: rollD6() };
}

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function safeActionId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120) return null;
  if (!ACTION_ID_RE.test(trimmed)) return null;
  return trimmed;
}

function sanitizePlayerNameForJoin(name) {
  return stripControlChars(name).trim().slice(0, 24);
}

function normalizePrivateState(input) {
  const nextHand = emptyHand();
  const hand = input?.hand && typeof input.hand === "object" ? input.hand : {};
  for (const r of RESOURCE_TYPES) nextHand[r] = clampNonNegativeInt(hand[r] ?? 0);

  return {
    hand: nextHand,
    devCardsInHand: Array.isArray(input?.devCardsInHand)
      ? input.devCardsInHand.filter((c) => DEV_CARD_PLAYABLE_TYPES.includes(c))
      : [],
    devCardsNew: Array.isArray(input?.devCardsNew)
      ? input.devCardsNew.filter((c) => DEV_CARD_PLAYABLE_TYPES.includes(c))
      : [],
    playedKnightsCount: clampNonNegativeInt(input?.playedKnightsCount ?? 0),
    hiddenVictoryPointsCount: clampNonNegativeInt(input?.hiddenVictoryPointsCount ?? 0)
  };
}

function normalizePlayerName(name) {
  const trimmed = stripControlChars(name).trim().slice(0, 24);
  return trimmed || "Player";
}

function normalizeBoardSeed(input) {
  if (input == null) return null;
  const seed = stripControlChars(input).trim().slice(0, 64);
  return seed || null;
}

function normalizeHostPin(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!HOST_PIN_RE.test(s)) return null;
  return s;
}

function isHostPinEnabled(room) {
  if (!room || typeof room !== "object") return false;
  if (typeof room.hostPinSalt !== "string" || !room.hostPinSalt) return false;
  if (typeof room.hostPinHash !== "string" || !room.hostPinHash) return false;
  return true;
}

function hashHostPin(pin, salt) {
  const normalizedPin = normalizeHostPin(pin);
  if (!normalizedPin) return null;
  if (typeof salt !== "string" || !salt) return null;
  return crypto.createHash("sha256").update(`${salt}:${normalizedPin}`).digest("hex");
}

function verifyHostPin(room, providedPin) {
  if (!isHostPinEnabled(room)) return { ok: true, error: null };
  const normalizedPin = normalizeHostPin(providedPin);
  if (!normalizedPin) return { ok: false, error: "HOST_PIN_REQUIRED" };

  const expectedHash = typeof room.hostPinHash === "string" ? room.hostPinHash : "";
  const salt = typeof room.hostPinSalt === "string" ? room.hostPinSalt : "";
  const actualHash = hashHostPin(normalizedPin, salt);
  if (!actualHash) return { ok: false, error: "BAD_HOST_PIN" };

  try {
    const a = Buffer.from(actualHash, "hex");
    const b = Buffer.from(expectedHash, "hex");
    if (a.length !== b.length) return { ok: false, error: "BAD_HOST_PIN" };
    if (!crypto.timingSafeEqual(a, b)) return { ok: false, error: "BAD_HOST_PIN" };
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: "BAD_HOST_PIN" };
  }
}

function serializeRoomForDisk(room) {
  const players = [...room.players.values()].map((p) => ({
    playerId: p.playerId,
    name: p.name,
    color: p.color,
    ready: !!p.ready,
    joinedAt: p.joinedAt,
    lastSeenAt: p.lastSeenAt
  }));

  const privateByPlayerId = {};
  for (const [pid, priv] of room.privateByPlayerId.entries()) {
    privateByPlayerId[pid] = normalizePrivateState(priv);
  }

  return {
    schemaVersion: PERSIST_SCHEMA_VERSION,
    savedAt: nowMs(),
    room: {
      roomId: room.roomId,
      roomCode: room.roomCode,
      adminSecret: typeof room.adminSecret === "string" ? room.adminSecret : null,
      adminIp: typeof room.adminIp === "string" ? room.adminIp : null,
      timer: normalizeRoomTimerState(room.timer),
      revision: clampNonNegativeInt(room.revision ?? 0),
      status: room.status,
      hostPlayerId: room.hostPlayerId,
      scenarioId: typeof room.scenarioId === "string" ? room.scenarioId : null,
      presetId: room.presetId,
      themeId: room.themeId,
      boardSeed: normalizeBoardSeed(room.boardSeed),
      gameMode: room.gameMode === "quick" ? "quick" : "classic",
      maxPlayers: normalizeMaxPlayers(room.maxPlayers),
      houseRules: normalizeHouseRules(room.houseRules),
      diceProfile: normalizeDiceProfile(room.diceProfile),
      variants: normalizeVariants(room.variants),
      hostPinSalt: typeof room.hostPinSalt === "string" ? room.hostPinSalt : null,
      hostPinHash: typeof room.hostPinHash === "string" ? room.hostPinHash : null,
      createdAt: room.createdAt,
      lastActivityAt: room.lastActivityAt,
      players,
      privateByPlayerId,
      game: room.game
    }
  };
}

async function ensurePersistDirs() {
  if (persistDirsReadyPromise) return persistDirsReadyPromise;
  persistDirsReadyPromise = mkdir(persistRoomsDir, { recursive: true }).catch((err) => {
    persistDirsReadyPromise = null;
    throw err;
  });
  return persistDirsReadyPromise;
}

let feedbackDirReadyPromise = null;
async function ensureFeedbackDir() {
  if (feedbackDirReadyPromise) return feedbackDirReadyPromise;
  feedbackDirReadyPromise = mkdir(feedbackDir, { recursive: true }).catch((err) => {
    feedbackDirReadyPromise = null;
    throw err;
  });
  return feedbackDirReadyPromise;
}

async function persistRoomToDisk(room) {
  const roomCode = sanitizeRoomCode(room?.roomCode);
  if (!roomCode) return;
  await ensurePersistDirs();

  const payload = JSON.stringify(serializeRoomForDisk(room));
  const tmpPath = path.join(persistRoomsDir, `${roomCode}.${crypto.randomUUID()}.json.tmp`);
  const filePath = path.join(persistRoomsDir, `${roomCode}.json`);
  await writeFile(tmpPath, payload, "utf8");
  await rename(tmpPath, filePath);
}

function schedulePersistRoom(room) {
  if (isShuttingDown) return;
  const roomCode = sanitizeRoomCode(room?.roomCode);
  if (!roomCode) return;

  let state = persistStateByRoomCode.get(roomCode);
  if (!state) {
    state = { timer: null, writing: false, pending: false };
    persistStateByRoomCode.set(roomCode, state);
  }

  state.pending = true;
  if (state.timer) return;

  state.timer = setTimeout(() => {
    state.timer = null;
    flushPersistRoom(roomCode);
  }, 140);
  state.timer.unref?.();
}

async function flushPersistRoom(roomCode) {
  if (isShuttingDown) return;
  const state = persistStateByRoomCode.get(roomCode);
  if (!state) return;
  if (state.writing) {
    state.pending = true;
    return;
  }
  if (!state.pending) return;

  state.pending = false;
  state.writing = true;

  try {
    const room = rooms.get(roomCode);
    if (room) await persistRoomToDisk(room);
  } catch (err) {
    logWarn(`[catan] persist failed for room ${roomCode}:`, err);
  } finally {
    state.writing = false;
  }

  if (state.pending) flushPersistRoom(roomCode);
}

function restoreRoomFromDisk(payload) {
  const wrapper = payload && typeof payload === "object" ? payload : null;
  if (!wrapper || wrapper.schemaVersion !== PERSIST_SCHEMA_VERSION) return null;

  const saved = wrapper.room && typeof wrapper.room === "object" ? wrapper.room : null;
  if (!saved) return null;

  const roomCode = sanitizeRoomCode(saved.roomCode);
  if (!roomCode) return null;

  const presetId = PRESETS.some((p) => p.id === saved.presetId)
    ? saved.presetId
    : (PRESETS[0]?.id ?? "classic-balanced");
  const themeId = THEME_PACKS.some((t) => t.id === saved.themeId) ? saved.themeId : (THEME_PACKS[0]?.id ?? "aurora");
  const boardSeed = presetId === "random-balanced" ? normalizeBoardSeed(saved.boardSeed) : null;
  const gameMode = saved.gameMode === "quick" ? "quick" : "classic";
  const houseRules = normalizeHouseRules(saved.houseRules);
  const diceProfile = normalizeDiceProfile(saved.diceProfile);
  const scenarioId =
    getScenarioById(saved.scenarioId)?.id ||
    inferScenarioIdFromRoom({ presetId, themeId, boardSeed, gameMode, houseRules, diceProfile }) ||
    DEFAULT_SCENARIO_ID;

  /** @type {any} */
  const room = {
    roomId: typeof saved.roomId === "string" ? saved.roomId : crypto.randomUUID(),
    roomCode,
    adminSecret: typeof saved.adminSecret === "string" ? saved.adminSecret : crypto.randomUUID(),
    adminIp: typeof saved.adminIp === "string" ? saved.adminIp : null,
    timer: normalizeRoomTimerState(saved.timer),
    revision: clampNonNegativeInt(saved.revision ?? 0),
    status: saved.status === "in_game" ? "in_game" : "lobby",
    hostPlayerId: typeof saved.hostPlayerId === "string" ? saved.hostPlayerId : null,
    scenarioId,
    presetId,
    themeId,
    boardSeed,
    gameMode,
    maxPlayers: normalizeMaxPlayers(saved.maxPlayers),
    houseRules,
    diceProfile,
    variants: normalizeVariants(saved.variants),
    hostPinSalt: typeof saved.hostPinSalt === "string" ? saved.hostPinSalt : null,
    hostPinHash: typeof saved.hostPinHash === "string" ? saved.hostPinHash : null,
    createdAt: Number.isFinite(saved.createdAt) ? saved.createdAt : nowMs(),
    lastActivityAt: Number.isFinite(saved.lastActivityAt) ? saved.lastActivityAt : nowMs(),
    players: new Map(),
    privateByPlayerId: new Map(),
    sseClients: new Set(),
    disconnectTimers: new Map(),
    actionResponses: new Map(),
    lastEmoteAtByPlayerId: new Map(),
    game: saved.game && typeof saved.game === "object" ? saved.game : null
  };

  const players = Array.isArray(saved.players) ? saved.players : [];
  for (const p of players) {
    if (!p || typeof p !== "object") continue;
    const playerId = typeof p.playerId === "string" ? p.playerId : null;
    if (!playerId) continue;

    const player = {
      playerId,
      name: normalizePlayerName(p.name),
      color: typeof p.color === "string" ? p.color : pickColor(room),
      ready: !!p.ready,
      connected: false,
      joinedAt: Number.isFinite(p.joinedAt) ? p.joinedAt : nowMs(),
      lastSeenAt: Number.isFinite(p.lastSeenAt) ? p.lastSeenAt : nowMs()
    };

    room.players.set(playerId, player);
  }

  const priv = saved.privateByPlayerId && typeof saved.privateByPlayerId === "object" ? saved.privateByPlayerId : {};
  for (const playerId of room.players.keys()) {
    room.privateByPlayerId.set(playerId, normalizePrivateState(priv[playerId]));
  }

  if (room.status === "in_game" && !room.game) room.status = "lobby";
  maybeReassignHost(room);

  // Reset timer clock on server restart to avoid huge elapsed nudges.
  const timer = normalizeRoomTimerState(room.timer);
  timer.activePlayerId = room.status === "in_game" && room.game ? gameCurrentPlayerId(room.game) : null;
  timer.turnStartedAt = nowMs();
  timer.pausedTotalMs = 0;
  timer.pausedAt = timer.paused ? nowMs() : null;
  room.timer = timer;

  return room;
}

async function loadRoomsFromDisk() {
  await ensurePersistDirs();
  let names = [];
  try {
    names = await readdir(persistRoomsDir);
  } catch (err) {
    logWarn("[catan] failed to read persistence dir:", err);
    return { loaded: 0, errors: 1 };
  }

  let loaded = 0;
  let errors = 0;
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    if (/\.corrupt\./i.test(name)) continue;
    const filePath = path.join(persistRoomsDir, name);
    try {
      const raw = await readFile(filePath, "utf8");
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        errors += 1;
        const base = name.replace(/\.json$/i, "");
        const quarantineName = `${base}.corrupt.${nowMs()}.json`;
        const quarantinePath = path.join(persistRoomsDir, quarantineName);
        let quarantined = false;
        try {
          await rename(filePath, quarantinePath);
          quarantined = true;
        } catch (renameErr) {
          logWarn(`[catan] persisted room JSON corrupt (${name}); failed to quarantine:`, renameErr);
        }
        logWarn(
          `[catan] failed to parse persisted room ${name}${quarantined ? `; quarantined to ${quarantineName}` : ""}:`,
          err
        );
        continue;
      }
      const room = restoreRoomFromDisk(parsed);
      if (!room) continue;
      if (ROOM_TTL_MS > 0 && isRoomExpired(room)) {
        await deletePersistedRoomFile(room.roomCode);
        continue;
      }
      if (rooms.has(room.roomCode)) continue;
      rooms.set(room.roomCode, room);
      loaded += 1;
    } catch (err) {
      errors += 1;
      logWarn(`[catan] failed to load ${name}:`, err);
    }
  }

  return { loaded, errors };
}

function makeRoomCode(len = 5) {
  // Base32-ish, avoids ambiguous chars (0/O, 1/I).
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += ROOM_CODE_CHARS[bytes[i] % ROOM_CODE_CHARS.length];
  }
  return out;
}

function json(res, statusCode, body, extraHeaders = null) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...(extraHeaders || {})
  });
  res.end(payload);
}

function apiError(code, data = null) {
  const c = typeof code === "string" && code.trim() ? code.trim() : "UNKNOWN_ERROR";
  const payload = { code: c };
  if (data != null) payload.data = data;
  return payload;
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(text);
}

function payloadTooLarge(res) {
  json(
    res,
    413,
    { ok: false, error: apiError("REQUEST_TOO_LARGE", { maxBytes: MAX_JSON_BYTES }) },
    { Connection: "close" }
  );
}

function tooManyRequests(res) {
  json(res, 429, { ok: false, error: apiError("RATE_LIMIT") }, { "Retry-After": "1" });
}

function requestIp(req) {
  const remote = req.socket?.remoteAddress || "unknown";
  if (!TRUST_PROXY) return remote;

  const xfwd = req.headers["x-forwarded-for"];
  if (typeof xfwd === "string" && xfwd.trim()) return xfwd.split(",")[0].trim();
  return remote;
}

function isLoopbackIp(ip) {
  if (!ip) return false;
  if (ip === "127.0.0.1" || ip === "::1") return true;
  if (ip.startsWith("::ffff:")) return ip.slice("::ffff:".length) === "127.0.0.1";
  return false;
}

function pruneRateState(now) {
  for (const [key, state] of rateStateByKey.entries()) {
    const at = Number(state?.at);
    if (!Number.isFinite(at) || now - at > RATE_STATE_TTL_MS) rateStateByKey.delete(key);
  }
  lastRateStatePruneAt = now;
}

function allowRequest(req, bucket, { capacity, refillPerSec }) {
  const ip = requestIp(req);
  if (isLoopbackIp(ip)) return true;
  const key = `${bucket}:${ip}`;
  const now = nowMs();
  if (now - lastRateStatePruneAt >= RATE_STATE_PRUNE_INTERVAL_MS) pruneRateState(now);
  const cap = Math.max(1, clampNonNegativeInt(capacity));
  const rate = Math.max(0.1, Number(refillPerSec) || 0);
  const prev = rateStateByKey.get(key) || { tokens: cap, at: now };
  const elapsedSec = Math.max(0, (now - prev.at) / 1000);
  const tokens = Math.min(cap, prev.tokens + elapsedSec * rate);
  if (tokens < 1) {
    rateStateByKey.set(key, { tokens, at: now });
    return false;
  }
  rateStateByKey.set(key, { tokens: tokens - 1, at: now });
  return true;
}

function contentLength(req) {
  const raw = req.headers["content-length"];
  if (typeof raw !== "string") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

async function readJsonBody(req) {
  const declared = contentLength(req);
  if (declared != null && declared > MAX_JSON_BYTES) return Symbol.for("too_large");

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_JSON_BYTES) return Symbol.for("too_large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return Symbol.for("bad_json");
  }
}

function getRoom(roomCode) {
  return rooms.get(roomCode) ?? null;
}

function pickColor(room) {
  const used = new Set([...room.players.values()].map((p) => p.color));
  const available = PLAYER_COLORS.find((c) => !used.has(c));
  return available ?? PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}

function roomPublicSnapshot(room) {
  const players = [...room.players.values()]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => ({
      playerId: p.playerId,
      name: p.name,
      color: p.color,
      ready: p.ready,
      connected: p.connected,
      isHost: p.playerId === room.hostPlayerId
    }));

  const gameSnap = room.game ? getPublicGameSnapshot(room.game) : null;
  if (gameSnap?.phase === "game_over") {
    const finalPointsByPlayerId = { ...(gameSnap.pointsByPlayerId || {}) };
    for (const [pid, priv] of room.privateByPlayerId.entries()) {
      const hidden = clampNonNegativeInt(priv?.hiddenVictoryPointsCount ?? 0);
      if (hidden > 0) finalPointsByPlayerId[pid] = clampNonNegativeInt((finalPointsByPlayerId[pid] ?? 0) + hidden);
    }
    gameSnap.pointsByPlayerId = finalPointsByPlayerId;
    gameSnap.finalPointsByPlayerId = finalPointsByPlayerId;
  }

  const settings = {
    scenarioId: typeof room.scenarioId === "string" && room.scenarioId ? room.scenarioId : DEFAULT_SCENARIO_ID,
    gameMode: room.gameMode === "quick" ? "quick" : "classic"
  };
  const normalizedHouseRules = normalizeHouseRules(room.houseRules);
  if (normalizedHouseRules) settings.houseRules = normalizedHouseRules;

  return {
    serverTimeMs: nowMs(),
    roomCode: room.roomCode,
    revision: clampNonNegativeInt(room.revision ?? 0),
    status: room.status,
    hostPinEnabled: isHostPinEnabled(room),
    hostPlayerId: room.hostPlayerId,
    presetId: room.presetId,
    themeId: room.themeId,
    boardSeed: normalizeBoardSeed(room.boardSeed),
    gameMode: room.gameMode === "quick" ? "quick" : "classic",
    maxPlayers: normalizeMaxPlayers(room.maxPlayers),
    variants: normalizeVariants(room.variants),
    settings,
    timer: normalizeRoomTimerState(room.timer),
    presets: PRESETS,
    scenarios: SCENARIOS,
    themes: THEME_PACKS,
    players,
    game: gameSnap,
    createdAt: room.createdAt,
    lastActivityAt: room.lastActivityAt
  };
}

function playerPrivateSnapshot(room, playerId) {
  const priv = room.privateByPlayerId.get(playerId);
  if (!priv) return null;
  return structuredClone(priv);
}

function canStartRoom(room) {
  const playerCount = room.players.size;
  const maxPlayers = normalizeMaxPlayers(room?.maxPlayers);
  if (playerCount < 3 || playerCount > maxPlayers) return false;
  for (const player of room.players.values()) {
    if (!player.ready) return false;
  }
  return true;
}

function broadcastRoomState(room) {
  room.lastActivityAt = nowMs();
  updateRoomTimer(room);
  room.revision = clampNonNegativeInt(room.revision ?? 0) + 1;
  const publicSnap = roomPublicSnapshot(room);

  for (const client of [...room.sseClients]) {
    const payload = { room: publicSnap };
    if (client.role === "phone" && client.playerId) {
      payload.you = playerPrivateSnapshot(room, client.playerId);
    }
    const ok = sendSseEvent(client.res, "state", payload);
    if (!ok) room.sseClients.delete(client);
  }

  schedulePersistRoom(room);
}

function broadcastRoomEmote(room, payload) {
  room.lastActivityAt = nowMs();
  for (const client of [...room.sseClients]) {
    const ok = sendSseEvent(client.res, "emote", payload);
    if (!ok) room.sseClients.delete(client);
  }
}

function sendSseEvent(res, eventName, data) {
  try {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function notFound(res) {
  sendText(res, 404, "Not found");
}

function badRequest(res, code, data = null) {
  json(res, 400, { ok: false, error: apiError(code, data) });
}

function forbidden(res, code, data = null) {
  json(res, 403, { ok: false, error: apiError(code, data) });
}

function ok(res, body) {
  json(res, 200, { ok: true, ...body });
}

function roomLastActivityAtMs(room) {
  if (!room || typeof room !== "object") return 0;
  const last = Number.isFinite(room.lastActivityAt)
    ? room.lastActivityAt
    : Number.isFinite(room.createdAt)
      ? room.createdAt
      : 0;
  return Math.max(0, last);
}

function isRoomExpired(room) {
  if (ROOM_TTL_MS <= 0) return false;
  return nowMs() - roomLastActivityAtMs(room) > ROOM_TTL_MS;
}

async function deletePersistedRoomFile(roomCode) {
  const code = sanitizeRoomCode(roomCode);
  if (!code) return;
  await ensurePersistDirs();
  try {
    await unlink(path.join(persistRoomsDir, `${code}.json`));
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") return;
    logWarn(`[catan] failed to delete persisted room ${code}:`, err);
  }
}

async function pruneExpiredRooms({ reason = "ttl" } = {}) {
  if (ROOM_TTL_MS <= 0) return { pruned: 0 };
  const cutoff = nowMs() - ROOM_TTL_MS;

  let pruned = 0;
  for (const [roomCode, room] of rooms.entries()) {
    if (room?.sseClients?.size) continue;
    if (roomLastActivityAtMs(room) > cutoff) continue;

    for (const t of room?.disconnectTimers?.values?.() ?? []) clearTimeout(t);
    room?.disconnectTimers?.clear?.();

    const persistState = persistStateByRoomCode.get(roomCode);
    if (persistState?.timer) clearTimeout(persistState.timer);
    persistStateByRoomCode.delete(roomCode);

    rooms.delete(roomCode);
    pruned += 1;
    await deletePersistedRoomFile(roomCode);
  }

  if (pruned) logInfo(`[catan] pruned ${pruned} inactive room${pruned === 1 ? "" : "s"} (${reason})`);
  return { pruned };
}

function sanitizeRoomCode(input) {
  if (!input) return null;
  return String(input)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    case ".map":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

const VENDOR_THREE_FILES = new Map([
  ["three.module.js", "three.module.js"],
  ["three.module.min.js", "three.module.min.js"]
]);

async function serveVendorThree(req, res, pathname) {
  const prefix = "/vendor/three/";
  if (!pathname.startsWith(prefix)) return false;

  const name = pathname.slice(prefix.length);
  const rel = VENDOR_THREE_FILES.get(name);
  if (!rel) {
    notFound(res);
    return true;
  }

  const baseDir = path.resolve(vendorThreeDir);
  const filePath = path.resolve(vendorThreeDir, rel);

  // Block path traversal attempts.
  if (!filePath.startsWith(baseDir)) {
    notFound(res);
    return true;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      notFound(res);
      return true;
    }

    if (req.method === "HEAD") {
      res.writeHead(200, {
        "Content-Type": contentTypeFor(filePath),
        "Cache-Control": "no-store"
      });
      res.end();
      return true;
    }

    const buf = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypeFor(filePath),
      "Cache-Control": "no-store"
    });
    res.end(buf);
    return true;
  } catch {
    notFound(res);
    return true;
  }
}

// Allowed files in build directory (production bundles)
const BUILD_FILES = new Set(["3d.bundle.js", "3d.bundle.js.map"]);

async function serveBuildAssets(req, res, pathname) {
  const prefix = "/build/";
  if (!pathname.startsWith(prefix)) return false;

  const name = pathname.slice(prefix.length);
  // Only allow specific files to prevent serving unexpected content
  if (!BUILD_FILES.has(name)) {
    notFound(res);
    return true;
  }

  const baseDir = path.resolve(buildDir);
  const filePath = path.resolve(buildDir, name);

  // Block path traversal attempts
  if (!filePath.startsWith(baseDir)) {
    notFound(res);
    return true;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      notFound(res);
      return true;
    }

    if (req.method === "HEAD") {
      res.writeHead(200, {
        "Content-Type": contentTypeFor(filePath),
        "Cache-Control": "public, max-age=31536000, immutable"
      });
      res.end();
      return true;
    }

    const buf = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypeFor(filePath),
      // Built assets are immutable (filename changes on content change)
      "Cache-Control": "public, max-age=31536000, immutable"
    });
    res.end(buf);
    return true;
  } catch {
    // Build directory may not exist in dev mode, return false to allow fallthrough
    return false;
  }
}

async function serveStatic(req, res, pathname) {
  let rel = pathname;
  if (rel === "/") rel = "/tv";
  if (rel === "/tv") rel = "/tv/";
  if (rel === "/phone") rel = "/phone/";
  if (rel.endsWith("/")) rel += "index.html";

  const requestedPath = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(publicDir, requestedPath);

  // Block path traversal attempts.
  if (!filePath.startsWith(publicDir)) return notFound(res);

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return notFound(res);
    const buf = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypeFor(filePath),
      "Cache-Control": "no-store"
    });
    res.end(buf);
  } catch {
    notFound(res);
  }
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

function normalizeRoomTimerState(input) {
  const timer = input && typeof input === "object" ? input : null;
  const paused = !!timer?.paused;
  const turnStartedAt = Number.isFinite(timer?.turnStartedAt) ? Math.floor(timer.turnStartedAt) : nowMs();
  const pausedTotalMs = clampNonNegativeInt(timer?.pausedTotalMs ?? 0);
  const activePlayerId = typeof timer?.activePlayerId === "string" ? timer.activePlayerId : null;
  let pausedAt = Number.isFinite(timer?.pausedAt) ? Math.floor(timer.pausedAt) : null;
  if (!paused) pausedAt = null;
  if (paused && pausedAt == null) pausedAt = nowMs();

  return { paused, pausedAt, pausedTotalMs, turnStartedAt, activePlayerId };
}

function ensureRoom(roomCode) {
  let code = roomCode;
  while (!code || rooms.has(code)) code = makeRoomCode(5);

  const room = {
    roomId: crypto.randomUUID(),
    roomCode: code,
    adminSecret: crypto.randomUUID(),
    adminIp: null,
    timer: normalizeRoomTimerState(null),
    revision: 0,
    status: "lobby",
    hostPlayerId: null,
    scenarioId: DEFAULT_SCENARIO_ID,
    presetId: PRESETS[0].id,
    themeId: THEME_PACKS[0].id,
    boardSeed: null,
    gameMode: "classic",
    maxPlayers: 4,
    houseRules: null,
    diceProfile: "standard",
    variants: { eventDeckEnabled: false, speedTradeEnabled: false },
    hostPinSalt: null,
    hostPinHash: null,
    createdAt: nowMs(),
    lastActivityAt: nowMs(),
    players: new Map(),
    privateByPlayerId: new Map(),
    sseClients: new Set(),
    disconnectTimers: new Map(),
    actionResponses: new Map(),
    lastEmoteAtByPlayerId: new Map(),
    game: null
  };
  const scenario = getScenarioById(room.scenarioId) || getScenarioById(DEFAULT_SCENARIO_ID);
  if (scenario) applyScenarioToRoom(room, scenario);
  rooms.set(code, room);
  return room;
}

function makeRoomLogEntry({ type, message, actorPlayerId = null, data = null }) {
  return {
    id: crypto.randomUUID(),
    at: nowMs(),
    type,
    actorPlayerId: actorPlayerId ?? null,
    message,
    data: data ?? null
  };
}

function pushRoomLog(room, entry) {
  if (!room?.game?.log) return;
  room.game.log.push(entry);
  if (room.game.log.length > 400) room.game.log.splice(0, room.game.log.length - 300);
}

function clearDisconnectTimer(room, playerId) {
  const t = room.disconnectTimers?.get(playerId);
  if (t) clearTimeout(t);
  room.disconnectTimers?.delete(playerId);
}

function initPlayerPrivateState() {
  return {
    hand: emptyHand(),
    devCardsInHand: [],
    devCardsNew: [],
    playedKnightsCount: 0,
    hiddenVictoryPointsCount: 0
  };
}

function applyHandDelta(priv, delta) {
  if (!priv || !priv.hand || !delta) return;
  for (const r of RESOURCE_TYPES) {
    const add = Number.isFinite(delta[r]) ? delta[r] : 0;
    priv.hand[r] = Math.max(0, Math.floor((priv.hand[r] ?? 0) + add));
  }
}

function handTotal(hand) {
  let total = 0;
  for (const r of RESOURCE_TYPES) {
    total += Math.max(0, Math.floor(hand?.[r] ?? 0));
  }
  return total;
}

function requiredDiscardCount(hand) {
  const total = handTotal(hand);
  if (total <= 7) return 0;
  return Math.floor(total / 2);
}

function applyCostToHand(hand, cost) {
  for (const r of RESOURCE_TYPES) {
    const need = Number.isFinite(cost[r]) ? cost[r] : 0;
    if (need <= 0) continue;
    hand[r] = Math.max(0, Math.floor((hand[r] ?? 0) - need));
  }
}

function applyCostToBank(bank, cost) {
  if (!bank) return;
  for (const r of RESOURCE_TYPES) {
    const add = Number.isFinite(cost[r]) ? cost[r] : 0;
    if (add <= 0) continue;
    bank[r] = Math.min(19, Math.floor((bank[r] ?? 0) + add));
  }
}

function pickRandomResourceFromHand(hand) {
  const counts = {};
  let total = 0;
  for (const r of RESOURCE_TYPES) {
    const n = Math.max(0, Math.floor(hand?.[r] ?? 0));
    counts[r] = n;
    total += n;
  }
  if (total <= 0) return null;

  const pick = crypto.randomBytes(4).readUInt32BE(0) % total;
  let acc = 0;
  for (const r of RESOURCE_TYPES) {
    acc += counts[r];
    if (pick < acc) return r;
  }
  return null;
}

function applyTradeExchange(room, offer) {
  if (!room || !offer) return;
  const fromPriv = room.privateByPlayerId.get(offer.fromPlayerId);
  const toPriv = room.privateByPlayerId.get(offer.acceptedByPlayerId);
  if (!fromPriv || !toPriv) return;

  applyCostToHand(fromPriv.hand, offer.give);
  applyHandDelta(fromPriv, offer.want);

  applyCostToHand(toPriv.hand, offer.want);
  applyHandDelta(toPriv, offer.give);
}

function assertPlayer(room, playerId) {
  if (!playerId) return null;
  return room.players.get(playerId) ?? null;
}

function isHost(room, playerId) {
  return !!playerId && room.hostPlayerId === playerId;
}

function maybeReassignHost(room) {
  if (room.hostPlayerId && room.players.has(room.hostPlayerId)) return;
  const next = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
  room.hostPlayerId = next ? next.playerId : null;
}

function gameCurrentPlayerId(game) {
  if (!game) return null;
  if (game.phase === "setup_round_1" || game.phase === "setup_round_2") {
    return game.setup?.placementOrder?.[game.setup?.placementIndex] ?? null;
  }
  return game.turnOrder?.[game.currentPlayerIndex] ?? null;
}

function ensureRoomTimer(room) {
  room.timer = normalizeRoomTimerState(room?.timer);
  return room.timer;
}

function updateRoomTimer(room) {
  if (!room) return;
  const timer = ensureRoomTimer(room);
  const nextActive = room.status === "in_game" && room.game ? gameCurrentPlayerId(room.game) : null;
  if (nextActive !== timer.activePlayerId) {
    timer.activePlayerId = nextActive;
    timer.turnStartedAt = nowMs();
    timer.pausedTotalMs = 0;
    timer.pausedAt = timer.paused ? nowMs() : null;
  }
  if (!timer.paused) timer.pausedAt = null;
  if (timer.paused && timer.pausedAt == null) timer.pausedAt = nowMs();
}

function setRoomTimerPaused(room, paused) {
  if (!room) return;
  const timer = ensureRoomTimer(room);
  const nextPaused = !!paused;
  if (nextPaused === timer.paused) return;
  const at = nowMs();

  if (nextPaused) {
    timer.paused = true;
    timer.pausedAt = at;
    return;
  }

  timer.paused = false;
  if (Number.isFinite(timer.pausedAt))
    timer.pausedTotalMs = clampNonNegativeInt(timer.pausedTotalMs + (at - timer.pausedAt));
  timer.pausedAt = null;
}

function isAdmin(room, adminSecret) {
  if (!room || typeof room.adminSecret !== "string") return false;
  if (typeof adminSecret !== "string" || !adminSecret) return false;
  return adminSecret === room.adminSecret;
}

function adminSecretFromHeaders(req) {
  const auth = req.headers.authorization;
  if (typeof auth === "string") {
    const match = auth.match(/^Bearer (.+)$/i);
    if (match) return match[1].trim();
  }
  const x = req.headers["x-admin-secret"];
  if (typeof x === "string" && x.trim()) return x.trim();
  return null;
}

function removePlayerFromGame(room, playerId) {
  const game = room?.game;
  if (!game || !playerId) return;

  if (Array.isArray(game.turnOrder)) {
    const idx = game.turnOrder.indexOf(playerId);
    if (idx >= 0) {
      game.turnOrder.splice(idx, 1);
      const cur = clampNonNegativeInt(game.currentPlayerIndex ?? 0);
      if (idx < cur) game.currentPlayerIndex = Math.max(0, cur - 1);
      if (clampNonNegativeInt(game.currentPlayerIndex ?? 0) >= game.turnOrder.length) game.currentPlayerIndex = 0;
      if (game.turnOrder.length === 0) {
        game.phase = "game_over";
        game.subphase = "game_over";
        game.winnerPlayerId = null;
      }
    }
  }

  if (game.setup && Array.isArray(game.setup.placementOrder)) {
    const order = game.setup.placementOrder;
    const curIdx = clampNonNegativeInt(game.setup.placementIndex ?? 0);
    const wasCurrentSetupPlayer = order[curIdx] === playerId;
    let removedBefore = 0;
    const nextOrder = [];
    for (let i = 0; i < order.length; i += 1) {
      if (order[i] === playerId) {
        if (i < curIdx) removedBefore += 1;
        continue;
      }
      nextOrder.push(order[i]);
    }
    game.setup.placementOrder = nextOrder;
    game.setup.placementIndex = Math.max(0, curIdx - removedBefore);

    // Issue 1.8: Validate setup phase after kick
    // If the kicked player was mid-placement (setup_road), reset to setup_settlement
    // so the next player can start fresh
    if (wasCurrentSetupPlayer && game.subphase === "setup_road") {
      game.subphase = "setup_settlement";
      game.setup.lastSettlementVertexId = null;
    }

    // Check if setup is complete after removing the player
    const n = game.turnOrder.length;
    if (nextOrder.length === 0) {
      // No placement slots left - setup complete or game over handled elsewhere
      if (n > 0 && game.phase !== "game_over") {
        game.phase = "turn";
        game.subphase = "needs_roll";
        game.setup = null;
      }
    } else if (game.setup.placementIndex >= nextOrder.length) {
      // All placements done - transition to turn phase
      if (n > 0 && game.phase !== "game_over") {
        game.phase = "turn";
        game.subphase = "needs_roll";
        game.setup = null;
      }
    } else {
      // Still in setup - ensure correct round
      if (game.phase === "setup_round_1" || game.phase === "setup_round_2") {
        game.phase = game.setup.placementIndex < n ? "setup_round_1" : "setup_round_2";
      }
    }

    if (
      game.setup &&
      game.setup.settlementsPlacedByPlayerId &&
      typeof game.setup.settlementsPlacedByPlayerId === "object"
    ) {
      delete game.setup.settlementsPlacedByPlayerId[playerId];
    }
  }

  if (game.playedKnightsByPlayerId && typeof game.playedKnightsByPlayerId === "object") {
    delete game.playedKnightsByPlayerId[playerId];
  }

  if (game.awards && typeof game.awards === "object") {
    // Issue 1.2: Recalculate longest road when the holder is kicked
    if (game.awards.longestRoadPlayerId === playerId) {
      const computed = computeLongestRoadAward(game);
      game.awards.longestRoadPlayerId = computed.longestRoadPlayerId ?? null;
      game.awards.longestRoadLength = computed.longestRoadLength ?? 0;
    }
    // Issue 1.3: Recalculate largest army when the holder is kicked
    if (game.awards.largestArmyPlayerId === playerId) {
      const LARGEST_ARMY_MIN_KNIGHTS = 3;
      const played = game.playedKnightsByPlayerId || {};
      let bestPlayerId = null;
      let bestCount = 0;
      for (const [pid, count] of Object.entries(played)) {
        const n = clampNonNegativeInt(count);
        if (n >= LARGEST_ARMY_MIN_KNIGHTS && n > bestCount) {
          bestCount = n;
          bestPlayerId = pid;
        }
      }
      game.awards.largestArmyPlayerId = bestPlayerId;
    }

    // Issue 3.1: Check for game over after award recalculations
    maybeEndGameAfterKick(room);
  }

  if (game.robber) {
    if (game.robber.discardRequiredByPlayerId && typeof game.robber.discardRequiredByPlayerId === "object") {
      delete game.robber.discardRequiredByPlayerId[playerId];
    }
    if (game.robber.discardSubmittedByPlayerId && typeof game.robber.discardSubmittedByPlayerId === "object") {
      delete game.robber.discardSubmittedByPlayerId[playerId];
    }
    if (Array.isArray(game.robber.eligibleVictimPlayerIds)) {
      game.robber.eligibleVictimPlayerIds = game.robber.eligibleVictimPlayerIds.filter((pid) => pid !== playerId);
    }

    // Issue 1.4: If in robber_discard and all remaining players have discarded, advance to robber_move
    if (game.subphase === "robber_discard") {
      const requiredPids = Object.keys(game.robber.discardRequiredByPlayerId || {});
      const allDone = requiredPids.every((pid) => !!game.robber.discardSubmittedByPlayerId?.[pid]);
      if (allDone) {
        game.subphase = "robber_move";
      }
    }

    // Issue 1.5: If in robber_steal and no eligible victims remain, advance to main
    if (game.subphase === "robber_steal") {
      const victims = game.robber.eligibleVictimPlayerIds || [];
      if (victims.length === 0) {
        pushRoomLog(
          room,
          makeRoomLogEntry({
            type: "robber",
            message: "No one to steal from.",
            data: {}
          })
        );
        game.subphase = "main";
        game.robber = null;
      }
    }
  }

  if (Array.isArray(game.tradeOffers)) {
    for (const offer of game.tradeOffers) {
      if (!offer || typeof offer !== "object") continue;
      if (offer.status !== "open") continue;
      if (offer.fromPlayerId === playerId || offer.to === playerId || offer.acceptedByPlayerId === playerId) {
        offer.status = "cancelled";
      }
      if (Array.isArray(offer.rejectedByPlayerIds))
        offer.rejectedByPlayerIds = offer.rejectedByPlayerIds.filter((pid) => pid !== playerId);
      if (offer.acceptedByPlayerId === playerId) offer.acceptedByPlayerId = null;
    }
  }
}

function maybeEndGameFromHiddenVictoryPoints(room, playerId) {
  if (!room?.game || !playerId) return;
  if (room.game.phase === "game_over") return;
  if (room.game.phase !== "turn") return;
  const current = room.game.turnOrder?.[room.game.currentPlayerIndex] ?? null;
  if (current !== playerId) return;

  const target = clampNonNegativeInt(room.game.victoryPointsToWin ?? 10);
  if (target <= 0) return;

  const priv = room.privateByPlayerId.get(playerId);
  const hidden = clampNonNegativeInt(priv?.hiddenVictoryPointsCount ?? 0);
  if (hidden <= 0) return;

  const publicPoints = clampNonNegativeInt(getPublicGameSnapshot(room.game)?.pointsByPlayerId?.[playerId] ?? 0);
  const total = publicPoints + hidden;
  if (total < target) return;

  room.game.phase = "game_over";
  room.game.subphase = "game_over";
  room.game.winnerPlayerId = playerId;
  pushRoomLog(
    room,
    makeRoomLogEntry({
      type: "system",
      actorPlayerId: playerId,
      message: `Won the game with ${total} VP!`,
      data: { points: total, target, hiddenVictoryPointsCount: hidden }
    })
  );
}

// Issue 3.1: Check for game over after kick recalculations
// After recalculating awards post-kick, the new award holder might have enough VP to win
function maybeEndGameAfterKick(room) {
  if (!room?.game) return;
  if (room.game.phase === "game_over") return;
  if (room.game.phase !== "turn") return;

  const target = clampNonNegativeInt(room.game.victoryPointsToWin ?? 10);
  if (target <= 0) return;

  const snapshot = getPublicGameSnapshot(room.game);
  const publicPointsByPlayerId = snapshot?.pointsByPlayerId ?? {};
  const turnOrder = room.game.turnOrder ?? [];

  // Check all remaining players for a winner
  for (const pid of turnOrder) {
    const publicPoints = clampNonNegativeInt(publicPointsByPlayerId[pid] ?? 0);
    const priv = room.privateByPlayerId.get(pid);
    const hidden = clampNonNegativeInt(priv?.hiddenVictoryPointsCount ?? 0);
    const total = publicPoints + hidden;

    if (total >= target) {
      room.game.phase = "game_over";
      room.game.subphase = "game_over";
      room.game.winnerPlayerId = pid;
      pushRoomLog(
        room,
        makeRoomLogEntry({
          type: "system",
          actorPlayerId: pid,
          message: `Won the game with ${total} VP!`,
          data: { points: total, target, hiddenVictoryPointsCount: hidden }
        })
      );
      return; // Only one winner
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = url.pathname;

  // --- API ---
  if (pathname === "/healthz" && req.method === "GET") {
    return ok(res, { uptimeMs: Math.max(0, nowMs() - serverStartMs), roomsCount: rooms.size });
  }

  if (pathname === "/api/presets" && req.method === "GET") {
    return ok(res, { presets: PRESETS });
  }

  if (pathname === "/api/scenarios" && req.method === "GET") {
    return ok(res, { scenarios: SCENARIOS });
  }

  if (pathname === "/api/themes" && req.method === "GET") {
    return ok(res, { themes: THEME_PACKS });
  }

  if (pathname === "/api/rooms" && req.method === "POST") {
    const room = ensureRoom(null);
    room.adminIp = normalizeIp(requestIp(req));
    broadcastRoomState(room);
    return ok(res, { roomCode: room.roomCode, adminSecret: room.adminSecret, room: roomPublicSnapshot(room) });
  }

  const roomGetMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})$/);
  if (roomGetMatch && req.method === "GET") {
    const roomCode = sanitizeRoomCode(roomGetMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const adminClaimMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/admin\/claim$/);
  if (adminClaimMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(adminClaimMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);

    const ip = normalizeIp(requestIp(req));
    const boundIp = typeof room.adminIp === "string" && room.adminIp !== "unknown" ? room.adminIp : null;
    if (boundIp && boundIp !== ip && !isLoopbackIp(ip)) return forbidden(res, "HOST_CONSOLE_CLAIMED");
    if (!boundIp) room.adminIp = ip;

    if (typeof room.adminSecret !== "string" || !room.adminSecret) room.adminSecret = crypto.randomUUID();
    schedulePersistRoom(room);
    return ok(res, { adminSecret: room.adminSecret });
  }

  const adminTimerMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/admin\/timer$/);
  if (adminTimerMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(adminTimerMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);

    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isAdmin(room, body?.adminSecret)) return forbidden(res, "BAD_ADMIN_SECRET");
    const pinCheck = verifyHostPin(room, body?.hostPin);
    if (!pinCheck.ok) return forbidden(res, pinCheck.error);

    setRoomTimerPaused(room, !!body?.paused);
    broadcastRoomState(room);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const adminKickMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/admin\/kick$/);
  if (adminKickMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(adminKickMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);

    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isAdmin(room, body?.adminSecret)) return forbidden(res, "BAD_ADMIN_SECRET");
    const pinCheck = verifyHostPin(room, body?.hostPin);
    if (!pinCheck.ok) return forbidden(res, pinCheck.error);

    const targetPlayerId = typeof body?.targetPlayerId === "string" ? body.targetPlayerId : null;
    if (!targetPlayerId) return badRequest(res, "MISSING_TARGET_PLAYER_ID");
    const target = room.players.get(targetPlayerId) ?? null;
    if (!target) return badRequest(res, "UNKNOWN_TARGET_PLAYER_ID");

    if (room.status === "in_game" && room.game) {
      const wasCurrent = gameCurrentPlayerId(room.game) === targetPlayerId;
      if (wasCurrent && room.game.phase === "turn" && room.game.subphase === "main") {
        const ended = applyAction(room.game, { type: "END_TURN" }, targetPlayerId);
        if (ended?.game) room.game = ended.game;
      }

      const priv = room.privateByPlayerId.get(targetPlayerId) ?? null;
      if (priv?.hand && room.game.bank) {
        for (const r of RESOURCE_TYPES) {
          const n = clampNonNegativeInt(priv.hand?.[r] ?? 0);
          if (n <= 0) continue;
          room.game.bank[r] = Math.min(19, clampNonNegativeInt(room.game.bank?.[r] ?? 0) + n);
        }
      }
      removePlayerFromGame(room, targetPlayerId);
      if (wasCurrent && room.game.phase === "turn") {
        room.game.subphase = "needs_roll";
        room.game.robber = null;
        room.game.devRoadBuilding = null;
        room.game.devCardPlayedThisTurn = false;
      }
      pushRoomLog(
        room,
        makeRoomLogEntry({
          type: "system",
          message: `Kicked ${target.name}.`,
          data: { playerId: targetPlayerId }
        })
      );
    }

    room.players.delete(targetPlayerId);
    room.privateByPlayerId.delete(targetPlayerId);
    // Clean up actionResponses entries for kicked player to prevent memory leaks
    if (room.actionResponses instanceof Map) {
      const prefix = `${targetPlayerId}:`;
      for (const key of room.actionResponses.keys()) {
        if (key.startsWith(prefix)) {
          room.actionResponses.delete(key);
        }
      }
    }
    clearDisconnectTimer(room, targetPlayerId);
    if (room.hostPlayerId === targetPlayerId) maybeReassignHost(room);
    broadcastRoomState(room);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const adminHostMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/admin\/host$/);
  if (adminHostMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(adminHostMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);

    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isAdmin(room, body?.adminSecret)) return forbidden(res, "BAD_ADMIN_SECRET");
    const pinCheck = verifyHostPin(room, body?.hostPin);
    if (!pinCheck.ok) return forbidden(res, pinCheck.error);

    const hostPlayerId = typeof body?.hostPlayerId === "string" ? body.hostPlayerId : null;
    if (!hostPlayerId) return badRequest(res, "MISSING_HOST_PLAYER_ID");
    if (!room.players.has(hostPlayerId)) return badRequest(res, "UNKNOWN_HOST_PLAYER_ID");

    room.hostPlayerId = hostPlayerId;
    broadcastRoomState(room);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const adminResetMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/admin\/reset$/);
  if (adminResetMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(adminResetMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);

    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isAdmin(room, body?.adminSecret)) return forbidden(res, "BAD_ADMIN_SECRET");
    const pinCheck = verifyHostPin(room, body?.hostPin);
    if (!pinCheck.ok) return forbidden(res, pinCheck.error);
    if (body?.confirm !== true) return badRequest(res, "CONFIRM_RESET_REQUIRED");

    for (const t of room.disconnectTimers.values()) clearTimeout(t);
    room.disconnectTimers = new Map();
    room.actionResponses = new Map();

    room.status = "lobby";
    room.game = null;
    for (const p of room.players.values()) p.ready = false;
    maybeReassignHost(room);
    room.timer = normalizeRoomTimerState(null);

    broadcastRoomState(room);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const debugExportMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/debug\/export$/);
  if (debugExportMatch && req.method === "GET") {
    const roomCode = sanitizeRoomCode(debugExportMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);

    const adminSecret = adminSecretFromHeaders(req);
    if (!isAdmin(room, adminSecret)) return forbidden(res, "BAD_ADMIN_SECRET");

    const ip = normalizeIp(requestIp(req));
    const boundIp = typeof room.adminIp === "string" && room.adminIp !== "unknown" ? room.adminIp : null;
    if (boundIp && boundIp !== ip && !isLoopbackIp(ip)) return forbidden(res, "HOST_CONSOLE_CLAIMED");
    if (!boundIp) {
      room.adminIp = ip;
      schedulePersistRoom(room);
    }

    const pinFromHeader = req.headers["x-host-pin"];
    const pinFromQuery = url.searchParams.get("hostPin");
    const hostPin = typeof pinFromHeader === "string" ? pinFromHeader : pinFromQuery;
    const pinCheck = verifyHostPin(room, hostPin);
    if (!pinCheck.ok) return forbidden(res, pinCheck.error);

    const privateByPlayerId = {};
    for (const [pid, priv] of room.privateByPlayerId.entries()) {
      privateByPlayerId[pid] = normalizePrivateState(priv);
    }

    const players = [...room.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        playerId: p.playerId,
        name: p.name,
        color: p.color,
        ready: !!p.ready,
        connected: !!p.connected,
        isHost: p.playerId === room.hostPlayerId,
        joinedAt: p.joinedAt,
        lastSeenAt: p.lastSeenAt
      }));

    const snapshot = {
      exportedAt: nowMs(),
      roomId: room.roomId,
      roomCode: room.roomCode,
      status: room.status,
      revision: clampNonNegativeInt(room.revision ?? 0),
      scenarioId: typeof room.scenarioId === "string" ? room.scenarioId : null,
      presetId: room.presetId,
      themeId: room.themeId,
      gameMode: room.gameMode === "quick" ? "quick" : "classic",
      maxPlayers: normalizeMaxPlayers(room.maxPlayers),
      houseRules: normalizeHouseRules(room.houseRules),
      diceProfile: normalizeDiceProfile(room.diceProfile),
      timer: normalizeRoomTimerState(room.timer),
      createdAt: room.createdAt,
      lastActivityAt: room.lastActivityAt,
      players,
      publicRoom: roomPublicSnapshot(room),
      privateByPlayerId,
      game: room.game ? structuredClone(room.game) : null
    };

    return json(res, 200, { ok: true, snapshot }, { "Cache-Control": "no-store" });
  }

  const streamMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/stream$/);
  if (streamMatch && req.method === "GET") {
    const roomCode = sanitizeRoomCode(streamMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);

    const role = url.searchParams.get("role") === "phone" ? "phone" : "tv";
    const playerId = url.searchParams.get("playerId") || null;

    // If a phone claims a playerId, mark connected (best effort).
    if (role === "phone" && playerId && room.players.has(playerId)) {
      const player = room.players.get(playerId);
      player.connected = true;
      player.lastSeenAt = nowMs();
      clearDisconnectTimer(room, playerId);
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.write("retry: 2000\n\n");
    sendSseEvent(res, "hello", { ok: true });

    const client = { res, role, playerId, connectedAt: nowMs() };
    room.sseClients.add(client);
    broadcastRoomState(room);

    req.on("close", () => {
      room.sseClients.delete(client);
      if (role === "phone" && playerId && room.players.has(playerId)) {
        const player = room.players.get(playerId);
        player.connected = false;
        player.lastSeenAt = nowMs();
        if (room.status === "lobby") maybeReassignHost(room);
        broadcastRoomState(room);

        if (room.status === "in_game" && room.game) {
          clearDisconnectTimer(room, playerId);
          const timer = setTimeout(() => {
            // Only log if they're still disconnected after a short debounce.
            const p = room.players.get(playerId);
            if (!p || p.connected) return;
            pushRoomLog(
              room,
              makeRoomLogEntry({
                type: "system",
                actorPlayerId: playerId,
                message: "Disconnected."
              })
            );
            broadcastRoomState(room);
            clearDisconnectTimer(room, playerId);
          }, 1200);
          timer.unref?.();
          room.disconnectTimers.set(playerId, timer);
        }
      }
    });
    return;
  }

  const joinMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/join$/);
  if (joinMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(joinMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);

    if (!allowRequest(req, "join", RATE_LIMIT_JOIN)) return tooManyRequests(res);
    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");

    if (!isPlainObject(body)) return badRequest(res, "BAD_PAYLOAD");

    const rawName = body.playerName;
    if (typeof rawName !== "string") return badRequest(res, "MISSING_PLAYER_NAME");
    if (hasControlChars(rawName)) return badRequest(res, "BAD_PLAYER_NAME");

    const name = sanitizePlayerNameForJoin(rawName);
    if (!name) return badRequest(res, "MISSING_PLAYER_NAME");

    const requestedPlayerId = isUuid(body.playerId) ? body.playerId : null;
    const existing =
      requestedPlayerId && room.players.has(requestedPlayerId) ? room.players.get(requestedPlayerId) : null;

    if (existing) {
      existing.name = name;
      existing.connected = true;
      existing.lastSeenAt = nowMs();
      maybeReassignHost(room);
      broadcastRoomState(room);
      return ok(res, {
        playerId: existing.playerId,
        isHost: isHost(room, existing.playerId),
        room: roomPublicSnapshot(room),
        you: playerPrivateSnapshot(room, existing.playerId)
      });
    }

    if (room.status !== "lobby") return forbidden(res, "GAME_ALREADY_STARTED");
    const maxPlayers = normalizeMaxPlayers(room.maxPlayers);
    if (room.players.size >= maxPlayers) return forbidden(res, "ROOM_FULL", { maxPlayers });

    const playerId = crypto.randomUUID();
    const player = {
      playerId,
      name,
      color: pickColor(room),
      ready: false,
      connected: true,
      joinedAt: nowMs(),
      lastSeenAt: nowMs()
    };
    room.players.set(playerId, player);
    room.privateByPlayerId.set(playerId, initPlayerPrivateState());

    if (!room.hostPlayerId) room.hostPlayerId = playerId;
    broadcastRoomState(room);

    return ok(res, {
      playerId,
      isHost: isHost(room, playerId),
      room: roomPublicSnapshot(room),
      you: playerPrivateSnapshot(room, playerId)
    });
  }

  const readyMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/ready$/);
  if (readyMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(readyMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);
    if (room.status !== "lobby") return forbidden(res, "GAME_ALREADY_STARTED");

    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isPlainObject(body)) return badRequest(res, "BAD_PAYLOAD");
    const playerId = body.playerId;
    if (!isUuid(playerId)) return badRequest(res, "BAD_PLAYER_ID");
    const player = assertPlayer(room, playerId);
    if (!player) return forbidden(res, "UNKNOWN_PLAYER_ID");

    player.ready = !!body?.ready;
    player.lastSeenAt = nowMs();
    broadcastRoomState(room);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const settingsMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/settings$/);
  if (settingsMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(settingsMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);
    if (room.status !== "lobby") return forbidden(res, "GAME_ALREADY_STARTED");

    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isPlainObject(body)) return badRequest(res, "BAD_PAYLOAD");

    const hasAdminSecret = typeof body.adminSecret === "string" && !!body.adminSecret;
    if (hasAdminSecret) {
      if (!isAdmin(room, body.adminSecret)) return forbidden(res, "BAD_ADMIN_SECRET");
      const pinCheck = verifyHostPin(room, body.hostPin);
      if (!pinCheck.ok) return forbidden(res, pinCheck.error);
    } else {
      const playerId = body.playerId;
      if (!isUuid(playerId)) return badRequest(res, "BAD_PLAYER_ID");
      if (!isHost(room, playerId)) return forbidden(res, "ONLY_HOST");
      const pinCheck = verifyHostPin(room, body.hostPin);
      if (!pinCheck.ok) return forbidden(res, pinCheck.error);
    }

    if (!("scenarioId" in body)) return badRequest(res, "MISSING_SCENARIO_ID");
    const scenarioId = String(body.scenarioId ?? "").trim();
    if (!scenarioId) return badRequest(res, "MISSING_SCENARIO_ID");
    const scenario = getScenarioById(scenarioId);
    if (!scenario) return badRequest(res, "BAD_SCENARIO");

    if (!applyScenarioToRoom(room, scenario)) return badRequest(res, "BAD_SCENARIO");
    broadcastRoomState(room);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const presetMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/preset$/);
  if (presetMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(presetMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);
    if (room.status !== "lobby") return forbidden(res, "GAME_ALREADY_STARTED");

    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isPlainObject(body)) return badRequest(res, "BAD_PAYLOAD");
    const playerId = body.playerId;
    if (!isUuid(playerId)) return badRequest(res, "BAD_PLAYER_ID");
    if (!isHost(room, playerId)) return forbidden(res, "ONLY_HOST");
    const pinCheck = verifyHostPin(room, body.hostPin);
    if (!pinCheck.ok) return forbidden(res, pinCheck.error);

    const presetId = String(body.presetId ?? "");
    if (!PRESETS.some((p) => p.id === presetId)) return badRequest(res, "BAD_PRESET");

    room.presetId = presetId;
    if (presetId !== "random-balanced") room.boardSeed = null;
    broadcastRoomState(room);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const boardSeedMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/boardSeed$/);
  if (boardSeedMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(boardSeedMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);
    if (room.status !== "lobby") return forbidden(res, "GAME_ALREADY_STARTED");

    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isPlainObject(body)) return badRequest(res, "BAD_PAYLOAD");
    const playerId = body.playerId;
    if (!isUuid(playerId)) return badRequest(res, "BAD_PLAYER_ID");
    if (!isHost(room, playerId)) return forbidden(res, "ONLY_HOST");
    const pinCheck = verifyHostPin(room, body.hostPin);
    if (!pinCheck.ok) return forbidden(res, pinCheck.error);

    const boardSeed = normalizeBoardSeed(body.boardSeed);
    if (room.presetId !== "random-balanced" && boardSeed) return badRequest(res, "BOARD_SEED_NOT_APPLICABLE");

    room.boardSeed = room.presetId === "random-balanced" ? boardSeed : null;
    broadcastRoomState(room);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const modeMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/mode$/);
  if (modeMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(modeMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);
    if (room.status !== "lobby") return forbidden(res, "GAME_ALREADY_STARTED");

    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isPlainObject(body)) return badRequest(res, "BAD_PAYLOAD");
    const playerId = body.playerId;
    if (!isUuid(playerId)) return badRequest(res, "BAD_PLAYER_ID");
    if (!isHost(room, playerId)) return forbidden(res, "ONLY_HOST");
    const pinCheck = verifyHostPin(room, body.hostPin);
    if (!pinCheck.ok) return forbidden(res, pinCheck.error);

    const gameMode = String(body.gameMode ?? "");
    if (gameMode !== "classic" && gameMode !== "quick") return badRequest(res, "BAD_GAME_MODE");

    room.gameMode = gameMode;
    broadcastRoomState(room);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const houseRulesMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/houseRules$/);
  if (houseRulesMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(houseRulesMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);
    if (room.status !== "lobby") return forbidden(res, "GAME_ALREADY_STARTED");

    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isPlainObject(body)) return badRequest(res, "BAD_PAYLOAD");
    const playerId = body.playerId;
    if (!isUuid(playerId)) return badRequest(res, "BAD_PLAYER_ID");
    if (!isHost(room, playerId)) return forbidden(res, "ONLY_HOST");
    const pinCheck = verifyHostPin(room, body.hostPin);
    if (!pinCheck.ok) return forbidden(res, pinCheck.error);
    if (!("houseRules" in body)) return badRequest(res, "MISSING_HOUSE_RULES");

    const normalized = normalizeHouseRules(body.houseRules, { strict: true });
    if (normalized === HOUSE_RULES_ERROR.INVALID) return badRequest(res, "BAD_HOUSE_RULES");
    if (normalized === HOUSE_RULES_ERROR.VICTORY_POINTS_RANGE) return badRequest(res, "BAD_VICTORY_POINTS_TO_WIN");

    room.houseRules = normalized;
    broadcastRoomState(room);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const maxPlayersMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/maxPlayers$/);
  if (maxPlayersMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(maxPlayersMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);
    if (room.status !== "lobby") return forbidden(res, "GAME_ALREADY_STARTED");

    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isPlainObject(body)) return badRequest(res, "BAD_PAYLOAD");
    const playerId = body.playerId;
    if (!isUuid(playerId)) return badRequest(res, "BAD_PLAYER_ID");
    if (!isHost(room, playerId)) return forbidden(res, "ONLY_HOST");
    const pinCheck = verifyHostPin(room, body.hostPin);
    if (!pinCheck.ok) return forbidden(res, pinCheck.error);

    const maxPlayers = clampNonNegativeInt(body.maxPlayers);
    if (maxPlayers < 3 || maxPlayers > 6) return badRequest(res, "BAD_MAX_PLAYERS");
    if (room.players.size > maxPlayers) return badRequest(res, "MAX_PLAYERS_TOO_LOW", { players: room.players.size });

    room.maxPlayers = maxPlayers;
    broadcastRoomState(room);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const themeMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/theme$/);
  if (themeMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(themeMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);
    if (room.status !== "lobby") return forbidden(res, "GAME_ALREADY_STARTED");

    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isPlainObject(body)) return badRequest(res, "BAD_PAYLOAD");
    const playerId = body.playerId;
    if (!isUuid(playerId)) return badRequest(res, "BAD_PLAYER_ID");
    if (!isHost(room, playerId)) return forbidden(res, "ONLY_HOST");
    const pinCheck = verifyHostPin(room, body.hostPin);
    if (!pinCheck.ok) return forbidden(res, pinCheck.error);

    const themeId = String(body.themeId ?? "");
    if (!THEME_PACKS.some((t) => t.id === themeId)) return badRequest(res, "BAD_THEME");

    room.themeId = themeId;
    broadcastRoomState(room);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const hostPinMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/hostPin$/);
  if (hostPinMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(hostPinMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);
    if (room.status !== "lobby") return forbidden(res, "GAME_ALREADY_STARTED");

    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isPlainObject(body)) return badRequest(res, "BAD_PAYLOAD");
    const playerId = body.playerId;
    if (!isUuid(playerId)) return badRequest(res, "BAD_PLAYER_ID");
    if (!isHost(room, playerId)) return forbidden(res, "ONLY_HOST");

    const rawNext = body.nextHostPin;
    const wantsClear = rawNext == null || String(rawNext).trim() === "";
    if (wantsClear) {
      if (isHostPinEnabled(room)) {
        const check = verifyHostPin(room, body.hostPin);
        if (!check.ok) return forbidden(res, check.error);
      }
      room.hostPinSalt = null;
      room.hostPinHash = null;
      broadcastRoomState(room);
      return ok(res, { room: roomPublicSnapshot(room) });
    }

    const nextPin = normalizeHostPin(rawNext);
    if (!nextPin) return badRequest(res, "BAD_HOST_PIN");
    if (isHostPinEnabled(room)) {
      const check = verifyHostPin(room, body.hostPin);
      if (!check.ok) return forbidden(res, check.error);
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashHostPin(nextPin, salt);
    if (!hash) return badRequest(res, "BAD_HOST_PIN");

    room.hostPinSalt = salt;
    room.hostPinHash = hash;
    broadcastRoomState(room);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const startMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/start$/);
  if (startMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(startMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);
    if (room.status !== "lobby") return forbidden(res, "GAME_ALREADY_STARTED");

    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isPlainObject(body)) return badRequest(res, "BAD_PAYLOAD");
    const playerId = body.playerId;
    if (!isUuid(playerId)) return badRequest(res, "BAD_PLAYER_ID");
    if (!isHost(room, playerId)) return forbidden(res, "ONLY_HOST");
    const pinCheck = verifyHostPin(room, body.hostPin);
    if (!pinCheck.ok) return forbidden(res, pinCheck.error);
    maybeReassignHost(room);

    const maxPlayers = normalizeMaxPlayers(room.maxPlayers);
    if (!canStartRoom(room)) return forbidden(res, "CANT_START_ROOM", { minPlayers: 3, maxPlayers });

    const playerIds = shuffle([...room.players.keys()]);
    room.game = createNewGame({
      playerIds,
      presetId: room.presetId,
      boardSeed: room.boardSeed,
      gameMode: room.gameMode,
      houseRules: room.houseRules,
      variants: room.variants
    });
    for (const pid of room.players.keys()) {
      room.privateByPlayerId.set(pid, initPlayerPrivateState());
    }
    room.status = "in_game";
    broadcastRoomState(room);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const rematchMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/rematch$/);
  if (rematchMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(rematchMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);
    if (room.status !== "in_game" || !room.game) return forbidden(res, "GAME_NOT_STARTED");
    if (room.game.phase !== "game_over") return forbidden(res, "GAME_NOT_OVER");

    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isPlainObject(body)) return badRequest(res, "BAD_PAYLOAD");
    const playerId = body.playerId;
    if (!isUuid(playerId)) return badRequest(res, "BAD_PLAYER_ID");
    if (!isHost(room, playerId)) return forbidden(res, "ONLY_HOST");
    const pinCheck = verifyHostPin(room, body.hostPin);
    if (!pinCheck.ok) return forbidden(res, pinCheck.error);
    maybeReassignHost(room);

    const maxPlayers = normalizeMaxPlayers(room.maxPlayers);
    if (room.players.size < 3 || room.players.size > maxPlayers)
      return forbidden(res, "CANT_START_ROOM", { minPlayers: 3, maxPlayers });

    for (const t of room.disconnectTimers.values()) clearTimeout(t);
    room.disconnectTimers = new Map();
    room.actionResponses = new Map();
    room.timer = normalizeRoomTimerState(null);

    const playerIds = shuffle([...room.players.keys()]);
    room.game = createNewGame({
      playerIds,
      presetId: room.presetId,
      boardSeed: room.boardSeed,
      gameMode: room.gameMode,
      houseRules: room.houseRules,
      variants: room.variants
    });
    for (const pid of room.players.keys()) {
      room.privateByPlayerId.set(pid, initPlayerPrivateState());
    }
    room.status = "in_game";
    broadcastRoomState(room);
    return ok(res, { room: roomPublicSnapshot(room) });
  }

  const emoteMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/emote$/);
  if (emoteMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(emoteMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);

    if (!allowRequest(req, "emote", RATE_LIMIT_EMOTE)) return tooManyRequests(res);
    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");
    if (!isPlainObject(body)) return badRequest(res, "BAD_PAYLOAD");

    const playerId = body.playerId;
    if (!isUuid(playerId)) return badRequest(res, "BAD_PLAYER_ID");
    const player = assertPlayer(room, playerId);
    if (!player) return forbidden(res, "UNKNOWN_PLAYER_ID");

    if (room.houseRules?.emotesEnabled === false) return forbidden(res, "EMOTES_DISABLED");

    const emote = String(body?.emote ?? "");
    if (!EMOTE_TYPES.includes(emote)) return badRequest(res, "BAD_EMOTE");

    const now = nowMs();
    const lastByPlayerId = room.lastEmoteAtByPlayerId instanceof Map ? room.lastEmoteAtByPlayerId : new Map();
    room.lastEmoteAtByPlayerId = lastByPlayerId;
    const lastAt = Number(lastByPlayerId.get(playerId) ?? 0);
    if (Number.isFinite(lastAt) && now - lastAt < EMOTE_COOLDOWN_MS) {
      return json(res, 429, { ok: false, error: apiError("EMOTE_COOLDOWN") }, { "Retry-After": "1" });
    }
    lastByPlayerId.set(playerId, now);

    broadcastRoomEmote(room, { at: now, playerId, name: player.name, color: player.color, emote });
    return ok(res, {});
  }

  const actionMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/action$/);
  if (actionMatch && req.method === "POST") {
    const roomCode = sanitizeRoomCode(actionMatch[1]);
    const room = getRoom(roomCode);
    if (!room) return notFound(res);
    if (room.status !== "in_game" || !room.game) return forbidden(res, "GAME_NOT_STARTED");

    if (!allowRequest(req, "action", RATE_LIMIT_ACTION)) return tooManyRequests(res);
    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");

    if (!isPlainObject(body)) return badRequest(res, "BAD_PAYLOAD");

    const playerId = body.playerId;
    if (!isUuid(playerId)) return badRequest(res, "BAD_PLAYER_ID");
    const player = assertPlayer(room, playerId);
    if (!player) return forbidden(res, "UNKNOWN_PLAYER_ID");

    const actionId = safeActionId(body.actionId);
    const cacheKey = actionId ? `${playerId}:${actionId}` : null;
    const actionResponses = room.actionResponses instanceof Map ? room.actionResponses : new Map();
    room.actionResponses = actionResponses;

    if (cacheKey) {
      const cached = actionResponses.get(cacheKey);
      if (cached) {
        actionResponses.delete(cacheKey);
        actionResponses.set(cacheKey, cached);
        if (cached.done) return json(res, cached.statusCode, cached.body);
        return json(res, 202, { ok: true, pending: true });
      }
      actionResponses.set(cacheKey, { done: false, at: nowMs() });
    }

    function sendActionResponse(statusCode, payload) {
      if (cacheKey) {
        actionResponses.delete(cacheKey);
        actionResponses.set(cacheKey, { done: true, statusCode, body: payload, at: nowMs() });
        while (actionResponses.size > ACTION_IDEMPOTENCY_MAX_ENTRIES) {
          const oldest = actionResponses.keys().next().value;
          if (!oldest) break;
          actionResponses.delete(oldest);
        }
      }
      json(res, statusCode, payload);
    }

    function sendActionOk(body) {
      return sendActionResponse(200, { ok: true, ...body });
    }

    function sendActionErr(statusCode, code, data = null) {
      return sendActionResponse(statusCode, { ok: false, error: apiError(code, data) });
    }

    const type = String(body?.type ?? "");
    let action = null;
    let maybeCost = BUILD_COSTS[type] ?? null;

    // Apply Road Work event: roads cost 1 less wood
    if (maybeCost && type === "BUILD_ROAD" && room.game?.currentEvent?.id === "road_work") {
      maybeCost = { ...maybeCost, wood: Math.max(0, (maybeCost.wood || 0) - 1) };
    }

    if (maybeCost) {
      const priv = room.privateByPlayerId.get(playerId);
      if (!priv) return sendActionErr(403, "UNKNOWN_PLAYER_ID");
      if (!hasEnoughResources(priv.hand, maybeCost)) return sendActionErr(400, "NOT_ENOUGH_RESOURCES");
    }

    if (type === "ROLL_DICE") {
      const { d1, d2 } = rollDiceForRoom(room);
      const sum = d1 + d2;
      if (sum === 7) {
        const discardRequiredByPlayerId = {};
        for (const pid of room.players.keys()) {
          const priv = room.privateByPlayerId.get(pid);
          if (!priv) continue;
          const need = requiredDiscardCount(priv.hand);
          if (need > 0) discardRequiredByPlayerId[pid] = need;
        }
        action = { type, d1, d2, discardRequiredByPlayerId };
      } else {
        action = { type, d1, d2 };
      }
    } else if (type === "PLACE_SETTLEMENT") {
      const vertexId = typeof body.vertexId === "string" ? body.vertexId : "";
      action = { type, vertexId };
    } else if (type === "PLACE_ROAD") {
      const edgeId = typeof body.edgeId === "string" ? body.edgeId : "";
      action = { type, edgeId };
    } else if (type === "BUILD_ROAD") {
      const edgeId = typeof body.edgeId === "string" ? body.edgeId : "";
      action = { type, edgeId };
    } else if (type === "BUILD_SETTLEMENT") {
      const vertexId = typeof body.vertexId === "string" ? body.vertexId : "";
      action = { type, vertexId };
    } else if (type === "BUILD_CITY") {
      const vertexId = typeof body.vertexId === "string" ? body.vertexId : "";
      action = { type, vertexId };
    } else if (type === "END_TURN") {
      action = { type };
    } else if (type === "BANK_TRADE") {
      const priv = room.privateByPlayerId.get(playerId);
      if (!priv) return sendActionErr(403, "UNKNOWN_PLAYER_ID");

      const give = normalizeResourceCounts(body?.give);
      const receive = normalizeResourceCounts(body?.receive);
      if (!hasAnyResources(give) || !hasAnyResources(receive)) return sendActionErr(400, "BAD_TRADE");
      if (!hasEnoughResources(priv.hand, give)) return sendActionErr(400, "NOT_ENOUGH_RESOURCES");

      // Bank inventory is public, so we can pre-check here for a nicer failure before the engine validates ratios.
      const bank = room.game.bank || {};
      for (const r of RESOURCE_TYPES) {
        const n = Math.max(0, Math.floor(receive?.[r] ?? 0));
        if (n <= 0) continue;
        if (Math.max(0, Math.floor(bank?.[r] ?? 0)) < n) return sendActionErr(400, "BANK_EMPTY");
      }

      action = { type, give, receive };
    } else if (type === "TRADE_OFFER_CREATE") {
      const priv = room.privateByPlayerId.get(playerId);
      if (!priv) return sendActionErr(403, "UNKNOWN_PLAYER_ID");

      const to = body?.to ?? "all";
      const give = normalizeResourceCounts(body?.give);
      const want = normalizeResourceCounts(body?.want);
      if (!hasAnyResources(give) || !hasAnyResources(want)) return sendActionErr(400, "BAD_TRADE");
      if (!hasEnoughResources(priv.hand, give)) return sendActionErr(400, "NOT_ENOUGH_RESOURCES");

      const toId = to === "all" ? "all" : String(to || "");
      if (toId !== "all") {
        if (!room.players.has(toId)) return sendActionErr(400, "BAD_TRADE_TO");
        if (toId === playerId) return sendActionErr(400, "BAD_TRADE_TO");
      }

      action = { type, to: toId, give, want };
    } else if (type === "TRADE_OFFER_CANCEL") {
      const offerId = String(body?.offerId || "");
      if (!offerId) return sendActionErr(400, "MISSING_OFFER_ID");
      action = { type, offerId };
    } else if (type === "TRADE_OFFER_RESPOND") {
      const offerId = String(body?.offerId || "");
      const response = String(body?.response || "");
      if (!offerId) return sendActionErr(400, "MISSING_OFFER_ID");
      if (response !== "accept" && response !== "reject") return sendActionErr(400, "BAD_RESPONSE");

      if (response === "accept") {
        const offer = room.game.tradeOffers?.find((o) => o.id === offerId) ?? null;
        if (offer && offer.status === "open") {
          const fromPriv = room.privateByPlayerId.get(offer.fromPlayerId);
          const toPriv = room.privateByPlayerId.get(playerId);
          if (!fromPriv || !toPriv) return sendActionErr(403, "UNKNOWN_PLAYER_ID");
          if (!hasEnoughResources(fromPriv.hand, offer.give)) return sendActionErr(400, "NOT_ENOUGH_RESOURCES");
          if (!hasEnoughResources(toPriv.hand, offer.want)) return sendActionErr(400, "NOT_ENOUGH_RESOURCES");
        }
      }

      action = { type, offerId, response };
    } else if (type === "DISCARD_CARDS") {
      const priv = room.privateByPlayerId.get(playerId);
      if (!priv) return sendActionErr(403, "UNKNOWN_PLAYER_ID");
      const required = Math.max(0, Math.floor(room.game?.robber?.discardRequiredByPlayerId?.[playerId] ?? 0));
      if (required <= 0) return sendActionErr(400, "NO_DISCARD_REQUIRED");

      const counts = normalizeResourceCounts(body?.counts);
      const total = handTotal(counts);
      if (total !== required) return sendActionErr(400, "BAD_DISCARD");
      if (!hasEnoughResources(priv.hand, counts)) return sendActionErr(400, "NOT_ENOUGH_RESOURCES");
      action = { type, counts };
    } else if (type === "MOVE_ROBBER") {
      const hexId = String(body?.hexId || "");
      if (!hexId) return sendActionErr(400, "MISSING_HEX_ID");
      action = { type, hexId };
    } else if (type === "STEAL_CARD") {
      const fromPlayerId = String(body?.fromPlayerId || "");
      if (!fromPlayerId) return sendActionErr(400, "MISSING_FROM_PLAYER_ID");
      if (!room.players.has(fromPlayerId)) return sendActionErr(400, "BAD_PLAYER");

      const fromPriv = room.privateByPlayerId.get(fromPlayerId);
      const didSteal = handTotal(fromPriv?.hand) > 0;
      action = { type, fromPlayerId, didSteal };
    } else if (type === "BUY_DEV_CARD") {
      const priv = room.privateByPlayerId.get(playerId);
      if (!priv) return sendActionErr(403, "UNKNOWN_PLAYER_ID");
      if (!hasEnoughResources(priv.hand, DEV_CARD_COST)) return sendActionErr(400, "NOT_ENOUGH_RESOURCES");
      if (Array.isArray(room.game.devDeck) && room.game.devDeck.length === 0)
        return sendActionErr(400, "DEV_DECK_EMPTY");
      action = { type };
    } else if (type === "PLAY_DEV_CARD") {
      const priv = room.privateByPlayerId.get(playerId);
      if (!priv) return sendActionErr(403, "UNKNOWN_PLAYER_ID");

      const card = String(body?.card ?? "");
      if (!DEV_CARD_PLAYABLE_TYPES.includes(card)) return sendActionErr(400, "BAD_DEV_CARD");
      if (!priv.devCardsInHand?.includes(card)) return sendActionErr(400, "NO_DEV_CARD");

      if (card === "year_of_plenty") {
        const take = normalizeResourceCounts(body?.take);
        if (handTotal(take) !== 2) return sendActionErr(400, "BAD_DEV_SELECTION");
        const bank = room.game.bank || {};
        for (const r of RESOURCE_TYPES) {
          const n = Math.max(0, Math.floor(take?.[r] ?? 0));
          if (n <= 0) continue;
          if (Math.max(0, Math.floor(bank?.[r] ?? 0)) < n) return sendActionErr(400, "BANK_EMPTY");
        }
        action = { type, card, take };
      } else if (card === "monopoly") {
        const resourceType = String(body?.resourceType ?? "");
        if (!RESOURCE_TYPES.includes(resourceType)) return sendActionErr(400, "BAD_DEV_SELECTION");
        action = { type, card, resourceType };
      } else {
        action = { type, card };
      }
    } else if (type === "DEV_ROAD_BUILDING_PLACE_ROAD") {
      const edgeId = String(body?.edgeId || "");
      if (!edgeId) return sendActionErr(400, "MISSING_EDGE_ID");
      action = { type, edgeId };
    } else {
      return sendActionErr(400, "BAD_ACTION_TYPE");
    }

    const result = applyAction(room.game, action, playerId);
    if (result?.error) {
      return sendActionErr(400, result.error.code);
    }

    room.game = result.game;
    if (type === "TRADE_OFFER_RESPOND" && action.response === "accept") {
      const offer = room.game.tradeOffers?.find((o) => o.id === action.offerId) ?? null;
      if (offer?.status === "accepted" && offer.acceptedByPlayerId) applyTradeExchange(room, offer);
    }
    if (type === "BANK_TRADE") {
      const priv = room.privateByPlayerId.get(playerId);
      if (priv) {
        applyCostToHand(priv.hand, action.give);
        applyCostToBank(room.game.bank, action.give);

        for (const r of RESOURCE_TYPES) {
          const n = Math.max(0, Math.floor(action.receive?.[r] ?? 0));
          if (n <= 0) continue;
          room.game.bank[r] = Math.max(0, Math.floor((room.game.bank?.[r] ?? 0) - n));
        }
        applyHandDelta(priv, action.receive);

        // Handle Merchant Ships event: ports give +1 bonus resource on trades
        if (room.game?.currentEvent?.id === "merchant_ships") {
          // Give +1 of the received resource type (first resource received)
          for (const r of RESOURCE_TYPES) {
            const n = Math.max(0, Math.floor(action.receive?.[r] ?? 0));
            if (n > 0 && room.game.bank[r] > 0) {
              priv.hand[r] = (priv.hand[r] || 0) + 1;
              room.game.bank[r] = Math.max(0, room.game.bank[r] - 1);
              break; // Only +1 bonus total per trade
            }
          }
        }
      }
    }
    if (type === "DISCARD_CARDS") {
      const priv = room.privateByPlayerId.get(playerId);
      if (priv) {
        applyCostToHand(priv.hand, action.counts);
        applyCostToBank(room.game.bank, action.counts);
      }
    }
    if (type === "STEAL_CARD" && action.didSteal) {
      const fromPriv = room.privateByPlayerId.get(action.fromPlayerId);
      const toPriv = room.privateByPlayerId.get(playerId);
      if (fromPriv && toPriv) {
        const stolen = pickRandomResourceFromHand(fromPriv.hand);
        if (stolen) {
          fromPriv.hand[stolen] = Math.max(0, Math.floor((fromPriv.hand[stolen] ?? 0) - 1));
          toPriv.hand[stolen] = Math.max(0, Math.floor((toPriv.hand[stolen] ?? 0) + 1));
        }
      }
    }
    if (type === "BUY_DEV_CARD") {
      const priv = room.privateByPlayerId.get(playerId);
      if (priv) {
        applyCostToHand(priv.hand, DEV_CARD_COST);
        applyCostToBank(room.game.bank, DEV_CARD_COST);
      }
    }
    // Handle Harvest Festival event: each player gets +1 of their most common resource
    if (type === "ROLL_DICE" && room.game?.currentEvent?.id === "harvest_festival") {
      for (const [pid, priv] of room.privateByPlayerId.entries()) {
        const hand = priv?.hand;
        if (!hand) continue;
        // Find most common resource
        let maxResource = null;
        let maxCount = 0;
        for (const r of RESOURCE_TYPES) {
          const count = Math.max(0, Math.floor(hand[r] || 0));
          if (count > maxCount) {
            maxCount = count;
            maxResource = r;
          }
        }
        // Grant +1 of the most common resource if they have any
        if (maxResource && room.game.bank[maxResource] > 0) {
          hand[maxResource] = (hand[maxResource] || 0) + 1;
          room.game.bank[maxResource] = Math.max(0, room.game.bank[maxResource] - 1);
        }
      }
    }
    if (maybeCost) {
      const priv = room.privateByPlayerId.get(playerId);
      if (priv) {
        applyCostToHand(priv.hand, maybeCost);
        applyCostToBank(room.game.bank, maybeCost);
      }
    }
    if (Array.isArray(result.privateUpdates)) {
      for (const u of result.privateUpdates) {
        const priv = room.privateByPlayerId.get(u.playerId);
        if (!priv) continue;
        if (u.handDelta) applyHandDelta(priv, u.handDelta);
        if (u.devCardDraw) {
          const card = u.devCardDraw;
          if (card === "victory_point") {
            priv.hiddenVictoryPointsCount = clampNonNegativeInt((priv.hiddenVictoryPointsCount ?? 0) + 1);
          } else if (DEV_CARD_PLAYABLE_TYPES.includes(card)) {
            if (!Array.isArray(priv.devCardsNew)) priv.devCardsNew = [];
            priv.devCardsNew.push(card);
          }
        }
      }
    }
    if (type === "PLAY_DEV_CARD") {
      const priv = room.privateByPlayerId.get(playerId);
      if (priv && action?.card && Array.isArray(priv.devCardsInHand)) {
        const idx = priv.devCardsInHand.indexOf(action.card);
        if (idx >= 0) priv.devCardsInHand.splice(idx, 1);
      }

      if (action?.card === "monopoly") {
        const resourceType = action.resourceType;
        const actorPriv = room.privateByPlayerId.get(playerId);
        if (actorPriv) {
          let totalTaken = 0;
          for (const [pid, otherPriv] of room.privateByPlayerId.entries()) {
            if (pid === playerId) continue;
            const n = Math.max(0, Math.floor(otherPriv?.hand?.[resourceType] ?? 0));
            if (n <= 0) continue;
            otherPriv.hand[resourceType] = Math.max(0, Math.floor((otherPriv.hand?.[resourceType] ?? 0) - n));
            totalTaken += n;
          }
          actorPriv.hand[resourceType] = Math.max(0, Math.floor((actorPriv.hand?.[resourceType] ?? 0) + totalTaken));
        }
      }
    }
    if (type === "END_TURN") {
      const priv = room.privateByPlayerId.get(playerId);
      if (priv && Array.isArray(priv.devCardsNew) && priv.devCardsNew.length) {
        if (!Array.isArray(priv.devCardsInHand)) priv.devCardsInHand = [];
        priv.devCardsInHand.push(...priv.devCardsNew);
        priv.devCardsNew = [];
      }
    }

    maybeEndGameFromHiddenVictoryPoints(room, playerId);
    broadcastRoomState(room);
    return sendActionOk({ room: roomPublicSnapshot(room) });
  }

  // --- Feedback endpoint ---
  if (pathname === "/api/feedback" && req.method === "POST") {
    const body = await readJsonBody(req);
    if (body === Symbol.for("too_large")) return payloadTooLarge(res);
    if (body === Symbol.for("bad_json")) return badRequest(res, "BAD_JSON");

    // Validate rating: must be integer 1-5
    const rating = body?.rating;
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return badRequest(res, "INVALID_RATING", { message: "Rating must be an integer between 1 and 5" });
    }

    // Validate comment: optional, max 1000 chars
    const comment = body?.comment;
    if (comment != null && (typeof comment !== "string" || comment.length > 1000)) {
      return badRequest(res, "INVALID_COMMENT", { message: "Comment must be a string with max 1000 characters" });
    }

    // Extract fields from request body
    const timestamp = Date.now();
    const roomId = body?.roomId ?? null;
    const playerId = body?.playerId ?? null;
    const gameStats = body?.gameStats ?? null;

    const feedbackData = {
      timestamp,
      roomId,
      playerId,
      rating,
      comment: comment ?? null,
      gameStats
    };

    // Store feedback to disk
    try {
      await ensureFeedbackDir();
      const filename = `feedback-${timestamp}-${roomId || "unknown"}.json`;
      const filePath = path.join(feedbackDir, filename);
      await writeFile(filePath, JSON.stringify(feedbackData, null, 2), "utf8");
    } catch (err) {
      logError("[catan] failed to write feedback:", err);
      return badRequest(res, "FEEDBACK_WRITE_ERROR", { message: "Failed to store feedback" });
    }

    return ok(res, { saved: true });
  }

  // --- Static files ---
  if (req.method === "GET" || req.method === "HEAD") {
    // Serve production build assets first (if they exist)
    if (await serveBuildAssets(req, res, pathname)) return;
    // Serve vendor files (Three.js from node_modules for dev mode)
    if (await serveVendorThree(req, res, pathname)) return;
    return serveStatic(req, res, pathname);
  }

  return notFound(res);
});

// SSE keepalive
setInterval(() => {
  for (const room of rooms.values()) {
    for (const client of [...room.sseClients]) {
      const ok = sendSseEvent(client.res, "ping", { at: nowMs() });
      if (!ok) room.sseClients.delete(client);
    }
  }
}, 15000).unref();

const loadRes = await loadRoomsFromDisk();
if (loadRes.loaded) logInfo(`[catan] restored ${loadRes.loaded} room${loadRes.loaded === 1 ? "" : "s"} from disk`);
if (loadRes.errors) logWarn(`[catan] persistence load errors: ${loadRes.errors}`);

await pruneExpiredRooms({ reason: "startup" });
if (ROOM_TTL_MS > 0) {
  setInterval(() => {
    pruneExpiredRooms().catch((err) => logWarn("[catan] prune failed:", err));
  }, 60 * 1000).unref();
}

async function flushAllRoomsToDisk() {
  for (const state of persistStateByRoomCode.values()) {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  }

  for (const room of rooms.values()) {
    try {
      await persistRoomToDisk(room);
    } catch (err) {
      logWarn(`[catan] persist failed for room ${room.roomCode}:`, err);
    }
  }
}

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logInfo(`[catan] ${signal} received; saving rooms…`);
  try {
    server.close(() => {});
    await flushAllRoomsToDisk();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

server.listen(PORT, HOST, () => {
  const addr = server.address();
  const actualHost = typeof addr === "object" && addr ? addr.address : HOST;
  const actualPort = typeof addr === "object" && addr ? addr.port : PORT;
  const hostForUrl = actualHost.includes(":") ? `[${actualHost}]` : actualHost;
  logInfo(`[catan] listening on http://${hostForUrl}:${actualPort}`);
});
