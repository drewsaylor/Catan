import { api, qs, renderLog, setText } from "/shared/common.js";
import {
  applyBoardMoment,
  renderBoard,
  focusPlayerArea,
  focusEdge,
  focusVertex,
  focusHex,
  cinematicReset
} from "/shared/board-renderer.js";
import { createRenderScheduler } from "/shared/render-scheduler.js";
import { errorCode, humanizeErrorMessage } from "/shared/error-copy.js";
import { qrSvg } from "/shared/qr.js";
import { scenarioDisplay } from "/shared/scenarios.js";
import { getSettings, initSettings, onSettingsChange, setSettings } from "/shared/settings.js";
import { installAudioUnlock, playSfx, setAmbientEnabled } from "/shared/audio.js";
import { supportsWebGL } from "/shared/render-capabilities.js";
import { createMomentQueue, detectMoments } from "/shared/moment-detector.js";
import { createShowLayer } from "/tv/show-layer.js";
import { createSegmentTracker, getSegment, hostCopyForMoment } from "/shared/host-copy.js";
import {
  loadTheme,
  getLoadedTheme,
  onThemeChange,
  preloadThemes,
  fetchThemeIndex,
  getAvailableThemes
} from "/shared/theme-loader.js";
import { getTipsForContext } from "/shared/tips-catalog.js";
import { createDice3dPanel, createBoardFxHelper, createResourceFlyoutManager } from "/shared/board-3d.js";
// Extracted modules for TV functionality (Phase 3 modularization)
import {
  computeShowBeats as computeShowBeatsModule,
  computePlacedStructures as computePlacedStructuresModule
} from "/tv/show-beats.js";
import {
  createAttractSampleBoard as createAttractSampleBoardModule,
  createAttractModeController
} from "/tv/attract-mode.js";
import { createLobbyOverlayController } from "/tv/lobby-overlay.js";

const debugPerfEnabled = new URL(location.href).searchParams.get("debug") === "1";
const alwaysRenderEnabled = new URL(location.href).searchParams.get("alwaysRender") === "1";
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

const elStatus = qs("#status");
const elPhaseText = qs("#phaseText");
const elPhasePill = qs("#phasePill");
const elTurnTimer = qs("#turnTimer");
const elRoomCode = qs("#roomCode");
const elJoinUrl = qs("#joinUrl");
const elJoinQr = qs("#joinQr");
const elScenarioName = qs("#scenarioName");
const elScenarioSelect = qs("#scenarioSelect");
const elScenarioDesc = qs("#scenarioDesc");
const elPresetName = qs("#presetName");
const elModeName = qs("#modeName");
const elThemeName = qs("#themeName");
const elPlayerCount = qs("#playerCount");
const elPlayers = qs("#players");
const elBoard = qs("#board");
const elSideTitle = qs("#sideTitle");
const elJoinInfo = qs("#joinInfo");
const elDiceBox = qs("#diceBox");
const elEventCard = qs("#eventCard");
const elEventTitle = qs("#eventTitle");
const elEventDescription = qs("#eventDescription");
const elOffersCard = qs("#offersCard");
const elOffers = qs("#offers");
const elOffersEmpty = qs("#offersEmpty");
const elLog = qs("#log");
const elEndScreenCard = qs("#endScreenCard");
const elEndScreenWinner = qs("#endScreenWinner");
const elEndScreenHint = qs("#endScreenHint");
const elRematchBtn = qs("#rematchBtn");
const elNewRoomBtn = qs("#newRoomBtn");
const elSettingsBtn = qs("#settingsBtn");
const elSettingsBackdrop = qs("#settingsBackdrop");
const elSettingsCloseBtn = qs("#settingsCloseBtn");
const elMuteAllBtn = qs("#muteAllBtn");
const elReducedMotionBtn = qs("#reducedMotionBtn");
const elHighContrastBtn = qs("#highContrastBtn");
const elColorblindBtn = qs("#colorblindBtn");
const elBoardRendererBtn = qs("#boardRendererBtn");
const elBoardRendererHint = qs("#boardRendererHint");
const elShowQrBtn = qs("#showQrBtn");
const elSfxVolume = qs("#sfxVolume");
const elMusicVolume = qs("#musicVolume");
const elShowLayer = qs("#showLayer");
const elConnectionOverlay = qs("#connectionOverlay");
const elConnectionTitle = qs("#connectionTitle");
const elConnectionHint = qs("#connectionHint");
const elHostBtn = qs("#hostBtn");
const elHostBackdrop = qs("#hostBackdrop");
const elHostCloseBtn = qs("#hostCloseBtn");
const elAdminState = qs("#adminState");
const elClaimAdminBtn = qs("#claimAdminBtn");
const elDownloadSnapshotBtn = qs("#downloadSnapshotBtn");
const elTimerPauseBtn = qs("#timerPauseBtn");
const elThemeSelectField = qs("#themeSelectField");
const elThemeSelect = qs("#themeSelect");
const elHostSelect = qs("#hostSelect");
const elHostSetBtn = qs("#hostSetBtn");
const elKickList = qs("#kickList");
const elResetRoomBtn = qs("#resetRoomBtn");
const elResetConfirmPanel = qs("#resetConfirmPanel");
const elResetConfirmBtn = qs("#resetConfirmBtn");
const elResetCancelBtn = qs("#resetCancelBtn");
const elHostErr = qs("#hostErr");

// Attract Mode Elements
const elAttractMode = qs("#attractMode");
const elAttractBoard = qs("#attractBoard");
const elAttractTip = qs("#attractTip");
const elAttractQr = qs("#attractQr");
const elAttractCreateBtn = qs("#attractCreateBtn");

// Lobby Overlay Elements
const elLobbyOverlay = qs("#lobbyOverlay");
const elLobbyRoomCode = qs("#lobbyRoomCode");
const elLobbyQr = qs("#lobbyQr");
const elLobbyJoinUrl = qs("#lobbyJoinUrl");
const elLobbyJoinRoomCode = qs("#lobbyJoinRoomCode");
const elLobbyPlayers = qs("#lobbyPlayers");
const elLobbyPlayersEmpty = qs("#lobbyPlayersEmpty");
const elLobbyBoardPreview = qs("#lobbyBoardPreview");
const elLobbyScenarioSelect = qs("#lobbyScenarioSelect");
const elLobbyScenarioDesc = qs("#lobbyScenarioDesc");
const elLobbyThemeSelect = qs("#lobbyThemeSelect");
const elLobbyStartStatus = qs("#lobbyStartStatus");

let roomCode = null;
let adminSecret = null;
let hostPinCache = null;
let es = null;
let lastRoomState = null;
let lastRenderedRoomState = null;
let lastRevisionSeen = null;
let lastThemeId = null;
let lastScenarioOptionsKey = null;
let lastTurnPlayerId = null;
let turnStartMs = null;
let turnTimerInterval = null;
let turnNudgeKey = null;
const turnNudgeFired = new Set();
const flashTimers = new WeakMap();
const offerNewTimers = new Map();
const showQueue = createMomentQueue({ maxQueue: 24, maxSeen: 512 });
const segmentTracker = createSegmentTracker();
let lastJoinQrUrl = null;
let serverSkewMs = 0;
let lastPlayersRenderKey = null;
let lastLogRenderKey = null;
let lastBoardRenderKey = null;

// =============================================================================
// Attract Mode State
// =============================================================================
let attractModeActive = false;
let hasEverConnected = false; // Track if we've ever connected to a room (for startup attract mode)
let attractTipIndex = 0;
let attractTipTimer = null;
let attractIdleTimer = null;
let attractBoard3dModule = null;
const ATTRACT_IDLE_TIMEOUT_MS = 30000; // 30 seconds of no room/players triggers attract
const ATTRACT_TIP_INTERVAL_MS = 5500; // Rotate tips every 5.5 seconds

// =============================================================================
// Lobby Overlay State
// =============================================================================
let lobbyOverlayActive = false;
let lastLobbyScenarioOptionsKey = null;
let lastLobbyThemeOptionsKey = null;
let lastLobbyQrUrl = null;
let lobbyPreviewBoard = null;

const RESOURCE_TYPES = ["wood", "brick", "sheep", "wheat", "ore"];
const QUICK_TURN_NUDGE_THRESHOLDS_MS = [45000, 75000];

// =============================================================================
// 3D Dice + FX State (Phase 7)
// =============================================================================
let dice3dPanel = null;
let boardFxHelper = null;
let resourceFlyoutManager = null;
let lastDiceRollAt = null;

initSettings();
installAudioUnlock();
setAmbientEnabled(true);
const show = elShowLayer
  ? createShowLayer(elShowLayer)
  : {
      showMoment: async () => {},
      toast: async () => {},
      spotlightElement: () => {},
      confetti: () => {}
    };
showQueue.setHandler(runBeat);

let focusBeforeSettings = null;
let focusBeforeHost = null;

function syncSettingsUi(settings) {
  if (elMuteAllBtn) {
    elMuteAllBtn.textContent = settings?.muteAll ? "On" : "Off";
    elMuteAllBtn.setAttribute("aria-pressed", settings?.muteAll ? "true" : "false");
  }
  if (elReducedMotionBtn) {
    elReducedMotionBtn.textContent = settings?.reducedMotion ? "On" : "Off";
    elReducedMotionBtn.setAttribute("aria-pressed", settings?.reducedMotion ? "true" : "false");
  }
  if (elHighContrastBtn) {
    elHighContrastBtn.textContent = settings?.highContrast ? "On" : "Off";
    elHighContrastBtn.setAttribute("aria-pressed", settings?.highContrast ? "true" : "false");
  }
  if (elColorblindBtn) {
    elColorblindBtn.textContent = settings?.colorblind ? "On" : "Off";
    elColorblindBtn.setAttribute("aria-pressed", settings?.colorblind ? "true" : "false");
  }
  if (elBoardRendererBtn || elBoardRendererHint) {
    const webglOk = supportsWebGL();
    const wants3d = settings?.boardRenderer === "3d";
    const is3d = webglOk && wants3d;

    if (elBoardRendererBtn) {
      elBoardRendererBtn.textContent = is3d ? "3D" : "2D";
      elBoardRendererBtn.disabled = !webglOk;
      elBoardRendererBtn.setAttribute("aria-pressed", is3d ? "true" : "false");
    }

    if (elBoardRendererHint) {
      if (!webglOk && wants3d) elBoardRendererHint.textContent = "WebGL unavailable • Using 2D.";
      else if (!webglOk) elBoardRendererHint.textContent = "3D unavailable on this device.";
      else elBoardRendererHint.textContent = "2D is safest • 3D is beta.";
    }
  }
  if (elShowQrBtn) {
    elShowQrBtn.textContent = settings?.showQr ? "On" : "Off";
    elShowQrBtn.setAttribute("aria-pressed", settings?.showQr ? "true" : "false");
  }
  if (settings?.showQr && roomCode && lastRoomState?.status !== "in_game") {
    renderJoinQr(roomUrlForPhones(), { force: true });
  }
  if (elSfxVolume) elSfxVolume.value = String(Math.round((settings?.sfxVolume ?? 0) * 100));
  if (elMusicVolume) elMusicVolume.value = String(Math.round((settings?.musicVolume ?? 0) * 100));

  // === UPDATE 3D DICE + FX HELPERS WITH SETTINGS ===
  if (dice3dPanel) {
    dice3dPanel.setReducedMotion(!!settings?.reducedMotion);
  }
  if (boardFxHelper) {
    boardFxHelper.setReducedMotion(!!settings?.reducedMotion);
    boardFxHelper.setQuality(settings?.boardRenderer === "3d" ? "auto" : "medium");
  }
  if (resourceFlyoutManager) {
    resourceFlyoutManager.setReducedMotion(!!settings?.reducedMotion);
  }
}

function isSettingsOpen() {
  if (!elSettingsBackdrop) return false;
  return elSettingsBackdrop.style.display !== "none";
}

function openSettings() {
  if (!elSettingsBackdrop) return;
  focusBeforeSettings = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  syncSettingsUi(getSettings());
  elSettingsBackdrop.style.display = "";
  requestAnimationFrame(() => elSettingsCloseBtn?.focus());
}

function closeSettings() {
  if (!elSettingsBackdrop) return;
  elSettingsBackdrop.style.display = "none";
  const restore = focusBeforeSettings && document.contains(focusBeforeSettings) ? focusBeforeSettings : elSettingsBtn;
  focusBeforeSettings = null;
  requestAnimationFrame(() => restore?.focus());
}

function isHostControlsOpen() {
  if (!elHostBackdrop) return false;
  return elHostBackdrop.style.display !== "none";
}

function openHostControls() {
  if (!elHostBackdrop) return;
  if (isSettingsOpen()) closeSettings();
  focusBeforeHost = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (elHostErr) elHostErr.textContent = "";
  if (elResetConfirmPanel) elResetConfirmPanel.style.display = "none";
  syncHostControls(lastRoomState);
  elHostBackdrop.style.display = "";
  requestAnimationFrame(() => elHostCloseBtn?.focus());
}

