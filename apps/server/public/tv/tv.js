// The TV is a cast display: it shows the game and takes no input. All controls live on the phones.
import { latestRollGains } from "/shared/roll-gains.js";
import { api, qs, setText } from "/shared/common.js";
import { flashRolledHexes, renderBoard } from "/shared/board-renderer.js";
import { createRenderScheduler } from "/shared/render-scheduler.js";
import { errorCode } from "/shared/error-copy.js";
import { qrSvg } from "/shared/qr.js";
import { scenarioDisplay } from "/shared/scenarios.js";
import { getSettings, initSettings } from "/shared/settings.js";
import { installAudioUnlock, playSfx, setMusicMode, preloadMusic } from "/shared/audio.js";
import { createMomentQueue } from "/shared/moment-detector.js";
import { applyDisplayColors } from "/shared/player-colors.js";
import { createSegmentTracker, hostCopyForMoment } from "/shared/host-copy.js";
import { loadTheme, preloadThemes, fetchThemeIndex } from "/shared/theme-loader.js";
import { createShowLayer } from "/tv/show-layer.js";
import { computeShowBeats, computePlacedStructures } from "/tv/show-beats.js";
import { createAttractSampleBoard } from "/tv/attract-mode.js";
import {
  createPlayerCards,
  diceHudHtml,
  dieHtml,
  endPanelHtml,
  escapeHtml,
  offerHtml,
  pendingDiscards,
  settlementSprite,
  tickerHtml,
  turnActionText,
  turnKickerText
} from "/tv/hud.js";

const debugPerfEnabled = new URL(location.href).searchParams.get("debug") === "1";
let markRenderStart = null;
let markRenderEnd = null;
let markPayloadSize = null;
let measureUtf8Bytes = null;

if (debugPerfEnabled) {
  try {
    const perf = await import("/shared/perf.js");
    markRenderStart = perf.markRenderStart;
    markRenderEnd = perf.markRenderEnd;
    markPayloadSize = perf.markPayloadSize;
    measureUtf8Bytes = perf.measureUtf8Bytes;
  } catch {
    // Ignore perf import failures.
  }
}

const QUICK_TURN_NUDGE_THRESHOLDS_MS = [45000, 75000];
const MIN_PLAYERS = 3;
const MAX_RECOVERY_DELAY = 10000;

const elBoard = qs("#board");
const elBoardStage = qs("#boardStage");
const elTurnCard = qs("#turnCard");
const elTurnKicker = qs("#turnKicker");
const elTurnTimer = qs("#turnTimer");
const elTurnName = qs("#turnName");
const elTurnAction = qs("#turnAction");
const elTurnWaiting = qs("#turnWaiting");
const elDiceHud = qs("#diceHud");
const elEventPanel = qs("#eventPanel");
const elEventTitle = qs("#eventTitle");
const elEventDescription = qs("#eventDescription");
const elOffersPanel = qs("#offersPanel");
const elOffers = qs("#offers");
const elTicker = qs("#ticker");
const elRejoinPill = qs("#rejoinPill");
const elVpGoal = qs("#vpGoal");
const elEndPanel = qs("#endPanel");
const elConnectionOverlay = qs("#connectionOverlay");
const elConnectionTitle = qs("#connectionTitle");
const elConnectionHint = qs("#connectionHint");
const elLobbyPreview = qs("#lobbyBoardPreview");
const elLobbySlots = qs("#lobbySlots");
const elLobbyPills = qs("#lobbyPills");
const elLobbyStatus = qs("#lobbyStatus");

let roomCode = null;
let serverLanIp = null;
let es = null;
let lastRoomState = null;
let lastRenderedRoomState = null;
let lastRevisionSeen = null;
let lastThemeId = null;
let lastBoardRenderKey = null;
let lastJoinKey = null;
let lobbyPreviewRadius = null;
let serverSkewMs = 0;
let turnTimerInterval = null;
let turnNudgeKey = null;
let lastMusicMode = null;
let recoveryTimer = null;
let recoveryDelay = 1200;

const turnNudgeFired = new Set();
const flashTimers = new WeakMap();
const showQueue = createMomentQueue({ maxQueue: 24, maxSeen: 512 });
const segmentTracker = createSegmentTracker();
const playerCards = createPlayerCards(qs("#playerCards"));
const show = createShowLayer(qs("#showLayer"), { toastRail: qs("#toastRail") });

