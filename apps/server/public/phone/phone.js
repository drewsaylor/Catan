import { api, qs, renderLog, sanitizeRoomCode, setText } from "/shared/common.js";
import { renderBoard } from "/shared/board-renderer.js";
import { DEV_CARD_COST, gateAction, hasAnyResources, hasEnoughResources as hasEnough } from "/shared/action-gates.js";
import { createRenderScheduler } from "/shared/render-scheduler.js";
import { getSettings, initSettings, onSettingsChange, setSettings } from "/shared/settings.js";
import { installAudioUnlock, playSfx } from "/shared/audio.js";
import { errorCode, humanizeErrorMessage } from "/shared/error-copy.js";
import { computeVpBreakdownByPlayerId } from "/shared/vp-breakdown.js";
import { supportsWebGL } from "/shared/render-capabilities.js";
import { createMomentQueue, detectMoments } from "/shared/moment-detector.js";
import { scenarioDisplay } from "/shared/scenarios.js";
import { getWhatsNextCopy } from "/shared/host-copy.js";
import { loadTheme, preloadThemes, fetchThemeIndex, getAvailableThemes } from "/shared/theme-loader.js";
import { getTipsForContext } from "/shared/tips-catalog.js";
import { triggerHaptic, animatePressEffect, triggerPressFeedback } from "/shared/haptics.js";

const debugPerfEnabled = new URL(location.href).searchParams.get("debug") === "1";
const alwaysRenderEnabled = new URL(location.href).searchParams.get("alwaysRender") === "1";
let markRenderStart = null;
let markRenderEnd = null;
let markPayloadSize = null;
let measureUtf8Bytes = null;
let perfLoaded = false;

async function ensurePerf() {
  if (!debugPerfEnabled || perfLoaded) return;
  perfLoaded = true;
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
const elConnectionOverlay = qs("#connectionOverlay");
const elConnectionTitle = qs("#connectionTitle");
const elConnectionHint = qs("#connectionHint");
const elSettingsBtn = qs("#settingsBtn");
const elSettingsBackdrop = qs("#settingsBackdrop");
const elSettingsCloseBtn = qs("#settingsCloseBtn");
const elMuteAllBtn = qs("#muteAllBtn");
const elReducedMotionBtn = qs("#reducedMotionBtn");
const elLowPowerModeBtn = qs("#lowPowerModeBtn");
const elHighContrastBtn = qs("#highContrastBtn");
const elColorblindBtn = qs("#colorblindBtn");
const elBoardRendererBtn = qs("#boardRendererBtn");
const elBoardRendererHint = qs("#boardRendererHint");
const elSfxVolume = qs("#sfxVolume");
const elMusicVolume = qs("#musicVolume");
const elPanelTitle = qs("#panelTitle");
const elRoomStateBanner = qs("#roomStateBanner");
const elRoomStateTitle = qs("#roomStateTitle");
const elRoomStateHint = qs("#roomStateHint");
const elJoinPanel = qs("#joinPanel");
const elLobbyPanel = qs("#lobbyPanel");
const elGamePanel = qs("#gamePanel");
const elRoomInput = qs("#roomInput");
const elNameInput = qs("#nameInput");
const elJoinBtn = qs("#joinBtn");
const elJoinErr = qs("#joinErr");
const elRoomLabel = qs("#roomLabel");
const elScenarioName = qs("#scenarioName");
const elScenarioSummary = qs("#scenarioSummary");
const elReadyBtn = qs("#readyBtn");
const elHostTag = qs("#hostTag");
const elHostControls = qs("#hostControls");
const elPresetSelect = qs("#presetSelect");
const elThemeSelect = qs("#themeSelect");
const elGameModeSelect = qs("#gameModeSelect");
const elMaxPlayersSelect = qs("#maxPlayersSelect");
const elAdvancedBtn = qs("#advancedBtn");
const elAdvancedPanel = qs("#advancedPanel");
const elVpTargetSelect = qs("#vpTargetSelect");
const elVpTargetHint = qs("#vpTargetHint");
const elBoardSeedField = qs("#boardSeedField");
const elBoardSeedInput = qs("#boardSeedInput");
const elEmotesToggleBtn = qs("#emotesToggleBtn");
const elHostPinInput = qs("#hostPinInput");
const elHostPinState = qs("#hostPinState");
const elHostPinSetBtn = qs("#hostPinSetBtn");
const elHostPinClearBtn = qs("#hostPinClearBtn");
const elHostPinErr = qs("#hostPinErr");
const elStartBtn = qs("#startBtn");
const elPlayers = qs("#players");
const elVpLabel = qs("#vpLabel");
const elWinnerTag = qs("#winnerTag");
const elEventBanner = qs("#eventBanner");
const elEventBannerTitle = qs("#eventBannerTitle");
const elEventBannerHint = qs("#eventBannerHint");
const elPostGameCard = qs("#postGameCard");
const elPostGameWinner = qs("#postGameWinner");
const elPostGameStats = qs("#postGameStats");
const elPostGameHostControls = qs("#postGameHostControls");
const elPostGameRematchBtn = qs("#postGameRematchBtn");
const elPostGameWaiting = qs("#postGameWaiting");
const elPostGameErr = qs("#postGameErr");
const elResourcesBarCard = qs("#resourcesBarCard");
const elPrimaryActionCard = qs("#primaryActionCard");
const elPrimaryBtn = qs("#primaryBtn");
const elActionHint = qs("#actionHint");
const elEndTurnBtn = qs("#endTurnBtn");
const elEmoteStrip = qs("#emoteStrip");
const elBoardShell = qs("#boardShell");
const elBoardFrame = qs("#boardFrame");
const elBoardResetBtn = qs("#boardResetBtn");
const elBoardFullscreenBtn = qs("#boardFullscreenBtn");
const elBoard = qs("#board");
const elMainActions = qs("#mainActions");
const elBuildRoadBtn = qs("#buildRoadBtn");
const elBuildSettlementBtn = qs("#buildSettlementBtn");
const elBuildCityBtn = qs("#buildCityBtn");
const elCancelModeBtn = qs("#cancelModeBtn");
const elResTotalValue = qs("#resTotalValue");
const elResCountWood = qs("#resCountWood");
const elResCountBrick = qs("#resCountBrick");
const elResCountSheep = qs("#resCountSheep");
const elResCountWheat = qs("#resCountWheat");
const elResCountOre = qs("#resCountOre");
const elLog = qs("#log");
const elTradeCard = qs("#tradeCard");
const elTradeHint = qs("#tradeHint");
const elTradeCreatePanel = qs("#tradeCreatePanel");
const elTradeToSelect = qs("#tradeToSelect");
const elTradeGiveWood = qs("#tradeGiveWood");
const elTradeGiveBrick = qs("#tradeGiveBrick");
const elTradeGiveSheep = qs("#tradeGiveSheep");
const elTradeGiveWheat = qs("#tradeGiveWheat");
const elTradeGiveOre = qs("#tradeGiveOre");
const elTradeWantWood = qs("#tradeWantWood");
const elTradeWantBrick = qs("#tradeWantBrick");
const elTradeWantSheep = qs("#tradeWantSheep");
const elTradeWantWheat = qs("#tradeWantWheat");
const elTradeWantOre = qs("#tradeWantOre");
const elTradeSuggestBtn = qs("#tradeSuggestBtn");
const elTradeRepeatBtn = qs("#tradeRepeatBtn");
const elTradeSendBtn = qs("#tradeSendBtn");
const elTradeClearBtn = qs("#tradeClearBtn");
const elTradeErr = qs("#tradeErr");
const elTradeOffers = qs("#tradeOffers");
const elBankTradeCard = qs("#bankTradeCard");
const elBankTradeHint = qs("#bankTradeHint");
const elBankTradePanel = qs("#bankTradePanel");
const elBankGiveSelect = qs("#bankGiveSelect");
const elBankGiveAmount = qs("#bankGiveAmount");
const elBankReceiveSelect = qs("#bankReceiveSelect");
const elBankReceiveAmount = qs("#bankReceiveAmount");
const elBankTradeRate = qs("#bankTradeRate");
const elBankTradeBtn = qs("#bankTradeBtn");
const elBankTradeErr = qs("#bankTradeErr");
const elDevCardsCard = qs("#devCardsCard");
const elDevCardsHint = qs("#devCardsHint");
const elDevBuyBtn = qs("#devBuyBtn");
const elDevDeckTag = qs("#devDeckTag");
const elDevPlayLimitTag = qs("#devPlayLimitTag");
const elDevCardsInHand = qs("#devCardsInHand");
const elDevCardsNew = qs("#devCardsNew");
const elDevPlayPanel = qs("#devPlayPanel");
const elDevPlayTag = qs("#devPlayTag");
const elDevPlayCancelBtn = qs("#devPlayCancelBtn");
const elDevYopPanel = qs("#devYopPanel");
const elDevYopWood = qs("#devYopWood");
const elDevYopBrick = qs("#devYopBrick");
const elDevYopSheep = qs("#devYopSheep");
const elDevYopWheat = qs("#devYopWheat");
const elDevYopOre = qs("#devYopOre");
const elDevYopPlayBtn = qs("#devYopPlayBtn");
const elDevYopErr = qs("#devYopErr");
const elDevMonopolyPanel = qs("#devMonopolyPanel");
const elDevMonopolySelect = qs("#devMonopolySelect");
const elDevMonopolyPlayBtn = qs("#devMonopolyPlayBtn");
const elDevMonopolyErr = qs("#devMonopolyErr");
const elDevKnightsTag = qs("#devKnightsTag");
const elDevLargestArmyTag = qs("#devLargestArmyTag");
const elDevHiddenVpTag = qs("#devHiddenVpTag");
const elDevCardsErr = qs("#devCardsErr");
const elRobberCard = qs("#robberCard");
const elRobberHint = qs("#robberHint");
const elDiscardPanel = qs("#discardPanel");
const elDiscardReqLabel = qs("#discardReqLabel");
const elDiscardWood = qs("#discardWood");
const elDiscardBrick = qs("#discardBrick");
const elDiscardSheep = qs("#discardSheep");
const elDiscardWheat = qs("#discardWheat");
const elDiscardOre = qs("#discardOre");
const elDiscardSubmitBtn = qs("#discardSubmitBtn");
const elDiscardErr = qs("#discardErr");
const elStealPanel = qs("#stealPanel");
const elStealHint = qs("#stealHint");
const elStealTargets = qs("#stealTargets");
const elStealErr = qs("#stealErr");
const elNotifyBanner = qs("#notifyBanner");
const elNotifyTitle = qs("#notifyTitle");
const elNotifyHint = qs("#notifyHint");
const elHelpBtn = qs("#helpBtn");
const elHelpBackdrop = qs("#helpBackdrop");
const elHelpCloseBtn = qs("#helpCloseBtn");
const elHelpTitle = qs("#helpTitle");
const elHelpList = qs("#helpList");
const elTipsCard = qs("#tipsCard");
const elPhoneTabs = qs("#phoneTabs");
const elHowToPlayBtn = qs("#howToPlayBtn");
const elFeedbackModal = qs("#feedbackModal");
const elFeedbackStars = qs("#feedbackStars");
const elFeedbackComment = qs("#feedbackComment");
const elFeedbackCharCount = qs("#feedbackCharCount");
const elFeedbackSubmitBtn = qs("#feedbackSubmitBtn");
const elFeedbackSkipBtn = qs("#feedbackSkipBtn");
const elFeedbackErr = qs("#feedbackErr");

const tabButtons = Array.from(document.querySelectorAll('#phoneTabs [data-tab]'));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));
const tabBadges = new Map(
  Array.from(document.querySelectorAll("[data-tab-badge]")).map((el) => [el.getAttribute("data-tab-badge"), el])
);

let roomCode = null;
let playerId = null;
let playerName = null;
let isHost = false;
let hostPinCache = null;
let es = null;
let lastRoomState = null;
let lastYouState = null;
let lastRenderedRoomState = null;
let lastRevisionSeen = null;
let lastThemeId = null;
let mode = null; // "build_road" | "build_settlement" | "build_city" | null
let reconnectCheckTimer = null;
let autoStealKey = null;
let notifyTimer = null;
let actionHintOverride = null;
let actionHintOverrideTimer = null;
let devPlayMode = null; // "year_of_plenty" | "monopoly" | null
let lastIllegalTapAt = 0;
let lastNotYourTurnBoardTapAt = 0;
let lastSetupAssistKey = null;
let roomPreviewTimer = null;
let roomPreviewSeq = 0;
let activeTab = localStorage.getItem("catan.phoneTab") || "board";
let lastPlayersRenderKey = null;
let lastLogRenderKey = null;
let lastBoardRenderKey = null;
let lastTradeToOptionsRenderKey = null;
let lastTradeOffersRenderKey = null;
let lastSentTradeOffer = null;
let lastStealTargetsRenderKey = null;
let rematchInFlight = false;
let emoteCooldownUntil = 0;
const momentQueue = createMomentQueue({ maxQueue: 18, maxSeen: 512, cooldownMsByKind: { trade_open: 1400 } });
const HOST_ADVANCED_OPEN_KEY = "catan.phone.hostAdvancedOpen";
let hostAdvancedOpen = localStorage.getItem(HOST_ADVANCED_OPEN_KEY) === "1";

// =============================================================================
// First-Join Tutorial State
// =============================================================================
const FIRST_JOIN_TUTORIAL_KEY = "catan.phone.firstJoinTutorialShown";
let firstJoinTutorialShown = false;
let lobbyTipIndex = 0;
let lobbyTipTimer = null;
let lobbyTips = [];
const LOBBY_TIP_INTERVAL_MS = 6000; // Rotate tips every 6 seconds

// =============================================================================
// First-Time Player Hints State
// =============================================================================
// Track which hint triggers have fired this session to avoid repeated triggers
let hintTriggerState = {
  lastExpected: null,
  lastPhase: null,
  lastSubphase: null,
  lastMyTurn: false,
  lastHasResources: false,
  rollHintShown: false,
  buildHintShown: false,
  tradeHintShown: false,
  turnHintShown: false,
  settlementHintShown: false,
  roadHintShown: false,
  robberHintShown: false
};

// =============================================================================
// Feedback Modal State
// =============================================================================
const FEEDBACK_SUBMITTED_KEY = "catan.phone.feedbackSubmitted";
let feedbackSelectedRating = 0;
let feedbackModalShown = false;
let feedbackSubmitting = false;

const boardView = {
  scale: 1,
  tx: 0,
  ty: 0,
  pointers: new Map(),
  gesture: null,
  suppressClick: false,
  suppressClickTimer: null,
  attached: false
};

const RESOURCE_TYPES = ["wood", "brick", "sheep", "wheat", "ore"];
const tradeGiveInputs = {
  wood: elTradeGiveWood,
  brick: elTradeGiveBrick,
  sheep: elTradeGiveSheep,
  wheat: elTradeGiveWheat,
  ore: elTradeGiveOre
};
const tradeWantInputs = {
  wood: elTradeWantWood,
  brick: elTradeWantBrick,
  sheep: elTradeWantSheep,
  wheat: elTradeWantWheat,
  ore: elTradeWantOre
};
const discardInputs = {
  wood: elDiscardWood,
  brick: elDiscardBrick,
  sheep: elDiscardSheep,
  wheat: elDiscardWheat,
  ore: elDiscardOre
};
const devYopInputs = {
  wood: elDevYopWood,
  brick: elDevYopBrick,
  sheep: elDevYopSheep,
  wheat: elDevYopWheat,
  ore: elDevYopOre
};

initSettings();
installAudioUnlock();
momentQueue.setHandler(handleMoment);

// ============================================================================
// THEME INDEX + PRELOAD
// ============================================================================
// Fetch theme index and preload all themes from index.json
// Falls back to hardcoded list if index fetch fails

(async function initThemes() {
  const index = await fetchThemeIndex();
  if (index && index.themes && index.themes.length > 0) {
    const themeIds = index.themes.map((t) => t.id);
    await preloadThemes(themeIds);
  } else {
    // Fallback to hardcoded list
    await preloadThemes(["aurora", "ember", "ocean", "classic-night", "neon-arcade", "deep-sea"]);
  }
})();

const renderScheduler = createRenderScheduler(() => {
  if (!lastRoomState) return;
  if (debugPerfEnabled && markRenderStart && markRenderEnd) {
    markRenderStart("phone.render");
    render(lastRoomState, lastYouState);
    markRenderEnd("phone.render");
  } else {
    render(lastRoomState, lastYouState);
  }
});

function setActiveTab(tab, { persist = false } = {}) {
  if (!elPhoneTabs) return;
  const next = String(tab || "");
  if (!next) return;
  activeTab = next;
  if (persist) localStorage.setItem("catan.phoneTab", activeTab);

  for (const btn of tabButtons) {
    const selected = btn.getAttribute("data-tab") === activeTab;
    btn.classList.toggle("primary", selected);
    btn.setAttribute("aria-selected", selected ? "true" : "false");
    btn.setAttribute("tabindex", selected ? "0" : "-1");
  }

  for (const panel of tabPanels) {
    panel.hidden = panel.getAttribute("data-tab-panel") !== activeTab;
  }
}

function setTabBadge(tab, text) {
  const el = tabBadges.get(tab) || null;
  if (!el) return;
  if (!text) {
    el.textContent = "";
    el.style.display = "none";
    return;
  }
  el.textContent = String(text);
  el.style.display = "";
}

function shouldShowBoardTab(room, me) {
  const game = room?.game || null;
  if (!game) return false;
  const myTurn = me?.playerId === game.currentPlayerId;
  const expected = game.hints?.expected || null;
  if (myTurn && ["PLACE_SETTLEMENT", "PLACE_ROAD", "MOVE_ROBBER", "DEV_ROAD_BUILDING_PLACE_ROAD"].includes(expected)) return true;
  if (myTurn && game.phase === "turn" && game.subphase === "main" && mode) return true;
  return false;
}

function updateTabUi(room, me) {
  if (!room?.game) return;

  const boardNeeded = shouldShowBoardTab(room, me);
  setTabBadge("board", boardNeeded && activeTab !== "board" ? "!" : "");

  const tradeOffers = relevantOpenTradeOffers(room.game, me?.playerId);
  const n = tradeOffers.length;
  setTabBadge("trade", n > 0 ? String(Math.min(9, n)) + (n > 9 ? "+" : "") : "");
}

elPhoneTabs?.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-tab]");
  if (!btn) return;
  setActiveTab(btn.getAttribute("data-tab"), { persist: true });
});

setActiveTab(activeTab);

let focusBeforeSettings = null;
let focusBeforeHelp = null;