function closeHostControls() {
  if (!elHostBackdrop) return;
  elHostBackdrop.style.display = "none";
  if (elResetConfirmPanel) elResetConfirmPanel.style.display = "none";
  if (elHostErr) elHostErr.textContent = "";
  const restore = focusBeforeHost && document.contains(focusBeforeHost) ? focusBeforeHost : elHostBtn;
  focusBeforeHost = null;
  requestAnimationFrame(() => restore?.focus());
}

syncSettingsUi(getSettings());
onSettingsChange(syncSettingsUi);

elSettingsBtn?.addEventListener("click", () => openSettings());
elSettingsCloseBtn?.addEventListener("click", () => closeSettings());
elSettingsBackdrop?.addEventListener("click", (ev) => {
  if (ev.target === elSettingsBackdrop) closeSettings();
});

elHostBtn?.addEventListener("click", () => openHostControls());
elHostCloseBtn?.addEventListener("click", () => closeHostControls());
elHostBackdrop?.addEventListener("click", (ev) => {
  if (ev.target === elHostBackdrop) closeHostControls();
});

elRematchBtn?.addEventListener("click", async () => {
  await requestRematch();
});

elNewRoomBtn?.addEventListener("click", async () => {
  await createNewRoom();
});

elScenarioSelect?.addEventListener("change", () => {
  const room = lastRoomState;
  if (!room) return;
  const current = typeof room?.settings?.scenarioId === "string" ? room.settings.scenarioId : "";
  const next = String(elScenarioSelect.value || "");
  if (next && next !== current) requestScenarioChange(next);
});

elClaimAdminBtn?.addEventListener("click", async () => {
  if (!elClaimAdminBtn) return;
  setHostError("");
  try {
    elClaimAdminBtn.disabled = true;
    await claimAdminSecret();
    show.toast({ title: "Host controls enabled", subtitle: "This TV is the console.", tone: "good", durationMs: 1600 });
  } catch (e) {
    setHostError(humanizeErrorMessage(e, { room: lastRoomState }));
  } finally {
    elClaimAdminBtn.disabled = false;
    syncHostControls(lastRoomState);
  }
});

elDownloadSnapshotBtn?.addEventListener("click", async () => {
  if (!elDownloadSnapshotBtn) return;
  setHostError("");
  try {
    elDownloadSnapshotBtn.disabled = true;
    await downloadRoomSnapshot();
    show.toast({ title: "Snapshot downloaded", subtitle: roomCode || "", tone: "good", durationMs: 1600 });
  } catch (e) {
    setHostError(humanizeErrorMessage(e, { room: lastRoomState }));
  } finally {
    syncHostControls(lastRoomState);
  }
});

elTimerPauseBtn?.addEventListener("click", async () => {
  setHostError("");
  try {
    const paused = !!lastRoomState?.timer?.paused;
    elTimerPauseBtn.disabled = true;
    await adminPost("timer", { paused: !paused });
    show.toast({
      title: paused ? "Timer resumed" : "Timer paused",
      subtitle: "Turn nudges follow the timer.",
      tone: "info",
      durationMs: 1400
    });
  } catch (e) {
    setHostError(humanizeErrorMessage(e, { room: lastRoomState }));
  } finally {
    elTimerPauseBtn.disabled = false;
    syncHostControls(lastRoomState);
  }
});

elHostSelect?.addEventListener("change", () => syncHostControls(lastRoomState));

elThemeSelect?.addEventListener("change", async () => {
  const room = lastRoomState;
  if (!room || room.status !== "lobby") return;
  const currentThemeId = typeof room?.themeId === "string" ? room.themeId : "";
  const nextThemeId = String(elThemeSelect.value || "");
  if (nextThemeId && nextThemeId !== currentThemeId) {
    await requestThemeChange(nextThemeId);
  }
});

elHostSetBtn?.addEventListener("click", async () => {
  setHostError("");
  try {
    const desired = elHostSelect?.value || "";
    if (!desired) return;
    elHostSetBtn.disabled = true;
    await adminPost("host", { hostPlayerId: desired });
    const who = (lastRoomState?.players || []).find((p) => p.playerId === desired)?.name || "Player";
    show.toast({ title: "Host reassigned", subtitle: who, tone: "info", durationMs: 1500 });
  } catch (e) {
    setHostError(humanizeErrorMessage(e, { room: lastRoomState }));
  } finally {
    syncHostControls(lastRoomState);
  }
});

elKickList?.addEventListener("click", async (ev) => {
  const btn = ev.target?.closest?.('button[data-action="kick"]');
  if (!btn) return;
  const playerId = btn.getAttribute("data-player-id") || "";
  const who = (lastRoomState?.players || []).find((p) => p.playerId === playerId)?.name || "Player";
  if (!confirm(`Kick ${who}?`)) return;

  setHostError("");
  try {
    btn.disabled = true;
    await adminPost("kick", { targetPlayerId: playerId });
    show.toast({ title: "Player kicked", subtitle: who, tone: "warn", durationMs: 1600 });
  } catch (e) {
    setHostError(humanizeErrorMessage(e, { room: lastRoomState }));
  } finally {
    btn.disabled = false;
  }
});

elResetRoomBtn?.addEventListener("click", () => {
  if (!elResetConfirmPanel) return;
  elResetConfirmPanel.style.display = "";
  requestAnimationFrame(() => elResetConfirmBtn?.focus());
});

elResetCancelBtn?.addEventListener("click", () => {
  if (!elResetConfirmPanel) return;
  elResetConfirmPanel.style.display = "none";
  requestAnimationFrame(() => elResetRoomBtn?.focus());
});

elResetConfirmBtn?.addEventListener("click", async () => {
  setHostError("");
  try {
    elResetConfirmBtn.disabled = true;
    await adminPost("reset", { confirm: true });
    if (elResetConfirmPanel) elResetConfirmPanel.style.display = "none";
    show.toast({ title: "Room reset", subtitle: "Back to lobby.", tone: "warn", durationMs: 1600 });
  } catch (e) {
    setHostError(humanizeErrorMessage(e, { room: lastRoomState }));
  } finally {
    elResetConfirmBtn.disabled = false;
    syncHostControls(lastRoomState);
  }
});

elMuteAllBtn?.addEventListener("click", () => {
  const s = getSettings();
  setSettings({ muteAll: !s.muteAll });
});

elReducedMotionBtn?.addEventListener("click", () => {
  const s = getSettings();
  setSettings({ reducedMotion: !s.reducedMotion });
});

elHighContrastBtn?.addEventListener("click", () => {
  const s = getSettings();
  setSettings({ highContrast: !s.highContrast });
});

elColorblindBtn?.addEventListener("click", () => {
  const s = getSettings();
  setSettings({ colorblind: !s.colorblind });
});

elBoardRendererBtn?.addEventListener("click", () => {
  if (!supportsWebGL()) return;
  const s = getSettings();
  const next = s.boardRenderer === "3d" ? "auto" : "3d";
  setSettings({ boardRenderer: next });
  lastBoardRenderKey = null;
  try {
    renderScheduler.schedule();
  } catch {
    // Ignore.
  }
});

elShowQrBtn?.addEventListener("click", () => {
  const s = getSettings();
  setSettings({ showQr: !s.showQr });
});

elSfxVolume?.addEventListener("input", () => {
  setSettings({ sfxVolume: Number(elSfxVolume.value) / 100 });
});

elMusicVolume?.addEventListener("input", () => {
  setSettings({ musicVolume: Number(elMusicVolume.value) / 100 });
});

document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape") return;
  if (isSettingsOpen()) return closeSettings();
  if (isHostControlsOpen()) return closeHostControls();
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.floor(ms || 0))));
}

function playerRow(p, { mode, currentPlayerId, pointsByPlayerId, victoryPointsToWin, winnerPlayerId }) {
  const inGame = mode === "in_game";
  const isGameOver = inGame && !!winnerPlayerId;
  const isTurn = inGame && !isGameOver && currentPlayerId && p.playerId === currentPlayerId;
  const dotColor = p.connected ? p.color : "rgba(255,255,255,0.18)";

  const cls = ["player"];
  if (inGame) cls.push("compact");
  if (!p.connected) cls.push("disconnected");
  if (isTurn) cls.push("turn");

  const readyTag = p.ready ? `<span class="tag good">Ready</span>` : `<span class="tag warn">Not ready</span>`;
  const hostTag = p.isHost ? `<span class="tag">Host</span>` : "";
  const points = Math.max(0, Math.floor(pointsByPlayerId?.[p.playerId] ?? 0));
  const target = Math.max(0, Math.floor(victoryPointsToWin ?? 0));
  const vpTag =
    target > 0
      ? `<span class="tag">${escapeHtml(points)}/${escapeHtml(target)} VP</span>`
      : `<span class="tag">${escapeHtml(points)} VP</span>`;
  const winnerTag = winnerPlayerId === p.playerId ? `<span class="tag good">Winner</span>` : "";
  const right =
    mode === "lobby"
      ? `<div style="display:flex; gap:8px; align-items:center;">${hostTag}${readyTag}</div>`
      : `<div style="display:flex; gap:8px; align-items:center;">${winnerTag}${vpTag}</div>`;
  return `
    <div class="${cls.join(" ")}" data-player-id="${escapeHtml(p.playerId)}" style="--pc:${escapeHtml(p.color)};">
      <div class="name">
        <span class="dot" style="background:${dotColor};"></span>
        <div>${escapeHtml(p.name)}</div>
      </div>
      ${right}
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function roomUrlForPhones() {
  const base = `${location.protocol}//${location.host}`;
  return `${base}/phone?room=${encodeURIComponent(roomCode)}`;
}

function renderJoinQr(joinUrl, { force = false } = {}) {
  if (!elJoinQr) return;
  if (!joinUrl) {
    elJoinQr.innerHTML = "";
    lastJoinQrUrl = null;
    return;
  }

  const showQr = getSettings()?.showQr !== false;
  if (!showQr) return;
  if (!force && joinUrl === lastJoinQrUrl) return;
  lastJoinQrUrl = joinUrl;

  try {
    elJoinQr.innerHTML = qrSvg(joinUrl, { margin: 4, label: "Join room" });
  } catch (err) {
    console.warn("[catan] failed to render join QR:", err);
    elJoinQr.innerHTML = "";
    lastJoinQrUrl = null;
  }
}

function setTvStatus(label) {
  const code = roomCode ? ` @ ${roomCode}` : "";
  setText(elStatus, `${label}${code}`);
}

function setConnectionOverlay(isVisible, { title = "Reconnecting…", hint = "" } = {}) {
  if (!elConnectionOverlay) return;
  elConnectionOverlay.style.display = isVisible ? "" : "none";
  if (!isVisible) return;
  if (elConnectionTitle) elConnectionTitle.textContent = title;
  if (elConnectionHint) elConnectionHint.textContent = hint;
}

function adminSecretStorageKey(code) {
  const safe = String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return `catan.adminSecret.${safe}`;
}

function loadAdminSecret(code) {
  try {
    return localStorage.getItem(adminSecretStorageKey(code)) || null;
  } catch {
    return null;
  }
}

function storeAdminSecret(code, secret) {
  try {
    if (secret) localStorage.setItem(adminSecretStorageKey(code), secret);
  } catch {
    // Ignore.
  }
}

function hasAdminSecret() {
  return typeof adminSecret === "string" && !!adminSecret;
}

function normalizeHostPin(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!/^\d{4,8}$/.test(s)) return null;
  return s;
}

function isHostPinErrorMessage(message) {
  const s = String(message || "");
  return s === "HOST_PIN_REQUIRED" || s === "BAD_HOST_PIN" || s.includes("Host PIN");
}

async function ensureHostPin({ room = lastRoomState } = {}) {
  if (!room?.hostPinEnabled) {
    hostPinCache = null;
    return null;
  }
  const cached = normalizeHostPin(hostPinCache);
  if (cached) return cached;

  const entered = prompt("Host PIN", "");
  const pin = normalizeHostPin(entered);
  if (!pin) throw new Error("Host PIN required");
  hostPinCache = pin;
  return pin;
}

function setHostError(message) {
  if (!elHostErr) return;
  elHostErr.textContent = message ? String(message) : "";
}

function setEndScreenHint(message) {
  if (!elEndScreenHint) return;
  elEndScreenHint.textContent = message ? String(message) : "";
  elEndScreenHint.style.display = message ? "" : "none";
}