initSettings();
installAudioUnlock();
setMusicMode("lobby");
preloadMusic();
showQueue.setHandler(runBeat);

function updateMusicMode(room) {
  const mode = room?.status === "in_game" && room?.game?.phase !== "game_over" ? "game" : "lobby";
  if (mode === lastMusicMode) return;
  lastMusicMode = mode;
  setMusicMode(mode);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stablePart(v) {
  return v == null ? "" : String(v);
}

function flashClass(el, cls, durationMs = 650) {
  if (!el) return;
  const prev = flashTimers.get(el);
  if (prev) clearTimeout(prev);
  el.classList.remove(cls);
  // Force reflow so repeated flashes still animate.
  void el.offsetHeight;
  el.classList.add(cls);
  flashTimers.set(
    el,
    setTimeout(() => el.classList.remove(cls), Math.max(0, Math.floor(durationMs)))
  );
}

function playerById(id) {
  return (lastRoomState?.players || []).find((p) => p.playerId === id) || null;
}

// -----------------------------------------------------------------------------
// Moments: the board stays clear. Only rare events earn a card at its centre.
// -----------------------------------------------------------------------------

async function runBeat(beat) {
  const reducedMotion = !!getSettings()?.reducedMotion;
  // Catch up when the table is playing faster than the show.
  const backlog = showQueue.pendingCount() > 3 ? 0.55 : 1;
  const pace = (beat?.gameMode === "quick" ? 0.8 : 1) * backlog;
  const d = (ms) => Math.max(0, Math.floor((Number(ms) || 0) * pace));
  const wait = (ms) => sleep(reducedMotion ? Math.min(140, d(ms)) : d(ms));
  const type = beat?.type || "beat";
  const game = lastRoomState?.game || null;

  if (type === "turn_nudge") {
    if (game?.turnNumber !== beat?.turnNumber || game?.currentPlayerId !== beat?.playerId) return;
    playSfx("turn_nudge");
    const copy = hostCopyForMoment(beat, { audience: "tv" });
    flashClass(elTurnCard, "flash", d(900));
    show.toast({ title: copy.title, subtitle: copy.subtitle, tone: copy.tone });
    return wait(400);
  }

  if (type === "turn_start") {
    playSfx("turn");
    flashClass(elTurnCard, "flash", d(900));
    flashClass(elBoardStage, "turnPulse", d(1100));
    return wait(500);
  }

  if (type === "dice_roll") {
    // A newer roll has landed, so this one would contradict the dice on screen.
    if (game?.lastRoll && (game.lastRoll.d1 !== beat?.d1 || game.lastRoll.d2 !== beat?.d2)) return;
    playSfx("dice");
    flashClass(elDiceHud, "flash", d(900));
    const sum = Number(beat?.sum);
    const dice = `<div class="stingerDice">${dieHtml(beat?.d1)}${dieHtml(beat?.d2)}</div>`;

    if (sum === 7) {
      const copy = hostCopyForMoment(beat, { audience: "tv" });
      await show.showMoment({
        artHtml: `${dice}<img class="stingerSprite" src="/shared/icons/robber.png" alt="" />`,
        title: copy.title,
        subtitle: copy.subtitle,
        tone: "bad",
        durationMs: d(1700)
      });
      return wait(1900);
    }

    await show.showMoment({ artHtml: dice, title: String(sum), tone: "info", durationMs: d(1100) });
    await wait(900);
    flashRolledHexes(elBoard, sum, { robberHexId: game?.robberHexId });
    playerCards.showGains(latestRollGains(game?.log));
    return wait(500);
  }

  if (type === "robber_step") {
    // The turn card already tracks this step; skip it once play has moved on.
    if (game?.subphase !== beat?.subphase) return;
    playSfx("robber", { gain: 0.75 });
    flashClass(elTurnCard, "flash", d(900));
    return wait(350);
  }

  if (type === "robber_moved") {
    playSfx("ui_tick", { gain: 0.7 });
    show.ping(elBoard.querySelector(`[data-hex-id="${beat?.hexId}"]`), { color: "#ff5c7a" });
    return wait(600);
  }

  if (type === "robber_discarded") {
    playSfx("ui_tick", { gain: 0.7 });
    return wait(150);
  }

  if (type === "robber_stole") {
    playSfx(beat?.didSteal !== false ? "steal_success" : "steal_fail");
    const copy = hostCopyForMoment(beat, { audience: "tv" });
    show.toast({ title: copy.title, subtitle: copy.subtitle, tone: copy.tone });
    return wait(500);
  }

  if (type === "build") {
    playSfx("build");
    const target =
      beat?.kind === "road"
        ? elBoard.querySelector(`[data-edge-id="${beat?.edgeId}"]`)
        : elBoard.querySelector(`[data-vertex-id="${beat?.vertexId}"]`);
    show.ping(target, { color: playerById(beat?.playerId)?.color || "#fff" });
    return wait(450);
  }

  if (type === "award") {
    playSfx("segment_start");
    await show.showMoment({
      artHtml: `<img class="stingerSprite" src="/shared/icons/${escapeHtml(beat.icon)}.png" alt="" />`,
      title: beat.title,
      subtitle: beat.playerName,
      tone: "good",
      durationMs: d(1500)
    });
    return wait(1600);
  }

  if (type === "trade_open") {
    playSfx("trade", { gain: 0.85 });
    flashClass(elOffersPanel, "flash", d(900));
    return wait(350);
  }

  if (type === "trade_accepted") {
    playSfx("trade");
    const copy = hostCopyForMoment(beat, { audience: "tv" });
    show.toast({ title: copy.title, subtitle: copy.subtitle, tone: copy.tone });
    return wait(500);
  }

  if (type === "trade_cancelled" || type === "trade_rejected") {
    playSfx("ui_bonk", { gain: 0.65 });
    return wait(200);
  }

  if (type === "game_over") {
    playSfx("win");
    show.confetti({
      count: 80,
      colors: (lastRoomState?.players || []).map((p) => p.color)
    });
    return wait(1500);
  }

  if (type === "segment_transition") {
    playSfx("segment_start");
    const copy = beat?.copy || { title: "Next phase", subtitle: "", tone: "info" };
    await show.showMoment({ title: copy.title, subtitle: copy.subtitle, tone: copy.tone, durationMs: d(1700) });
    return wait(1900);
  }

  if (type === "event_drawn") {
    playSfx("event_drawn");
    flashClass(elEventPanel, "flash", d(900));
    await show.showMoment({
      title: beat?.eventName || "Event",
      subtitle: beat?.eventShortText || "",
      tone: "good",
      durationMs: d(2400)
    });
    return wait(2600);
  }

  if (type === "event_ended") {
    playSfx("event_ended");
    show.toast({ title: `${beat?.eventName || "Event"} ended` });
    return wait(300);
  }
}

// Longest road and largest army aren't in the moment detector, so they're read from the room diff.
function computeAwardBeats(prevGame, game, roomKey) {
  if (!prevGame || !game) return [];
  const awards = [
    ["longestRoadPlayerId", "Longest Road", "award-longest-road"],
    ["largestArmyPlayerId", "Largest Army", "award-largest-army"]
  ];
  return awards.flatMap(([key, title, icon]) => {
    const playerId = game.awards?.[key] || null;
    if (!playerId || playerId === prevGame.awards?.[key]) return [];
    return [
      {
        id: `award:${roomKey}:${key}:${playerId}:${stablePart(game.turnNumber)}`,
        type: "award",
        title,
        icon,
        playerName: playerById(playerId)?.name || ""
      }
    ];
  });
}

// -----------------------------------------------------------------------------
// Turn timer
// -----------------------------------------------------------------------------

function formatMmSs(ms) {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${String(Math.floor(totalSec / 60)).padStart(2, "0")}:${String(totalSec % 60).padStart(2, "0")}`;
}

function serverNowMs() {
  return Date.now() - (Number.isFinite(serverSkewMs) ? serverSkewMs : 0);
}

function computeTurnElapsedMs(room) {
  const timer = room?.timer;
  const startedAt = Number(timer?.turnStartedAt);
  if (!Number.isFinite(startedAt)) return null;
  const pausedTotalMs = Math.max(0, Number(timer.pausedTotalMs) || 0);
  const now = serverNowMs();
  const endAt = timer.paused && Number.isFinite(timer.pausedAt) ? Number(timer.pausedAt) : now;
  return Math.max(0, Math.floor(endAt - startedAt - pausedTotalMs));
}

function renderTurnTimer(room) {
  const elapsed = computeTurnElapsedMs(room);
  if (elapsed == null) return setText(elTurnTimer, "");
  setText(elTurnTimer, room.timer?.paused ? `Paused ${formatMmSs(elapsed)}` : formatMmSs(elapsed));
  if (!room.timer?.paused) maybeQueueTurnNudge(elapsed);
}

function stopTurnTimer() {
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  turnTimerInterval = null;
  turnNudgeKey = null;
  turnNudgeFired.clear();
  setText(elTurnTimer, "");
}

function ensureTurnTimerRunning() {
  if (turnTimerInterval) return;
  turnTimerInterval = setInterval(() => {
    if (lastRoomState?.game?.currentPlayerId) renderTurnTimer(lastRoomState);
  }, 500);
}

function maybeQueueTurnNudge(elapsedMs) {
  const room = lastRoomState;
  const game = room?.status === "in_game" ? room.game : null;
  if (!game || room.gameMode !== "quick" || game.phase !== "turn") return;
  if (game.subphase !== "needs_roll" && game.subphase !== "main") return;

  const key = `${game.turnNumber}:${game.currentPlayerId}`;
  if (key !== turnNudgeKey) {
    turnNudgeKey = key;
    turnNudgeFired.clear();
  }

  for (const thresholdMs of QUICK_TURN_NUDGE_THRESHOLDS_MS) {
    if (elapsedMs < thresholdMs) break;
    if (turnNudgeFired.has(thresholdMs)) continue;
    turnNudgeFired.add(thresholdMs);
    showQueue.enqueue({
      id: `turn_nudge:${stablePart(room.roomCode)}:${stablePart(game.turnNumber)}:${stablePart(game.currentPlayerId)}:${thresholdMs}`,
      type: "turn_nudge",
      gameMode: "quick",
      thresholdMs,
      turnNumber: game.turnNumber,
      playerId: game.currentPlayerId,
      playerName: playerById(game.currentPlayerId)?.name || "Player",
      subphase: game.subphase,
      expected: game.hints?.expected || null
    });
  }
}

// -----------------------------------------------------------------------------
// Joining: attract and lobby
// -----------------------------------------------------------------------------

function roomUrlForPhones() {
  // Only a TV opened on loopback needs the LAN IP. Any other host, including a reverse proxy, already works for phones.
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const host = isLoopback && serverLanIp ? `${serverLanIp}:${location.port || 80}` : location.host;
  return { host, url: `${location.protocol}//${host}/phone?room=${encodeURIComponent(roomCode)}` };
}

function renderJoinInfo() {
  const { host, url } = roomUrlForPhones();
  if (url === lastJoinKey) return;
  lastJoinKey = url;

  let qr = "";
  try {
    qr = qrSvg(url, { margin: 2, label: "Join room" });
  } catch (err) {
    console.warn("[catan] failed to render join QR:", err);
  }
  for (const prefix of ["attract", "lobby"]) {
    setText(qs(`#${prefix}Code`), roomCode);
    setText(qs(`#${prefix}Url`), `${host}/phone`);
    qs(`#${prefix}Qr`).innerHTML = qr;
  }
}

function effectiveVp(room) {
  const customVp = room?.settings?.houseRules?.victoryPointsToWin;
  if (Number.isFinite(customVp)) return Math.floor(customVp);
  return room?.gameMode === "quick" ? 8 : 10;
}

function lobbyStatus(room) {
  const players = room.players || [];
  const host = players.find((p) => p.playerId === room.hostPlayerId) || null;
  const missing = MIN_PLAYERS - players.length;
  if (missing > 0) return { text: `Need ${missing} more player${missing === 1 ? "" : "s"}`, ready: false };
  const waiting = players.filter((p) => !p.ready).map((p) => p.name);
  if (waiting.length) return { text: `Waiting on ${waiting.join(", ")} to tap Ready`, ready: false };
  return { text: `Everybody's in! ${host?.name || "The host"} can tap Start`, ready: true };
}

function renderLobby(room) {
  const scenario = scenarioDisplay(room.scenarios, room.settings?.scenarioId, { fallbackName: "Classic" });
  setText(qs("#lobbyScenarioTitle"), scenario?.name || "Classic");

  const preset = (room.presets || []).find((p) => p?.id === room.presetId);
  const pills = [`${effectiveVp(room)} VP to win`, preset?.name || "Balanced"];
  if (room.variants?.eventDeckEnabled === true) pills.push("Event deck");
  elLobbyPills.innerHTML = pills.map((label) => `<span class="lobbyPill">${escapeHtml(label)}</span>`).join("");

  const limit = Math.max(MIN_PLAYERS, Math.min(6, Math.floor(Number(room.maxPlayers)) || 4));
  const players = room.players || [];
  elLobbySlots.dataset.slots = String(limit);
  elLobbySlots.innerHTML = Array.from({ length: Math.max(limit, players.length) }, (_, i) => {
    const p = players[i];
    if (!p) return `<div class="lobbySlot empty"><span class="slotHint">Open seat</span></div>`;
    const state = !p.connected ? "Reconnecting…" : p.ready ? "Ready" : "Joined";
    return `<div class="lobbySlot${p.ready ? " ready" : ""}${p.connected ? "" : " offline"}" style="--c:${escapeHtml(p.color)}">
      ${settlementSprite(p.color)}
      <div class="slotMain">
        <div class="slotName">${escapeHtml(p.name)}</div>
        <div class="slotState">${p.playerId === room.hostPlayerId ? "Host · " : ""}${state}</div>
      </div>
      ${p.ready ? `<span class="slotCheck" aria-hidden="true">✓</span>` : ""}
    </div>`;
  }).join("");

  const status = lobbyStatus(room);
  setText(elLobbyStatus, status.text);
  elLobbyStatus.classList.toggle("ready", status.ready);

  const radius = players.length >= 5 ? 3 : 2;
  if (radius !== lobbyPreviewRadius) {
    lobbyPreviewRadius = radius;
    renderBoard(elLobbyPreview, createAttractSampleBoard(radius), {
      players: [],
      structures: { roads: {}, settlements: {} },
      robberHexId: radius >= 3 ? "H18" : "H9"
    });
  }
}

// -----------------------------------------------------------------------------
// Room connection
// -----------------------------------------------------------------------------

async function adoptNewRoom() {
  const created = await api("/api/rooms", { method: "POST" });
  roomCode = created.roomCode;
  lastRevisionSeen = null;
  history.replaceState(null, "", `/tv?room=${encodeURIComponent(roomCode)}`);
}

async function ensureRoom() {
  const fromQuery = new URL(location.href).searchParams.get("room");
  if (fromQuery) {
    const candidate = String(fromQuery).toUpperCase();
    try {
      await api(`/api/rooms/${encodeURIComponent(candidate)}`);
      roomCode = candidate;
      lastRevisionSeen = null;
      return;
    } catch {
      // Room doesn't exist anymore (server restart). Create a fresh one.
    }
  }
  await adoptNewRoom();
}

function setConnectionOverlay(isVisible, { title = "Reconnecting…", hint = "" } = {}) {
  elConnectionOverlay.style.display = isVisible ? "" : "none";
  if (!isVisible) return;
  elConnectionTitle.textContent = title;
  elConnectionHint.textContent = hint;
}

const renderScheduler = createRenderScheduler(() => {
  const room = lastRoomState;
  if (!room) return;
  const prev = lastRenderedRoomState;
  lastRenderedRoomState = room;

  if (debugPerfEnabled && markRenderStart && markRenderEnd) {
    markRenderStart("tv.render");
    render(room, prev);
    markRenderEnd("tv.render");
  } else {
    render(room, prev);
  }
});

function connectStream() {
  if (es) es.close();
  setConnectionOverlay(false);
  es = new EventSource(`/api/rooms/${encodeURIComponent(roomCode)}/stream?role=tv`);

  es.addEventListener("state", (ev) => {
    const raw = ev.data;
    const payload = JSON.parse(raw);
    const serverTimeMs = Number(payload?.room?.serverTimeMs);
    if (Number.isFinite(serverTimeMs)) serverSkewMs = Date.now() - serverTimeMs;
    const rev = Number(payload?.room?.revision);
    if (Number.isFinite(rev)) {
      if (Number.isFinite(lastRevisionSeen) && rev <= lastRevisionSeen) return;
      lastRevisionSeen = rev;
    } else {
      lastRevisionSeen = null;
    }
    const prev = lastRoomState;
    lastRoomState = applyDisplayColors(payload.room);
    if (debugPerfEnabled && markPayloadSize && measureUtf8Bytes) markPayloadSize("tv.state", measureUtf8Bytes(raw));
    if (prev && payload.room?.roomCode !== prev.roomCode) {
      lastRenderedRoomState = null;
      lastBoardRenderKey = null;
      showQueue.clear();
      segmentTracker.reset();
    }
    setConnectionOverlay(false);
    recoveryDelay = 1200;
    renderScheduler.schedule();
  });

  es.addEventListener("emote", (ev) => {
    let payload = null;
    try {
      payload = JSON.parse(ev.data || "null");
    } catch {
      return;
    }
    const emote = String(payload?.emote || "");
    const label = { nice: "Nice!", ouch: "Ouch", gg: "GG" }[emote];
    if (label) playerCards.showBubble(payload?.playerId, label, emote === "ouch" ? "warn" : "good");
  });

  es.addEventListener("ping", () => {});

  es.onerror = () => {
    setConnectionOverlay(true, {
      title: "Reconnecting…",
      hint: "Hang tight. If this room is gone, a new code will appear."
    });
    scheduleRoomRecovery();
  };
}

function scheduleRoomRecovery() {
  if (recoveryTimer) return;
  const code = roomCode;
  recoveryTimer = setTimeout(async () => {
    recoveryTimer = null;
    try {
      await api(`/api/rooms/${encodeURIComponent(code)}`);
      recoveryDelay = 1200;
    } catch (e) {
      recoveryDelay = Math.min(recoveryDelay * 2, MAX_RECOVERY_DELAY);
      if (errorCode(e) === "HTTP_404" && code === roomCode) {
        try {
          await adoptNewRoom();
          recoveryDelay = 1200;
          connectStream();
        } catch {
          // Ignore; we'll retry on the next error tick.
        }
      }
    }
  }, recoveryDelay);
}

async function applyThemeFromRoom(room) {
  const themeId = (typeof room?.themeId === "string" ? room.themeId : "").trim() || null;
  if (themeId === lastThemeId) return;
  lastThemeId = themeId;

  const root = document.documentElement;
  if (!themeId) return root.removeAttribute("data-theme");
  try {
    await loadTheme(themeId);
  } catch (err) {
    console.warn("[catan] Failed to load theme:", err);
    root.setAttribute("data-theme", themeId);
  }
}

// -----------------------------------------------------------------------------
// Render
// -----------------------------------------------------------------------------

function screenFor(room) {
  if (room.status === "in_game" && room.game) return room.game.phase === "game_over" ? "over" : "game";
  return (room.players || []).length ? "lobby" : "attract";
}

function renderTurnCard(room) {
  const game = room.game;
  const current = playerById(game.currentPlayerId);
  const color = current?.color || "#fff";
  document.body.style.setProperty("--turn-color", color);
  setText(elTurnKicker, turnKickerText(game));
  setText(elTurnName, current?.name || "");
  setText(elTurnAction, turnActionText(game));

  const pending = pendingDiscards(room);
  setText(
    elTurnWaiting,
    pending.length ? `Discarding: ${pending.map((p) => `${p.name} (${p.count})`).join(", ")}` : ""
  );
}

function renderOffers(room) {
  const open = (room.game.tradeOffers || []).filter((o) => o?.status === "open");
  elOffersPanel.hidden = open.length === 0;
  elOffers.innerHTML = open
    .slice(-3)
    .map((o) => offerHtml(o, room.players))
    .join("");
}

function renderEvent(game) {
  const event = game.currentEvent;
  elEventPanel.hidden = !event?.id;
  if (!event?.id) return;
  setText(elEventTitle, event.name || "Event");
  setText(elEventDescription, event.description || event.shortText || "");
}

function renderRejoin(room) {
  const dropped = (room.players || []).filter((p) => !p.connected);
  elRejoinPill.classList.toggle("alert", dropped.length > 0);
  setText(elRejoinPill, dropped.length ? `Rejoin with code ${room.roomCode}` : `Room ${room.roomCode}`);
}

function boardRenderKey(room) {
  const game = room.game;
  const s = game.structures || {};
  const roads = Object.entries(s.roads || {}).map(([id, r]) => `${id}:${r?.playerId}`);
  const towns = Object.entries(s.settlements || {}).map(([id, t]) => `${id}:${t?.playerId}:${t?.kind}`);
  const hints = game.hints || {};
  return [
    room.roomCode,
    game.board?.layout,
    (game.board?.hexes || []).map((h) => `${h?.id}:${h?.resource}:${h?.token}`).join(","),
    roads.sort().join(","),
    towns.sort().join(","),
    hints.expected,
    (hints.legalVertexIds || []).join(","),
    (hints.legalEdgeIds || []).join(","),
    (hints.legalHexIds || []).join(","),
    game.robberHexId,
    (room.players || []).map((p) => `${p.playerId}:${p.color}`).join(",")
  ].join("|");
}

function renderGameBoard(room, prevGame) {
  const game = room.game;
  const key = boardRenderKey(room);
  if (key === lastBoardRenderKey) return;
  lastBoardRenderKey = key;

  const placed = computePlacedStructures(prevGame?.structures || null, game.structures || null);
  const highlightMode =
    room.gameMode === "quick" && ["PLACE_SETTLEMENT", "PLACE_ROAD"].includes(game.hints?.expected || "")
      ? "quick-setup"
      : "";
  renderBoard(elBoard, game.board, {
    players: room.players,
    structures: game.structures,
    placedVertexIds: placed.placedVertexIds,
    placedEdgeIds: placed.placedEdgeIds,
    selectableVertexIds: game.hints?.legalVertexIds || [],
    selectableEdgeIds: game.hints?.legalEdgeIds || [],
    selectableHexIds: game.hints?.legalHexIds || [],
    robberHexId: game.robberHexId,
    highlightMode
  });
}

function render(room, prevRoom) {
  applyThemeFromRoom(room);
  updateMusicMode(room);
  renderJoinInfo();

  const screen = screenFor(room);
  document.body.dataset.screen = screen;
  document.body.dataset.playerCountBucket = (room.players || []).length >= 5 ? "5-6" : "3-4";

  if (screen === "lobby") renderLobby(room);

  const prevGame = prevRoom?.status === "in_game" ? prevRoom.game || null : null;
  const game = room.status === "in_game" ? room.game || null : null;

  const { beats } = computeShowBeats(prevRoom, room);
  beats.push(...computeAwardBeats(prevGame, game, stablePart(room.roomCode)));
  const segment = segmentTracker.update(game);
  if (segment.changed && segment.copy) {
    beats.unshift({
      id: `segment_transition:${stablePart(room.roomCode)}:${stablePart(segment.from)}:${stablePart(segment.to)}`,
      type: "segment_transition",
      copy: segment.copy
    });
  }
  const gameMode = room.gameMode === "quick" ? "quick" : "classic";
  for (const beat of beats) beat.gameMode = gameMode;

  if (!game) {
    stopTurnTimer();
    lastBoardRenderKey = null;
    showQueue.enqueue(beats);
    return;
  }

  renderGameBoard(room, prevGame);
  playerCards.update(room);
  setText(elVpGoal, `First to ${game.victoryPointsToWin ?? effectiveVp(room)} VP`);

  if (screen === "over") {
    stopTurnTimer();
    elEndPanel.innerHTML = endPanelHtml(room);
  } else {
    renderTurnCard(room);
    renderOffers(room);
    renderEvent(game);
    renderRejoin(room);
    elDiceHud.innerHTML = diceHudHtml(game.lastRoll);
    elTicker.innerHTML = tickerHtml(game.log, room.players);
    if (game.currentPlayerId) {
      ensureTurnTimerRunning();
      renderTurnTimer(room);
    } else {
      stopTurnTimer();
    }
  }

  showQueue.enqueue(beats);
}

// -----------------------------------------------------------------------------
// Startup
// -----------------------------------------------------------------------------

async function initThemes() {
  const index = await fetchThemeIndex();
  const themeIds = index?.themes?.map((t) => t.id);
  await preloadThemes(
    themeIds?.length ? themeIds : ["aurora", "ember", "ocean", "classic-night", "neon-arcade", "deep-sea"]
  );
}

await initThemes();

try {
  const serverInfo = await api("/api/server-info");
  if (serverInfo?.lanIp) serverLanIp = serverInfo.lanIp;
} catch {
  // Ignore: phones fall back to location.host.
}

await ensureRoom();
renderJoinInfo();
connectStream();