function syncSettingsUi(settings) {
  if (elMuteAllBtn) {
    elMuteAllBtn.textContent = settings?.muteAll ? "On" : "Off";
    elMuteAllBtn.setAttribute("aria-pressed", settings?.muteAll ? "true" : "false");
  }
  if (elReducedMotionBtn) {
    elReducedMotionBtn.textContent = settings?.reducedMotion ? "On" : "Off";
    elReducedMotionBtn.setAttribute("aria-pressed", settings?.reducedMotion ? "true" : "false");
  }
  if (elLowPowerModeBtn) {
    elLowPowerModeBtn.textContent = settings?.lowPowerMode ? "On" : "Off";
    elLowPowerModeBtn.setAttribute("aria-pressed", settings?.lowPowerMode ? "true" : "false");
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
  if (elSfxVolume) elSfxVolume.value = String(Math.round((settings?.sfxVolume ?? 0) * 100));
  if (elMusicVolume) elMusicVolume.value = String(Math.round((settings?.musicVolume ?? 0) * 100));
}

function setConnectionOverlay(isVisible, { title = "Rejoining…", hint = "" } = {}) {
  if (!elConnectionOverlay) return;
  elConnectionOverlay.style.display = isVisible ? "" : "none";
  if (!isVisible) return;
  if (elConnectionTitle) elConnectionTitle.textContent = title;
  if (elConnectionHint) elConnectionHint.textContent = hint;
}

function isSettingsOpen() {
  if (!elSettingsBackdrop) return false;
  return elSettingsBackdrop.style.display !== "none";
}

function openSettings() {
  if (!elSettingsBackdrop) return;
  if (isHelpOpen()) closeHelp();
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

function isHelpOpen() {
  if (!elHelpBackdrop) return false;
  return elHelpBackdrop.style.display !== "none";
}

function closeHelp() {
  if (!elHelpBackdrop) return;
  elHelpBackdrop.style.display = "none";
  const restore = focusBeforeHelp && document.contains(focusBeforeHelp) ? focusBeforeHelp : elHelpBtn;
  focusBeforeHelp = null;
  requestAnimationFrame(() => restore?.focus());
}

function renderHelp(room, you) {
  if (!elHelpTitle || !elHelpList) return;

  const game = room?.game || null;
  const me = room?.players?.find((p) => p.playerId === playerId) || null;
  const current = room?.players?.find((p) => p.playerId === game?.currentPlayerId) || null;
  const currentName = current?.name || "the current player";
  const expected = game?.hints?.expected || null;
  const myTurn = !!me?.playerId && me.playerId === game?.currentPlayerId;

  let title = "What’s next?";
  let items = [];

  if (!game) {
    title = "Not in a game yet";
    items = ["Join a room using the code on the TV.", "Tap Ready in the lobby.", "Host taps Start game."];
  } else if (game.phase === "setup_round_1" || game.phase === "setup_round_2") {
    title = "Setup";
    items = [
      "Place a settlement on a glowing spot.",
      "Then place a road touching your settlement.",
      "Settlements can’t touch other settlements.",
      "Round 2 goes in reverse order."
    ];
  } else if (expected === "ROLL_DICE") {
    title = myTurn ? "Your turn" : "Waiting";
    items = [
      myTurn ? "Tap Roll dice to start your turn." : `Waiting for ${currentName} to roll.`,
      "After the roll: build, trade, or play a dev card.",
      "If a 7 is rolled: discard (if needed), move robber, steal."
    ];
  } else if (expected === "DISCARD_CARDS") {
    const required = parseNonNegativeInt(game.hints?.discardRequiredByPlayerId?.[me?.playerId] ?? 0);
    const submitted = !!game.hints?.discardSubmittedByPlayerId?.[me?.playerId];
    title = "Robber: Discard";
    if (required > 0 && !submitted) {
      items = [
        `Discard exactly ${required} card${required === 1 ? "" : "s"} below.`,
        "Then wait for everyone to finish discarding.",
        "The current player will move the robber next."
      ];
    } else {
      items = ["No discard needed for you.", "Waiting for everyone to finish discarding.", "Then the current player moves the robber."];
    }
  } else if (expected === "MOVE_ROBBER") {
    title = "Robber: Move";
    items = [
      myTurn ? "Tap a highlighted hex to move the robber." : `Waiting for ${currentName} to move the robber.`,
      "You can’t leave it in the same spot.",
      "Then the current player steals 1 random card."
    ];
  } else if (expected === "STEAL_CARD") {
    title = "Robber: Steal";
    items = [
      myTurn ? "Pick a target below to steal from." : `Waiting for ${currentName} to steal a card.`,
      "The steal is random.",
      "No resource type is revealed."
    ];
  } else if (expected === "DEV_ROAD_BUILDING_PLACE_ROAD") {
    title = "Road Building";
    items = [
      myTurn ? "Tap highlighted edges to place your free roads." : `Waiting for ${currentName} to place roads.`,
      "Roads must connect to your network.",
      "You place 2 roads total."
    ];
  } else if (game.phase === "turn" && game.subphase === "main") {
    title = myTurn ? "Main phase" : "Waiting";
    items = myTurn
      ? ["Build: pick a build button, then tap highlighted board.", "Trade: propose or accept offers.", "End your turn when you’re done."]
      : ["You can respond to trade offers in the Trade section.", `Waiting for ${currentName} to end their turn.`, "Pinch/drag the board to inspect."];
  } else {
    title = "In progress";
    items = ["Follow the Primary action at the top.", "If you’re stuck, check the Robber or Trade sections."];
  }

  setText(elHelpTitle, title);
  elHelpList.innerHTML = "";
  for (const item of items.slice(0, 4)) {
    const li = document.createElement("li");
    li.textContent = item;
    elHelpList.appendChild(li);
  }
}

function openHelp() {
  if (!elHelpBackdrop) return;
  if (isSettingsOpen()) closeSettings();
  focusBeforeHelp = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  elHelpBackdrop.style.display = "";
  renderHelp(lastRoomState, lastYouState);
  requestAnimationFrame(() => elHelpCloseBtn?.focus());
}

// =============================================================================
// Feedback Modal
// =============================================================================

function hasFeedbackBeenSubmitted() {
  if (!roomCode) return false;
  const key = `${FEEDBACK_SUBMITTED_KEY}.${roomCode}`;
  return sessionStorage.getItem(key) === "1";
}

function markFeedbackSubmitted() {
  if (!roomCode) return;
  const key = `${FEEDBACK_SUBMITTED_KEY}.${roomCode}`;
  sessionStorage.setItem(key, "1");
}

function isFeedbackModalOpen() {
  if (!elFeedbackModal) return false;
  return elFeedbackModal.style.display !== "none";
}

function resetFeedbackModalState() {
  feedbackSelectedRating = 0;
  feedbackSubmitting = false;
  if (elFeedbackComment) elFeedbackComment.value = "";
  if (elFeedbackCharCount) elFeedbackCharCount.textContent = "0 / 1000";
  if (elFeedbackErr) elFeedbackErr.textContent = "";
  if (elFeedbackSubmitBtn) elFeedbackSubmitBtn.disabled = true;
  updateFeedbackStarsUI();
}

function updateFeedbackStarsUI() {
  if (!elFeedbackStars) return;
  const stars = elFeedbackStars.querySelectorAll(".feedbackStar");
  stars.forEach((star) => {
    const starValue = parseInt(star.getAttribute("data-star") || "0", 10);
    star.classList.toggle("selected", starValue <= feedbackSelectedRating);
  });
}

function showFeedbackModal() {
  if (!elFeedbackModal) return;
  if (hasFeedbackBeenSubmitted()) return;
  if (feedbackModalShown) return;

  feedbackModalShown = true;
  resetFeedbackModalState();
  elFeedbackModal.style.display = "";
  requestAnimationFrame(() => {
    const firstStar = elFeedbackStars?.querySelector(".feedbackStar");
    if (firstStar) firstStar.focus();
  });
}

function hideFeedbackModal() {
  if (!elFeedbackModal) return;
  elFeedbackModal.style.display = "none";
}

function skipFeedback() {
  markFeedbackSubmitted();
  hideFeedbackModal();
}

async function submitFeedback(rating, comment) {
  if (feedbackSubmitting) return;
  if (!roomCode || !playerId) {
    if (elFeedbackErr) elFeedbackErr.textContent = "Missing room or player info.";
    return;
  }
  if (rating < 1 || rating > 5) {
    if (elFeedbackErr) elFeedbackErr.textContent = "Please select a rating.";
    return;
  }

  feedbackSubmitting = true;
  if (elFeedbackSubmitBtn) elFeedbackSubmitBtn.disabled = true;
  if (elFeedbackErr) elFeedbackErr.textContent = "";

  const gameStats = {};
  if (lastRoomState?.game) {
    const game = lastRoomState.game;
    gameStats.winnerId = game.winnerPlayerId || null;
    gameStats.turnCount = game.turnCount || 0;
    gameStats.phase = game.phase || null;
    if (lastYouState) {
      gameStats.finalVp = lastYouState.visibleVp || 0;
    }
  }

  try {
    const res = await api("/api/feedback", {
      method: "POST",
      body: {
        roomId: roomCode,
        playerId: playerId,
        rating: rating,
        comment: (comment || "").trim().slice(0, 1000),
        gameStats: gameStats
      }
    });

    if (res.error) {
      throw new Error(res.error.code || "SUBMIT_FAILED");
    }

    markFeedbackSubmitted();
    hideFeedbackModal();
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : "Failed to submit feedback.";
    if (elFeedbackErr) elFeedbackErr.textContent = msg;
    feedbackSubmitting = false;
    if (elFeedbackSubmitBtn) elFeedbackSubmitBtn.disabled = feedbackSelectedRating < 1;
  }
}

// Feedback modal event listeners
if (elFeedbackStars) {
  elFeedbackStars.addEventListener("click", (ev) => {
    const star = ev.target.closest(".feedbackStar");
    if (!star) return;
    const value = parseInt(star.getAttribute("data-star") || "0", 10);
    if (value >= 1 && value <= 5) {
      feedbackSelectedRating = value;
      updateFeedbackStarsUI();
      if (elFeedbackSubmitBtn) elFeedbackSubmitBtn.disabled = false;
    }
  });

  // Hover effect for stars
  elFeedbackStars.addEventListener("mouseover", (ev) => {
    const star = ev.target.closest(".feedbackStar");
    if (!star) return;
    const value = parseInt(star.getAttribute("data-star") || "0", 10);
    const stars = elFeedbackStars.querySelectorAll(".feedbackStar");
    stars.forEach((s) => {
      const sv = parseInt(s.getAttribute("data-star") || "0", 10);
      s.classList.toggle("hovered", sv <= value);
    });
  });

  elFeedbackStars.addEventListener("mouseout", () => {
    const stars = elFeedbackStars.querySelectorAll(".feedbackStar");
    stars.forEach((s) => s.classList.remove("hovered"));
  });
}

if (elFeedbackComment) {
  elFeedbackComment.addEventListener("input", () => {
    const len = (elFeedbackComment.value || "").length;
    if (elFeedbackCharCount) elFeedbackCharCount.textContent = `${len} / 1000`;
  });
}

if (elFeedbackSubmitBtn) {
  elFeedbackSubmitBtn.addEventListener("click", () => {
    const comment = elFeedbackComment?.value || "";
    submitFeedback(feedbackSelectedRating, comment);
  });
}

if (elFeedbackSkipBtn) {
  elFeedbackSkipBtn.addEventListener("click", () => {
    skipFeedback();
  });
}

// Close feedback modal on backdrop click
if (elFeedbackModal) {
  elFeedbackModal.addEventListener("click", (ev) => {
    if (ev.target === elFeedbackModal) {
      skipFeedback();
    }
  });
}

syncSettingsUi(getSettings());
onSettingsChange(syncSettingsUi);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function parseNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function normalizeHostPin(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!/^\d{4,8}$/.test(s)) return null;
  return s;
}

function clampInput(el, min, max) {
  if (!el) return 0;
  const v = parseNonNegativeInt(el.value);
  const next = Math.max(min, Math.min(max, v));
  if (String(next) !== String(el.value)) el.value = String(next);
  return next;
}

function countsFromInputs(inputByType) {
  const out = {};
  for (const r of RESOURCE_TYPES) {
    const el = inputByType[r];
    out[r] = el ? parseNonNegativeInt(el.value) : 0;
  }
  return out;
}

function setInputsToZero(inputByType) {
  for (const r of RESOURCE_TYPES) {
    const el = inputByType[r];
    if (el) el.value = "0";
  }
}

function countsForSingle(type, amount) {
  const out = {};
  for (const r of RESOURCE_TYPES) out[r] = 0;
  if (RESOURCE_TYPES.includes(type)) out[type] = parseNonNegativeInt(amount);
  return out;
}

function titleResource(type) {
  const s = String(type || "");
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

const DEV_CARD_TYPES = ["knight", "road_building", "year_of_plenty", "monopoly"];

function titleDevCard(card) {
  switch (card) {
    case "knight":
      return "Knight";
    case "road_building":
      return "Road Building";
    case "year_of_plenty":
      return "Year of Plenty";
    case "monopoly":
      return "Monopoly";
    default:
      return "Dev card";
  }
}

function countsByValue(values) {
  const out = {};
  for (const v of Array.isArray(values) ? values : []) {
    const key = String(v || "");
    if (!key) continue;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function computeBankTradeRates(game, pid) {
  const ratios = { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 };
  const sources = { wood: "no port", brick: "no port", sheep: "no port", wheat: "no port", ore: "no port" };
  const ports = Array.isArray(game?.board?.ports) ? game.board.ports : [];
  const settlements = game?.structures?.settlements || {};
  if (!ports.length || !pid) return { ratios, sources };

  let hasGeneric = false;
  const hasSpecific = { wood: false, brick: false, sheep: false, wheat: false, ore: false };
  for (const port of ports) {
    const vertexIds = Array.isArray(port?.vertexIds) ? port.vertexIds : [];
    const owns = vertexIds.some((vId) => settlements?.[vId]?.playerId === pid);
    if (!owns) continue;
    if (port.kind === "generic") hasGeneric = true;
    else if (RESOURCE_TYPES.includes(port.kind)) hasSpecific[port.kind] = true;
  }

  for (const r of RESOURCE_TYPES) {
    if (hasSpecific[r]) {
      ratios[r] = 2;
      sources[r] = `${r} port`;
    } else if (hasGeneric) {
      ratios[r] = 3;
      sources[r] = "3:1 port";
    }
  }

  return { ratios, sources };
}

function clearNotify() {
  if (!elNotifyBanner) return;
  elNotifyBanner.classList.remove("show");
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = null;
}

function maybeHaptic(tone) {
  // Map legacy tones to haptic intensity levels
  // 'good' -> light (quick confirmation)
  // 'warn' -> medium (attention needed)
  // 'bad' -> heavy (error feedback)
  if (tone === "good") {
    triggerHaptic("light");
  } else if (tone === "warn") {
    triggerHaptic("medium");
  } else if (tone === "bad") {
    triggerHaptic("heavy");
  }
}

function feedbackGood(sfxKey, { gain = 1 } = {}) {
  maybeHaptic("good");
  if (sfxKey) playSfx(sfxKey, { gain });
}

function showNotify({ title, hint = "", tone = "info", durationMs = 3600 } = {}) {
  if (!elNotifyBanner || !elNotifyTitle || !elNotifyHint) return;

  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = null;

  maybeHaptic(tone);

  setText(elNotifyTitle, title || "");
  setText(elNotifyHint, hint || "");
  elNotifyHint.style.display = hint ? "" : "none";

  elNotifyBanner.classList.remove("good", "warn", "bad", "info");
  if (tone) elNotifyBanner.classList.add(tone);
  elNotifyBanner.classList.add("show");

  notifyTimer = setTimeout(() => clearNotify(), Math.max(800, parseNonNegativeInt(durationMs)));
}

function setActionHintOverrideText(text, { durationMs = 3800 } = {}) {
  const clean = String(text || "").trim();
  if (!clean) return;

  const ms = Math.max(800, parseNonNegativeInt(durationMs));
  actionHintOverride = { text: clean, until: Date.now() + ms };
  if (actionHintOverrideTimer) clearTimeout(actionHintOverrideTimer);
  actionHintOverrideTimer = setTimeout(() => {
    actionHintOverride = null;
    actionHintOverrideTimer = null;
    const room = lastRoomState;
    if (room?.status !== "in_game" || !room.game) return;
    const me = room.players.find((p) => p.playerId === playerId) || null;
    renderActionHint(room, me);
  }, ms);

  const room = lastRoomState;
  if (room?.status === "in_game" && room.game) {
    const me = room.players.find((p) => p.playerId === playerId) || null;
    renderActionHint(room, me);
  }
}

function showErrorToast(err, { title = "Can't do that", durationMs = 3800 } = {}) {
  const hint = humanizeErrorMessage(err, { room: lastRoomState });
  showNotify({ tone: "bad", title, hint, durationMs });
  setActionHintOverrideText(hint, { durationMs });
}

function isHostPinErrorMessage(message) {
  const s = String(message || "");
  return s === "HOST_PIN_REQUIRED" || s === "BAD_HOST_PIN" || s.includes("Host PIN");
}

async function ensureHostPin(room) {
  if (!room?.hostPinEnabled) return null;
  const cached = normalizeHostPin(hostPinCache);
  if (cached) return cached;

  const entered = prompt("Host PIN", "");
  const pin = normalizeHostPin(entered);
  if (!pin) throw new Error("HOST_PIN_REQUIRED");
  hostPinCache = pin;
  return pin;
}

async function hostPost(path, body, { room = lastRoomState } = {}) {
  const hostPin = await ensureHostPin(room);
  const requestBody = hostPin ? { ...(body || {}), hostPin } : body;
  try {
    return await api(path, { method: "POST", body: requestBody });
  } catch (e) {
    if (isHostPinErrorMessage(e?.message)) hostPinCache = null;
    throw e;
  }
}

function relevantOpenTradeOffers(game, pid) {
  if (!game || !Array.isArray(game.tradeOffers) || !pid) return [];
  return game.tradeOffers.filter((offer) => {
    if (!offer || offer.status !== "open") return false;
    if (offer.fromPlayerId === pid) return false;
    if (offer.to === "all") return !(offer.rejectedByPlayerIds || []).includes(pid);
    return offer.to === pid;
  });
}

function handleMoment(moment) {
  const room = lastRoomState;
  const game = room?.status === "in_game" ? room.game || null : null;
  if (!room || !game) return;
  if (!playerId) return;

  const byId = new Map((room.players || []).map((p) => [p.playerId, p]));
  const nameFor = (pid) => byId.get(pid)?.name || "Player";

  const kind = typeof moment?.kind === "string" ? moment.kind : "";
  const data = moment?.data && typeof moment.data === "object" ? moment.data : {};

  const expectedNow = game.hints?.expected || null;
  const myTurnNow = game.currentPlayerId === playerId;

  if (kind === "game_over") {
    const winnerId = typeof data.winnerPlayerId === "string" ? data.winnerPlayerId : null;
    showNotify({
      tone: "good",
      title: winnerId === playerId ? "You win!" : "Game over",
      hint: `Winner: ${nameFor(winnerId)}`,
      durationMs: 7200
    });
    return;
  }

  if (kind === "turn_start") {
    const pid = typeof data.playerId === "string" ? data.playerId : null;
    if (!pid || pid !== playerId) return;

    let hint = "Make your move.";
    if (expectedNow === "ROLL_DICE") hint = "Roll dice to start.";
    else if (expectedNow === "PLACE_SETTLEMENT") hint = "Place a settlement: tap a highlighted spot.";
    else if (expectedNow === "PLACE_ROAD") hint = "Place a road: tap a highlighted edge.";
    else if (expectedNow === "MOVE_ROBBER") hint = "Move the robber.";
    else if (expectedNow === "STEAL_CARD") hint = "Steal a card.";
    else if (expectedNow === "DISCARD_CARDS") hint = "Discard cards if needed.";
    else if (game.phase === "turn" && game.subphase === "main") hint = "Build, trade, or end your turn.";
    showNotify({ tone: "good", title: "Your turn", hint, durationMs: 3400 });
    return;
  }

  if (kind === "expected_action") {
    const expected = typeof data.expected === "string" ? data.expected : null;
    if (!expected) return;

    if (expected === "DISCARD_CARDS") {
      const required = parseNonNegativeInt(game.hints?.discardRequiredByPlayerId?.[playerId] ?? 0);
      const submitted = !!game.hints?.discardSubmittedByPlayerId?.[playerId];
      if (required > 0 && !submitted) {
        showNotify({
          tone: "warn",
          title: "Discard cards",
          hint: `Discard ${required} card${required === 1 ? "" : "s"}.`,
          durationMs: 5200
        });
      }
      return;
    }

    if (expected === "MOVE_ROBBER" && myTurnNow) {
      showNotify({ tone: "warn", title: "Move the robber", hint: "Tap a highlighted hex.", durationMs: 4600 });
      return;
    }

    if (expected === "STEAL_CARD" && myTurnNow) {
      showNotify({ tone: "warn", title: "Steal a card", hint: "Choose a target.", durationMs: 4600 });
      return;
    }

    if (expected === "PLACE_SETTLEMENT" && myTurnNow) {
      showNotify({ tone: "good", title: "Place a settlement", hint: "Tap a highlighted spot.", durationMs: 3800 });
      return;
    }

    if (expected === "PLACE_ROAD" && myTurnNow) {
      showNotify({ tone: "good", title: "Place a road", hint: "Tap a highlighted edge.", durationMs: 3800 });
      return;
    }

    if (expected === "DEV_ROAD_BUILDING_PLACE_ROAD" && myTurnNow) {
      showNotify({ tone: "good", title: "Road Building", hint: "Tap a highlighted edge.", durationMs: 3800 });
      return;
    }

    return;
  }

  if (kind === "trade_open") {
    const fromPlayerId = typeof data.fromPlayerId === "string" ? data.fromPlayerId : null;
    const to = data.to === "all" ? "all" : typeof data.to === "string" ? data.to : null;
    if (!fromPlayerId || fromPlayerId === playerId) return;
    if (to !== "all" && to !== playerId) return;
    playSfx("trade", { gain: 0.55 });
    showNotify({ tone: "info", title: "Trade offer", hint: `From ${nameFor(fromPlayerId)}. Scroll to Trade to respond.`, durationMs: 5200 });
    return;
  }

  if (kind === "trade_accepted") {
    const fromPlayerId = typeof data.fromPlayerId === "string" ? data.fromPlayerId : null;
    const acceptedByPlayerId = typeof data.acceptedByPlayerId === "string" ? data.acceptedByPlayerId : null;
    if (!fromPlayerId || !acceptedByPlayerId) return;
    if (fromPlayerId !== playerId && acceptedByPlayerId !== playerId) return;

    const giveText = renderResourceCountsText(data.give);
    const wantText = renderResourceCountsText(data.want);
    playSfx("trade", { gain: 0.75 });

    if (fromPlayerId === playerId) {
      showNotify({
        tone: "good",
        title: "Trade accepted",
        hint: `Accepted by ${nameFor(acceptedByPlayerId)}. You give ${giveText}. You get ${wantText}.`,
        durationMs: 5200
      });
      return;
    }

    showNotify({
      tone: "good",
      title: "Trade complete",
      hint: `Traded with ${nameFor(fromPlayerId)}. You give ${wantText}. You get ${giveText}.`,
      durationMs: 5200
    });
    return;
  }

  if (kind === "trade_rejected") {
    const fromPlayerId = typeof data.fromPlayerId === "string" ? data.fromPlayerId : null;
    const rejectedBy = Array.isArray(data.rejectedByPlayerIds) ? data.rejectedByPlayerIds : [];
    if (!fromPlayerId) return;
    const relevant = fromPlayerId === playerId || rejectedBy.includes(playerId);
    if (!relevant) return;

    const giveText = renderResourceCountsText(data.give);
    const wantText = renderResourceCountsText(data.want);
    const fromName = nameFor(fromPlayerId);

    let hint = "Trade rejected.";
    if (fromPlayerId === playerId) {
      const to = data.to === "all" ? "all" : typeof data.to === "string" ? data.to : null;
      const toName = to === "all" ? "Everyone" : nameFor(to);
      hint = `${toName} rejected your offer. Offer: ${giveText} for ${wantText}.`;
    } else if (rejectedBy.includes(playerId)) {
      hint = `You rejected ${fromName}'s offer.`;
    }

    showNotify({ tone: "warn", title: "Trade rejected", hint, durationMs: 4200 });
    return;
  }

  if (kind === "event_drawn") {
    const eventName = typeof data.eventName === "string" ? data.eventName : "Event";
    const eventShortText = typeof data.eventShortText === "string" ? data.eventShortText : "";
    playSfx("trade", { gain: 0.6 });
    showNotify({
      tone: "good",
      title: eventName,
      hint: eventShortText,
      durationMs: 4800
    });
    return;
  }

  if (kind === "event_ended") {
    const eventName = typeof data.eventName === "string" ? data.eventName : "Event";
    showNotify({
      tone: "info",
      title: `${eventName} ended`,
      hint: "",
      durationMs: 2400
    });
    return;
  }
}

function maybeNotify(prevRoom, room) {
  const moments = detectMoments(prevRoom, room);
  if (!moments.length) return;
  momentQueue.enqueue(moments);
}

function renderResourceBadges(counts, { prefix = "+" } = {}) {
  if (!counts || typeof counts !== "object") return "";
  const parts = [];
  for (const r of RESOURCE_TYPES) {
    const n = parseNonNegativeInt(counts[r] ?? 0);
    if (n <= 0) continue;
    parts.push(`<span class="badge res-${escapeHtml(r)}">${escapeHtml(prefix)}${escapeHtml(n)} ${escapeHtml(r)}</span>`);
  }
  return parts.join("");
}

function renderResourceCountsText(counts) {
  if (!counts || typeof counts !== "object") return "";
  const parts = [];
  for (const r of RESOURCE_TYPES) {
    const n = parseNonNegativeInt(counts[r] ?? 0);
    if (n <= 0) continue;
    parts.push(`${n} ${r}`);
  }
  return parts.join(", ");
}

function resourceCountsKey(counts) {
  const obj = counts && typeof counts === "object" ? counts : {};
  return RESOURCE_TYPES.map((r) => parseNonNegativeInt(obj[r] ?? 0)).join(",");
}

function playerRow(p) {
  const readyTag = p.ready ? `<span class="tag good">Ready</span>` : `<span class="tag warn">Not ready</span>`;
  const hostTag = p.isHost ? `<span class="tag">Host</span>` : "";
  const connTag = p.connected ? `<span class="tag good">Online</span>` : `<span class="tag">Offline</span>`;
  return `
    <div class="player">
      <div class="name">
        <span class="dot" style="background:${p.color};"></span>
        <div>${escapeHtml(p.name)}</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        ${hostTag}
        ${connTag}
        ${readyTag}
      </div>
    </div>
  `;
}

// =============================================================================
// First-Join Tutorial + Tip Carousel
// =============================================================================

/**
 * Check if this is the user's first join this session.
 * Uses sessionStorage so it only shows once per browser session.
 */
function hasShownFirstJoinTutorial() {
  try {
    return sessionStorage.getItem(FIRST_JOIN_TUTORIAL_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Mark the first-join tutorial as shown for this session.
 */
function markFirstJoinTutorialShown() {
  firstJoinTutorialShown = true;
  try {
    sessionStorage.setItem(FIRST_JOIN_TUTORIAL_KEY, "1");
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Show the first-join tutorial overlay.
 * A quick "2-tap tutorial" for pan/zoom on the board.
 */
function showFirstJoinTutorial() {
  if (firstJoinTutorialShown || hasShownFirstJoinTutorial()) return;

  // Create tutorial overlay
  const overlay = document.createElement("div");
  overlay.className = "tutorialOverlay";
  overlay.innerHTML = `
    <div class="tutorialCard">
      <h3>Quick Tips</h3>
      <div class="tutorialStep">
        <span class="tutorialIcon">1</span>
        <span>Drag to pan the board</span>
      </div>
      <div class="tutorialStep">
        <span class="tutorialIcon">2</span>
        <span>Pinch to zoom in/out</span>
      </div>
      <button class="btn primary tutorialDismiss">Got it!</button>
    </div>
  `;

  // Add styles if not already present
  if (!document.getElementById("tutorialStyles")) {
    const style = document.createElement("style");
    style.id = "tutorialStyles";
    style.textContent = `
      .tutorialOverlay {
        position: fixed;
        inset: 0;
        z-index: 6000;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: tutorialFadeIn 0.3s ease-out;
      }
      @keyframes tutorialFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .tutorialCard {
        background: var(--card-bg, rgba(20, 30, 50, 0.95));
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 16px;
        padding: 24px;
        max-width: 300px;
        text-align: center;
      }
      .tutorialCard h3 {
        margin: 0 0 16px 0;
        font-size: 20px;
        color: var(--accent, #4cc9f0);
      }
      .tutorialStep {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 0;
        text-align: left;
      }
      .tutorialIcon {
        width: 28px;
        height: 28px;
        background: var(--accent, #4cc9f0);
        color: #fff;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        flex-shrink: 0;
      }
      .tutorialDismiss {
        margin-top: 16px;
        width: 100%;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(overlay);

  const dismissBtn = overlay.querySelector(".tutorialDismiss");
  const dismiss = () => {
    markFirstJoinTutorialShown();
    overlay.remove();
  };
  dismissBtn?.addEventListener("click", dismiss);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) dismiss();
  });
}

/**
 * Initialize tip carousel for lobby view.
 * Shows contextual tips that rotate every few seconds.
 * @param {string} context - The current context (lobby, setup, etc.)
 */
function initLobbyTipCarousel(context = "lobby") {
  stopLobbyTipCarousel();
  if (!elTipsCard) return;

  lobbyTips = getTipsForContext(context, { limit: 6, shuffle: true });
  if (lobbyTips.length === 0) {
    elTipsCard.innerHTML = "";
    return;
  }

  lobbyTipIndex = 0;
  renderLobbyTip();
  startLobbyTipCarousel();
}

/**
 * Render the current lobby tip.
 */
function renderLobbyTip() {
  if (!elTipsCard || lobbyTips.length === 0) return;
  const tip = lobbyTips[lobbyTipIndex];
  if (!tip) return;

  elTipsCard.innerHTML = `
    <h2>Tips</h2>
    <div class="tipContent" id="tipContent">
      <div class="tipText">${escapeHtml(tip.text)}</div>
      <div class="tipDots">
        ${lobbyTips.map((_, i) => `<span class="tipDot${i === lobbyTipIndex ? " active" : ""}"></span>`).join("")}
      </div>
    </div>
  `;

  // Add tip carousel styles if not present
  if (!document.getElementById("tipCarouselStyles")) {
    const style = document.createElement("style");
    style.id = "tipCarouselStyles";
    style.textContent = `
      .tipContent {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .tipText {
        color: rgba(255, 255, 255, 0.8);
        font-size: 15px;
        line-height: 1.5;
        min-height: 44px;
        transition: opacity 0.3s ease-out;
      }
      .tipText.fading {
        opacity: 0;
      }
      .tipDots {
        display: flex;
        gap: 6px;
        justify-content: center;
      }
      .tipDot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.3);
        transition: background 0.2s ease-out;
      }
      .tipDot.active {
        background: var(--accent, #4cc9f0);
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Start the lobby tip carousel rotation.
 */
function startLobbyTipCarousel() {
  stopLobbyTipCarousel();
  if (lobbyTips.length <= 1) return;

  lobbyTipTimer = setInterval(() => {
    const tipText = document.querySelector(".tipText");
    if (!tipText) return;

    // Fade out
    tipText.classList.add("fading");

    setTimeout(() => {
      // Change tip
      lobbyTipIndex = (lobbyTipIndex + 1) % lobbyTips.length;

      // Update text and dots
      tipText.textContent = lobbyTips[lobbyTipIndex].text;
      tipText.classList.remove("fading");

      // Update dots
      const dots = document.querySelectorAll(".tipDot");
      dots.forEach((dot, i) => {
        dot.classList.toggle("active", i === lobbyTipIndex);
      });
    }, 300);
  }, LOBBY_TIP_INTERVAL_MS);
}

/**
 * Stop the lobby tip carousel.
 */
function stopLobbyTipCarousel() {
  if (lobbyTipTimer) {
    clearInterval(lobbyTipTimer);
    lobbyTipTimer = null;
  }
}

function setView(view) {
  if (document.body) document.body.dataset.view = view;
  elJoinPanel.style.display = view === "join" ? "" : "none";
  elLobbyPanel.style.display = view === "lobby" ? "" : "none";
  elGamePanel.style.display = view === "game" ? "" : "none";
  if (elTipsCard) elTipsCard.style.display = view === "game" ? "none" : "";

  // Manage tip carousel based on view
  if (view === "lobby") {
    initLobbyTipCarousel("lobby");
  } else if (view === "game") {
    stopLobbyTipCarousel();
  } else if (view === "join") {
    // Show join tips when entering join view
    initLobbyTipCarousel("lobby");
  }

  if (view !== "game") {
    setBoardFullscreen(false);
    clearNotify();
    closeHelp();
  }
}

function setRoomStateBanner({ title = "", hint = "", tone = "info", show = true } = {}) {
  if (!elRoomStateBanner || !elRoomStateTitle || !elRoomStateHint) return;
  if (!show) {
    elRoomStateBanner.style.display = "none";
    elRoomStateTitle.textContent = "";
    elRoomStateHint.textContent = "";
    return;
  }

  elRoomStateBanner.style.display = "";
  setText(elRoomStateTitle, title || "");
  setText(elRoomStateHint, hint || "");
  elRoomStateHint.style.display = hint ? "" : "none";

  elRoomStateBanner.classList.remove("good", "warn", "bad", "info");
  elRoomStateBanner.classList.add(tone || "info");
}

function bannerForRoom(room, { context = "connected" } = {}) {
  if (!room) return null;
  const joinCtx = context === "join";
  const status = room.status || "";
  const phase = room.game?.phase || "";

  if (status === "lobby") {
    return joinCtx
      ? { tone: "good", title: "Lobby open", hint: "Enter your name and tap Join." }
      : { tone: "info", title: "Lobby", hint: "Tap Ready when you’re set." };
  }

  if (status === "in_game") {
    if (phase === "game_over") {
      return joinCtx
        ? { tone: "info", title: "Game over", hint: "Ask the host for a new room." }
        : { tone: "good", title: "Game over", hint: "Winner on TV." };
    }
    return joinCtx
      ? { tone: "warn", title: "Game in progress", hint: "New players can’t join mid-game." }
      : { tone: "info", title: "In game", hint: "" };
  }

  return { tone: "info", title: "Room", hint: "" };
}

function renderRoomStateBanner(room, { context = "connected" } = {}) {
  const info = bannerForRoom(room, { context });
  if (!info) return setRoomStateBanner({ show: false });
  const hide =
    context === "connected" && room?.status === "in_game" && info.tone === "info" && !info.hint && String(info.title || "").toLowerCase() === "in game";
  setRoomStateBanner({ ...info, show: !hide });
}

function cancelRoomPreview() {
  roomPreviewSeq += 1;
  if (roomPreviewTimer) clearTimeout(roomPreviewTimer);
  roomPreviewTimer = null;
}

function scheduleRoomPreview(input) {
  if (!elRoomStateBanner) return;
  if (lastRoomState) return;

  cancelRoomPreview();
  const code = sanitizeRoomCode(input);
  if (!code || code.length < 4) {
    setRoomStateBanner({ show: false });
    return;
  }

  const seq = ++roomPreviewSeq;
  roomPreviewTimer = setTimeout(() => fetchRoomPreview(code, seq), 240);
}

async function fetchRoomPreview(code, seq) {
  if (seq !== roomPreviewSeq) return;
  setRoomStateBanner({ tone: "info", title: "Checking room…", hint: "", show: true });
  try {
    const payload = await api(`/api/rooms/${encodeURIComponent(code)}`);
    if (seq !== roomPreviewSeq) return;
    renderRoomStateBanner(payload.room, { context: "join" });
  } catch (e) {
    if (seq !== roomPreviewSeq) return;
    if (errorCode(e) === "HTTP_404") {
      setRoomStateBanner({ tone: "bad", title: "Room not found", hint: "Check the code on the TV.", show: true });
      return;
    }
    setRoomStateBanner({ tone: "bad", title: "Can’t load room", hint: humanizeErrorMessage(e), show: true });
  }
}

function persistIdentity() {
  if (roomCode) localStorage.setItem("catan.roomCode", roomCode);
  if (playerId) localStorage.setItem("catan.playerId", playerId);
  if (playerName) localStorage.setItem("catan.playerName", playerName);
}

function loadIdentity() {
  const url = new URL(location.href);
  const qRoom = url.searchParams.get("room");
  const savedRoom = localStorage.getItem("catan.roomCode");
  const savedPlayer = localStorage.getItem("catan.playerId");
  const savedName = localStorage.getItem("catan.playerName");
  roomCode = sanitizeRoomCode(qRoom || savedRoom || "");
  playerId = savedPlayer || null;
  playerName = (savedName || "").trim() || null;
  if (qRoom) {
    localStorage.setItem("catan.roomCode", roomCode);
  }
  if (roomCode) elRoomInput.value = roomCode;
  if (playerName) elNameInput.value = playerName;
}

async function join({ name, code }) {
  if (es) {
    es.close();
    es = null;
  }
  cancelRoomPreview();
  await ensurePerf();
  const prevRoomCode = roomCode;
  const rejoin = !!playerId;
  elStatus.textContent = rejoin ? "Rejoining…" : "Joining…";
  setConnectionOverlay(true, { title: rejoin ? "Rejoining…" : "Joining…", hint: rejoin ? "Hold tight — your seat is saved." : "" });
  playerName = String(name || "").trim();
  let payload;
  try {
    payload = await api(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: { playerName: name, playerId }
    });
  } catch (e) {
    setConnectionOverlay(false);
    elStatus.textContent = "Disconnected";
    throw e;
  }
  roomCode = payload.room.roomCode;
  playerId = payload.playerId;
  isHost = !!payload.isHost;
  lastRoomState = payload.room;
  lastYouState = payload.you;
  const rev = Number(payload?.room?.revision);
  lastRevisionSeen = Number.isFinite(rev) ? rev : null;
  persistIdentity();
  setConnectionOverlay(false);
  if (prevRoomCode && prevRoomCode !== roomCode) {
    lastRenderedRoomState = null;
    lastPlayersRenderKey = null;
    lastLogRenderKey = null;
    lastBoardRenderKey = null;
    lastTradeToOptionsRenderKey = null;
    lastTradeOffersRenderKey = null;
    lastSentTradeOffer = null;
    lastStealTargetsRenderKey = null;
    momentQueue.clear();
    clearNotify();
  }
  if (debugPerfEnabled && markRenderStart && markRenderEnd) {
    markRenderStart("phone.render");
    render(lastRoomState, lastYouState);
    markRenderEnd("phone.render");
  } else {
    render(lastRoomState, lastYouState);
  }
  connectStream();

  // Show first-join tutorial for new players (only once per session)
  if (!rejoin && !hasShownFirstJoinTutorial()) {
    // Slight delay to let the UI settle before showing tutorial
    setTimeout(() => {
      showFirstJoinTutorial();
    }, 800);
  }
}

function clearSession({ keepName = true } = {}) {
  localStorage.removeItem("catan.roomCode");
  localStorage.removeItem("catan.playerId");
  if (!keepName) localStorage.removeItem("catan.playerName");
  roomCode = null;
  playerId = null;
  isHost = false;
  mode = null;
  lastRevisionSeen = null;
  lastThemeId = null;
  document?.documentElement?.removeAttribute("data-theme");
  lastRoomState = null;
  lastYouState = null;
  lastRenderedRoomState = null;
  lastPlayersRenderKey = null;
  lastLogRenderKey = null;
  lastBoardRenderKey = null;
  lastTradeToOptionsRenderKey = null;
  lastTradeOffersRenderKey = null;
  lastSentTradeOffer = null;
  lastStealTargetsRenderKey = null;
  emoteCooldownUntil = 0;
  momentQueue.clear();
  renderScheduler.cancel();
  cancelRoomPreview();
  setRoomStateBanner({ show: false });
  clearNotify();
  if (es) {
    es.close();
    es = null;
  }
}

function connectStream() {
  if (es) es.close();
  elStatus.textContent = "Connecting…";
  setConnectionOverlay(false);
  es = new EventSource(
    `/api/rooms/${encodeURIComponent(roomCode)}/stream?role=phone&playerId=${encodeURIComponent(playerId)}`
  );

  es.addEventListener("state", (ev) => {
    const raw = ev.data;
    const payload = JSON.parse(raw);
    const rev = Number(payload?.room?.revision);
    if (Number.isFinite(rev)) {
      if (Number.isFinite(lastRevisionSeen) && rev <= lastRevisionSeen) return;
      lastRevisionSeen = rev;
    } else {
      lastRevisionSeen = null;
    }
    const prev = lastRoomState;
    lastRoomState = payload.room;
    lastYouState = payload.you;
    if (debugPerfEnabled && markPayloadSize && measureUtf8Bytes) markPayloadSize("phone.state", measureUtf8Bytes(raw));
    if (prev && payload.room?.roomCode !== prev.roomCode) {
      lastRenderedRoomState = null;
      lastPlayersRenderKey = null;
      lastLogRenderKey = null;
      lastBoardRenderKey = null;
      lastTradeToOptionsRenderKey = null;
      lastTradeOffersRenderKey = null;
      lastStealTargetsRenderKey = null;
      momentQueue.clear();
      clearNotify();
    }
    elStatus.textContent = "Live";
    setConnectionOverlay(false);
    renderScheduler.schedule();
  });

  es.onerror = () => {
    elStatus.textContent = "Rejoining…";
    setConnectionOverlay(true, { title: "Rejoining…", hint: "Hold tight — your seat is saved." });
    scheduleReconnectRoomCheck();
  };
}

function scheduleReconnectRoomCheck() {
  if (!roomCode) return;
  if (reconnectCheckTimer) return;
  const code = roomCode;
  reconnectCheckTimer = setTimeout(async () => {
    reconnectCheckTimer = null;
    try {
      await api(`/api/rooms/${encodeURIComponent(code)}`);
    } catch (e) {
      if (errorCode(e) === "HTTP_404" && code === roomCode) {
        clearSession({ keepName: true });
        elRoomInput.value = "";
        elJoinErr.textContent = "Room not found (server restarted). Enter the new room code from the TV.";
        elStatus.textContent = "Disconnected";
        setConnectionOverlay(false);
        elPanelTitle.textContent = "Join";
        setView("join");
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

function render(room, you) {
  const prevRoom = lastRenderedRoomState;
  lastRenderedRoomState = room;
  lastRoomState = room;
  lastYouState = you;
  applyThemeFromRoom(room);
  const me = room.players.find((p) => p.playerId === playerId) || null;
  isHost = !!me?.isHost;

  if (prevRoom) maybeNotify(prevRoom, room);

  cancelRoomPreview();
  renderRoomStateBanner(room, { context: "connected" });

  setText(elRoomLabel, room.roomCode);
  const scenarioId = typeof room?.settings?.scenarioId === "string" ? room.settings.scenarioId : "";
  const scenarios = Array.isArray(room?.scenarios) ? room.scenarios : [];
  const display = scenarioDisplay(scenarios, scenarioId, { fallbackName: scenarioId || "—" });
  if (elScenarioName) setText(elScenarioName, display.name);
  if (elScenarioSummary) {
    setText(elScenarioSummary, display.rulesSummary);
    elScenarioSummary.style.display = display.rulesSummary ? "" : "none";
  }
  document.body.dataset.playerCountBucket = room.players.length >= 5 ? "5-6" : "3-4";
  const nextPlayersKey = alwaysRenderEnabled ? null : phonePlayersRenderKey(room);
  if (alwaysRenderEnabled || nextPlayersKey !== lastPlayersRenderKey) {
    elPlayers.innerHTML = room.players.map(playerRow).join("");
    lastPlayersRenderKey = nextPlayersKey;
  }
  elHostTag.style.display = isHost ? "" : "none";

  if (room.status === "lobby") {
    elPanelTitle.textContent = "Lobby";
    setView("lobby");

    const ready = !!me?.ready;
    elReadyBtn.textContent = ready ? "Ready" : "Not ready";
    elReadyBtn.classList.toggle("primary", ready);
    elReadyBtn.setAttribute("aria-pressed", ready ? "true" : "false");

    // Host controls
    elHostControls.style.display = isHost ? "" : "none";
    if (isHost) {
      renderPresetSelect(room);
      renderThemeSelect(room);
      renderBoardSeedControls(room);
      renderGameModeSelect(room);
      renderMaxPlayersSelect(room);
      renderHouseRulesControls(room);
      elStartBtn.disabled = !canStart(room);
    }
    return;
  }

  if (room.status === "in_game" && room.game) {
    const isGameOver = room.game.phase === "game_over";
    elPanelTitle.textContent = isGameOver ? "Game Over" : "Game";
    setView("game");

    renderVpAndWinner(room, me);
    renderEventBanner(room);
    if (isGameOver) {
      setPostGameUiVisible(true);
      renderPostGame(room, me);
      // Show feedback modal after a brief delay to let the user see game results
      if (!hasFeedbackBeenSubmitted() && !feedbackModalShown) {
        setTimeout(() => showFeedbackModal(), 2500);
      }
      return;
    }
    setPostGameUiVisible(false);

    const nextLogKey = alwaysRenderEnabled ? null : phoneLogRenderKey(room.game.log, room.players);
    if (alwaysRenderEnabled || nextLogKey !== lastLogRenderKey) {
      renderLog(elLog, room.game.log, { players: room.players });
      lastLogRenderKey = nextLogKey;
    }

    renderPrimaryAction(room, me, you);
    renderEmoteStrip(room);
    if (shouldShowBoardTab(room, me) && activeTab !== "board") setActiveTab("board");
    updateTabUi(room, me);
    renderBoardUi(room, prevRoom, me);
    renderMainActions(room, me);
    renderRobberFlow(room, me, you);
    renderTrade(room, me, you);
    renderBankTrade(room, me, you);
    renderDevCards(room, me, you);
    renderResources(you);
    renderActionHint(room, me, you);
    if (isHelpOpen()) renderHelp(room, you);

    // Check for first-time player hint triggers
    checkHintTriggers(room, me, you);
    return;
  }

  elPanelTitle.textContent = "Join";
  setView("join");
}

function stableRoomPart(v) {
  return v == null ? "" : String(v);
}

function playerDisplayKey(players) {
  if (!Array.isArray(players)) return "";
  return players.map((p) => `${stableRoomPart(p?.playerId)}:${stableRoomPart(p?.name)}:${stableRoomPart(p?.color)}`).join(";");
}

function phonePlayersRenderKey(room) {
  const players = Array.isArray(room?.players) ? room.players : [];
  const rows = players
    .map((p) =>
      [
        stableRoomPart(p?.playerId),
        stableRoomPart(p?.name),
        stableRoomPart(p?.color),
        p?.connected ? "1" : "0",
        p?.ready ? "1" : "0",
        p?.isHost ? "1" : "0"
      ].join(",")
    )
    .join(";");
  return [`room:${stableRoomPart(room?.roomCode)}`, `status:${stableRoomPart(room?.status)}`, rows].join("|");
}

function phoneLogTailKey(entries, { tail = 4 } = {}) {
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

function phoneLogRenderKey(entries, players) {
  const tail = phoneLogTailKey(entries);
  const roster = playerDisplayKey(players);
  return `${tail}|players:${roster}`;
}

function phoneBoardStaticKey(board) {
  const b = board && typeof board === "object" ? board : null;
  if (!b) return "board:none";
  const layout = stableRoomPart(b.layout);
  const hexSig = Array.isArray(b.hexes)
    ? b.hexes.map((h) => `${stableRoomPart(h?.id)}:${stableRoomPart(h?.resource)}:${stableRoomPart(h?.token)}`).join(",")
    : "";
  const portSig = Array.isArray(b.ports)
    ? b.ports.map((p) => `${stableRoomPart(p?.id)}:${stableRoomPart(p?.kind)}:${stableRoomPart(p?.edgeId)}`).join(",")
    : "";
  return `layout:${layout}|hexes:${hexSig}|ports:${portSig}`;
}

function phoneStructuresKey(structures) {
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

function phonePlayerColorsKey(players) {
  if (!Array.isArray(players)) return "";
  return players.map((p) => `${stableRoomPart(p?.playerId)}:${stableRoomPart(p?.color)}`).join(";");
}

function phoneBoardRenderKey({
  roomCode = null,
  board = null,
  structures = null,
  robberHexId = null,
  highlightMode = "",
  selectableVertexIds = [],
  selectableEdgeIds = [],
  selectableHexIds = [],
  players = []
} = {}) {
  const s = getSettings();
  const parts = [
    `room:${stableRoomPart(roomCode)}`,
    phoneBoardStaticKey(board),
    phoneStructuresKey(structures),
    `robber:${stableRoomPart(robberHexId)}`,
    `hl:${stableRoomPart(highlightMode)}`,
    `v:${Array.isArray(selectableVertexIds) ? selectableVertexIds.join(",") : ""}`,
    `e:${Array.isArray(selectableEdgeIds) ? selectableEdgeIds.join(",") : ""}`,
    `h:${Array.isArray(selectableHexIds) ? selectableHexIds.join(",") : ""}`,
    `colors:${phonePlayerColorsKey(players)}`,
    `br:${stableRoomPart(s?.boardRenderer)}`,
    `rq:${stableRoomPart(s?.rendererQuality)}`,
    `lpm:${s?.lowPowerMode ? "1" : "0"}`
  ];
  return parts.join("|");
}

function renderPresetSelect(room) {
  const presets = room.presets || [];
  const html = presets
    .map((p) => `<option value="${escapeHtml(p.id)}" ${p.id === room.presetId ? "selected" : ""}>${escapeHtml(p.name)}</option>`)
    .join("");
  elPresetSelect.innerHTML = html;
}

function renderThemeSelect(room) {
  if (!elThemeSelect) return;
  const themes = room.themes || [];
  const html = themes
    .map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === room.themeId ? "selected" : ""}>${escapeHtml(t.name)}</option>`)
    .join("");
  elThemeSelect.innerHTML = html;
}

function renderBoardSeedControls(room) {
  if (!elBoardSeedField || !elBoardSeedInput) return;
  const enabled = room?.presetId === "random-balanced";
  elBoardSeedField.style.display = enabled ? "" : "none";
  if (!enabled) {
    if (document.activeElement !== elBoardSeedInput) elBoardSeedInput.value = "";
    return;
  }

  const nextSeed = typeof room?.boardSeed === "string" ? room.boardSeed : "";
  if (document.activeElement === elBoardSeedInput) return;
  if (elBoardSeedInput.value !== nextSeed) elBoardSeedInput.value = nextSeed;
}

function renderGameModeSelect(room) {
  if (!elGameModeSelect) return;
  const mode = room?.gameMode === "quick" ? "quick" : "classic";
  elGameModeSelect.value = mode;
}

function renderMaxPlayersSelect(room) {
  if (!elMaxPlayersSelect) return;
  const maxPlayers = Number(room?.maxPlayers);
  elMaxPlayersSelect.value = String(Number.isFinite(maxPlayers) ? Math.max(3, Math.min(6, Math.floor(maxPlayers))) : 4);
}

function setHostAdvancedOpen(nextOpen) {
  const next = !!nextOpen;
  const changed = next !== hostAdvancedOpen;
  hostAdvancedOpen = next;
  if (changed) {
    try {
      localStorage.setItem(HOST_ADVANCED_OPEN_KEY, hostAdvancedOpen ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }
  if (elAdvancedPanel) elAdvancedPanel.style.display = hostAdvancedOpen ? "" : "none";
  if (elAdvancedBtn) {
    elAdvancedBtn.setAttribute("aria-expanded", hostAdvancedOpen ? "true" : "false");
    elAdvancedBtn.textContent = hostAdvancedOpen ? "Advanced ▾" : "Advanced ▸";
  }
}

function renderHostPinControls(room) {
  const enabled = !!room?.hostPinEnabled;
  if (!enabled) hostPinCache = null;

  if (elHostPinState) elHostPinState.textContent = enabled ? "PIN: On" : "PIN: Off";
  if (elHostPinSetBtn) elHostPinSetBtn.textContent = enabled ? "Change PIN" : "Set PIN";
  if (elHostPinClearBtn) elHostPinClearBtn.style.display = enabled ? "" : "none";

  const nextPin = normalizeHostPin(elHostPinInput?.value);
  if (elHostPinSetBtn) elHostPinSetBtn.disabled = !nextPin;
  if (elHostPinClearBtn) elHostPinClearBtn.disabled = !enabled;
}

function renderHouseRulesControls(room) {
  const gameMode = room?.gameMode === "quick" ? "quick" : "classic";
  const defaultVp = gameMode === "quick" ? 8 : 10;

  const vp = Number(room?.settings?.houseRules?.victoryPointsToWin ?? NaN);
  const customVp = Number.isFinite(vp) ? Math.floor(vp) : null;
  if (elVpTargetSelect) elVpTargetSelect.value = customVp != null ? String(customVp) : "";
  if (elVpTargetHint) {
    elVpTargetHint.textContent = customVp != null ? `Custom: ${customVp} VP (default ${defaultVp})` : `Default: ${defaultVp} VP`;
  }

  const emotesEnabled = room?.settings?.houseRules?.emotesEnabled !== false;
  if (elEmotesToggleBtn) {
    elEmotesToggleBtn.textContent = emotesEnabled ? "On" : "Off";
    elEmotesToggleBtn.setAttribute("aria-pressed", emotesEnabled ? "true" : "false");
  }

  renderHostPinControls(room);
  setHostAdvancedOpen(hostAdvancedOpen);
}

function canStart(room) {
  if (!isHost) return false;
  const count = room.players.length;
  const maxPlayers = Number(room?.maxPlayers);
  const limit = Number.isFinite(maxPlayers) ? Math.max(3, Math.min(6, Math.floor(maxPlayers))) : 4;
  if (count < 3 || count > limit) return false;
  return room.players.every((p) => p.ready);
}

function renderVpAndWinner(room, me) {
  if (!elVpLabel || !elWinnerTag) return;
  const game = room?.game || null;
  if (!game || !me?.playerId) {
    setText(elVpLabel, "—");
    elWinnerTag.style.display = "none";
    return;
  }

  const target = parseNonNegativeInt(game.victoryPointsToWin ?? 0);
  const points = parseNonNegativeInt(game.pointsByPlayerId?.[me.playerId] ?? 0);
  setText(elVpLabel, target > 0 ? `${points}/${target}` : String(points));

  const winnerId = game.winnerPlayerId || null;
  if (!winnerId) {
    elWinnerTag.style.display = "none";
    elWinnerTag.textContent = "";
    return;
  }

  const winner = (room.players || []).find((p) => p.playerId === winnerId) || null;
  const name = winner?.name || "Player";
  elWinnerTag.style.display = "";
  elWinnerTag.textContent = winnerId === me.playerId ? "You win!" : `Winner: ${name}`;
}

function renderEventBanner(room) {
  if (!elEventBanner) return;
  const currentEvent = room?.game?.currentEvent || null;
  if (!currentEvent || !currentEvent.id) {
    elEventBanner.style.display = "none";
    return;
  }
  elEventBanner.style.display = "";
  if (elEventBannerTitle) elEventBannerTitle.textContent = currentEvent.name || "Event";
  if (elEventBannerHint) elEventBannerHint.textContent = currentEvent.shortText || currentEvent.description || "";
}

function setPostGameUiVisible(visible) {
  const show = !!visible;
  if (elPostGameCard) elPostGameCard.style.display = show ? "" : "none";
  if (elResourcesBarCard) elResourcesBarCard.style.display = show ? "none" : "";
  if (elPrimaryActionCard) elPrimaryActionCard.style.display = show ? "none" : "";
  if (elMainActions && show) elMainActions.style.display = "none";
  if (elRobberCard && show) elRobberCard.style.display = "none";
  if (elPhoneTabs) elPhoneTabs.style.display = show ? "none" : "";
  if (show) {
    for (const panel of tabPanels) panel.hidden = true;
  } else {
    setActiveTab(activeTab);
    if (elPostGameErr) elPostGameErr.textContent = "";
  }
}

function renderPostGame(room, me) {
  if (!elPostGameCard || !room?.game) return;
  const game = room.game;

  const winnerId = game.winnerPlayerId || null;
  const winner = winnerId ? (room.players || []).find((p) => p.playerId === winnerId) : null;
  const winnerName = winner?.name || "Player";
  if (elPostGameWinner) {
    elPostGameWinner.textContent = winnerId && winnerId === me?.playerId ? "You win!" : `Winner: ${winnerName}`;
  }

  const breakdown = computeVpBreakdownByPlayerId(game, (room.players || []).map((p) => p.playerId));
  const playersSorted = [...(room.players || [])].sort((a, b) => {
    const at = parseNonNegativeInt(breakdown?.[a.playerId]?.total ?? 0);
    const bt = parseNonNegativeInt(breakdown?.[b.playerId]?.total ?? 0);
    return bt - at;
  });

  if (elPostGameStats) {
    elPostGameStats.innerHTML =
      playersSorted
        .map((p) => {
          const b = breakdown?.[p.playerId] || { settlementCount: 0, cityCount: 0, longestRoad: 0, largestArmy: 0, hidden: 0, total: 0 };
          const tags = [
            `S ${parseNonNegativeInt(b.settlementCount)}`,
            `C ${parseNonNegativeInt(b.cityCount)}`,
            b.longestRoad ? "LR +2" : "LR +0",
            b.largestArmy ? "LA +2" : "LA +0",
            `H +${parseNonNegativeInt(b.hidden)}`
          ].join(" · ");
          const total = parseNonNegativeInt(b.total);
          const winnerTag = p.playerId === winnerId ? `<span class="tag good">Winner</span>` : "";
          return `
            <div class="player compact">
              <div class="name" style="display:flex; flex-direction:column; gap:2px;">
                <div style="display:flex; gap:8px; align-items:center;">
                  <span class="dot" style="background:${escapeHtml(p.color)};"></span>
                  <div>${escapeHtml(p.name)}</div>
                  ${winnerTag}
                </div>
                <div class="muted" style="margin-left:18px;">${escapeHtml(tags)}</div>
              </div>
              <div style="display:flex; gap:8px; align-items:center;">
                <span class="tag">${escapeHtml(total)} VP</span>
              </div>
            </div>
          `;
        })
        .join("") || `<div class="muted">No stats.</div>`;
  }

  if (elPostGameHostControls) elPostGameHostControls.style.display = me?.isHost ? "" : "none";
  if (elPostGameWaiting) elPostGameWaiting.style.display = me?.isHost ? "none" : "";
  if (elPostGameRematchBtn) {
    elPostGameRematchBtn.disabled = !me?.isHost || rematchInFlight;
    elPostGameRematchBtn.textContent = rematchInFlight ? "Starting…" : "Play again";
  }
  if (elPostGameErr) {
    const msg = String(elPostGameErr.textContent || "");
    elPostGameErr.style.display = msg.trim() ? "" : "none";
  }
}

function renderPrimaryAction(room, me, you) {
  const myTurn = me?.playerId === room.game.currentPlayerId;
  const expected = room.game.hints?.expected || null;
  elEndTurnBtn.style.display = "none";
  elEndTurnBtn.classList.remove("primary");

  if (room.game.phase === "game_over") {
    elPrimaryBtn.disabled = true;
    elPrimaryBtn.textContent = "Game over";
    return;
  }

  if (expected === "DISCARD_CARDS") {
    const required = parseNonNegativeInt(room.game.hints?.discardRequiredByPlayerId?.[me?.playerId] ?? 0);
    const submitted = !!room.game.hints?.discardSubmittedByPlayerId?.[me?.playerId];
    elPrimaryBtn.disabled = true;
    elPrimaryBtn.textContent = required > 0 && !submitted ? "Discard cards" : "Waiting for discards…";
    return;
  }

  if (expected === "MOVE_ROBBER") {
    elPrimaryBtn.disabled = true;
    elPrimaryBtn.textContent = myTurn ? "Move robber" : "Waiting…";
    return;
  }

  if (expected === "STEAL_CARD") {
    elPrimaryBtn.disabled = true;
    elPrimaryBtn.textContent = myTurn ? "Steal a card" : "Waiting…";
    return;
  }

  if (expected === "DEV_ROAD_BUILDING_PLACE_ROAD") {
    elPrimaryBtn.disabled = true;
    elPrimaryBtn.textContent = myTurn ? "Road Building" : "Waiting…";
    return;
  }

  if (!myTurn) {
    elPrimaryBtn.disabled = true;
    elPrimaryBtn.textContent = "Waiting…";
    return;
  }

  if (expected === "PLACE_SETTLEMENT") {
    elPrimaryBtn.disabled = true;
    elPrimaryBtn.textContent = "Place settlement";
    return;
  }

  if (expected === "PLACE_ROAD") {
    elPrimaryBtn.disabled = true;
    elPrimaryBtn.textContent = "Place road";
    return;
  }

  if (expected === "ROLL_DICE") {
    elPrimaryBtn.disabled = false;
    elPrimaryBtn.textContent = "Roll dice";
    return;
  }

  elPrimaryBtn.disabled = true;
  elPrimaryBtn.textContent = "Main phase";
  if (room.game.phase === "turn" && room.game.subphase === "main") {
    elEndTurnBtn.style.display = "";
    if (room.gameMode === "quick" && myTurn) {
      const game = room.game;
      const hand = you?.hand || {};
      const total = RESOURCE_TYPES.reduce((acc, r) => acc + parseNonNegativeInt(hand?.[r] ?? 0), 0);

      const gateCtx = { game, playerId: me?.playerId || null, you };
      const canBuildRoad = !gateAction(gateCtx, { type: "BUILD_ROAD" }) && legalRoadEdges(game, me.playerId).length > 0;
      const canBuildSettlement = !gateAction(gateCtx, { type: "BUILD_SETTLEMENT" }) && legalSettlementVertices(game, me.playerId).length > 0;
      const canBuildCity = !gateAction(gateCtx, { type: "BUILD_CITY" }) && legalCityVertices(game, me.playerId).length > 0;

      const canBuyDevCard = !gateAction(gateCtx, { type: "BUY_DEV_CARD" });
      const canPlayDevCard =
        !game.devCardPlayedThisTurn &&
        Array.isArray(you?.devCardsInHand) &&
        you.devCardsInHand.some((c) => DEV_CARD_TYPES.includes(c));

      const { ratios } = computeBankTradeRates(game, me?.playerId);
      let canBankTrade = false;
      for (const giveType of RESOURCE_TYPES) {
        const ratio = parseNonNegativeInt(ratios?.[giveType] ?? 4) || 4;
        if (parseNonNegativeInt(hand[giveType] ?? 0) < ratio) continue;
        for (const receiveType of RESOURCE_TYPES) {
          if (receiveType === giveType) continue;
          if (parseNonNegativeInt(game.bank?.[receiveType] ?? 0) > 0) {
            canBankTrade = true;
            break;
          }
        }
        if (canBankTrade) break;
      }

      const canDoSomething = canBuildRoad || canBuildSettlement || canBuildCity || canBuyDevCard || canPlayDevCard || canBankTrade || total > 0;
      elEndTurnBtn.classList.toggle("primary", !canDoSomething);
    }
  }
}

function setSoftDisabled(el, blockCode) {
  if (!el) return;
  el.disabled = false;
  const code = String(blockCode || "").trim();
  if (!code) {
    el.classList.remove("softDisabled");
    el.removeAttribute("aria-disabled");
    delete el.dataset.blockCode;
    return;
  }
  el.classList.add("softDisabled");
  el.setAttribute("aria-disabled", "true");
  el.dataset.blockCode = code;
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

function renderBoardUi(room, prevRoom, me) {
  const myTurn = me?.playerId === room.game.currentPlayerId;
  const hints = room.game.hints || {};
  const expected = hints.expected || null;
  const highlightMode =
    room.gameMode === "quick" && (expected === "PLACE_SETTLEMENT" || expected === "PLACE_ROAD") ? "quick-setup" : "";
  let selectableVertexIds = [];
  let selectableEdgeIds = [];
  let selectableHexIds = [];

  if (myTurn && (expected === "PLACE_SETTLEMENT" || expected === "PLACE_ROAD")) {
    selectableVertexIds = hints.legalVertexIds || [];
    selectableEdgeIds = hints.legalEdgeIds || [];
  } else if (myTurn && expected === "MOVE_ROBBER") {
    selectableHexIds = hints.legalHexIds || [];
  } else if (myTurn && expected === "DEV_ROAD_BUILDING_PLACE_ROAD") {
    selectableEdgeIds = hints.legalEdgeIds || [];
  } else if (myTurn && room.game.phase === "turn" && room.game.subphase === "main" && mode) {
    if (mode === "build_road") selectableEdgeIds = legalRoadEdges(room.game, me.playerId);
    if (mode === "build_settlement") selectableVertexIds = legalSettlementVertices(room.game, me.playerId);
    if (mode === "build_city") selectableVertexIds = legalCityVertices(room.game, me.playerId);
  }

  const nextBoardKey = alwaysRenderEnabled
    ? null
    : phoneBoardRenderKey({
        roomCode: room.roomCode,
        board: room.game.board,
        structures: room.game.structures,
        robberHexId: room.game.robberHexId,
        highlightMode,
        selectableVertexIds,
        selectableEdgeIds,
        selectableHexIds,
        players: room.players
      });
  if (!alwaysRenderEnabled && nextBoardKey === lastBoardRenderKey) {
    applyBoardTransform();
    return;
  }
  lastBoardRenderKey = nextBoardKey;

  const prevStructures = prevRoom?.status === "in_game" ? prevRoom?.game?.structures || null : null;
  const placed = computePlacedStructures(prevStructures, room.game.structures || null);

  renderBoard(elBoard, room.game.board, {
    players: room.players,
    structures: room.game.structures,
    placedVertexIds: placed.placedVertexIds,
    placedEdgeIds: placed.placedEdgeIds,
    selectableVertexIds,
    selectableEdgeIds,
    selectableHexIds,
    robberHexId: room.game.robberHexId,
    highlightMode,
    captureAllVertices: myTurn && selectableVertexIds.length > 0,
    captureAllEdges: myTurn && selectableEdgeIds.length > 0,
    captureAllHexes: myTurn && selectableHexIds.length > 0,
    onIllegalClick: ({ kind }) => {
      const now = Date.now();
      if (now - lastIllegalTapAt < 520) return;
      lastIllegalTapAt = now;

      let hint = "";
      if (kind === "edge") hint = "Tap a highlighted edge.";
      else if (kind === "vertex") hint = "Tap a highlighted spot.";
      else if (kind === "hex") hint = "Tap a highlighted hex.";

      playSfx("ui_bonk", { gain: 0.75 });
      showNotify({ tone: "bad", title: "Not legal there.", hint, durationMs: 1500 });
    },
    onVertexClick: async (vertexId) => {
      if (!myTurn) return;
      const expected = room.game.hints?.expected || null;
      try {
        if (expected === "PLACE_SETTLEMENT") {
          await api(`/api/rooms/${encodeURIComponent(room.roomCode)}/action`, {
            method: "POST",
            body: { playerId, type: "PLACE_SETTLEMENT", vertexId }
          });
          feedbackGood("build", { gain: 0.85 });
          return;
        }
        if (room.game.phase === "turn" && room.game.subphase === "main" && mode === "build_settlement") {
          await api(`/api/rooms/${encodeURIComponent(room.roomCode)}/action`, {
            method: "POST",
            body: { playerId, type: "BUILD_SETTLEMENT", vertexId }
          });
          feedbackGood("build", { gain: 0.85 });
          mode = null;
          return;
        }
        if (room.game.phase === "turn" && room.game.subphase === "main" && mode === "build_city") {
          await api(`/api/rooms/${encodeURIComponent(room.roomCode)}/action`, {
            method: "POST",
            body: { playerId, type: "BUILD_CITY", vertexId }
          });
          feedbackGood("build", { gain: 0.85 });
          mode = null;
        }
      } catch (e) {
        showErrorToast(e);
      }
    },
    onEdgeClick: async (edgeId) => {
      if (!myTurn) return;
      const expected = room.game.hints?.expected || null;
      try {
        if (expected === "PLACE_ROAD") {
          await api(`/api/rooms/${encodeURIComponent(room.roomCode)}/action`, {
            method: "POST",
            body: { playerId, type: "PLACE_ROAD", edgeId }
          });
          feedbackGood("build", { gain: 0.85 });
          return;
        }
        if (expected === "DEV_ROAD_BUILDING_PLACE_ROAD") {
          await api(`/api/rooms/${encodeURIComponent(room.roomCode)}/action`, {
            method: "POST",
            body: { playerId, type: "DEV_ROAD_BUILDING_PLACE_ROAD", edgeId }
          });
          feedbackGood("build", { gain: 0.85 });
          return;
        }
        if (room.game.phase === "turn" && room.game.subphase === "main" && mode === "build_road") {
          await api(`/api/rooms/${encodeURIComponent(room.roomCode)}/action`, {
            method: "POST",
            body: { playerId, type: "BUILD_ROAD", edgeId }
          });
          feedbackGood("build", { gain: 0.85 });
          mode = null;
        }
      } catch (e) {
        showErrorToast(e);
      }
    },
    onHexClick: async (hexId) => {
      if (!myTurn) return;
      const expected = room.game.hints?.expected || null;
      try {
        if (expected === "MOVE_ROBBER") {
          await api(`/api/rooms/${encodeURIComponent(room.roomCode)}/action`, {
            method: "POST",
            body: { playerId, type: "MOVE_ROBBER", hexId }
          });
          feedbackGood("ui_confirm", { gain: 0.8 });
        }
      } catch (e) {
        showErrorToast(e);
      }
    }
  });

  const isSetup = room.game.phase === "setup_round_1" || room.game.phase === "setup_round_2";
  const shouldAutoFocus =
    room.gameMode === "quick" &&
    myTurn &&
    isSetup &&
    (expected === "PLACE_SETTLEMENT" || expected === "PLACE_ROAD") &&
    !mode;

  if (shouldAutoFocus) {
    const focusKey = `${room.roomCode}:${room.game.phase}:${room.game.subphase}:${room.game.currentPlayerId}:${room.game.setup?.placementIndex ?? 0}`;
    if (focusKey !== lastSetupAssistKey) {
      lastSetupAssistKey = focusKey;
      if (expected === "PLACE_SETTLEMENT") {
        resetBoardView();
      } else if (expected === "PLACE_ROAD") {
        focusBoardOnSelection(room.game, { edgeIds: selectableEdgeIds });
      }
    }
  }

  applyBoardTransform();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function applyBoardTransform() {
  const svg = elBoard?.querySelector("svg");
  const canvas = elBoard?.querySelector("canvas");
  const target = svg || canvas;
  if (!target) return;
  target.style.transformOrigin = "0 0";
  target.style.transform = `matrix(${boardView.scale}, 0, 0, ${boardView.scale}, ${boardView.tx}, ${boardView.ty})`;
}

function resetBoardView() {
  boardView.scale = 1;
  boardView.tx = 0;
  boardView.ty = 0;
  applyBoardTransform();
}

function focusBoardOnSelection(game, { vertexIds = [], edgeIds = [], hexIds = [] } = {}) {
  const svg = elBoard?.querySelector("svg");
  if (!svg) return;

  const vb = svg.viewBox?.baseVal;
  if (!vb) return;

  const board = game?.board || null;
  if (!board) return;

  const verticesById = new Map((board.vertices || []).map((v) => [v.id, v]));
  const edgesById = new Map((board.edges || []).map((e) => [e.id, e]));
  const hexesById = new Map((board.hexes || []).map((h) => [h.id, h]));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function includePoint(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  for (const id of Array.isArray(vertexIds) ? vertexIds : []) {
    const v = verticesById.get(id);
    if (!v) continue;
    includePoint(v.x, v.y);
  }

  for (const id of Array.isArray(edgeIds) ? edgeIds : []) {
    const e = edgesById.get(id);
    if (!e) continue;
    const vA = verticesById.get(e.vA);
    const vB = verticesById.get(e.vB);
    if (vA) includePoint(vA.x, vA.y);
    if (vB) includePoint(vB.x, vB.y);
  }

  for (const id of Array.isArray(hexIds) ? hexIds : []) {
    const h = hexesById.get(id);
    if (!h) continue;
    for (const vId of h.cornerVertexIds || []) {
      const v = verticesById.get(vId);
      if (!v) continue;
      includePoint(v.x, v.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return;

  const padWorld = (Number(board.hexSize) || 0) * 0.9;
  minX -= padWorld;
  minY -= padWorld;
  maxX += padWorld;
  maxY += padWorld;

  const W = svg.clientWidth;
  const H = svg.clientHeight;
  if (W <= 0 || H <= 0) return;

  const s0 = Math.min(W / vb.width, H / vb.height);
  const offsetX0 = (W - vb.width * s0) / 2;
  const offsetY0 = (H - vb.height * s0) / 2;

  const x1 = (minX - vb.x) * s0 + offsetX0;
  const y1 = (minY - vb.y) * s0 + offsetY0;
  const x2 = (maxX - vb.x) * s0 + offsetX0;
  const y2 = (maxY - vb.y) * s0 + offsetY0;

  const bboxW = Math.max(1, x2 - x1);
  const bboxH = Math.max(1, y2 - y1);
  const padPx = Math.max(16, Math.min(52, Math.floor(Math.min(W, H) * 0.08)));

  const targetScale = clamp(Math.min((W - padPx * 2) / bboxW, (H - padPx * 2) / bboxH), 0.75, 3.5);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;

  boardView.scale = targetScale;
  boardView.tx = W / 2 - cx * targetScale;
  boardView.ty = H / 2 - cy * targetScale;
  applyBoardTransform();
}

function setBoardFullscreen(on) {
  if (!elBoardShell) return;
  elBoardShell.classList.toggle("fullscreen", !!on);
  document.body.classList.toggle("board-fullscreen", !!on);
  if (elBoardFullscreenBtn) elBoardFullscreenBtn.textContent = on ? "Exit" : "Full screen";
}

function setSuppressBoardClick() {
  boardView.suppressClick = true;
  if (boardView.suppressClickTimer) clearTimeout(boardView.suppressClickTimer);
  boardView.suppressClickTimer = setTimeout(() => {
    boardView.suppressClick = false;
  }, 250);
}

function attachBoardPanZoom() {
  if (!elBoardFrame || boardView.attached) return;
  boardView.attached = true;

  // Prevent "tap selects a vertex" when the user was dragging/pinching.
  elBoardFrame.addEventListener(
    "click",
    (ev) => {
      if (!boardView.suppressClick) return;
      ev.preventDefault();
      ev.stopPropagation();
    },
    true
  );

  elBoardFrame.addEventListener("click", () => {
    if (boardView.suppressClick) return;
    if (!playerId) return;
    const room = lastRoomState;
    const game = room?.game || null;
    if (!room || !game) return;
    if (game.currentPlayerId === playerId) return;
    if (game.phase !== "turn") return;
    if (!["needs_roll", "main"].includes(game.subphase)) return;

    const now = Date.now();
    if (now - lastNotYourTurnBoardTapAt < 2200) return;
    lastNotYourTurnBoardTapAt = now;

    const current = room.players.find((p) => p.playerId === game.currentPlayerId) || null;
    const name = current?.name || "the current player";
    showNotify({ tone: "info", title: "Not your turn", hint: `Waiting on ${name}…`, durationMs: 1600 });
  });

  elBoardFrame.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    boardView.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (boardView.pointers.size === 1) {
      boardView.gesture = {
        kind: "pan",
        startX: ev.clientX,
        startY: ev.clientY,
        startTx: boardView.tx,
        startTy: boardView.ty
      };
      return;
    }

    if (boardView.pointers.size === 2) {
      const pts = [...boardView.pointers.values()];
      const rect = elBoardFrame.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
      const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      boardView.gesture = {
        kind: "pinch",
        rect,
        dist: Math.max(1, dist),
        startScale: boardView.scale,
        worldX: (midX - boardView.tx) / boardView.scale,
        worldY: (midY - boardView.ty) / boardView.scale
      };
      setSuppressBoardClick();
    }
  });

  elBoardFrame.addEventListener("pointermove", (ev) => {
    if (!boardView.pointers.has(ev.pointerId)) return;
    boardView.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const g = boardView.gesture;
    if (!g) return;

    if (g.kind === "pan" && boardView.pointers.size === 1) {
      const dx = ev.clientX - g.startX;
      const dy = ev.clientY - g.startY;
      if (Math.abs(dx) + Math.abs(dy) > 6) setSuppressBoardClick();
      boardView.tx = g.startTx + dx;
      boardView.ty = g.startTy + dy;
      applyBoardTransform();
      return;
    }

    if (g.kind === "pinch" && boardView.pointers.size >= 2) {
      const pts = [...boardView.pointers.values()];
      const rect = g.rect;
      const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
      const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const nextScale = clamp(g.startScale * (dist / g.dist), 0.75, 3.5);
      boardView.scale = nextScale;
      boardView.tx = midX - g.worldX * nextScale;
      boardView.ty = midY - g.worldY * nextScale;
      applyBoardTransform();
      setSuppressBoardClick();
    }
  });

  function endPointer(ev) {
    if (boardView.pointers.has(ev.pointerId)) boardView.pointers.delete(ev.pointerId);
    if (boardView.pointers.size === 0) boardView.gesture = null;
    if (boardView.pointers.size === 1 && boardView.gesture?.kind === "pinch") {
      // Transition pinch -> pan using the remaining pointer.
      const [pt] = [...boardView.pointers.values()];
      boardView.gesture = { kind: "pan", startX: pt.x, startY: pt.y, startTx: boardView.tx, startTy: boardView.ty };
    }
  }

  elBoardFrame.addEventListener("pointerup", endPointer);
  elBoardFrame.addEventListener("pointercancel", endPointer);
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);
}

function renderMainActions(room, me) {
  const myTurn = me?.playerId === room.game.currentPlayerId;
  const inMain = room.game.phase === "turn" && room.game.subphase === "main";
  const show = !!myTurn && inMain;

  if (!show) {
    elMainActions.style.display = "none";
    mode = null;
    return;
  }

  elMainActions.style.display = "flex";
  elCancelModeBtn.style.display = mode ? "" : "none";

  elBuildRoadBtn.classList.toggle("primary", mode === "build_road");
  elBuildSettlementBtn.classList.toggle("primary", mode === "build_settlement");
  elBuildCityBtn.classList.toggle("primary", mode === "build_city");

  // Disable buttons when there are no legal placements.
  const roadOpts = legalRoadEdges(room.game, me.playerId);
  const settlementOpts = legalSettlementVertices(room.game, me.playerId);
  const cityOpts = legalCityVertices(room.game, me.playerId);
  const gateCtx = { game: room.game, playerId: me?.playerId || null, you: lastYouState };
  const roadGate = gateAction(gateCtx, { type: "BUILD_ROAD" });
  const settlementGate = gateAction(gateCtx, { type: "BUILD_SETTLEMENT" });
  const cityGate = gateAction(gateCtx, { type: "BUILD_CITY" });

  const roadsBuilt = Object.values(room.game.structures?.roads || {}).filter((r) => r?.playerId === me.playerId).length;
  const settlementsBuilt = Object.values(room.game.structures?.settlements || {}).filter((s) => s?.playerId === me.playerId && s.kind === "settlement").length;
  const citiesBuilt = Object.values(room.game.structures?.settlements || {}).filter((s) => s?.playerId === me.playerId && s.kind === "city").length;

  const roadBlock = roadsBuilt >= 15 ? "OUT_OF_PIECES_ROAD" : roadGate ? roadGate.code : roadOpts.length === 0 ? "ILLEGAL_PLACEMENT" : "";
  const settlementBlock =
    settlementsBuilt >= 5 ? "OUT_OF_PIECES_SETTLEMENT" : settlementGate ? settlementGate.code : settlementOpts.length === 0 ? "ILLEGAL_PLACEMENT" : "";
  const cityBlock = citiesBuilt >= 4 ? "OUT_OF_PIECES_CITY" : cityGate ? cityGate.code : cityOpts.length === 0 ? "ILLEGAL_PLACEMENT" : "";

  setSoftDisabled(elBuildRoadBtn, roadBlock);
  setSoftDisabled(elBuildSettlementBtn, settlementBlock);
  setSoftDisabled(elBuildCityBtn, cityBlock);
}

function renderRobberFlow(room, me, you) {
  if (!elRobberCard) return;
  const game = room?.game || null;
  if (!game) {
    elRobberCard.style.display = "none";
    return;
  }

  const inFlow = ["robber_discard", "robber_move", "robber_steal"].includes(game.subphase);
  if (!inFlow) {
    elRobberCard.style.display = "none";
    if (elDiscardPanel) elDiscardPanel.style.display = "none";
    if (elStealPanel) elStealPanel.style.display = "none";
    if (elDiscardErr) elDiscardErr.textContent = "";
    if (elStealErr) elStealErr.textContent = "";
    autoStealKey = null;
    lastStealTargetsRenderKey = null;
    return;
  }

  elRobberCard.style.display = "";
  if (game.subphase !== "robber_steal") {
    autoStealKey = null;
    lastStealTargetsRenderKey = null;
  }

  const hints = game.hints || {};

  if (game.subphase === "robber_discard") {
    const requiredById = hints.discardRequiredByPlayerId || {};
    const submittedById = hints.discardSubmittedByPlayerId || {};
    const required = parseNonNegativeInt(requiredById?.[me?.playerId] ?? 0);
    const submitted = !!submittedById?.[me?.playerId];

    const pendingNames = (room.players || [])
      .filter((p) => parseNonNegativeInt(requiredById?.[p.playerId] ?? 0) > 0 && !submittedById?.[p.playerId])
      .map((p) => p.name);

    if (required > 0 && !submitted) {
      setText(elRobberHint, "Pick exactly the number below.");
    } else if (pendingNames.length) {
      setText(elRobberHint, `Waiting on: ${pendingNames.join(", ")}`);
    } else {
      setText(elRobberHint, "Waiting…");
    }

    elStealPanel.style.display = "none";
    elDiscardPanel.style.display = required > 0 && !submitted ? "" : "none";

    if (required > 0 && !submitted) {
      setText(elDiscardReqLabel, `${required} card${required === 1 ? "" : "s"}`);
      const hand = you?.hand || {};
      for (const r of RESOURCE_TYPES) {
        const input = discardInputs[r];
        if (!input) continue;
        const max = parseNonNegativeInt(hand[r] ?? 0);
        input.max = String(max);
        clampInput(input, 0, max);
      }

      const counts = countsFromInputs(discardInputs);
      const total = RESOURCE_TYPES.reduce((acc, r) => acc + parseNonNegativeInt(counts[r] ?? 0), 0);
      elDiscardSubmitBtn.disabled = total !== required;
    }
    return;
  }

  if (game.subphase === "robber_move") {
    setText(elRobberHint, "Tap a highlighted hex to move the robber.");
    elDiscardPanel.style.display = "none";
    elStealPanel.style.display = "none";
    return;
  }

  if (game.subphase === "robber_steal") {
    const myTurn = me?.playerId === game.currentPlayerId;
    const victimIds = hints.legalVictimPlayerIds || [];

    elDiscardPanel.style.display = "none";
    elStealPanel.style.display = myTurn ? "" : "none";

    if (!myTurn) {
      lastStealTargetsRenderKey = null;
      setText(elRobberHint, "Waiting for the current player to steal…");
      return;
    }

    setText(elRobberHint, "Steal 1 random card.");
    setText(elStealHint, victimIds.length ? "Choose a target:" : "No one to steal from.");
    const nextStealTargetsKey = alwaysRenderEnabled
      ? null
      : victimIds
          .map((pid) => {
            const p = room.players.find((pp) => pp.playerId === pid);
            return `${stableRoomPart(pid)}:${stableRoomPart(p?.name)}:${stableRoomPart(p?.color)}`;
          })
          .join("|");

    if (alwaysRenderEnabled || nextStealTargetsKey !== lastStealTargetsRenderKey) {
      elStealTargets.innerHTML = victimIds
        .map((pid) => {
          const p = room.players.find((pp) => pp.playerId === pid);
          const name = p?.name || "Player";
          const color = p?.color || "rgba(255, 255, 255, 0.28)";
          return `<button class="btn primary" data-victim-id="${escapeHtml(pid)}" aria-label="Steal from ${escapeHtml(name)}" title="Steal from ${escapeHtml(name)}">
            <span class="dot" style="background:${escapeHtml(color)};"></span>
            <span>${escapeHtml(name)}</span>
          </button>`;
        })
        .join("");
      lastStealTargetsRenderKey = nextStealTargetsKey;
    }

    if (victimIds.length === 1) {
      const key = `${game.turnNumber}:${game.lastRoll?.at ?? 0}:${game.robberHexId ?? ""}:${victimIds[0]}`;
      if (autoStealKey !== key) {
        autoStealKey = key;
        (async () => {
          try {
            await api(`/api/rooms/${encodeURIComponent(room.roomCode)}/action`, {
              method: "POST",
              body: { playerId, type: "STEAL_CARD", fromPlayerId: victimIds[0] }
            });
          } catch (e) {
            if (elStealErr) elStealErr.textContent = humanizeErrorMessage(e, { room });
            autoStealKey = null;
          }
        })();
      }
    }
  }
}

function renderActionHint(room, me) {
  if (!elActionHint) return;

  const game = room?.game || null;
  if (!game) return setText(elActionHint, "");

  // Game over - show winner
  if (game.phase === "game_over") {
    const winnerId = game.winnerPlayerId || null;
    const winner = (room.players || []).find((p) => p.playerId === winnerId) || null;
    const name = winner?.name || "Player";
    setText(elActionHint, winnerId === me?.playerId ? "You won the game." : `${name} won the game.`);
    return;
  }

  // Temporary override (error messages, etc.)
  if (actionHintOverride) {
    const now = Date.now();
    if (now <= actionHintOverride.until) {
      setText(elActionHint, actionHintOverride.text);
      return;
    }
    actionHintOverride = null;
    if (actionHintOverrideTimer) clearTimeout(actionHintOverrideTimer);
    actionHintOverrideTimer = null;
  }

  const expected = game.hints?.expected || null;
  const myTurn = me?.playerId === game.currentPlayerId;
  const current = room.players.find((p) => p.playerId === game.currentPlayerId) || null;
  const currentName = current?.name || "the current player";

  let text = "";

  // Active build mode - give specific tap instructions
  if (game.phase === "turn" && game.subphase === "main" && myTurn && mode) {
    if (mode === "build_road") text = "Build road: tap a highlighted edge.";
    else if (mode === "build_settlement") text = "Build settlement: tap a highlighted spot.";
    else if (mode === "build_city") text = "Build city: tap your settlement.";
  }
  // Robber flow - clear step-by-step copy
  else if (expected === "DISCARD_CARDS") {
    const required = parseNonNegativeInt(game.hints?.discardRequiredByPlayerId?.[me?.playerId] ?? 0);
    const submitted = !!game.hints?.discardSubmittedByPlayerId?.[me?.playerId];
    if (required > 0 && !submitted) {
      text = `Discard ${required} card${required === 1 ? "" : "s"}`;
    } else {
      text = getWhatsNextCopy(game, { playerId: me?.playerId, expected, isMyTurn: false, currentPlayerName: currentName });
    }
  }
  else if (expected === "MOVE_ROBBER") {
    if (myTurn) {
      text = "Move the robber";
    } else {
      text = getWhatsNextCopy(game, { playerId: me?.playerId, expected, isMyTurn: false, currentPlayerName: currentName });
    }
  }
  else if (expected === "STEAL_CARD") {
    if (myTurn) {
      text = "Pick someone to steal from";
    } else {
      text = getWhatsNextCopy(game, { playerId: me?.playerId, expected, isMyTurn: false, currentPlayerName: currentName });
    }
  }
  // Dev card road building
  else if (expected === "DEV_ROAD_BUILDING_PLACE_ROAD") {
    text = myTurn
      ? getWhatsNextCopy(game, { playerId: me?.playerId, expected, isMyTurn: true, currentPlayerName: currentName })
      : "Waiting for roads...";
  }
  // Not my turn - show trade offers or waiting message
  else if (!myTurn) {
    const offers = relevantOpenTradeOffers(game, me?.playerId);
    if (offers.length) {
      text = "Trade offer pending";
    } else {
      text = getWhatsNextCopy(game, { playerId: me?.playerId, expected, isMyTurn: false, currentPlayerName: currentName });
    }
  }
  // My turn - use host copy for actionable hints
  else if (expected === "ROLL_DICE") {
    text = getWhatsNextCopy(game, { playerId: me?.playerId, expected, isMyTurn: true, currentPlayerName: currentName });
  }
  else if (expected === "PLACE_SETTLEMENT") {
    text = getWhatsNextCopy(game, { playerId: me?.playerId, expected, isMyTurn: true, currentPlayerName: currentName });
  }
  else if (expected === "PLACE_ROAD") {
    text = getWhatsNextCopy(game, { playerId: me?.playerId, expected, isMyTurn: true, currentPlayerName: currentName });
  }
  else if (game.phase === "turn" && game.subphase === "main") {
    text = getWhatsNextCopy(game, { playerId: me?.playerId, expected, isMyTurn: true, currentPlayerName: currentName });
  }

  setText(elActionHint, text);
}

function renderEmoteStrip(room) {
  if (!elEmoteStrip) return;
  const enabled = room?.settings?.houseRules?.emotesEnabled !== false;
  elEmoteStrip.style.display = enabled ? "" : "none";
}

function renderResources(you) {
  const hand = you?.hand || {};
  const wood = parseNonNegativeInt(hand.wood ?? 0);
  const brick = parseNonNegativeInt(hand.brick ?? 0);
  const sheep = parseNonNegativeInt(hand.sheep ?? 0);
  const wheat = parseNonNegativeInt(hand.wheat ?? 0);
  const ore = parseNonNegativeInt(hand.ore ?? 0);

  if (elResCountWood) elResCountWood.textContent = String(wood);
  if (elResCountBrick) elResCountBrick.textContent = String(brick);
  if (elResCountSheep) elResCountSheep.textContent = String(sheep);
  if (elResCountWheat) elResCountWheat.textContent = String(wheat);
  if (elResCountOre) elResCountOre.textContent = String(ore);
  if (elResTotalValue) elResTotalValue.textContent = String(wood + brick + sheep + wheat + ore);
}

function renderTrade(room, me, you) {
  if (!elTradeCard) return;

  const game = room?.game || null;
  if (!game) {
    elTradeCard.style.display = "none";
    return;
  }
  elTradeCard.style.display = "";

  const inMain = game.phase === "turn" && game.subphase === "main";
  const myTurn = !!me?.playerId && me.playerId === game.currentPlayerId;
  const canCreate = inMain && myTurn;

  setText(
    elTradeHint,
    inMain ? (canCreate ? "Propose a trade. Other players can accept or reject." : "Respond to the current player's trade offers.") : "Trading unlocks during the main phase (after dice)."
  );

  elTradeCreatePanel.style.display = canCreate ? "" : "none";

  // Populate "To" choices (keep current selection if still valid).
  if (canCreate) {
    const nextToKey = alwaysRenderEnabled ? null : `${stableRoomPart(me?.playerId)}|${playerDisplayKey(room.players)}`;
    if (alwaysRenderEnabled || nextToKey !== lastTradeToOptionsRenderKey) {
      const currentTo = elTradeToSelect?.value || "all";
      const options = [`<option value="all">Everyone</option>`];
      for (const p of room.players) {
        if (!p?.playerId || p.playerId === me?.playerId) continue;
        options.push(`<option value="${escapeHtml(p.playerId)}">${escapeHtml(p.name)}</option>`);
      }
      elTradeToSelect.innerHTML = options.join("");
      if (options.some((o) => o.includes(`value="${escapeHtml(currentTo)}"`))) elTradeToSelect.value = currentTo;
      lastTradeToOptionsRenderKey = nextToKey;
    }
  }

  // Clamp draft values to sensible ranges.
  const hand = you?.hand || {};
  for (const r of RESOURCE_TYPES) {
    const maxGive = parseNonNegativeInt(hand[r] ?? 0);
    const giveEl = tradeGiveInputs[r];
    if (giveEl) {
      giveEl.max = String(maxGive);
      clampInput(giveEl, 0, maxGive);
    }
    const wantEl = tradeWantInputs[r];
    if (wantEl) {
      wantEl.max = "19";
      clampInput(wantEl, 0, 19);
    }
  }

  const give = countsFromInputs(tradeGiveInputs);
  const want = countsFromInputs(tradeWantInputs);
  const valid = canCreate && hasAnyResources(give) && hasAnyResources(want) && hasEnough(hand, give);
  elTradeSendBtn.disabled = !valid;
  if (elTradeRepeatBtn) elTradeRepeatBtn.disabled = !canCreate || !lastSentTradeOffer;
  if (elTradeSuggestBtn) elTradeSuggestBtn.disabled = !canCreate || !hasAnyResources(hand);

  // Render open offers.
  const openOffers = (game.tradeOffers || []).filter((o) => o && o.status === "open");
  const offers = openOffers.filter((o) => o.to === "all" || o.to === me?.playerId || o.fromPlayerId === me?.playerId);
  const nextOffersKey = alwaysRenderEnabled
    ? null
    : [
        inMain ? "1" : "0",
        myTurn ? "1" : "0",
        stableRoomPart(me?.playerId),
        playerDisplayKey(room.players),
        resourceCountsKey(hand),
        offers
          .map((o) =>
            [
              stableRoomPart(o?.id),
              stableRoomPart(o?.fromPlayerId),
              stableRoomPart(o?.to),
              resourceCountsKey(o?.give),
              resourceCountsKey(o?.want),
              Array.isArray(o?.rejectedByPlayerIds) ? o.rejectedByPlayerIds.map(stableRoomPart).join(",") : ""
            ].join(":")
          )
          .join(";")
      ].join("|");

  if (alwaysRenderEnabled || nextOffersKey !== lastTradeOffersRenderKey) {
    const prevScrollTop = elTradeOffers.scrollTop;
    if (!offers.length) {
      elTradeOffers.innerHTML = `<div class="muted">No open offers.</div>`;
    } else {
      const playerById = new Map((room.players || []).map((p) => [p.playerId, p]));
      elTradeOffers.innerHTML = offers
        .map((o) => {
          const from = playerById.get(o.fromPlayerId) || { name: "Player", color: "rgba(255,255,255,0.28)" };
          const toName = o.to === "all" ? "Everyone" : playerById.get(o.to)?.name || "Player";
          const youRejected = Array.isArray(o.rejectedByPlayerIds) && o.rejectedByPlayerIds.includes(me?.playerId);
          const forYou = o.to === "all" || o.to === me?.playerId;

          let tags = "";
          if (!inMain) tags += `<span class="tag warn">Waiting</span>`;
          if (o.fromPlayerId === me?.playerId) tags += `<span class="tag">Yours</span>`;
          else if (!forYou) tags += `<span class="tag">Not for you</span>`;
          else if (youRejected) tags += `<span class="tag">Rejected</span>`;

          let buttons = "";
          if (inMain && o.fromPlayerId === me?.playerId && myTurn) {
            buttons = `<button class="btn danger" data-trade-action="cancel" data-offer-id="${escapeHtml(o.id)}">Cancel</button>`;
          } else if (inMain && forYou && o.fromPlayerId !== me?.playerId && !youRejected) {
            const canAccept = hasEnough(hand, o.want);
            buttons = `<button class="btn primary${canAccept ? "" : " softDisabled"}" data-trade-action="accept" data-offer-id="${escapeHtml(o.id)}" ${canAccept ? "" : 'aria-disabled="true" data-block-code="NOT_ENOUGH_RESOURCES"'}>Accept</button>
              <button class="btn" data-trade-action="reject" data-offer-id="${escapeHtml(o.id)}">Reject</button>`;
          }

          const giveBadges = renderResourceBadges(o.give, { prefix: "-" });
          const wantBadges = renderResourceBadges(o.want, { prefix: "+" });
          const badges = `<div class="logBadges">${giveBadges ? `<span class="badge">Gives</span>${giveBadges}` : ""}${wantBadges ? `<span class="badge">Wants</span>${wantBadges}` : ""}</div>`;

          return `<div class="tradeOffer">
            <div class="tradeOfferTop">
              <div class="name" style="display:flex; gap:10px; align-items:center;">
                <span class="dot" style="background:${escapeHtml(from.color)};"></span>
                <div>${escapeHtml(from.name)} → ${escapeHtml(toName)}</div>
              </div>
              <div class="tradeOfferBtns">${tags}${buttons}</div>
            </div>
            ${badges}
          </div>`;
        })
        .join("");
    }
    elTradeOffers.scrollTop = prevScrollTop;
    lastTradeOffersRenderKey = nextOffersKey;
  }
}

function renderBankTrade(room, me, you) {
  if (!elBankTradeCard) return;

  const game = room?.game || null;
  if (!game) {
    elBankTradeCard.style.display = "none";
    return;
  }
  elBankTradeCard.style.display = "";

  const inMain = game.phase === "turn" && game.subphase === "main";
  const myTurn = !!me?.playerId && me.playerId === game.currentPlayerId;
  const canTrade = inMain && myTurn;

  if (!canTrade) {
    setText(
      elBankTradeHint,
      inMain ? "Only the current player can bank trade." : "Bank trading unlocks during your main phase (after dice)."
    );
    elBankTradePanel.style.display = "none";
    if (elBankTradeErr) elBankTradeErr.textContent = "";
    return;
  }

  elBankTradePanel.style.display = "";

  const prevGive = elBankGiveSelect?.value || "wood";
  const prevReceive = elBankReceiveSelect?.value || "brick";
  const options = RESOURCE_TYPES.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(titleResource(r))}</option>`).join("");
  elBankGiveSelect.innerHTML = options;
  elBankReceiveSelect.innerHTML = options;

  if (RESOURCE_TYPES.includes(prevGive)) elBankGiveSelect.value = prevGive;
  if (RESOURCE_TYPES.includes(prevReceive)) elBankReceiveSelect.value = prevReceive;
  if (elBankReceiveSelect.value === elBankGiveSelect.value) {
    const alt = RESOURCE_TYPES.find((r) => r !== elBankGiveSelect.value) || "brick";
    elBankReceiveSelect.value = alt;
  }

  const giveType = elBankGiveSelect.value;
  const receiveType = elBankReceiveSelect.value;

  const { ratios, sources } = computeBankTradeRates(game, me.playerId);
  const ratio = parseNonNegativeInt(ratios[giveType] ?? 4) || 4;
  const source = sources[giveType] || "no port";
  setText(elBankTradeRate, `${ratio}:1 (${source})`);

  const hand = you?.hand || {};
  const bank = game.bank || {};

  const maxFromHand = Math.floor(parseNonNegativeInt(hand[giveType] ?? 0) / ratio);
  const maxFromBank = parseNonNegativeInt(bank[receiveType] ?? 0);
  const maxReceive = Math.min(maxFromHand, maxFromBank);

  if (elBankReceiveAmount) {
    elBankReceiveAmount.disabled = maxReceive <= 0;
    elBankReceiveAmount.min = maxReceive <= 0 ? "0" : "1";
    elBankReceiveAmount.max = String(Math.max(0, maxReceive));
    if (maxReceive <= 0) elBankReceiveAmount.value = "0";
  }

  const receiveAmount = maxReceive > 0 ? clampInput(elBankReceiveAmount, 1, maxReceive) : 0;
  const giveAmount = ratio * receiveAmount;
  if (elBankGiveAmount) elBankGiveAmount.value = String(giveAmount);

  const canDo = receiveAmount > 0 && giveAmount > 0;
  elBankTradeBtn.disabled = !canDo;

  if (!canDo) {
    const bankHave = parseNonNegativeInt(bank[receiveType] ?? 0);
    const handHave = parseNonNegativeInt(hand[giveType] ?? 0);
    const needForOne = ratio;
    if (bankHave <= 0) setText(elBankTradeHint, `Bank has no ${receiveType}.`);
    else if (handHave < needForOne) setText(elBankTradeHint, `Need ${needForOne} ${giveType} for 1 ${receiveType}.`);
    else setText(elBankTradeHint, "Can't trade right now.");
  } else {
    setText(elBankTradeHint, `Trade ${giveAmount} ${giveType} for ${receiveAmount} ${receiveType}.`);
  }
}

function renderDevCards(room, me, you) {
  if (!elDevCardsCard) return;

  const game = room?.game || null;
  if (!game) {
    elDevCardsCard.style.display = "none";
    return;
  }
  elDevCardsCard.style.display = "";

  const isGameOver = game.phase === "game_over";
  const inMain = game.phase === "turn" && game.subphase === "main";
  const myTurn = !!me?.playerId && me.playerId === game.currentPlayerId;
  const canInteract = !isGameOver && inMain && myTurn;
  const playedThisTurn = !!game.devCardPlayedThisTurn;
  const expected = game.hints?.expected || null;

  if (!canInteract || playedThisTurn) {
    devPlayMode = null;
    if (elDevPlayPanel) elDevPlayPanel.style.display = "none";
    if (elDevYopErr) elDevYopErr.textContent = "";
    if (elDevMonopolyErr) elDevMonopolyErr.textContent = "";
    if (elDevCardsErr) elDevCardsErr.textContent = "";
  }

  const deckCount = parseNonNegativeInt(game.devDeckCount ?? 0);
  if (elDevDeckTag) elDevDeckTag.textContent = `Deck: ${deckCount}`;
  if (elDevPlayLimitTag) elDevPlayLimitTag.style.display = canInteract && playedThisTurn ? "" : "none";

  const hand = you?.hand || {};
  const canAffordBuy = hasEnough(hand, DEV_CARD_COST);

  if (isGameOver) {
    setText(elDevCardsHint, "Game over.");
  } else if (expected === "DEV_ROAD_BUILDING_PLACE_ROAD") {
    setText(elDevCardsHint, "Road Building: place your free roads on the board.");
  } else if (!inMain) {
    setText(elDevCardsHint, "Dev cards unlock during your main phase (after dice).");
  } else if (!myTurn) {
    setText(elDevCardsHint, "Only the current player can use dev cards.");
  } else if (playedThisTurn) {
    setText(elDevCardsHint, "Dev card already played (buying is still ok).");
  } else if (deckCount <= 0) {
    setText(elDevCardsHint, "Dev deck empty.");
  } else if (!canAffordBuy) {
    setText(elDevCardsHint, "Buy cost: 1 wheat + 1 sheep + 1 ore.");
  } else {
    setText(elDevCardsHint, "Buy or play a dev card (1/turn).");
  }

  // Buy
  const canBuy = canInteract && deckCount > 0 && canAffordBuy;
  if (elDevBuyBtn) elDevBuyBtn.disabled = !canBuy;

  // In-hand playable cards.
  const inHandCounts = countsByValue(you?.devCardsInHand);
  const canPlay = canInteract && !playedThisTurn;
  const inHandRows = DEV_CARD_TYPES.filter((t) => (inHandCounts[t] ?? 0) > 0)
    .map((t) => {
      const n = parseNonNegativeInt(inHandCounts[t] ?? 0);
      const name = titleDevCard(t);
      const label = n === 1 ? name : `${name} ×${n}`;
      const disabled = !canPlay ? "disabled" : "";
      return `<div class="row" style="justify-content:space-between;">
        <div>${escapeHtml(label)}</div>
        <button class="btn primary" data-dev-play="${escapeHtml(t)}" ${disabled}>Play</button>
      </div>`;
    })
    .join("");

  elDevCardsInHand.innerHTML = inHandRows ? `<div class="muted">In hand</div>${inHandRows}` : `<div class="muted">In hand: none.</div>`;

  // Newly bought (locked until next turn).
  const newCounts = countsByValue(you?.devCardsNew);
  const newRows = DEV_CARD_TYPES.filter((t) => (newCounts[t] ?? 0) > 0)
    .map((t) => {
      const n = parseNonNegativeInt(newCounts[t] ?? 0);
      const name = titleDevCard(t);
      const label = n === 1 ? name : `${name} ×${n}`;
      return `<div class="row" style="justify-content:space-between;">
        <div>${escapeHtml(label)}</div>
        <span class="tag">New</span>
      </div>`;
    })
    .join("");
  elDevCardsNew.innerHTML = newRows ? `<div class="muted">New (next turn)</div>${newRows}` : "";

  // Public stats.
  const myKnights = parseNonNegativeInt(game.playedKnightsByPlayerId?.[me?.playerId] ?? 0);
  if (elDevKnightsTag) elDevKnightsTag.textContent = `Knights: ${myKnights}`;

  const largestPid = game.awards?.largestArmyPlayerId ?? null;
  const largestPlayer = largestPid ? (room.players || []).find((p) => p.playerId === largestPid) : null;
  if (elDevLargestArmyTag) elDevLargestArmyTag.textContent = largestPlayer ? `Largest Army: ${largestPlayer.name}` : "Largest Army: —";

  const hiddenVp = parseNonNegativeInt(you?.hiddenVictoryPointsCount ?? 0);
  if (elDevHiddenVpTag) elDevHiddenVpTag.textContent = `Hidden VP: ${hiddenVp}`;

  // Play flows (Year of Plenty / Monopoly).
  const showPlayPanel = canPlay && !!devPlayMode;
  if (elDevPlayPanel) elDevPlayPanel.style.display = showPlayPanel ? "" : "none";

  if (!showPlayPanel) {
    if (elDevYopPanel) elDevYopPanel.style.display = "none";
    if (elDevMonopolyPanel) elDevMonopolyPanel.style.display = "none";
    if (elDevYopErr) elDevYopErr.textContent = "";
    if (elDevMonopolyErr) elDevMonopolyErr.textContent = "";
    return;
  }

  if (elDevPlayTag) elDevPlayTag.textContent = devPlayMode === "year_of_plenty" ? "Year of Plenty" : "Monopoly";

  if (devPlayMode === "year_of_plenty") {
    if (elDevMonopolyPanel) elDevMonopolyPanel.style.display = "none";
    if (elDevYopPanel) elDevYopPanel.style.display = "";

    const bank = game.bank || {};
    for (const r of RESOURCE_TYPES) {
      const input = devYopInputs[r];
      if (!input) continue;
      const max = parseNonNegativeInt(bank[r] ?? 0);
      input.max = String(max);
      clampInput(input, 0, max);
    }

    const take = countsFromInputs(devYopInputs);
    const total = RESOURCE_TYPES.reduce((acc, r) => acc + parseNonNegativeInt(take[r] ?? 0), 0);
    if (elDevYopPlayBtn) elDevYopPlayBtn.disabled = total !== 2;
    return;
  }

  if (devPlayMode === "monopoly") {
    if (elDevYopPanel) elDevYopPanel.style.display = "none";
    if (elDevMonopolyPanel) elDevMonopolyPanel.style.display = "";

    const prev = elDevMonopolySelect?.value || "wood";
    const options = RESOURCE_TYPES.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(titleResource(r))}</option>`).join("");
    elDevMonopolySelect.innerHTML = options;
    if (RESOURCE_TYPES.includes(prev)) elDevMonopolySelect.value = prev;
  }
}

function legalRoadEdges(game, pid) {
  const roads = game.structures.roads || {};
  const settlements = game.structures.settlements || {};
  const verticesById = new Map(game.board.vertices.map((v) => [v.id, v]));

  function canConnect(vertexId) {
    const s = settlements[vertexId];
    if (s && s.playerId !== pid) return false;
    if (s && s.playerId === pid) return true;
    const v = verticesById.get(vertexId);
    if (!v) return false;
    return v.edgeIds.some((eId) => roads[eId]?.playerId === pid);
  }

  const out = [];
  for (const e of game.board.edges) {
    if (roads[e.id]) continue;
    if (canConnect(e.vA) || canConnect(e.vB)) out.push(e.id);
  }
  return out;
}

function legalSettlementVertices(game, pid) {
  const roads = game.structures.roads || {};
  const settlements = game.structures.settlements || {};
  const out = [];
  for (const v of game.board.vertices) {
    if (settlements[v.id]) continue;
    if (v.neighborVertexIds.some((n) => !!settlements[n])) continue;
    if (!v.edgeIds.some((eId) => roads[eId]?.playerId === pid)) continue;
    out.push(v.id);
  }
  return out;
}

function legalCityVertices(game, pid) {
  const out = [];
  for (const [vertexId, s] of Object.entries(game.structures.settlements || {})) {
    if (s.playerId === pid && s.kind === "settlement") out.push(vertexId);
  }
  return out;
}

// --- UI handlers ---
elSettingsBtn?.addEventListener("click", () => openSettings());
elSettingsCloseBtn?.addEventListener("click", () => closeSettings());
elSettingsBackdrop?.addEventListener("click", (ev) => {
  if (ev.target === elSettingsBackdrop) closeSettings();
});

elHelpBtn?.addEventListener("click", () => openHelp());
elHelpCloseBtn?.addEventListener("click", () => closeHelp());
elHelpBackdrop?.addEventListener("click", (ev) => {
  if (ev.target === elHelpBackdrop) closeHelp();
});

elMuteAllBtn?.addEventListener("click", () => {
  const s = getSettings();
  setSettings({ muteAll: !s.muteAll });
});

elReducedMotionBtn?.addEventListener("click", () => {
  const s = getSettings();
  setSettings({ reducedMotion: !s.reducedMotion });
});

elLowPowerModeBtn?.addEventListener("click", () => {
  const s = getSettings();
  setSettings({ lowPowerMode: !s.lowPowerMode });
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
  renderScheduler.schedule();
});

elSfxVolume?.addEventListener("input", () => {
  setSettings({ sfxVolume: Number(elSfxVolume.value) / 100 });
});

elMusicVolume?.addEventListener("input", () => {
  setSettings({ musicVolume: Number(elMusicVolume.value) / 100 });
});

elRoomInput?.addEventListener("input", () => {
  const code = sanitizeRoomCode(elRoomInput.value);
  if (code !== elRoomInput.value) elRoomInput.value = code;
  scheduleRoomPreview(code);
});

elJoinBtn.addEventListener("click", async () => {
  elJoinErr.textContent = "";
  const code = sanitizeRoomCode(elRoomInput.value);
  const name = String(elNameInput.value || "").trim();
  if (!code) return (elJoinErr.textContent = "Enter a room code.");
  if (!name) return (elJoinErr.textContent = "Enter a name.");
  try {
    elJoinBtn.disabled = true;
    await join({ name, code });
  } catch (e) {
    elJoinErr.textContent = humanizeErrorMessage(e);
  } finally {
    elJoinBtn.disabled = false;
  }
});

elReadyBtn.addEventListener("click", async () => {
  if (!roomCode || !playerId) return;
  const me = lastRoomState?.players.find((p) => p.playerId === playerId);
  const nextReady = !me?.ready;
  try {
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/ready`, { method: "POST", body: { playerId, ready: nextReady } });
  } catch (e) {
    showErrorToast(e);
  }
});

elPresetSelect.addEventListener("change", async () => {
  if (!roomCode || !playerId) return;
  try {
    await hostPost(`/api/rooms/${encodeURIComponent(roomCode)}/preset`, { playerId, presetId: elPresetSelect.value });
  } catch (e) {
    showErrorToast(e);
  }
});

elThemeSelect?.addEventListener("change", async () => {
  if (!roomCode || !playerId || !elThemeSelect) return;
  try {
    await hostPost(`/api/rooms/${encodeURIComponent(roomCode)}/theme`, { playerId, themeId: elThemeSelect.value });
  } catch (e) {
    showErrorToast(e);
  }
});

elGameModeSelect?.addEventListener("change", async () => {
  if (!roomCode || !playerId) return;
  try {
    await hostPost(`/api/rooms/${encodeURIComponent(roomCode)}/mode`, { playerId, gameMode: elGameModeSelect.value });
  } catch (e) {
    showErrorToast(e);
  }
});

elMaxPlayersSelect?.addEventListener("change", async () => {
  if (!roomCode || !playerId) return;
  try {
    await hostPost(`/api/rooms/${encodeURIComponent(roomCode)}/maxPlayers`, { playerId, maxPlayers: Number(elMaxPlayersSelect.value) });
  } catch (e) {
    showErrorToast(e);
  }
});

elAdvancedBtn?.addEventListener("click", () => setHostAdvancedOpen(!hostAdvancedOpen));

elVpTargetSelect?.addEventListener("change", async () => {
  if (!roomCode || !playerId) return;
  const value = String(elVpTargetSelect.value || "");
  const n = Number(value);
  const victoryPointsToWin = value ? (Number.isFinite(n) ? Math.floor(n) : null) : null;
  const current = lastRoomState?.settings?.houseRules;
  const nextHouseRules = current && typeof current === "object" && !Array.isArray(current) ? { ...current } : {};
  if (victoryPointsToWin != null) nextHouseRules.victoryPointsToWin = victoryPointsToWin;
  else delete nextHouseRules.victoryPointsToWin;
  const houseRules = Object.keys(nextHouseRules).length ? nextHouseRules : null;
  try {
    await hostPost(`/api/rooms/${encodeURIComponent(roomCode)}/houseRules`, { playerId, houseRules });
  } catch (e) {
    showErrorToast(e);
    renderHouseRulesControls(lastRoomState);
  }
});

elEmotesToggleBtn?.addEventListener("click", async () => {
  if (!roomCode || !playerId) return;
  const current = lastRoomState?.settings?.houseRules;
  const nextHouseRules = current && typeof current === "object" && !Array.isArray(current) ? { ...current } : {};
  const enabled = nextHouseRules.emotesEnabled !== false;
  if (enabled) nextHouseRules.emotesEnabled = false;
  else delete nextHouseRules.emotesEnabled;
  const houseRules = Object.keys(nextHouseRules).length ? nextHouseRules : null;

  try {
    if (elEmotesToggleBtn) elEmotesToggleBtn.disabled = true;
    await hostPost(`/api/rooms/${encodeURIComponent(roomCode)}/houseRules`, { playerId, houseRules });
  } catch (e) {
    showErrorToast(e, { title: "Can't update emotes" });
    renderHouseRulesControls(lastRoomState);
  } finally {
    if (elEmotesToggleBtn) elEmotesToggleBtn.disabled = false;
  }
});

elBoardSeedInput?.addEventListener("change", async () => {
  if (!roomCode || !playerId) return;
  try {
    await hostPost(`/api/rooms/${encodeURIComponent(roomCode)}/boardSeed`, { playerId, boardSeed: elBoardSeedInput.value });
  } catch (e) {
    showErrorToast(e);
    renderBoardSeedControls(lastRoomState);
  }
});

elHostPinInput?.addEventListener("input", () => {
  if (!elHostPinInput) return;
  const digits = String(elHostPinInput.value || "")
    .replace(/\D/g, "")
    .slice(0, 8);
  if (digits !== elHostPinInput.value) elHostPinInput.value = digits;
  renderHostPinControls(lastRoomState);
});

elHostPinSetBtn?.addEventListener("click", async () => {
  if (!roomCode || !playerId) return;
  if (elHostPinErr) elHostPinErr.textContent = "";

  const nextHostPin = normalizeHostPin(elHostPinInput?.value);
  if (!nextHostPin) {
    if (elHostPinErr) elHostPinErr.textContent = "Enter 4–8 digits.";
    return;
  }

  try {
    if (elHostPinSetBtn) elHostPinSetBtn.disabled = true;
    await hostPost(`/api/rooms/${encodeURIComponent(roomCode)}/hostPin`, { playerId, nextHostPin });
    hostPinCache = nextHostPin;
    if (elHostPinInput) elHostPinInput.value = "";
    renderHostPinControls(lastRoomState);
    showNotify({ tone: "good", title: "PIN updated", hint: "Host actions locked.", durationMs: 2600 });
  } catch (e) {
    if (elHostPinErr) elHostPinErr.textContent = humanizeErrorMessage(e, { room: lastRoomState });
    showErrorToast(e, { title: "Can't set PIN" });
  } finally {
    if (elHostPinSetBtn) elHostPinSetBtn.disabled = false;
    renderHostPinControls(lastRoomState);
  }
});

elHostPinClearBtn?.addEventListener("click", async () => {
  if (!roomCode || !playerId) return;
  if (elHostPinErr) elHostPinErr.textContent = "";
  try {
    if (elHostPinClearBtn) elHostPinClearBtn.disabled = true;
    await hostPost(`/api/rooms/${encodeURIComponent(roomCode)}/hostPin`, { playerId, nextHostPin: null });
    hostPinCache = null;
    if (elHostPinInput) elHostPinInput.value = "";
    renderHostPinControls(lastRoomState);
    showNotify({ tone: "info", title: "PIN cleared", hint: "Host actions unlocked.", durationMs: 2400 });
  } catch (e) {
    if (elHostPinErr) elHostPinErr.textContent = humanizeErrorMessage(e, { room: lastRoomState });
    showErrorToast(e, { title: "Can't clear PIN" });
  } finally {
    if (elHostPinClearBtn) elHostPinClearBtn.disabled = false;
    renderHostPinControls(lastRoomState);
  }
});

elStartBtn.addEventListener("click", async () => {
  if (!roomCode || !playerId) return;
  try {
    await hostPost(`/api/rooms/${encodeURIComponent(roomCode)}/start`, { playerId });
  } catch (e) {
    showErrorToast(e);
  }
});

elPostGameRematchBtn?.addEventListener("click", async () => {
  if (!roomCode || !playerId) return;
  if (!lastRoomState?.game || lastRoomState.game.phase !== "game_over") return;
  if (!isHost) return;

  if (elPostGameErr) elPostGameErr.textContent = "";
  try {
    rematchInFlight = true;
    renderScheduler.schedule();
    await hostPost(`/api/rooms/${encodeURIComponent(roomCode)}/rematch`, { playerId });
    showNotify({ tone: "good", title: "Rematch starting", hint: "Same room, no rejoin.", durationMs: 2600 });
  } catch (e) {
    if (elPostGameErr) elPostGameErr.textContent = humanizeErrorMessage(e, { room: lastRoomState });
    showErrorToast(e, { title: "Can't rematch" });
  } finally {
    rematchInFlight = false;
    renderScheduler.schedule();
  }
});

elPrimaryBtn.addEventListener("click", async () => {
  if (!roomCode || !playerId) return;
  if (!lastRoomState?.game) return;
  if ((lastRoomState.game.hints?.expected || null) !== "ROLL_DICE") return;
  animatePressEffect(elPrimaryBtn);
  try {
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/action`, { method: "POST", body: { playerId, type: "ROLL_DICE" } });
    feedbackGood("dice", { gain: 0.9 });
  } catch (e) {
    showErrorToast(e);
  }
});

elEndTurnBtn.addEventListener("click", async () => {
  if (!roomCode || !playerId) return;
  animatePressEffect(elEndTurnBtn);
  try {
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/action`, { method: "POST", body: { playerId, type: "END_TURN" } });
    feedbackGood("turn", { gain: 0.75 });
  } catch (e) {
    showErrorToast(e);
  }
});

elEmoteStrip?.addEventListener("click", async (ev) => {
  const target = ev.target instanceof Element ? ev.target : null;
  const btn = target?.closest("[data-emote]");
  if (!btn) return;
  if (!roomCode || !playerId) return;
  if (lastRoomState?.settings?.houseRules?.emotesEnabled === false) return;

  const emote = btn.getAttribute("data-emote") || "";
  if (!emote) return;

  const now = Date.now();
  if (now < emoteCooldownUntil) return;
  emoteCooldownUntil = now + 650;

  try {
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/emote`, { method: "POST", body: { playerId, emote } });
    feedbackGood("ui_tick", { gain: 0.8 });
  } catch (e) {
    const code = errorCode(e);
    if (code === "EMOTE_COOLDOWN" || code === "RATE_LIMIT") return;
    showErrorToast(e, { title: "Can't emote", durationMs: 2400 });
  }
});

elBuildRoadBtn.addEventListener("click", () => {
  if (mode !== "build_road") {
    const blockCode = elBuildRoadBtn?.dataset?.blockCode || "";
    if (blockCode) return showErrorToast(blockCode, { title: "Can't build road" });
  }
  triggerPressFeedback(elBuildRoadBtn, "light");
  mode = mode === "build_road" ? null : "build_road";
  if (mode) setActiveTab("board", { persist: true });
  if (lastRoomState) renderScheduler.schedule();
});

elBuildSettlementBtn.addEventListener("click", () => {
  if (mode !== "build_settlement") {
    const blockCode = elBuildSettlementBtn?.dataset?.blockCode || "";
    if (blockCode) return showErrorToast(blockCode, { title: "Can't build settlement" });
  }
  triggerPressFeedback(elBuildSettlementBtn, "light");
  mode = mode === "build_settlement" ? null : "build_settlement";
  if (mode) setActiveTab("board", { persist: true });
  if (lastRoomState) renderScheduler.schedule();
});

elBuildCityBtn.addEventListener("click", () => {
  if (mode !== "build_city") {
    const blockCode = elBuildCityBtn?.dataset?.blockCode || "";
    if (blockCode) return showErrorToast(blockCode, { title: "Can't build city" });
  }
  triggerPressFeedback(elBuildCityBtn, "light");
  mode = mode === "build_city" ? null : "build_city";
  if (mode) setActiveTab("board", { persist: true });
  if (lastRoomState) renderScheduler.schedule();
});

elCancelModeBtn.addEventListener("click", () => {
  mode = null;
  if (lastRoomState) renderScheduler.schedule();
});

function clearTradeForm() {
  if (elTradeErr) elTradeErr.textContent = "";
  setInputsToZero(tradeGiveInputs);
  setInputsToZero(tradeWantInputs);
  if (lastRoomState?.game) {
    const me = lastRoomState.players.find((p) => p.playerId === playerId) || null;
    renderTrade(lastRoomState, me, lastYouState);
  }
}

function applyTradeDraft({ to = "all", give = null, want = null } = {}) {
  if (!lastRoomState?.game) return false;
  if (elTradeErr) elTradeErr.textContent = "";

  const safeTo = String(to || "all");
  if (elTradeToSelect) {
    elTradeToSelect.value = safeTo;
    const hasTo = Array.from(elTradeToSelect.options || []).some((o) => o.value === safeTo);
    if (!hasTo) elTradeToSelect.value = "all";
  }

  for (const r of RESOURCE_TYPES) {
    const giveEl = tradeGiveInputs[r];
    if (giveEl) giveEl.value = String(parseNonNegativeInt(give?.[r] ?? 0));
    const wantEl = tradeWantInputs[r];
    if (wantEl) wantEl.value = String(parseNonNegativeInt(want?.[r] ?? 0));
  }

  updateTradeDraft();
  return true;
}

function suggestTradeDraft(hand) {
  const counts = hand && typeof hand === "object" ? hand : {};

  let giveType = null;
  let giveCount = 0;
  for (const r of RESOURCE_TYPES) {
    const n = parseNonNegativeInt(counts[r] ?? 0);
    if (n <= giveCount) continue;
    giveType = r;
    giveCount = n;
  }
  if (!giveType || giveCount <= 0) return null;

  let wantType = null;
  let wantCount = Infinity;
  for (const r of RESOURCE_TYPES) {
    if (r === giveType) continue;
    const n = parseNonNegativeInt(counts[r] ?? 0);
    if (n < wantCount) {
      wantType = r;
      wantCount = n;
    }
  }

  const safeWant = wantType && wantType !== giveType ? wantType : RESOURCE_TYPES.find((r) => r !== giveType) || "brick";
  return { to: "all", give: countsForSingle(giveType, 1), want: countsForSingle(safeWant, 1) };
}

elTradeClearBtn?.addEventListener("click", () => {
  clearTradeForm();
});

elTradeRepeatBtn?.addEventListener("click", () => {
  if (!lastSentTradeOffer) return;
  applyTradeDraft(lastSentTradeOffer);
  feedbackGood("ui_tick", { gain: 0.7 });
});

elTradeSuggestBtn?.addEventListener("click", () => {
  const hand = lastYouState?.hand || {};
  const draft = suggestTradeDraft(hand);
  if (!draft) return showErrorToast("NOT_ENOUGH_RESOURCES", { title: "No trade to suggest", durationMs: 2400 });
  applyTradeDraft(draft);
  feedbackGood("ui_tick", { gain: 0.75 });
});

function updateTradeDraft() {
  if (!lastRoomState?.game) return;
  const me = lastRoomState.players.find((p) => p.playerId === playerId) || null;
  renderTrade(lastRoomState, me, lastYouState);
}

function updateBankTradeDraft() {
  if (!lastRoomState?.game) return;
  const me = lastRoomState.players.find((p) => p.playerId === playerId) || null;
  renderBankTrade(lastRoomState, me, lastYouState);
}

function updateDevCardsDraft() {
  if (!lastRoomState?.game) return;
  const me = lastRoomState.players.find((p) => p.playerId === playerId) || null;
  renderDevCards(lastRoomState, me, lastYouState);
}

for (const el of [...Object.values(tradeGiveInputs), ...Object.values(tradeWantInputs)]) {
  el?.addEventListener("input", () => {
    if (elTradeErr) elTradeErr.textContent = "";
    updateTradeDraft();
  });
}
elTradeToSelect?.addEventListener("change", () => {
  if (elTradeErr) elTradeErr.textContent = "";
  updateTradeDraft();
});

elBankGiveSelect?.addEventListener("change", () => {
  if (elBankTradeErr) elBankTradeErr.textContent = "";
  updateBankTradeDraft();
});
elBankReceiveSelect?.addEventListener("change", () => {
  if (elBankTradeErr) elBankTradeErr.textContent = "";
  updateBankTradeDraft();
});
elBankReceiveAmount?.addEventListener("input", () => {
  if (elBankTradeErr) elBankTradeErr.textContent = "";
  updateBankTradeDraft();
});

elTradeSendBtn?.addEventListener("click", async () => {
  if (!roomCode || !playerId) return;
  if (!lastRoomState?.game) return;

  elTradeErr.textContent = "";
  const give = countsFromInputs(tradeGiveInputs);
  const want = countsFromInputs(tradeWantInputs);
  if (!hasAnyResources(give) || !hasAnyResources(want)) return (elTradeErr.textContent = "Enter something to give and want.");

  const hand = lastYouState?.hand || {};
  if (!hasEnough(hand, give)) return (elTradeErr.textContent = "You don't have those resources to give.");

  const to = elTradeToSelect?.value || "all";
  animatePressEffect(elTradeSendBtn);
  try {
    elTradeSendBtn.disabled = true;
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/action`, {
      method: "POST",
      body: { playerId, type: "TRADE_OFFER_CREATE", to, give, want }
    });
    lastSentTradeOffer = { to, give: { ...give }, want: { ...want } };
    feedbackGood("trade", { gain: 0.8 });
    clearTradeForm();
  } catch (e) {
    showErrorToast(e, { title: "Can't send trade" });
    elTradeErr.textContent = humanizeErrorMessage(e, { room: lastRoomState });
  } finally {
    updateTradeDraft();
  }
});

elBankTradeBtn?.addEventListener("click", async () => {
  if (!roomCode || !playerId) return;
  if (!lastRoomState?.game) return;

  if (elBankTradeErr) elBankTradeErr.textContent = "";
  const game = lastRoomState.game;
  const me = lastRoomState.players.find((p) => p.playerId === playerId) || null;
  if (!me) return;

  const giveType = elBankGiveSelect?.value || "wood";
  const receiveType = elBankReceiveSelect?.value || "brick";
  if (giveType === receiveType) return (elBankTradeErr.textContent = "Pick different resources.");

  const { ratios } = computeBankTradeRates(game, me.playerId);
  const ratio = parseNonNegativeInt(ratios[giveType] ?? 4) || 4;
  const receiveAmount = parseNonNegativeInt(elBankReceiveAmount?.value ?? 0);
  const giveAmount = ratio * receiveAmount;
  if (receiveAmount <= 0 || giveAmount <= 0) return (elBankTradeErr.textContent = "Pick an amount.");

  const give = countsForSingle(giveType, giveAmount);
  const receive = countsForSingle(receiveType, receiveAmount);

  const hand = lastYouState?.hand || {};
  if (!hasEnough(hand, give)) return (elBankTradeErr.textContent = "You don't have enough to give.");
  if (parseNonNegativeInt(game.bank?.[receiveType] ?? 0) < receiveAmount) return (elBankTradeErr.textContent = "Bank is out of that resource.");

  animatePressEffect(elBankTradeBtn);
  try {
    elBankTradeBtn.disabled = true;
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/action`, {
      method: "POST",
      body: { playerId, type: "BANK_TRADE", give, receive }
    });
    feedbackGood("trade", { gain: 0.8 });
  } catch (e) {
    showErrorToast(e, { title: "Can't bank trade" });
    elBankTradeErr.textContent = humanizeErrorMessage(e, { room: lastRoomState });
  } finally {
    updateBankTradeDraft();
  }
});

elDevBuyBtn?.addEventListener("click", async () => {
  if (!roomCode || !playerId) return;
  if (!lastRoomState?.game) return;

  if (elDevCardsErr) elDevCardsErr.textContent = "";
  animatePressEffect(elDevBuyBtn);
  try {
    elDevBuyBtn.disabled = true;
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/action`, { method: "POST", body: { playerId, type: "BUY_DEV_CARD" } });
    feedbackGood("ui_confirm", { gain: 0.85 });
  } catch (e) {
    showErrorToast(e, { title: "Can't buy dev card" });
    if (elDevCardsErr) elDevCardsErr.textContent = humanizeErrorMessage(e, { room: lastRoomState });
  } finally {
    updateDevCardsDraft();
  }
});

elDevCardsInHand?.addEventListener("click", async (ev) => {
  const target = ev.target instanceof Element ? ev.target : null;
  const btn = target?.closest("[data-dev-play]");
  if (!btn) return;
  if (!roomCode || !playerId) return;
  if (!lastRoomState?.game) return;

  const card = btn.getAttribute("data-dev-play") || "";
  if (card === "year_of_plenty" || card === "monopoly") {
    devPlayMode = card;
    if (elDevCardsErr) elDevCardsErr.textContent = "";
    if (elDevYopErr) elDevYopErr.textContent = "";
    if (elDevMonopolyErr) elDevMonopolyErr.textContent = "";
    if (card === "year_of_plenty") setInputsToZero(devYopInputs);
    updateDevCardsDraft();
    return;
  }

  if (elDevCardsErr) elDevCardsErr.textContent = "";
  try {
    btn.disabled = true;
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/action`, { method: "POST", body: { playerId, type: "PLAY_DEV_CARD", card } });
    feedbackGood("ui_confirm", { gain: 0.85 });
  } catch (e) {
    showErrorToast(e, { title: "Can't play dev card" });
    if (elDevCardsErr) elDevCardsErr.textContent = humanizeErrorMessage(e, { room: lastRoomState });
  } finally {
    btn.disabled = false;
    updateDevCardsDraft();
  }
});

elDevPlayCancelBtn?.addEventListener("click", () => {
  devPlayMode = null;
  setInputsToZero(devYopInputs);
  if (elDevYopErr) elDevYopErr.textContent = "";
  if (elDevMonopolyErr) elDevMonopolyErr.textContent = "";
  updateDevCardsDraft();
});

for (const el of Object.values(devYopInputs)) {
  el?.addEventListener("input", () => {
    if (elDevYopErr) elDevYopErr.textContent = "";
    updateDevCardsDraft();
  });
}

elDevYopPlayBtn?.addEventListener("click", async () => {
  if (!roomCode || !playerId) return;
  if (!lastRoomState?.game) return;

  if (elDevYopErr) elDevYopErr.textContent = "";

  const take = countsFromInputs(devYopInputs);
  const total = RESOURCE_TYPES.reduce((acc, r) => acc + parseNonNegativeInt(take[r] ?? 0), 0);
  if (total !== 2) return (elDevYopErr.textContent = "Take exactly 2.");

  const bank = lastRoomState.game.bank || {};
  for (const r of RESOURCE_TYPES) {
    const n = parseNonNegativeInt(take[r] ?? 0);
    if (n <= 0) continue;
    if (parseNonNegativeInt(bank[r] ?? 0) < n) return (elDevYopErr.textContent = "Bank doesn't have enough.");
  }

  try {
    elDevYopPlayBtn.disabled = true;
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/action`, {
      method: "POST",
      body: { playerId, type: "PLAY_DEV_CARD", card: "year_of_plenty", take }
    });
    feedbackGood("ui_confirm", { gain: 0.85 });
    devPlayMode = null;
    setInputsToZero(devYopInputs);
  } catch (e) {
    showErrorToast(e, { title: "Can't play Year of Plenty" });
    if (elDevYopErr) elDevYopErr.textContent = humanizeErrorMessage(e, { room: lastRoomState });
  } finally {
    updateDevCardsDraft();
  }
});

elDevMonopolyPlayBtn?.addEventListener("click", async () => {
  if (!roomCode || !playerId) return;
  if (!lastRoomState?.game) return;

  if (elDevMonopolyErr) elDevMonopolyErr.textContent = "";
  const resourceType = elDevMonopolySelect?.value || "wood";

  try {
    elDevMonopolyPlayBtn.disabled = true;
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/action`, {
      method: "POST",
      body: { playerId, type: "PLAY_DEV_CARD", card: "monopoly", resourceType }
    });
    feedbackGood("ui_confirm", { gain: 0.85 });
    devPlayMode = null;
  } catch (e) {
    showErrorToast(e, { title: "Can't play Monopoly" });
    if (elDevMonopolyErr) elDevMonopolyErr.textContent = humanizeErrorMessage(e, { room: lastRoomState });
  } finally {
    elDevMonopolyPlayBtn.disabled = false;
    updateDevCardsDraft();
  }
});

elTradeOffers?.addEventListener("click", async (ev) => {
  const target = ev.target instanceof Element ? ev.target : null;
  const btn = target?.closest("[data-trade-action]");
  if (!btn) return;
  if (!roomCode || !playerId) return;

  const action = btn.getAttribute("data-trade-action");
  const offerId = btn.getAttribute("data-offer-id");
  if (!action || !offerId) return;

  if (btn.getAttribute("aria-disabled") === "true") {
    const code = btn.getAttribute("data-block-code") || "BAD_PHASE";
    return showErrorToast(code, { title: action === "accept" ? "Can't accept trade" : "Can't do that" });
  }

  // Visual feedback for trade action buttons
  animatePressEffect(btn);

  try {
    if (action === "cancel") {
      await api(`/api/rooms/${encodeURIComponent(roomCode)}/action`, {
        method: "POST",
        body: { playerId, type: "TRADE_OFFER_CANCEL", offerId }
      });
      feedbackGood("trade", { gain: 0.6 });
      return;
    }
    if (action === "accept" || action === "reject") {
      await api(`/api/rooms/${encodeURIComponent(roomCode)}/action`, {
        method: "POST",
        body: { playerId, type: "TRADE_OFFER_RESPOND", offerId, response: action }
      });
      feedbackGood(action === "accept" ? "trade" : "ui_tick", { gain: action === "accept" ? 0.75 : 0.8 });
    }
  } catch (e) {
    showErrorToast(e);
  }
});

function updateDiscardDraft() {
  if (!lastRoomState?.game) return;
  const me = lastRoomState.players.find((p) => p.playerId === playerId) || null;
  renderRobberFlow(lastRoomState, me, lastYouState);
}

for (const el of Object.values(discardInputs)) {
  el?.addEventListener("input", () => {
    if (elDiscardErr) elDiscardErr.textContent = "";
    updateDiscardDraft();
  });
}

elDiscardSubmitBtn?.addEventListener("click", async () => {
  if (!roomCode || !playerId) return;
  if (!lastRoomState?.game) return;

  if (elDiscardErr) elDiscardErr.textContent = "";
  const required = parseNonNegativeInt(lastRoomState.game.hints?.discardRequiredByPlayerId?.[playerId] ?? 0);
  const submitted = !!lastRoomState.game.hints?.discardSubmittedByPlayerId?.[playerId];
  if (required <= 0 || submitted) return;

  const counts = countsFromInputs(discardInputs);
  const total = RESOURCE_TYPES.reduce((acc, r) => acc + parseNonNegativeInt(counts[r] ?? 0), 0);
  if (total !== required) return (elDiscardErr.textContent = `Discard exactly ${required}.`);

  const hand = lastYouState?.hand || {};
  if (!hasEnough(hand, counts)) return (elDiscardErr.textContent = "You don't have those cards.");

  animatePressEffect(elDiscardSubmitBtn);
  try {
    elDiscardSubmitBtn.disabled = true;
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/action`, {
      method: "POST",
      body: { playerId, type: "DISCARD_CARDS", counts }
    });
    feedbackGood("ui_confirm", { gain: 0.8 });
    setInputsToZero(discardInputs);
  } catch (e) {
    showErrorToast(e, { title: "Can't discard" });
    elDiscardErr.textContent = humanizeErrorMessage(e, { room: lastRoomState });
  } finally {
    updateDiscardDraft();
  }
});

elStealTargets?.addEventListener("click", async (ev) => {
  const target = ev.target instanceof Element ? ev.target : null;
  const btn = target?.closest("[data-victim-id]");
  if (!btn) return;
  if (!roomCode || !playerId) return;

  const fromPlayerId = btn.getAttribute("data-victim-id");
  if (!fromPlayerId) return;

  if (elStealErr) elStealErr.textContent = "";
  try {
    btn.disabled = true;
    await api(`/api/rooms/${encodeURIComponent(roomCode)}/action`, {
      method: "POST",
      body: { playerId, type: "STEAL_CARD", fromPlayerId }
    });
    feedbackGood("ui_confirm", { gain: 0.8 });
  } catch (e) {
    showErrorToast(e, { title: "Can't steal" });
    if (elStealErr) elStealErr.textContent = humanizeErrorMessage(e, { room: lastRoomState });
  } finally {
    btn.disabled = false;
  }
});

elBoardResetBtn?.addEventListener("click", () => {
  resetBoardView();
});

elBoardFullscreenBtn?.addEventListener("click", () => {
  const next = !elBoardShell?.classList.contains("fullscreen");
  setBoardFullscreen(next);
});

document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape") return;
  if (isSettingsOpen()) return closeSettings();
  if (isHelpOpen()) return closeHelp();
  setBoardFullscreen(false);
});

// iOS Safari: prevent page zoom gestures only on the board surface (keeps zoom accessible elsewhere).
function shouldBlockPageZoomGesture(target) {
  if (!elBoardShell || !target) return false;
  try {
    return elBoardShell.contains(target);
  } catch {
    return false;
  }
}

for (const evt of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(
    evt,
    (e) => {
      if (shouldBlockPageZoomGesture(e.target)) e.preventDefault();
    },
    { passive: false, capture: true }
  );
}

attachBoardPanZoom();

// =============================================================================
// How to Play Button
// =============================================================================

if (elHowToPlayBtn) {
  elHowToPlayBtn.addEventListener("click", () => {
    if (typeof window.CatanHints?.toggleQuickReference === "function") {
      window.CatanHints.toggleQuickReference();
    }
  });
}

// =============================================================================
// First-Time Player Hints Integration
// =============================================================================

/**
 * Check for hint triggers based on game state transitions.
 * Called from the render function when game state changes.
 * @param {Object} room - The current room state
 * @param {Object} me - The current player object
 * @param {Object} you - The "you" state with private info (hand, etc.)
 */
function checkHintTriggers(room, me, you) {
  // Only show hints if CatanHints is available
  if (typeof window.CatanHints?.showHint !== "function") return;
  if (typeof window.CatanHints?.hasSeenHint !== "function") return;

  const game = room?.game || null;
  if (!game) return;

  const expected = game.hints?.expected || null;
  const phase = game.phase || "";
  const subphase = game.subphase || "";
  const myTurn = !!me?.playerId && me.playerId === game.currentPlayerId;
  const hand = you?.hand || {};
  const totalResources = ["wood", "brick", "sheep", "wheat", "ore"].reduce(
    (sum, r) => sum + (parseInt(hand[r], 10) || 0),
    0
  );
  const hasResources = totalResources > 0;

  // Track if this is a state transition
  const isNewTurn = myTurn && !hintTriggerState.lastMyTurn;
  const isNewExpected = expected !== hintTriggerState.lastExpected;
  const isNewPhase = phase !== hintTriggerState.lastPhase || subphase !== hintTriggerState.lastSubphase;
  const justGotResources = hasResources && !hintTriggerState.lastHasResources;

  // Update state tracking
  hintTriggerState.lastExpected = expected;
  hintTriggerState.lastPhase = phase;
  hintTriggerState.lastSubphase = subphase;
  hintTriggerState.lastMyTurn = myTurn;
  hintTriggerState.lastHasResources = hasResources;

  // --- Hint: Your Turn (first turn ever) ---
  if (isNewTurn && !hintTriggerState.turnHintShown && !window.CatanHints.hasSeenHint("your_turn")) {
    // Only show on very first turn
    if (expected === "ROLL_DICE") {
      window.CatanHints.showHint("your_turn");
      hintTriggerState.turnHintShown = true;
      return; // Only show one hint at a time
    }
  }

  // --- Hint: First Roll ---
  if (myTurn && expected === "ROLL_DICE" && isNewExpected && !hintTriggerState.rollHintShown) {
    if (!window.CatanHints.hasSeenHint("first_roll")) {
      window.CatanHints.showHint("first_roll");
      hintTriggerState.rollHintShown = true;
      return;
    }
  }

  // --- Hint: First Settlement (setup phase) ---
  if (myTurn && expected === "PLACE_SETTLEMENT" && isNewExpected && !hintTriggerState.settlementHintShown) {
    if ((phase === "setup_round_1" || phase === "setup_round_2") && !window.CatanHints.hasSeenHint("first_settlement")) {
      window.CatanHints.showHint("first_settlement");
      hintTriggerState.settlementHintShown = true;
      return;
    }
  }

  // --- Hint: First Road (setup phase) ---
  if (myTurn && expected === "PLACE_ROAD" && isNewExpected && !hintTriggerState.roadHintShown) {
    if ((phase === "setup_round_1" || phase === "setup_round_2") && !window.CatanHints.hasSeenHint("first_road")) {
      window.CatanHints.showHint("first_road");
      hintTriggerState.roadHintShown = true;
      return;
    }
  }

  // --- Hint: Robber Introduction ---
  if (expected === "MOVE_ROBBER" && isNewExpected && !hintTriggerState.robberHintShown) {
    if (myTurn && !window.CatanHints.hasSeenHint("robber_intro")) {
      window.CatanHints.showHint("robber_intro");
      hintTriggerState.robberHintShown = true;
      return;
    }
  }

  // --- Hint: First Build (when player gets resources in main phase) ---
  if (myTurn && phase === "turn" && subphase === "main" && justGotResources && !hintTriggerState.buildHintShown) {
    if (!window.CatanHints.hasSeenHint("first_build")) {
      // Small delay to let the resources update visually first
      setTimeout(() => {
        if (typeof window.CatanHints?.showHint === "function") {
          window.CatanHints.showHint("first_build");
        }
      }, 1200);
      hintTriggerState.buildHintShown = true;
      return;
    }
  }

  // --- Hint: First Trade (after a few turns with resources) ---
  // Show trade hint if player has resources but hasn't traded yet
  if (myTurn && phase === "turn" && subphase === "main" && hasResources && !hintTriggerState.tradeHintShown) {
    // Only show if they've seen the build hint already (so they understand resources)
    if (window.CatanHints.hasSeenHint("first_build") && !window.CatanHints.hasSeenHint("first_trade")) {
      // Delay this hint to not overwhelm new players
      setTimeout(() => {
        if (typeof window.CatanHints?.showHint === "function") {
          window.CatanHints.showHint("first_trade");
        }
      }, 3000);
      hintTriggerState.tradeHintShown = true;
      return;
    }
  }
}

// --- Boot ---
loadIdentity();
elPanelTitle.textContent = "Join";
setView("join");
scheduleRoomPreview(roomCode);
if (roomCode && playerId && playerName) {
  elJoinErr.textContent = "Rejoining…";
  elStatus.textContent = "Rejoining…";
  setConnectionOverlay(true, { title: "Rejoining…", hint: "Hold tight — your seat is saved." });
  elJoinBtn.disabled = true;
  join({ name: playerName, code: roomCode })
    .catch((e) => {
      // Most commonly: the server restarted and this room is gone.
      if (errorCode(e) === "HTTP_404") {
        clearSession({ keepName: true });
        elRoomInput.value = "";
        elJoinErr.textContent = "Room not found (server restarted). Enter the new room code from the TV.";
        elStatus.textContent = "Disconnected";
        setConnectionOverlay(false);
        return;
      }
      elJoinErr.textContent = humanizeErrorMessage(e);
    })
    .finally(() => {
      elJoinBtn.disabled = false;
    });
}