function syncHostControls(room) {
  const hasAdmin = hasAdminSecret();
  const players = Array.isArray(room?.players) ? room.players : [];
  const hostPlayerId = typeof room?.hostPlayerId === "string" ? room.hostPlayerId : "";
  const canUse = hasAdmin && !!roomCode;

  if (elAdminState) elAdminState.textContent = hasAdmin ? "Ready." : "Enable host controls on this TV.";
  if (elClaimAdminBtn) elClaimAdminBtn.style.display = hasAdmin ? "none" : "";
  if (elDownloadSnapshotBtn) elDownloadSnapshotBtn.disabled = !canUse;

  const paused = !!room?.timer?.paused;
  if (elTimerPauseBtn) {
    elTimerPauseBtn.textContent = paused ? "Resume" : "Pause";
    elTimerPauseBtn.disabled = !canUse;
  }

  // Theme selector - only show in lobby
  const isLobby = room?.status === "lobby";
  const canChangeTheme = canUse && isLobby && !themeUpdateInFlight;
  if (elThemeSelectField) {
    elThemeSelectField.style.display = isLobby && hasAdmin ? "" : "none";
  }
  if (elThemeSelect) {
    const themes = Array.isArray(room?.themes) ? room.themes : [];
    const currentThemeId = typeof room?.themeId === "string" ? room.themeId : "";
    const prevSelected = elThemeSelect.value;

    // Only rebuild options if themes list changed
    const themesKey = themes.map((t) => `${t.id}:${t.name}`).join("|");
    if (elThemeSelect.dataset.themesKey !== themesKey) {
      elThemeSelect.innerHTML = themes
        .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`)
        .join("");
      elThemeSelect.dataset.themesKey = themesKey;
    }

    // Set selected value
    const hasOption = themes.some((t) => t.id === currentThemeId);
    if (hasOption && elThemeSelect.value !== currentThemeId) {
      elThemeSelect.value = currentThemeId;
    } else if (!hasOption && prevSelected) {
      elThemeSelect.value = prevSelected;
    }

    elThemeSelect.disabled = !canChangeTheme;
  }

  if (elHostSelect) {
    const prevSelected = elHostSelect.value;
    elHostSelect.innerHTML = players
      .map((p) => {
        const offline = p.connected ? "" : " (offline)";
        return `<option value="${escapeHtml(p.playerId)}">${escapeHtml(p.name)}${escapeHtml(offline)}</option>`;
      })
      .join("");
    const prevStillValid = prevSelected && players.some((p) => p.playerId === prevSelected);
    if (prevStillValid) elHostSelect.value = prevSelected;
    else if (hostPlayerId) elHostSelect.value = hostPlayerId;
  }

  if (elHostSetBtn) {
    const desired = elHostSelect?.value || "";
    elHostSetBtn.disabled = !canUse || !desired || desired === hostPlayerId;
  }

  if (elKickList) {
    elKickList.innerHTML = players
      .map((p) => {
        const connTag = p.connected ? `<span class="tag good">Online</span>` : `<span class="tag">Offline</span>`;
        const hostTag = p.playerId === hostPlayerId ? `<span class="tag">Host</span>` : "";
        return `
          <div class="row" style="justify-content:space-between; align-items:center;">
            <div style="display:flex; gap:8px; align-items:center;">
              <span class="dot" style="background:${escapeHtml(p.color)};"></span>
              <div>${escapeHtml(p.name)}</div>
              ${hostTag}
              ${connTag}
            </div>
            <button class="btn danger" data-action="kick" data-player-id="${escapeHtml(p.playerId)}" ${canUse ? "" : "disabled"}>Kick</button>
          </div>
        `;
      })
      .join("");
  }

  if (elResetRoomBtn) elResetRoomBtn.disabled = !canUse;
}

let rematchInFlight = false;
let scenarioUpdateInFlight = false;
async function requestRematch() {
  if (rematchInFlight) return;
  rematchInFlight = true;
  setEndScreenHint("");
  try {
    if (!roomCode) throw new Error("No room");
    const room = lastRoomState;
    const hostPlayerId = room?.hostPlayerId ?? null;
    if (!hostPlayerId) throw new Error("No host");

    const hostPin = await ensureHostPin({ room });
    const body = hostPin ? { playerId: hostPlayerId, hostPin } : { playerId: hostPlayerId };
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/rematch`, { method: "POST", body });
    show.toast({ title: "Rematch started", subtitle: "", tone: "good", durationMs: 1600 });
  } catch (e) {
    setEndScreenHint(humanizeErrorMessage(e, { room: lastRoomState }));
    show.toast({ title: "Can't rematch", subtitle: errorCode(e), tone: "bad", durationMs: 2400 });
  } finally {
    rematchInFlight = false;
    if (lastRoomState) render(lastRoomState, lastRenderedRoomState);
  }
}

let newRoomInFlight = false;
async function createNewRoom() {
  if (newRoomInFlight) return;
  newRoomInFlight = true;
  setEndScreenHint("");

  // Exit attract mode immediately when creating a room
  if (attractModeActive) exitAttractMode();

  try {
    if (es) es.close();
    es = null;
    stopTurnTimer();
    hostPinCache = null;

    const created = await api("/api/rooms", { method: "POST" });
    roomCode = created.roomCode;
    adminSecret = typeof created?.adminSecret === "string" ? created.adminSecret : null;
    storeAdminSecret(roomCode, adminSecret);
    lastRevisionSeen = null;
    lastRoomState = null;
    lastRenderedRoomState = null;
    lastJoinQrUrl = null;
    lastPlayersRenderKey = null;
    lastLogRenderKey = null;
    lastBoardRenderKey = null;
    lastDiceRollAt = null;

    // Reset lobby overlay state
    lastLobbyScenarioOptionsKey = null;
    lastLobbyThemeOptionsKey = null;
    lastLobbyQrUrl = null;
    lobbyPreviewBoard = null;

    // === CLEANUP 3D DICE + FX HELPERS ===
    if (dice3dPanel) {
      dice3dPanel.destroy();
      dice3dPanel = null;
    }
    if (boardFxHelper) {
      boardFxHelper.destroy();
      boardFxHelper = null;
    }
    if (resourceFlyoutManager) {
      resourceFlyoutManager.destroy();
      resourceFlyoutManager = null;
    }

    history.replaceState(null, "", `/tv?room=${encodeURIComponent(roomCode)}`);
    connectStream();
  } catch (e) {
    show.toast({ title: "Can't create room", subtitle: errorCode(e), tone: "bad", durationMs: 2400 });
  } finally {
    newRoomInFlight = false;
  }
}

function snapshotFilename(snapshot) {
  const safeCode = String(snapshot?.roomCode || roomCode || "ROOM")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

  const at = Number(snapshot?.exportedAt);
  let stamp = "";
  if (Number.isFinite(at)) {
    try {
      stamp = new Date(at).toISOString().replace(/[:.]/g, "-");
    } catch {
      stamp = "";
    }
  }
  if (!stamp) stamp = String(Date.now());

  return `catan-room-${safeCode}-${stamp}.json`;
}

async function downloadRoomSnapshot() {
  if (!roomCode) throw new Error("No room");
  if (!hasAdminSecret()) throw new Error("Host controls not enabled");

  const hostPin = await ensureHostPin();
  /** @type {Record<string, string>} */
  const headers = { Authorization: `Bearer ${adminSecret}` };
  if (hostPin) headers["X-Host-Pin"] = hostPin;

  const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/debug/export`, {
    method: "GET",
    headers
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const msg = json?.error || `HTTP ${res.status}`;
    if (isHostPinErrorMessage(msg)) hostPinCache = null;
    throw new Error(msg);
  }

  const snapshot = json.snapshot || null;
  if (!snapshot) throw new Error("No snapshot returned");

  const raw = `${JSON.stringify(snapshot, null, 2)}\n`;
  const blob = new Blob([raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = snapshotFilename(snapshot);
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function claimAdminSecret() {
  if (!roomCode) throw new Error("No room");
  const payload = await api(`/api/rooms/${encodeURIComponent(roomCode)}/admin/claim`, { method: "POST" });
  const secret = typeof payload?.adminSecret === "string" ? payload.adminSecret : null;
  if (!secret) throw new Error("No adminSecret returned");
  adminSecret = secret;
  storeAdminSecret(roomCode, adminSecret);
  syncHostControls(lastRoomState);
}

async function adminPost(path, body) {
  if (!roomCode) throw new Error("No room");
  if (!hasAdminSecret()) throw new Error("Host controls not enabled");
  const hostPin = await ensureHostPin();
  const requestBody = { adminSecret, ...(body || {}) };
  if (hostPin) requestBody.hostPin = hostPin;

  try {
    return await api(`/api/rooms/${encodeURIComponent(roomCode)}/admin/${path}`, { method: "POST", body: requestBody });
  } catch (e) {
    if (isHostPinErrorMessage(e?.message)) hostPinCache = null;
    throw e;
  }
}

function scenarioMeta(room) {
  const scenarioId = typeof room?.settings?.scenarioId === "string" ? room.settings.scenarioId : "";
  const scenarios = Array.isArray(room?.scenarios) ? room.scenarios : [];
  const scenario = scenarioId ? scenarios.find((s) => s?.id === scenarioId) || null : null;
  return { scenarioId, scenario, scenarios };
}

function scenariosKey(scenarios) {
  const list = Array.isArray(scenarios) ? scenarios : [];
  return list.map((s) => `${String(s?.id || "")}:${String(s?.name || "")}`).join("|");
}

let themeUpdateInFlight = false;
async function requestThemeChange(nextThemeId) {
  if (themeUpdateInFlight) return;
  themeUpdateInFlight = true;
  try {
    if (!roomCode) throw new Error("No room");
    if (!hasAdminSecret()) throw new Error("Host controls not enabled");
    const room = lastRoomState;
    const hostPlayerId = room?.hostPlayerId;
    if (!hostPlayerId) throw new Error("No host");
    const hostPin = await ensureHostPin({ room });
    const body = { playerId: hostPlayerId, themeId: nextThemeId };
    if (hostPin) body.hostPin = hostPin;
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/theme`, { method: "POST", body });
    show.toast({ title: "Theme updated", subtitle: "", tone: "good", durationMs: 1400 });
  } catch (e) {
    if (isHostPinErrorMessage(e?.message)) hostPinCache = null;
    show.toast({ title: "Can't change theme", subtitle: errorCode(e), tone: "bad", durationMs: 2400 });
  } finally {
    themeUpdateInFlight = false;
    if (lastRoomState) render(lastRoomState, lastRenderedRoomState);
  }
}

async function requestScenarioChange(nextScenarioId) {
  if (scenarioUpdateInFlight) return;
  scenarioUpdateInFlight = true;
  try {
    if (!roomCode) throw new Error("No room");
    if (!hasAdminSecret()) throw new Error("Host controls not enabled");
    const room = lastRoomState;
    const hostPin = await ensureHostPin({ room });
    const body = { adminSecret, scenarioId: nextScenarioId };
    if (hostPin) body.hostPin = hostPin;
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/settings`, { method: "POST", body });
    show.toast({ title: "Scenario updated", subtitle: "", tone: "good", durationMs: 1400 });
  } catch (e) {
    if (isHostPinErrorMessage(e?.message)) hostPinCache = null;
    show.toast({ title: "Can't set scenario", subtitle: errorCode(e), tone: "bad", durationMs: 2400 });
  } finally {
    scenarioUpdateInFlight = false;
    if (lastRoomState) render(lastRoomState, lastRenderedRoomState);
  }
}

function syncScenarioUi(room) {
  const { scenarioId, scenarios } = scenarioMeta(room);
  const display = scenarioDisplay(scenarios, scenarioId, { fallbackName: scenarioId || "—" });

  if (elScenarioName) setText(elScenarioName, display.name);

  if (elScenarioSelect) {
    const nextOptionsKey = scenariosKey(scenarios);
    if (nextOptionsKey !== lastScenarioOptionsKey) {
      elScenarioSelect.innerHTML = scenarios
        .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
        .join("");
      lastScenarioOptionsKey = nextOptionsKey;
    }

    const hasOption = scenarios.some((s) => s?.id === scenarioId);
    if (hasOption && elScenarioSelect.value !== scenarioId) elScenarioSelect.value = scenarioId;

    const canChange = room?.status === "lobby" && hasAdminSecret() && !scenarioUpdateInFlight;
    elScenarioSelect.disabled = !canChange;
  }

  if (elScenarioDesc) setText(elScenarioDesc, display.description);
}

function diePips(n) {
  switch (n) {
    case 1:
      return ["c"];
    case 2:
      return ["tl", "br"];
    case 3:
      return ["tl", "c", "br"];
    case 4:
      return ["tl", "tr", "bl", "br"];
    case 5:
      return ["tl", "tr", "c", "bl", "br"];
    case 6:
      return ["tl", "ml", "bl", "tr", "mr", "br"];
    default:
      return [];
  }
}

function dieHtml(n) {
  const pips = diePips(n)
    .map((pos) => `<span class="pip ${pos}"></span>`)
    .join("");
  return `<div class="die" aria-label="Die ${escapeHtml(n)}">${pips}</div>`;
}

function renderDice(lastRoll) {
  if (!lastRoll) {
    return `<div class="dicePanel">
      <div class="diceGroup">
        <div class="die empty"></div>
        <div class="die empty"></div>
      </div>
      <div class="diceTotalWrap">
        <div class="diceLabel">Total</div>
        <div class="diceTotal">—</div>
      </div>
    </div>`;
  }
  const total = lastRoll.sum ?? (lastRoll.d1 ?? 0) + (lastRoll.d2 ?? 0);
  return `<div class="dicePanel">
    <div class="diceGroup">
      ${dieHtml(lastRoll.d1)}
      ${dieHtml(lastRoll.d2)}
    </div>
    <div class="diceTotalWrap">
      <div class="diceLabel">Total</div>
      <div class="diceTotal">${escapeHtml(total)}</div>
    </div>
  </div>`;
}

function flashClass(el, cls, durationMs = 650) {
  if (!el) return;
  const prev = flashTimers.get(el);
  if (prev) clearTimeout(prev);
  el.classList.remove(cls);
  // Force reflow so repeated flashes still animate.
  void el.offsetHeight;
  el.classList.add(cls);
  const t = setTimeout(() => el.classList.remove(cls), Math.max(0, Math.floor(durationMs)));
  flashTimers.set(el, t);
}

async function runBeat(beat) {
  const reducedMotion = !!getSettings()?.reducedMotion;
  const pace = beat?.gameMode === "quick" ? 0.8 : 1;
  const d = (ms) => {
    const v = Number(ms);
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.floor(v * pace));
  };
  const wait = (ms) => sleep(reducedMotion ? Math.min(140, d(ms)) : d(ms));

  const type = beat?.type || "beat";
  // -------------------------------------------------------------------------
  // Turn Nudge - gentle reminder for slow players
  // -------------------------------------------------------------------------
  if (type === "turn_nudge") {
    const room = lastRoomState;
    const game = room?.status === "in_game" ? room.game || null : null;
    if (!room || !game) return wait(0);
    if (room.gameMode !== "quick") return wait(0);
    if (game.phase !== "turn") return wait(0);
    if (game.turnNumber !== beat?.turnNumber) return wait(0);
    if (game.currentPlayerId !== beat?.playerId) return wait(0);
    if (game.subphase !== "needs_roll" && game.subphase !== "main") return wait(0);

    const hostCopy = hostCopyForMoment(beat, { audience: "tv" });
    flashClass(elPhasePill, "cardFlash", d(520));
    await show.toast({ title: hostCopy.title, subtitle: hostCopy.subtitle, tone: hostCopy.tone, durationMs: d(1600) });

    if (beat?.expected === "ROLL_DICE") {
      show.spotlightElement(elDiceBox, { tone: "warn", pad: 14, durationMs: d(900), pulse: true, shade: 0.36 });
    } else {
      const rowEl = elPlayers?.querySelector?.(`[data-player-id="${beat?.playerId}"]`) || null;
      show.spotlightElement(rowEl, { tone: "warn", pad: 10, durationMs: d(900), pulse: false, shade: 0.32 });
    }

    return wait(420);
  }

  // -------------------------------------------------------------------------
  // Turn Start - announce whose turn it is
  // -------------------------------------------------------------------------
  if (type === "turn_start") {
    flashClass(elPhasePill, "cardFlash", d(650));
    playSfx("turn");
    // === CINEMATIC CAMERA: Focus on player's area ===
    const structures = lastRoomState?.game?.structures || null;
    focusPlayerArea(elBoard, beat?.playerId, structures, { duration: d(1000) });
    const hostCopy = hostCopyForMoment(beat, { audience: "tv" });
    await show.showMoment({
      title: hostCopy.title,
      subtitle: hostCopy.subtitle,
      tone: hostCopy.tone,
      durationMs: d(1150)
    });
    const rowEl = elPlayers?.querySelector?.(`[data-player-id="${beat?.playerId}"]`) || null;
    show.spotlightElement(rowEl, { tone: "info", pad: 10, durationMs: d(820), pulse: false, shade: 0.32 });
    return wait(640);
  }

  // -------------------------------------------------------------------------
  // Dice Roll - show the result with appropriate fanfare + 3D dice animation
  // -------------------------------------------------------------------------
  if (type === "dice_roll") {
    flashClass(elDiceBox, "diceRolling", d(650));
    playSfx("dice");
    const sum = beat?.sum;
    const diceD1 = beat?.d1;
    const diceD2 = beat?.d2;

    // Trigger 3D dice animation if available and not already animating
    if (dice3dPanel && !dice3dPanel.isAnimating && diceD1 && diceD2) {
      dice3dPanel.setReducedMotion(reducedMotion);
      dice3dPanel.animateRoll(diceD1, diceD2, reducedMotion ? 100 : d(400));
    }

    const hostCopy = hostCopyForMoment(beat, { audience: "tv" });
    await show.showMoment({
      title: hostCopy.title,
      subtitle: hostCopy.subtitle,
      tone: hostCopy.tone,
      durationMs: sum === 7 ? d(1200) : d(900)
    });
    return wait(660);
  }

  // -------------------------------------------------------------------------
  // Robber Step - clear multi-step flow: discard -> move -> steal
  // -------------------------------------------------------------------------
  if (type === "robber_step") {
    flashClass(elPhasePill, "cardFlash", d(650));
    playSfx("robber", { gain: 0.75 });
    const sub = String(beat?.subphase || "");

    // Step 1: Discard Phase
    if (sub === "robber_discard") {
      const pending = Array.isArray(beat?.pendingDiscards) ? beat.pendingDiscards : [];
      const who = pending.length ? pending.map((p) => `${p.name} (${p.count})`).join(", ") : "";
      await show.showMoment({
        title: "Discard Phase",
        subtitle: who ? `Waiting: ${who}` : "Players with 8+ cards must discard half",
        tone: "warn",
        durationMs: d(1500)
      });
      show.spotlightElement(elPlayers, { tone: "warn", pad: 12, durationMs: d(850), pulse: false, shade: 0.34 });
      return wait(720);
    }

    // Step 2: Move the Robber
    if (sub === "robber_move") {
      await show.showMoment({
        title: "Move the Robber",
        subtitle: "Pick a new hex",
        tone: "warn",
        durationMs: d(1300)
      });
      const boardRoot = elBoard?.querySelector?.(".board") || elBoard;
      show.spotlightElement(boardRoot, { tone: "warn", pad: 14, durationMs: d(820), pulse: false, shade: 0.34 });
      return wait(650);
    }

    // Step 3: Pick a Victim to Steal From
    if (sub === "robber_steal") {
      await show.showMoment({
        title: "Pick a Victim",
        subtitle: "Steal one random card",
        tone: "warn",
        durationMs: d(1300)
      });
      return wait(650);
    }

    return wait(520);
  }

  // -------------------------------------------------------------------------
  // Robber Moved - confirm placement + particle FX
  // -------------------------------------------------------------------------
  if (type === "robber_moved") {
    flashClass(elBoard, "boardFlash", d(650));
    playSfx("ui_tick", { gain: 0.7 });
    const hexId = beat?.hexId || null;
    // === CINEMATIC CAMERA: Focus on robber tile ===
    if (hexId) focusHex(elBoard, hexId, { duration: d(1000) });
    const hexEl = hexId ? elBoard?.querySelector?.(`[data-hex-id="${hexId}"]`) : null;
    if (!hexEl && hexId) await applyBoardMoment(elBoard, { kind: "robber_moved", data: { hexId } });
    show.spotlightElement(hexEl, { tone: "warn", pad: 18, durationMs: d(900), pulse: true, shade: 0.42 });

    // === PARTICLE FX: Show robber effect ===
    if (boardFxHelper && !reducedMotion && hexEl) {
      const rect = hexEl.getBoundingClientRect();
      const boardRect = elBoard.getBoundingClientRect();
      const position = {
        x: rect.left + rect.width / 2 - boardRect.left,
        y: rect.top + rect.height / 2 - boardRect.top
      };
      boardFxHelper.showRobberEffect(position);
    }

    const hostCopy = hostCopyForMoment(beat, { audience: "tv" });
    show.toast({ title: hostCopy.title, subtitle: hostCopy.subtitle, tone: hostCopy.tone, durationMs: d(1400) });
    return wait(700);
  }

  // -------------------------------------------------------------------------
  // Robber Discarded - player submitted their discard
  // -------------------------------------------------------------------------
  if (type === "robber_discarded") {
    playSfx("ui_tick", { gain: 0.7 });
    const hostCopy = hostCopyForMoment(beat, { audience: "tv" });
    await show.toast({ title: hostCopy.title, subtitle: hostCopy.subtitle, tone: hostCopy.tone, durationMs: d(1600) });
    return wait(360);
  }

  // -------------------------------------------------------------------------
  // Robber Stole - theft complete (or failed if no cards)
  // -------------------------------------------------------------------------
  if (type === "robber_stole") {
    const didSteal = beat?.didSteal !== false;
    if (didSteal) playSfx("ui_confirm", { gain: 0.8 });
    else playSfx("ui_bonk", { gain: 0.7 });
    const hostCopy = hostCopyForMoment(beat, { audience: "tv" });
    await show.showMoment({
      title: hostCopy.title,
      subtitle: hostCopy.subtitle,
      tone: hostCopy.tone,
      durationMs: didSteal ? d(1400) : d(1300)
    });
    const rowEl = elPlayers?.querySelector?.(`[data-player-id="${beat?.fromPlayerId}"]`) || null;
    show.spotlightElement(rowEl, { tone: "warn", pad: 10, durationMs: d(820), pulse: false, shade: 0.32 });
    return wait(700);
  }

  // -------------------------------------------------------------------------
  // Build - road, settlement, or city placed + particle FX
  // -------------------------------------------------------------------------
  if (type === "build") {
    flashClass(elBoard, "boardFlash", d(650));
    playSfx("build");
    const kind = beat?.kind || "build";
    // === CINEMATIC CAMERA: Focus on build location ===
    if (kind === "road" && beat?.edgeId) {
      focusEdge(elBoard, beat.edgeId, { duration: d(800) });
    } else if (beat?.vertexId) {
      focusVertex(elBoard, beat.vertexId, { duration: d(800) });
    }
    const hostCopy = hostCopyForMoment({ ...beat, kind: `build_${kind}` }, { audience: "tv" });
    await show.toast({ title: hostCopy.title, subtitle: hostCopy.subtitle, tone: hostCopy.tone, durationMs: d(1800) });
    const target =
      kind === "road" && beat?.edgeId
        ? elBoard?.querySelector?.(`[data-edge-id="${beat.edgeId}"]`)
        : beat?.vertexId
          ? elBoard?.querySelector?.(`[data-vertex-id="${beat.vertexId}"]`)
          : null;
    if (!target) {
      const momentKind =
        kind === "road"
          ? "build_road"
          : kind === "settlement"
            ? "build_settlement"
            : kind === "city"
              ? "build_city"
              : "";
      const data =
        momentKind === "build_road" ? { edgeId: beat?.edgeId || null } : { vertexId: beat?.vertexId || null };
      if (momentKind) await applyBoardMoment(elBoard, { kind: momentKind, data });
    }
    show.spotlightElement(target, { tone: "good", pad: 18, durationMs: d(850), pulse: true, shade: 0.34 });

    // === PARTICLE FX: Show build effect for settlement/city ===
    if (boardFxHelper && !reducedMotion && (kind === "settlement" || kind === "city") && target) {
      const rect = target.getBoundingClientRect();
      const boardRect = elBoard.getBoundingClientRect();
      const position = {
        x: rect.left + rect.width / 2 - boardRect.left,
        y: rect.top + rect.height / 2 - boardRect.top
      };
      boardFxHelper.showBuildEffect(position, { tone: "good", particleCount: kind === "city" ? 14 : 10 });
    }

    return wait(620);
  }

  // -------------------------------------------------------------------------
  // Trade Open - someone proposed a trade
  // -------------------------------------------------------------------------
  if (type === "trade_open") {
    flashClass(elOffersCard, "cardFlash", d(700));
    playSfx("trade", { gain: 0.85 });
    const count = clampNonNegativeInt(beat?.count ?? 0);
    const more = count > 1 ? ` (+${count - 1} more)` : "";
    const hostCopy = hostCopyForMoment(beat, { audience: "tv" });
    const offer = beat?.offer || null;
    const giveBadges = renderResourceBadges(offer?.give, { prefix: "-" });
    const wantBadges = renderResourceBadges(offer?.want, { prefix: "+" });
    const badges = `${giveBadges ? `<span class="badge">Gives</span>${giveBadges}` : ""}${wantBadges ? `<span class="badge">Wants</span>${wantBadges}` : ""}`;
    await show.showMoment({
      title: `${hostCopy.title}${more}`,
      subtitle: hostCopy.subtitle,
      badgesHtml: badges,
      tone: hostCopy.tone,
      durationMs: d(1600)
    });
    show.spotlightElement(elOffersCard, { tone: "info", pad: 12, durationMs: d(900), pulse: true, shade: 0.34 });
    return wait(720);
  }

  // -------------------------------------------------------------------------
  // Trade Accepted - deal complete
  // -------------------------------------------------------------------------
  if (type === "trade_accepted") {
    flashClass(elOffersCard, "cardFlash", d(700));
    playSfx("trade");
    const hostCopy = hostCopyForMoment(beat, { audience: "tv" });
    await show.showMoment({
      title: hostCopy.title,
      subtitle: hostCopy.subtitle,
      tone: hostCopy.tone,
      durationMs: d(1500)
    });
    return wait(720);
  }

  // -------------------------------------------------------------------------
  // Trade Cancelled - offer withdrawn
  // -------------------------------------------------------------------------
  if (type === "trade_cancelled") {
    flashClass(elOffersCard, "cardFlash", d(700));
    playSfx("ui_bonk", { gain: 0.65 });
    const hostCopy = hostCopyForMoment(beat, { audience: "tv" });
    await show.toast({ title: hostCopy.title, subtitle: hostCopy.subtitle, tone: hostCopy.tone, durationMs: d(1700) });
    return wait(520);
  }

  // -------------------------------------------------------------------------
  // Trade Rejected - offer declined
  // -------------------------------------------------------------------------
  if (type === "trade_rejected") {
    flashClass(elOffersCard, "cardFlash", d(700));
    playSfx("ui_bonk", { gain: 0.65 });
    const hostCopy = hostCopyForMoment(beat, { audience: "tv" });
    await show.toast({ title: hostCopy.title, subtitle: hostCopy.subtitle, tone: hostCopy.tone, durationMs: d(1700) });
    return wait(520);
  }

  // -------------------------------------------------------------------------
  // Game Over - victory celebration
  // -------------------------------------------------------------------------
  if (type === "game_over") {
    flashClass(elPhasePill, "cardFlash", d(900));
    playSfx("win");
    // === CINEMATIC CAMERA: Reset to full board view for victory ===
    cinematicReset(elBoard, { duration: d(1200) });
    show.confetti({ count: 70, durationMs: d(1900) });
    const hostCopy = hostCopyForMoment(beat, { audience: "tv" });
    await show.showMoment({
      title: hostCopy.title,
      subtitle: hostCopy.subtitle,
      tone: hostCopy.tone,
      durationMs: d(2000)
    });
    const rowEl = elPlayers?.querySelector?.(`[data-player-id="${beat?.winnerPlayerId}"]`) || null;
    show.spotlightElement(rowEl, { tone: "good", pad: 10, durationMs: d(1400), pulse: false, shade: 0.32 });
    return wait(1100);
  }

  // -------------------------------------------------------------------------
  // Segment Transition - show when game moves to new phase
  // -------------------------------------------------------------------------
  if (type === "segment_transition") {
    const hostCopy = beat?.copy || { title: "Phase Change", subtitle: "", tone: "info" };
    await show.showMoment({
      title: hostCopy.title,
      subtitle: hostCopy.subtitle,
      tone: hostCopy.tone,
      durationMs: d(1400)
    });
    return wait(600);
  }

  // -------------------------------------------------------------------------
  // Event Drawn - party mode event started
  // -------------------------------------------------------------------------
  if (type === "event_drawn") {
    flashClass(elPhasePill, "cardFlash", d(900));
    playSfx("trade", { gain: 0.9 });
    const eventName = beat?.eventName || "Event";
    const eventShortText = beat?.eventShortText || "";
    await show.showMoment({
      title: eventName,
      subtitle: eventShortText,
      badgesHtml: `<span class="badge" data-tone="good">Event</span>`,
      tone: "good",
      durationMs: d(2200)
    });
    return wait(1000);
  }

  // -------------------------------------------------------------------------
  // Event Ended - party mode event expired
  // -------------------------------------------------------------------------
  if (type === "event_ended") {
    const eventName = beat?.eventName || "Event";
    await show.toast({
      title: `${eventName} ended`,
      subtitle: "",
      tone: "info",
      durationMs: d(1200)
    });
    return wait(400);
  }
}

function formatMmSs(ms) {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function serverNowMs() {
  return Date.now() - (Number.isFinite(serverSkewMs) ? serverSkewMs : 0);
}

function computeTurnElapsedMs(room) {
  const timer = room?.timer && typeof room.timer === "object" ? room.timer : null;
  if (!timer) return null;
  const startedAt = Number(timer.turnStartedAt);
  if (!Number.isFinite(startedAt)) return null;

  const pausedTotalMs = clampNonNegativeInt(timer.pausedTotalMs ?? 0);
  const now = serverNowMs();
  const endAt = timer.paused ? (Number.isFinite(timer.pausedAt) ? Number(timer.pausedAt) : now) : now;
  return Math.max(0, Math.floor(endAt - startedAt - pausedTotalMs));
}

function stopTurnTimer() {
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  turnTimerInterval = null;
  lastTurnPlayerId = null;
  turnStartMs = null;
  turnNudgeKey = null;
  turnNudgeFired.clear();
  if (elTurnTimer) elTurnTimer.style.display = "none";
}

function ensureTurnTimerRunning() {
  if (!elTurnTimer) return;
  if (turnTimerInterval) return;
  turnTimerInterval = setInterval(() => {
    const room = lastRoomState;
    const game = room?.status === "in_game" ? room.game || null : null;
    if (!room || !game) return;
    if (!game.currentPlayerId) return;
    const elapsed = computeTurnElapsedMs(room);
    if (elapsed == null) return;
    const paused = !!room?.timer?.paused;
    elTurnTimer.textContent = paused ? `⏸ ${formatMmSs(elapsed)}` : formatMmSs(elapsed);
    if (!paused) maybeQueueTurnNudge(elapsed);
  }, 250);
}

function maybeQueueTurnNudge(elapsedMs) {
  const room = lastRoomState;
  const game = room?.status === "in_game" ? room.game || null : null;
  if (!room || !game) return;
  if (room.gameMode !== "quick") return;
  if (game.phase !== "turn") return;
  if (game.subphase !== "needs_roll" && game.subphase !== "main") return;
  if (!game.currentPlayerId) return;
  if (room.timer?.paused) return;

  const key = `${game.turnNumber}:${game.currentPlayerId}`;
  if (key !== turnNudgeKey) {
    turnNudgeKey = key;
    turnNudgeFired.clear();
  }

  for (const thresholdMs of QUICK_TURN_NUDGE_THRESHOLDS_MS) {
    if (elapsedMs < thresholdMs) break;
    if (turnNudgeFired.has(thresholdMs)) continue;
    turnNudgeFired.add(thresholdMs);

    const current = (room.players || []).find((p) => p.playerId === game.currentPlayerId) || null;
    showQueue.enqueue({
      id: `turn_nudge:${stableRoomPart(room.roomCode)}:${stableRoomPart(game.turnNumber)}:${stableRoomPart(game.currentPlayerId)}:${stableRoomPart(thresholdMs)}`,
      type: "turn_nudge",
      gameMode: "quick",
      thresholdMs,
      turnNumber: game.turnNumber,
      playerId: game.currentPlayerId,
      playerName: current?.name || "Player",
      subphase: game.subphase,
      expected: game.hints?.expected || null
    });
  }
}

function phaseActionLabel(game) {
  const expected = game?.hints?.expected || null;
  if (expected === "PLACE_SETTLEMENT") return "Place settlement";
  if (expected === "PLACE_ROAD") return "Place road";
  if (expected === "ROLL_DICE") return "Roll dice";
  if (expected === "DISCARD_CARDS") return "Discard";
  if (expected === "MOVE_ROBBER") return "Move robber";
  if (expected === "STEAL_CARD") return "Steal";
  if (game?.phase === "turn" && game?.subphase === "main") return "Build / Trade / End";
  return game?.hints?.prompt || "…";
}

function clampNonNegativeInt(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function renderResourceBadges(counts, { prefix = "+" } = {}) {
  if (!counts || typeof counts !== "object") return "";
  const parts = [];
  for (const r of RESOURCE_TYPES) {
    const n = clampNonNegativeInt(counts[r] ?? 0);
    if (n <= 0) continue;
    parts.push(
      `<span class="badge res-${escapeHtml(r)}">${escapeHtml(prefix)}${escapeHtml(n)} ${escapeHtml(r)}</span>`
    );
  }
  return parts.join("");
}

function renderOpenOffers(room, { newOfferIds = new Set() } = {}) {
  if (!elOffersCard || !elOffers || !elOffersEmpty) return;
  if (!room || room.status !== "in_game" || !room.game) {
    elOffersCard.style.display = "none";
    return;
  }

  const byId = new Map((room.players || []).map((p) => [p.playerId, p]));
  const offers = (room.game.tradeOffers || [])
    .filter((o) => o && o.status === "open")
    .slice()
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  elOffersCard.style.display = "";
  if (!offers.length) {
    elOffersEmpty.style.display = "";
    elOffers.style.display = "none";
    elOffers.innerHTML = "";
    return;
  }

  elOffersEmpty.style.display = "none";
  elOffers.style.display = "";
  elOffers.innerHTML = offers
    .map((o) => {
      const from = byId.get(o.fromPlayerId) || { name: "Player", color: "rgba(255,255,255,0.28)" };
      const toName = o.to === "all" ? "Everyone" : byId.get(o.to)?.name || "Player";
      const giveBadges = renderResourceBadges(o.give, { prefix: "-" });
      const wantBadges = renderResourceBadges(o.want, { prefix: "+" });
      const badges = `<div class="logBadges">${giveBadges ? `<span class="badge">Gives</span>${giveBadges}` : ""}${wantBadges ? `<span class="badge">Wants</span>${wantBadges}` : ""}</div>`;
      const cls = ["tradeOffer"];
      if (newOfferIds.has(o.id)) cls.push("new");
      return `<div class="${cls.join(" ")}" data-offer-id="${escapeHtml(o.id)}">
        <div class="tradeOfferTop">
          <div class="name" style="display:flex; gap:10px; align-items:center;">
            <span class="dot" style="background:${escapeHtml(from.color)};"></span>
            <div>${escapeHtml(from.name)} → ${escapeHtml(toName)}</div>
          </div>
          <div class="tradeOfferBtns"><span class="tag">Open</span></div>
        </div>
        ${badges}
      </div>`;
    })
    .join("");

  for (const id of newOfferIds) {
    if (!id || offerNewTimers.has(id)) continue;
    const t = setTimeout(() => {
      offerNewTimers.delete(id);
      const el = elOffers?.querySelector?.(`[data-offer-id="${id}"]`);
      el?.classList.remove("new");
    }, 4500);
    offerNewTimers.set(id, t);
  }
}

function computePhaseText(room) {
  if (!room || room.status !== "in_game" || !room.game) return "Lobby";
  const game = room.game;
  const byId = new Map((room.players || []).map((p) => [p.playerId, p]));

  if (game.phase === "game_over") {
    const winner = byId.get(game.winnerPlayerId)?.name || "Winner";
    return `Game Over · ${winner} wins`;
  }

  const who = byId.get(game.currentPlayerId)?.name || "Player";
  const action = phaseActionLabel(game);
  if (game.phase === "setup_round_1" || game.phase === "setup_round_2") return `Setup · ${who} · ${action}`;
  if (game.phase === "turn") return `Turn ${game.turnNumber} · ${who} · ${action}`;
  return `${who} · ${action}`;
}

function structureCounts(game) {
  const roads = Object.keys(game?.structures?.roads || {}).length;
  let settlements = 0;
  let cities = 0;
  for (const s of Object.values(game?.structures?.settlements || {})) {
    if (!s) continue;
    if (s.kind === "city") cities += 1;
    else settlements += 1;
  }
  return { roads, settlements, cities };
}

function computePlacedStructures(prevStructures, nextStructures) {
  const placedEdgeIds = [];
  const placedVertexIds = [];
  if (!prevStructures || !nextStructures) return { placedEdgeIds, placedVertexIds };

  const prevRoads = prevStructures.roads || {};
  const nextRoads = nextStructures.roads || {};
  for (const edgeId of Object.keys(nextRoads)) {
    if (!prevRoads[edgeId]) placedEdgeIds.push(edgeId);
  }

  const prevSettlements = prevStructures.settlements || {};
  const nextSettlements = nextStructures.settlements || {};
  for (const [vertexId, s] of Object.entries(nextSettlements)) {
    const prev = prevSettlements[vertexId] || null;
    if (!prev) {
      placedVertexIds.push(vertexId);
      continue;
    }
    if (prev.kind !== s?.kind) placedVertexIds.push(vertexId);
  }

  return { placedEdgeIds, placedVertexIds };
}

function computeShowBeats(prevRoom, room) {
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
        .map(([playerId, count]) => ({
          ...playerMeta(playerId),
          count: clampNonNegativeInt(count),
          submitted: !!submitted[playerId]
        }));
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
      if (edgeId)
        beats.push({
          id: m.id,
          type: "build",
          kind: "road",
          edgeId,
          playerId: p.playerId,
          playerName: p.name,
          playerColor: p.color
        });
      continue;
    }
    if (kind === "build_settlement") {
      const vertexId = typeof data.vertexId === "string" ? data.vertexId : null;
      const p = playerMeta(typeof data.playerId === "string" ? data.playerId : null);
      if (vertexId)
        beats.push({
          id: m.id,
          type: "build",
          kind: "settlement",
          vertexId,
          playerId: p.playerId,
          playerName: p.name,
          playerColor: p.color
        });
      continue;
    }
    if (kind === "build_city") {
      const vertexId = typeof data.vertexId === "string" ? data.vertexId : null;
      const p = playerMeta(typeof data.playerId === "string" ? data.playerId : null);
      if (vertexId)
        beats.push({
          id: m.id,
          type: "build",
          kind: "city",
          vertexId,
          playerId: p.playerId,
          playerName: p.name,
          playerColor: p.color
        });
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
      beats.push({
        id: m.id,
        type: "trade_cancelled",
        count: 1,
        fromPlayerId: from.playerId,
        fromName: from.name,
        fromColor: from.color
      });
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
      beats.push({
        id: m.id,
        type: "robber_discarded",
        playerId: actor.playerId,
        playerName: actor.name,
        count: clampNonNegativeInt(data.count ?? 0)
      });
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

// =============================================================================
// Attract Mode - Jackbox-like idle screen with 3D board preview
// =============================================================================

/**
 * Sample board data for attract mode preview.
 * This creates a standard Catan board with all resource types.
 */
function createAttractSampleBoard() {
  const resources = [
    "ore",
    "sheep",
    "wheat",
    "brick",
    "sheep",
    "wheat",
    "ore",
    "wood",
    "brick",
    "desert",
    "wood",
    "wheat",
    "ore",
    "wood",
    "sheep",
    "brick",
    "sheep",
    "wheat",
    "wood"
  ];
  const tokens = [10, 2, 9, 12, 6, 4, 10, 9, 11, 0, 3, 8, 8, 3, 4, 5, 5, 6, 11];

  const SQRT3 = Math.sqrt(3);
  const HEX_SIZE = 100;
  const coords = [];
  for (let x = -2; x <= 2; x++) {
    for (let y = -2; y <= 2; y++) {
      const z = -x - y;
      if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= 2) {
        coords.push({ q: x, r: z });
      }
    }
  }
  coords.sort((a, b) => a.r - b.r || a.q - b.q);

  function axialToPixel(q, r) {
    return { x: HEX_SIZE * SQRT3 * (q + r / 2), y: HEX_SIZE * 1.5 * r };
  }

  function hexCornerOffsets() {
    const a = (SQRT3 / 2) * HEX_SIZE;
    const b = 0.5 * HEX_SIZE;
    return [
      { x: 0, y: -HEX_SIZE },
      { x: a, y: -b },
      { x: a, y: b },
      { x: 0, y: HEX_SIZE },
      { x: -a, y: b },
      { x: -a, y: -b }
    ];
  }

  const verticesByKey = new Map();
  const vertices = [];
  const edges = [];
  const edgesByKey = new Map();
  const cornerOffsets = hexCornerOffsets();

  function roundKey(n) {
    return Math.round(n * 1000);
  }
  function pointKey(x, y) {
    return `${roundKey(x)}:${roundKey(y)}`;
  }

  function getOrCreateVertex(pt) {
    const key = pointKey(pt.x, pt.y);
    const existing = verticesByKey.get(key);
    if (existing) return existing;
    const id = `V${vertices.length}`;
    const v = { id, x: pt.x, y: pt.y, adjacentHexIds: [], neighborVertexIds: [], edgeIds: [] };
    verticesByKey.set(key, v);
    vertices.push(v);
    return v;
  }

  function addEdge(vA, vB) {
    const a = vA.id < vB.id ? vA : vB;
    const b = vA.id < vB.id ? vB : vA;
    const key = `${a.id}|${b.id}`;
    const existing = edgesByKey.get(key);
    if (existing) return existing;
    const id = `E${edges.length}`;
    const e = { id, vA: a.id, vB: b.id };
    edgesByKey.set(key, e);
    edges.push(e);
    return e;
  }

  const hexes = coords.map((c, idx) => {
    const center = axialToPixel(c.q, c.r);
    const corners = cornerOffsets.map((off) => getOrCreateVertex({ x: center.x + off.x, y: center.y + off.y }));
    const hexId = `H${idx}`;
    for (const v of corners) v.adjacentHexIds.push(hexId);
    for (let i = 0; i < corners.length; i++) {
      addEdge(corners[i], corners[(i + 1) % corners.length]);
    }
    return {
      id: hexId,
      q: c.q,
      r: c.r,
      center,
      resource: resources[idx] || "desert",
      token: tokens[idx] || 0,
      cornerVertexIds: corners.map((v) => v.id)
    };
  });

  const vertexById = new Map(vertices.map((v) => [v.id, v]));
  for (const e of edges) {
    const vA = vertexById.get(e.vA);
    const vB = vertexById.get(e.vB);
    vA.neighborVertexIds.push(vB.id);
    vB.neighborVertexIds.push(vA.id);
    vA.edgeIds.push(e.id);
    vB.edgeIds.push(e.id);
  }

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const v of vertices) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }

  const edgeByVertexPair = {};
  for (const [k, e] of edgesByKey.entries()) edgeByVertexPair[k] = e.id;

  return {
    layout: "standard-radius-2",
    hexSize: HEX_SIZE,
    hexes,
    vertices,
    edges,
    ports: [],
    edgeByVertexPair,
    bounds: { minX, minY, maxX, maxY }
  };
}

let attractSampleBoard = null;
let attractTips = [];

async function initAttractMode() {
  if (!elAttractMode) return;
  attractSampleBoard = createAttractSampleBoard();
  attractTips = getTipsForContext("lobby", { limit: 8, shuffle: true });
  elAttractCreateBtn?.addEventListener("click", async () => {
    await exitAttractMode();
    // If no room exists yet (startup), create one and connect
    if (!roomCode) {
      await ensureRoom();
      connectStream();
    } else {
      // Coming from idle attract mode with existing room
      await createNewRoom();
    }
  });
}

async function showAttractMode() {
  if (!elAttractMode || attractModeActive) return;

  // Hide lobby overlay when entering attract mode
  if (lobbyOverlayActive && elLobbyOverlay) {
    lobbyOverlayActive = false;
    elLobbyOverlay.style.display = "none";
  }

  attractModeActive = true;
  elAttractMode.style.display = "";
  elAttractMode.classList.remove("hiding");

  if (elAttractQr) {
    const baseUrl = `${location.protocol}//${location.host}/phone`;
    try {
      elAttractQr.innerHTML = qrSvg(baseUrl, { margin: 4, label: "Join Catan" });
    } catch {
      elAttractQr.innerHTML = "";
    }
  }

  attractTipIndex = 0;
  if (attractTips.length > 0 && elAttractTip) {
    elAttractTip.textContent = attractTips[0].text;
    startAttractTipCarousel();
  }

  if (elAttractBoard && attractSampleBoard) {
    try {
      renderBoard(elAttractBoard, attractSampleBoard, {
        players: [],
        structures: { roads: {}, settlements: {} },
        selectableVertexIds: [],
        selectableEdgeIds: [],
        selectableHexIds: [],
        robberHexId: "H9"
      });
    } catch (err) {
      console.warn("[catan] Failed to render attract mode board:", err);
    }
  }
}

async function exitAttractMode() {
  if (!elAttractMode || !attractModeActive) return;
  stopAttractTipCarousel();
  elAttractMode.classList.add("hiding");
  await sleep(350);
  attractModeActive = false;
  elAttractMode.style.display = "none";
  elAttractMode.classList.remove("hiding");

  // Show lobby overlay if we're in lobby mode after exiting attract
  const room = lastRoomState;
  if (room && room.status === "lobby") {
    showLobbyOverlay();
    renderLobbyOverlay(room);
  }
}

function startAttractTipCarousel() {
  stopAttractTipCarousel();
  if (!elAttractTip || attractTips.length === 0) return;
  attractTipTimer = setInterval(() => {
    if (!attractModeActive) {
      stopAttractTipCarousel();
      return;
    }
    elAttractTip.classList.add("fading");
    setTimeout(() => {
      attractTipIndex = (attractTipIndex + 1) % attractTips.length;
      elAttractTip.textContent = attractTips[attractTipIndex].text;
      elAttractTip.classList.remove("fading");
    }, 300);
  }, ATTRACT_TIP_INTERVAL_MS);
}

function stopAttractTipCarousel() {
  if (attractTipTimer) {
    clearInterval(attractTipTimer);
    attractTipTimer = null;
  }
}

function checkIdleForAttractMode() {
  // Don't trigger idle attract if we haven't connected yet (startup attract mode handles this)
  if (!hasEverConnected) return;

  const room = lastRoomState;
  const hasPlayers = Array.isArray(room?.players) && room.players.length > 0;
  const isInGame = room?.status === "in_game";

  if (hasPlayers || isInGame) {
    cancelAttractIdleTimer();
    if (attractModeActive) exitAttractMode();
    return;
  }

  if (!attractIdleTimer && !attractModeActive) {
    attractIdleTimer = setTimeout(() => {
      attractIdleTimer = null;
      const currentRoom = lastRoomState;
      const currentHasPlayers = Array.isArray(currentRoom?.players) && currentRoom.players.length > 0;
      if (!currentHasPlayers && !attractModeActive) showAttractMode();
    }, ATTRACT_IDLE_TIMEOUT_MS);
  }
}

function cancelAttractIdleTimer() {
  if (attractIdleTimer) {
    clearTimeout(attractIdleTimer);
    attractIdleTimer = null;
  }
}

initAttractMode();

// =============================================================================
// Lobby Overlay - Purpose-built lobby screen
// =============================================================================

/**
 * Create a sample board for the lobby preview based on scenario.
 * Uses the same pattern as createAttractSampleBoard but can be extended
 * for different scenarios in the future.
 */
function createLobbyPreviewBoard(scenarioId) {
  // For now, use the same board as attract mode
  // This can be extended to show different layouts per scenario
  return createAttractSampleBoard();
}

function showLobbyOverlay() {
  if (!elLobbyOverlay || lobbyOverlayActive) return;
  lobbyOverlayActive = true;
  elLobbyOverlay.style.display = "";
  elLobbyOverlay.classList.remove("hiding");

  // Initialize preview board
  if (!lobbyPreviewBoard) {
    lobbyPreviewBoard = createLobbyPreviewBoard(null);
  }
}

async function hideLobbyOverlay() {
  if (!elLobbyOverlay || !lobbyOverlayActive) return;
  elLobbyOverlay.classList.add("hiding");
  await sleep(300);
  lobbyOverlayActive = false;
  elLobbyOverlay.style.display = "none";
  elLobbyOverlay.classList.remove("hiding");
}

function renderLobbyQr(url) {
  if (!elLobbyQr || !url) return;
  if (url === lastLobbyQrUrl) return;
  lastLobbyQrUrl = url;
  try {
    elLobbyQr.innerHTML = qrSvg(url, { margin: 4, label: "Join Catan" });
  } catch {
    elLobbyQr.innerHTML = "";
  }
}

function renderLobbyPlayers(players) {
  if (!elLobbyPlayers) return;

  const list = Array.isArray(players) ? players : [];

  if (list.length === 0) {
    elLobbyPlayers.innerHTML = "";
    if (elLobbyPlayersEmpty) elLobbyPlayersEmpty.style.display = "";
    return;
  }

  if (elLobbyPlayersEmpty) elLobbyPlayersEmpty.style.display = "none";

  const html = list
    .map((p) => {
      const dotColor = p.connected ? p.color : "rgba(255,255,255,0.18)";
      const hostClass = p.isHost ? " host" : "";
      const roleText = p.isHost ? "Host" : "";
      const readyTag = p.ready ? `<span class="tag good">Ready</span>` : `<span class="tag warn">Not ready</span>`;

      return `
        <div class="lobbyPlayer${hostClass}">
          <div class="lobbyPlayerDot" style="background:${escapeHtml(dotColor)};"></div>
          <div class="lobbyPlayerInfo">
            <div class="lobbyPlayerName">${escapeHtml(p.name || "Player")}</div>
            ${roleText ? `<div class="lobbyPlayerRole">${escapeHtml(roleText)}</div>` : ""}
          </div>
          <div class="lobbyPlayerStatus">${readyTag}</div>
        </div>
      `;
    })
    .join("");

  elLobbyPlayers.innerHTML = html;
}

function renderLobbyScenarios(room) {
  if (!elLobbyScenarioSelect) return;

  const { scenarioId, scenarios } = scenarioMeta(room);
  const nextOptionsKey = scenariosKey(scenarios);

  if (nextOptionsKey !== lastLobbyScenarioOptionsKey) {
    elLobbyScenarioSelect.innerHTML = scenarios
      .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
      .join("");
    lastLobbyScenarioOptionsKey = nextOptionsKey;
  }

  const hasOption = scenarios.some((s) => s?.id === scenarioId);
  if (hasOption && elLobbyScenarioSelect.value !== scenarioId) {
    elLobbyScenarioSelect.value = scenarioId;
  }

  const canChange = room?.status === "lobby" && hasAdminSecret() && !scenarioUpdateInFlight;
  elLobbyScenarioSelect.disabled = !canChange;

  // Update description
  if (elLobbyScenarioDesc) {
    const display = scenarioDisplay(scenarios, scenarioId, { fallbackName: scenarioId || "—" });
    setText(elLobbyScenarioDesc, display.description);
  }
}

function renderLobbyThemes(room) {
  if (!elLobbyThemeSelect) return;

  const themes = Array.isArray(room?.themes) ? room.themes : [];
  const currentThemeId = typeof room?.themeId === "string" ? room.themeId : "";

  const nextOptionsKey = themes.map((t) => `${t?.id || ""}:${t?.name || ""}`).join("|");

  if (nextOptionsKey !== lastLobbyThemeOptionsKey) {
    elLobbyThemeSelect.innerHTML = themes
      .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`)
      .join("");
    lastLobbyThemeOptionsKey = nextOptionsKey;
  }

  const hasOption = themes.some((t) => t?.id === currentThemeId);
  if (hasOption && elLobbyThemeSelect.value !== currentThemeId) {
    elLobbyThemeSelect.value = currentThemeId;
  }

  const canChange = room?.status === "lobby" && hasAdminSecret() && !themeUpdateInFlight;
  elLobbyThemeSelect.disabled = !canChange;
}

function renderLobbyBoardPreview(scenarioId) {
  if (!elLobbyBoardPreview) return;

  // Create or reuse preview board
  if (!lobbyPreviewBoard) {
    lobbyPreviewBoard = createLobbyPreviewBoard(scenarioId);
  }

  try {
    renderBoard(elLobbyBoardPreview, lobbyPreviewBoard, {
      players: [],
      structures: { roads: {}, settlements: {} },
      selectableVertexIds: [],
      selectableEdgeIds: [],
      selectableHexIds: [],
      robberHexId: "H9"
    });
  } catch (err) {
    console.warn("[catan] Failed to render lobby board preview:", err);
  }
}

function updateLobbyStartStatus(room) {
  if (!elLobbyStartStatus) return;

  const players = Array.isArray(room?.players) ? room.players : [];
  const readyCount = players.filter((p) => p.ready).length;
  const totalCount = players.length;
  const hasHost = !!room?.hostPlayerId;
  const minPlayers = 3;

  let statusText = "";
  let isReady = false;

  if (totalCount === 0) {
    statusText = "Waiting for players to join...";
  } else if (totalCount < minPlayers) {
    statusText = `Need ${minPlayers - totalCount} more player${minPlayers - totalCount === 1 ? "" : "s"} to start`;
  } else if (!hasHost) {
    statusText = "Waiting for a host...";
  } else if (readyCount < totalCount) {
    statusText = `Waiting for host to start... (${readyCount}/${totalCount} players ready)`;
  } else {
    statusText = `All ${totalCount} players ready! Waiting for host to start...`;
    isReady = true;
  }

  elLobbyStartStatus.textContent = statusText;
  elLobbyStartStatus.classList.toggle("ready", isReady);
}

function renderLobbyOverlay(room) {
  if (!elLobbyOverlay || !room) return;

  // Update room code
  if (elLobbyRoomCode) setText(elLobbyRoomCode, room.roomCode || "-----");
  if (elLobbyJoinRoomCode) setText(elLobbyJoinRoomCode, room.roomCode || "-----");

  // Update join URL
  const joinUrl = roomUrlForPhones();
  if (elLobbyJoinUrl) {
    // Extract just the host/path without protocol
    try {
      const url = new URL(joinUrl);
      setText(elLobbyJoinUrl, `${url.host}${url.pathname}`);
    } catch {
      setText(elLobbyJoinUrl, joinUrl);
    }
  }

  // Render QR code
  renderLobbyQr(joinUrl);

  // Render players
  renderLobbyPlayers(room.players);

  // Render scenario selection
  renderLobbyScenarios(room);

  // Render theme selection
  renderLobbyThemes(room);

  // Render board preview
  const { scenarioId } = scenarioMeta(room);
  renderLobbyBoardPreview(scenarioId);

  // Update start status
  updateLobbyStartStatus(room);
}

// Event listeners for lobby overlay scenario/theme changes
elLobbyScenarioSelect?.addEventListener("change", () => {
  const room = lastRoomState;
  if (!room) return;
  const current = typeof room?.settings?.scenarioId === "string" ? room.settings.scenarioId : "";
  const next = String(elLobbyScenarioSelect.value || "");
  if (next && next !== current) requestScenarioChange(next);
});

elLobbyThemeSelect?.addEventListener("change", async () => {
  const room = lastRoomState;
  if (!room || room.status !== "lobby") return;
  const currentThemeId = typeof room?.themeId === "string" ? room.themeId : "";
  const nextThemeId = String(elLobbyThemeSelect.value || "");
  if (nextThemeId && nextThemeId !== currentThemeId) {
    await requestThemeChange(nextThemeId);
  }
});

async function ensureRoom() {
  const url = new URL(location.href);
  const fromQuery = url.searchParams.get("room");
  if (fromQuery) {
    const candidate = String(fromQuery).toUpperCase();
    try {
      await api(`/api/rooms/${encodeURIComponent(candidate)}`);
      roomCode = candidate;
      adminSecret = loadAdminSecret(roomCode);
      lastRevisionSeen = null;
      return;
    } catch {
      // Room doesn't exist anymore (server restart). Create a fresh one.
    }
  }
  const created = await api("/api/rooms", { method: "POST" });
  roomCode = created.roomCode;
  adminSecret = typeof created?.adminSecret === "string" ? created.adminSecret : null;
  storeAdminSecret(roomCode, adminSecret);
  lastRevisionSeen = null;
  history.replaceState(null, "", `/tv?room=${encodeURIComponent(roomCode)}`);
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
  setTvStatus("Connecting…");
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
    lastRoomState = payload.room;
    if (debugPerfEnabled && markPayloadSize && measureUtf8Bytes) markPayloadSize("tv.state", measureUtf8Bytes(raw));
    if (prev && payload.room?.roomCode !== prev.roomCode) {
      lastRenderedRoomState = null;
      lastPlayersRenderKey = null;
      lastLogRenderKey = null;
      lastBoardRenderKey = null;
      showQueue.clear();
      segmentTracker.reset();
    }
    setTvStatus("LIVE");
    setConnectionOverlay(false);
    hasEverConnected = true;
    renderScheduler.schedule();

    // Check if we should show or exit attract mode based on room state
    checkIdleForAttractMode();
  });

  es.addEventListener("emote", (ev) => {
    let payload = null;
    try {
      payload = JSON.parse(ev.data || "null");
    } catch {
      payload = null;
    }
    const emote = String(payload?.emote || "");
    const name = String(payload?.name || "Player");
    const color = String(payload?.color || "rgba(255,255,255,0.30)");

    const label = emote === "nice" ? "Nice!" : emote === "ouch" ? "Ouch" : emote === "gg" ? "GG" : "";
    if (!label) return;
    const tone = emote === "ouch" ? "warn" : "good";

    show.toast({
      title: label,
      badgesHtml: `<span class="badge"><span class="miniDot" style="--c:${escapeHtml(color)}"></span>${escapeHtml(name)}</span>`,
      tone,
      durationMs: 1600
    });
  });

  es.addEventListener("ping", () => {});

  es.onerror = () => {
    setTvStatus("Reconnecting…");
    setConnectionOverlay(true, {
      title: "Reconnecting…",
      hint: "Phones can refresh to rejoin • If this room disappears, a new code will appear"
    });
    scheduleRoomRecovery();
  };
}

let recoveryTimer = null;
function scheduleRoomRecovery() {
  if (recoveryTimer) return;
  const code = roomCode;
  recoveryTimer = setTimeout(async () => {
    recoveryTimer = null;
    try {
      await api(`/api/rooms/${encodeURIComponent(code)}`);
    } catch (e) {
      if (errorCode(e) === "HTTP_404" && code === roomCode) {
        try {
          const created = await api("/api/rooms", { method: "POST" });
          roomCode = created.roomCode;
          adminSecret = typeof created?.adminSecret === "string" ? created.adminSecret : null;
          storeAdminSecret(roomCode, adminSecret);
          lastRevisionSeen = null;
          history.replaceState(null, "", `/tv?room=${encodeURIComponent(roomCode)}`);
          connectStream();
        } catch {
          // Ignore; we'll retry on the next error tick.
        }
      }
    }
  }, 1200);
}

async function applyThemeFromRoom(room) {
  const raw = typeof room?.themeId === "string" ? room.themeId : "";
  const themeId = raw.trim() || null;
  if (themeId === lastThemeId) return;
  lastThemeId = themeId;

  if (themeId) {
    try {
      await loadTheme(themeId);
    } catch (err) {
      console.warn("[catan] Failed to load theme:", err);
      // Fallback: just set the data-theme attribute
      const root = document?.documentElement;
      if (root) root.setAttribute("data-theme", themeId);
    }
  } else {
    const root = document?.documentElement;
    if (root) root.removeAttribute("data-theme");
  }
}

function render(room, prevRoom) {
  applyThemeFromRoom(room);
  setText(elRoomCode, room.roomCode);
  const joinUrl = roomUrlForPhones();
  setText(elJoinUrl, joinUrl);
  const maxPlayers = Number(room.maxPlayers);
  const limit = Number.isFinite(maxPlayers) ? Math.max(3, Math.min(6, Math.floor(maxPlayers))) : 4;
  setText(elPlayerCount, `${room.players.length}/${limit}`);
  document.body.dataset.playerCountBucket = room.players.length >= 5 ? "5-6" : "3-4";

  syncScenarioUi(room);

  const preset = (room.presets || []).find((p) => p.id === room.presetId);
  setText(elPresetName, preset ? preset.name : room.presetId);
  const theme = (room.themes || []).find((t) => t.id === room.themeId);
  if (elThemeName) setText(elThemeName, theme ? theme.name : room.themeId);
  const baseModeName = room.gameMode === "quick" ? "Quick" : "Classic";
  const houseRules = room?.settings?.houseRules ?? null;
  const hasHouseRules =
    !!houseRules &&
    typeof houseRules === "object" &&
    !Array.isArray(houseRules) &&
    Object.keys(houseRules).some((k) => k !== "emotesEnabled");
  const customVp = Number(houseRules?.victoryPointsToWin ?? NaN);
  const vpLabel = Number.isFinite(customVp) ? Math.floor(customVp) : null;
  setText(elModeName, hasHouseRules ? (vpLabel != null ? `Custom (${vpLabel} VP)` : "Custom") : baseModeName);

  const mode = room.status === "in_game" ? "in_game" : "lobby";
  const currentPlayerId = room.game?.currentPlayerId ?? null;
  const winnerPlayerId = room.game?.winnerPlayerId ?? null;
  const isGameOver = mode === "in_game" && room.game?.phase === "game_over";

  // Show/hide lobby overlay based on room status
  if (mode === "lobby" && !attractModeActive) {
    showLobbyOverlay();
    renderLobbyOverlay(room);
  } else if (lobbyOverlayActive) {
    hideLobbyOverlay();
  }

  elSideTitle.textContent =
    mode === "in_game" && room.game?.phase === "game_over" ? "Game Over" : mode === "in_game" ? "Players" : "Lobby";
  elJoinInfo.style.display = mode === "in_game" || lobbyOverlayActive ? "none" : "";
  if (mode !== "in_game") renderJoinQr(joinUrl);

  if (elEndScreenCard) elEndScreenCard.style.display = isGameOver ? "" : "none";
  if (elEndScreenWinner) {
    const winner = winnerPlayerId ? (room.players || []).find((p) => p.playerId === winnerPlayerId) : null;
    elEndScreenWinner.textContent = `Winner: ${winner?.name || "—"}`;
  }
  if (elRematchBtn) {
    const playersCount = Array.isArray(room?.players) ? room.players.length : 0;
    const hasHost = !!room?.hostPlayerId;
    const canRematch = isGameOver && hasHost && playersCount >= 3 && playersCount <= limit && !rematchInFlight;
    elRematchBtn.disabled = !canRematch;
  }
  if (elNewRoomBtn) elNewRoomBtn.disabled = newRoomInFlight;

  if (!isGameOver) {
    setEndScreenHint("");
  } else if (elEndScreenHint && !String(elEndScreenHint.textContent || "").trim()) {
    setEndScreenHint(room?.hostPinEnabled ? "Host PIN may be required." : "");
  }

  if (elPhaseText) elPhaseText.textContent = computePhaseText(room);
  if (isHostControlsOpen()) syncHostControls(room);

  const prevGame = prevRoom?.status === "in_game" ? prevRoom?.game || null : null;
  const game = room.status === "in_game" ? room.game || null : null;
  const pointsByPlayerId = room.game?.pointsByPlayerId || {};
  const victoryPointsToWin = room.game?.victoryPointsToWin ?? 0;

  const { beats, newOfferIds } = computeShowBeats(prevRoom, room);
  const gameMode = room.gameMode === "quick" ? "quick" : "classic";
  for (const beat of beats) {
    if (!beat || typeof beat !== "object") continue;
    beat.gameMode = gameMode;
  }

  // Check for segment transitions (Setup -> Main -> Endgame)
  const segmentResult = segmentTracker.update(game);
  if (segmentResult.changed && segmentResult.copy) {
    const transitionBeat = {
      id: `segment_transition:${stableRoomPart(room.roomCode)}:${stableRoomPart(segmentResult.from)}:${stableRoomPart(segmentResult.to)}`,
      type: "segment_transition",
      gameMode,
      from: segmentResult.from,
      to: segmentResult.to,
      copy: segmentResult.copy
    };
    beats.unshift(transitionBeat);
  }

  renderOpenOffers(room, { newOfferIds });

  // Render event card if there's an active event
  const currentEvent = room.game?.currentEvent || null;
  if (elEventCard) {
    if (currentEvent && currentEvent.id) {
      elEventCard.style.display = "";
      if (elEventTitle) setText(elEventTitle, currentEvent.name || "Event");
      if (elEventDescription) setText(elEventDescription, currentEvent.description || currentEvent.shortText || "");
    } else {
      elEventCard.style.display = "none";
    }
  }

  const inActiveGame = room.status === "in_game" && !!room.game && room.game.phase !== "game_over";
  const pid = room.game?.currentPlayerId ?? null;
  if (!inActiveGame || !pid) {
    stopTurnTimer();
  } else {
    ensureTurnTimerRunning();
    if (elTurnTimer) {
      elTurnTimer.style.display = "";
      const elapsed = computeTurnElapsedMs(room);
      const paused = !!room.timer?.paused;
      if (elapsed != null) elTurnTimer.textContent = paused ? `⏸ ${formatMmSs(elapsed)}` : formatMmSs(elapsed);
    }
  }

  const nextPlayersKey = alwaysRenderEnabled
    ? null
    : tvPlayersRenderKey(room, {
        mode,
        currentPlayerId,
        pointsByPlayerId,
        victoryPointsToWin,
        winnerPlayerId
      });
  if (alwaysRenderEnabled || nextPlayersKey !== lastPlayersRenderKey) {
    elPlayers.innerHTML = room.players
      .map((p) =>
        playerRow(p, {
          mode,
          currentPlayerId,
          pointsByPlayerId,
          victoryPointsToWin,
          winnerPlayerId
        })
      )
      .join("");
    lastPlayersRenderKey = nextPlayersKey;
  }

  if (!room.game) {
    const nextBoardKey = alwaysRenderEnabled ? null : `room:${room.roomCode}|board:none`;
    if (alwaysRenderEnabled || nextBoardKey !== lastBoardRenderKey) {
      elBoard.innerHTML = `<div class="muted">Start a game to see the board.</div>`;
      lastBoardRenderKey = nextBoardKey;
    }
    // === CLEANUP 3D DICE + FX when game ends ===
    if (dice3dPanel) {
      dice3dPanel.destroy();
      dice3dPanel = null;
    }
    if (boardFxHelper) {
      boardFxHelper.destroy();
      boardFxHelper = null;
    }
    lastDiceRollAt = null;

    elDiceBox.innerHTML = renderDice(null);
    if (elOffersCard) elOffersCard.style.display = "none";
    const nextLogKey = alwaysRenderEnabled ? null : `room:${room.roomCode}|log:none`;
    if (alwaysRenderEnabled || nextLogKey !== lastLogRenderKey) {
      renderLog(elLog, [], { players: room.players });
      lastLogRenderKey = nextLogKey;
    }
    return;
  }

  elDiceBox.innerHTML = renderDice(room.game.lastRoll);

  // === 3D DICE PANEL: Initialize and sync ===
  if (supportsWebGL() && elDiceBox && !dice3dPanel) {
    dice3dPanel = createDice3dPanel(elDiceBox, { size: 56, gap: 10 });
    if (dice3dPanel) {
      dice3dPanel.setReducedMotion(!!getSettings()?.reducedMotion);
      dice3dPanel.mount();
    }
  }
  // Update 3D dice values when lastRoll changes (without animation - animation happens in runBeat)
  if (dice3dPanel && room.game.lastRoll) {
    const d1 = room.game.lastRoll.d1;
    const d2 = room.game.lastRoll.d2;
    const rollAt = room.game.lastRoll.at;
    // Only set values immediately if this is not a fresh roll (already seen)
    if (d1 && d2 && rollAt === lastDiceRollAt) {
      dice3dPanel.setValues(d1, d2, true);
    }
    lastDiceRollAt = rollAt;
  }

  // === BOARD FX HELPER: Initialize ===
  if (elBoard && !boardFxHelper) {
    boardFxHelper = createBoardFxHelper(elBoard, {
      reducedMotion: !!getSettings()?.reducedMotion,
      quality: getSettings()?.boardRenderer === "3d" ? "auto" : "medium"
    });
  }

  const nextLogKey = alwaysRenderEnabled ? null : tvLogRenderKey(room.game.log, room.players);
  if (alwaysRenderEnabled || nextLogKey !== lastLogRenderKey) {
    renderLog(elLog, room.game.log, { players: room.players });
    lastLogRenderKey = nextLogKey;
  }

  const highlightMode =
    room.gameMode === "quick" && ["PLACE_SETTLEMENT", "PLACE_ROAD"].includes(room.game.hints?.expected || "")
      ? "quick-setup"
      : "";
  const nextBoardKey = alwaysRenderEnabled ? null : tvBoardRenderKey(room, { highlightMode });
  if (alwaysRenderEnabled || nextBoardKey !== lastBoardRenderKey) {
    const placed = computePlacedStructures(prevGame?.structures || null, game?.structures || null);
    renderBoard(elBoard, room.game.board, {
      players: room.players,
      structures: room.game.structures,
      placedVertexIds: placed.placedVertexIds,
      placedEdgeIds: placed.placedEdgeIds,
      selectableVertexIds: room.game.hints?.legalVertexIds || [],
      selectableEdgeIds: room.game.hints?.legalEdgeIds || [],
      selectableHexIds: room.game.hints?.legalHexIds || [],
      robberHexId: room.game.robberHexId,
      highlightMode
    });
    lastBoardRenderKey = nextBoardKey;
  }

  showQueue.enqueue(beats);
}

function stableRoomPart(v) {
  return v == null ? "" : String(v);
}

function playerDisplayKey(players) {
  if (!Array.isArray(players)) return "";
  return players
    .map((p) => `${stableRoomPart(p?.playerId)}:${stableRoomPart(p?.name)}:${stableRoomPart(p?.color)}`)
    .join(";");
}

function tvPlayersRenderKey(
  room,
  { mode = "", currentPlayerId = null, pointsByPlayerId = {}, victoryPointsToWin = 0, winnerPlayerId = null } = {}
) {
  const players = Array.isArray(room?.players) ? room.players : [];
  const rows = players
    .map((p) => {
      const pid = stableRoomPart(p?.playerId);
      const points = Math.max(0, Math.floor(pointsByPlayerId?.[pid] ?? 0));
      return [
        pid,
        stableRoomPart(p?.name),
        stableRoomPart(p?.color),
        p?.connected ? "1" : "0",
        p?.ready ? "1" : "0",
        p?.isHost ? "1" : "0",
        String(points)
      ].join(",");
    })
    .join(";");
  return [
    `room:${stableRoomPart(room?.roomCode)}`,
    `mode:${stableRoomPart(mode)}`,
    `turn:${stableRoomPart(currentPlayerId)}`,
    `winner:${stableRoomPart(winnerPlayerId)}`,
    `target:${stableRoomPart(victoryPointsToWin)}`,
    rows
  ].join("|");
}

function tvLogTailKey(entries, { tail = 4 } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const n = list.length;
  const k = Math.max(1, Math.min(12, Math.floor(tail)));
  const start = Math.max(0, n - k);
  const tailEntries = list.slice(start).map((e) => {
    const at = stableRoomPart(e?.at);
    const type = stableRoomPart(e?.type);
    const actor = stableRoomPart(e?.actorPlayerId);
    const msg = stableRoomPart(e?.message);
    let data = "";
    try {
      data = JSON.stringify(e?.data ?? null);
    } catch {
      data = "";
    }
    return `${at}:${type}:${actor}:${msg}:${data}`;
  });
  return `${n}|${tailEntries.join("|")}`;
}

function tvLogRenderKey(entries, players) {
  const tail = tvLogTailKey(entries);
  const roster = playerDisplayKey(players);
  return `${tail}|players:${roster}`;
}

function tvBoardStaticKey(board) {
  const b = board && typeof board === "object" ? board : null;
  if (!b) return "board:none";
  const layout = stableRoomPart(b.layout);
  const hexSig = Array.isArray(b.hexes)
    ? b.hexes
        .map((h) => `${stableRoomPart(h?.id)}:${stableRoomPart(h?.resource)}:${stableRoomPart(h?.token)}`)
        .join(",")
    : "";
  const portSig = Array.isArray(b.ports)
    ? b.ports.map((p) => `${stableRoomPart(p?.id)}:${stableRoomPart(p?.kind)}:${stableRoomPart(p?.edgeId)}`).join(",")
    : "";
  return `layout:${layout}|hexes:${hexSig}|ports:${portSig}`;
}

function tvStructuresKey(structures) {
  const s = structures && typeof structures === "object" ? structures : null;
  if (!s) return "structures:none";

  const roads = s.roads && typeof s.roads === "object" ? s.roads : {};
  const settlements = s.settlements && typeof s.settlements === "object" ? s.settlements : {};

  const roadIds = Object.keys(roads).sort();
  const roadSig = roadIds.map((id) => `${id}:${stableRoomPart(roads[id]?.playerId)}`).join(",");

  const settlementIds = Object.keys(settlements).sort();
  const settlementSig = settlementIds
    .map((id) => `${id}:${stableRoomPart(settlements[id]?.playerId)}:${stableRoomPart(settlements[id]?.kind)}`)
    .join(",");

  return `roads:${roadSig}|settlements:${settlementSig}`;
}

function tvHintsKey(hints) {
  const h = hints && typeof hints === "object" ? hints : null;
  if (!h) return "hints:none";
  const exp = stableRoomPart(h.expected);
  const v = Array.isArray(h.legalVertexIds) ? h.legalVertexIds.join(",") : "";
  const e = Array.isArray(h.legalEdgeIds) ? h.legalEdgeIds.join(",") : "";
  const x = Array.isArray(h.legalHexIds) ? h.legalHexIds.join(",") : "";
  return `exp:${exp}|v:${v}|e:${e}|h:${x}`;
}

function tvPlayerColorsKey(players) {
  if (!Array.isArray(players)) return "";
  return players.map((p) => `${stableRoomPart(p?.playerId)}:${stableRoomPart(p?.color)}`).join(";");
}

function tvBoardRenderKey(room, { highlightMode = "" } = {}) {
  if (!room?.game) return `room:${stableRoomPart(room?.roomCode)}|board:none`;
  const game = room.game;
  const s = getSettings();
  const parts = [
    `room:${stableRoomPart(room?.roomCode)}`,
    tvBoardStaticKey(game.board),
    tvStructuresKey(game.structures),
    tvHintsKey(game.hints),
    `robber:${stableRoomPart(game.robberHexId)}`,
    `hl:${stableRoomPart(highlightMode)}`,
    `colors:${tvPlayerColorsKey(room.players)}`,
    `br:${stableRoomPart(s?.boardRenderer)}`,
    `rq:${stableRoomPart(s?.rendererQuality)}`,
    `lpm:${s?.lowPowerMode ? "1" : "0"}`
  ];
  return parts.join("|");
}

// ============================================================================
// THEME INDEX + PRELOAD
// ============================================================================
// Fetch theme index and preload all themes from index.json
// Falls back to hardcoded list if index fetch fails

async function initThemes() {
  const index = await fetchThemeIndex();
  if (index && index.themes && index.themes.length > 0) {
    const themeIds = index.themes.map((t) => t.id);
    await preloadThemes(themeIds);
  } else {
    // Fallback to hardcoded list
    await preloadThemes(["aurora", "ember", "ocean", "classic-night", "neon-arcade", "deep-sea"]);
  }
}

await initThemes();

// Check if joining an existing room via URL parameter
const urlParams = new URL(location.href).searchParams;
const roomFromUrl = urlParams.get("room");

if (roomFromUrl) {
  // Direct join - skip attract mode, go straight to room
  await ensureRoom();
  connectStream();
} else {
  // Fresh load - show attract mode as startup screen
  showAttractMode();
}
