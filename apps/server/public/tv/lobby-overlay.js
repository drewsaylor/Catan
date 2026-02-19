/**
 * Lobby Overlay Module
 *
 * Purpose-built lobby screen showing QR code, player list,
 * scenario selection, and board preview.
 */

import { qrSvg } from "/shared/qr.js";
import { scenarioDisplay } from "/shared/scenarios.js";
import { renderBoard } from "/shared/board-renderer.js";
import { createAttractSampleBoard } from "/tv/attract-mode.js";

/**
 * Escape HTML special characters.
 * @param {string} s - String to escape
 * @returns {string} - Escaped string
 */
function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = String(s ?? "");
  return div.innerHTML;
}

/**
 * Create a lobby overlay controller.
 *
 * @param {object} options
 * @param {HTMLElement} options.elLobbyOverlay - Main overlay container
 * @param {HTMLElement} options.elLobbyRoomCode - Room code display
 * @param {HTMLElement} options.elLobbyQr - QR code container
 * @param {HTMLElement} options.elLobbyJoinUrl - Join URL display
 * @param {HTMLElement} options.elLobbyJoinRoomCode - Room code in URL
 * @param {HTMLElement} options.elLobbyPlayers - Players list container
 * @param {HTMLElement} options.elLobbyPlayersEmpty - Empty state message
 * @param {HTMLElement} options.elLobbyBoardPreview - Board preview container
 * @param {HTMLElement} options.elLobbyScenarioSelect - Scenario dropdown
 * @param {HTMLElement} options.elLobbyScenarioDesc - Scenario description
 * @param {HTMLElement} options.elLobbyThemeSelect - Theme dropdown
 * @param {HTMLElement} options.elLobbyStartStatus - Start status message
 * @param {Function} options.onScenarioChange - Callback for scenario changes
 * @param {Function} options.onThemeChange - Callback for theme changes
 * @param {Function} options.getAvailableThemes - Function to get available themes
 * @returns {object} - Lobby overlay controller
 */
export function createLobbyOverlayController({
  elLobbyOverlay,
  elLobbyRoomCode,
  elLobbyQr,
  elLobbyJoinUrl,
  elLobbyJoinRoomCode,
  elLobbyPlayers,
  elLobbyPlayersEmpty,
  elLobbyBoardPreview,
  elLobbyScenarioSelect,
  elLobbyScenarioDesc,
  elLobbyThemeSelect,
  elLobbyStartStatus,
  onScenarioChange,
  onThemeChange,
  getAvailableThemes
}) {
  let isActive = false;
  let lastQrUrl = null;
  let lastScenarioOptionsKey = null;
  let lastThemeOptionsKey = null;
  let previewBoard = null;

  function show() {
    if (!elLobbyOverlay || isActive) return;
    isActive = true;
    elLobbyOverlay.style.display = "";
  }

  async function hide() {
    if (!elLobbyOverlay || !isActive) return;
    isActive = false;
    elLobbyOverlay.style.display = "none";
    lastQrUrl = null;
    lastScenarioOptionsKey = null;
    lastThemeOptionsKey = null;
  }

  function renderQr(url) {
    if (!elLobbyQr || !url) return;
    if (url === lastQrUrl) return;
    lastQrUrl = url;
    try {
      elLobbyQr.innerHTML = qrSvg(url, { margin: 4, label: "Scan to Join" });
    } catch {
      elLobbyQr.innerHTML = "";
    }
  }

  function renderPlayers(players) {
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
        const name = escapeHtml(p?.name || "Player");
        const color = escapeHtml(p?.color || "#888");
        const isHost = p?.isHost === true;
        const isReady = p?.ready === true;
        const hostBadge = isHost ? '<span class="lobbyPlayerBadge lobbyPlayerBadgeHost">Host</span>' : "";
        const readyBadge = isReady ? '<span class="lobbyPlayerBadge lobbyPlayerBadgeReady">Ready</span>' : "";
        return `
          <div class="lobbyPlayerItem">
            <span class="lobbyPlayerColor" style="background: ${color}"></span>
            <span class="lobbyPlayerName">${name}</span>
            ${hostBadge}${readyBadge}
          </div>
        `;
      })
      .join("");

    elLobbyPlayers.innerHTML = html;
  }

  function scenariosKey(scenarios) {
    const list = Array.isArray(scenarios) ? scenarios : [];
    return list.map((s) => s?.id || "").join(",");
  }

  function renderScenarios(room) {
    if (!elLobbyScenarioSelect) return;

    const scenarios = Array.isArray(room?.settings?.scenarios) ? room.settings.scenarios : [];
    const currentId = typeof room?.settings?.scenarioId === "string" ? room.settings.scenarioId : "";
    const key = scenariosKey(scenarios);

    if (key !== lastScenarioOptionsKey) {
      lastScenarioOptionsKey = key;
      const opts = scenarios
        .map((s) => {
          const id = escapeHtml(s?.id || "");
          const name = escapeHtml(s?.name || id);
          return `<option value="${id}">${name}</option>`;
        })
        .join("");
      elLobbyScenarioSelect.innerHTML = opts;
    }

    if (elLobbyScenarioSelect.value !== currentId) {
      elLobbyScenarioSelect.value = currentId;
    }

    if (elLobbyScenarioDesc) {
      const display = scenarioDisplay(scenarios, currentId);
      elLobbyScenarioDesc.textContent = display.rulesSummary || display.description || "";
    }
  }

  function themesKey(themes) {
    const list = Array.isArray(themes) ? themes : [];
    return list.map((t) => t?.id || "").join(",");
  }

  function renderThemes(room) {
    if (!elLobbyThemeSelect) return;

    const themes = getAvailableThemes ? getAvailableThemes() : [];
    const currentId = typeof room?.themeId === "string" ? room.themeId : "default";
    const key = themesKey(themes);

    if (key !== lastThemeOptionsKey) {
      lastThemeOptionsKey = key;
      const opts = themes
        .map((t) => {
          const id = escapeHtml(t?.id || "");
          const name = escapeHtml(t?.name || id);
          return `<option value="${id}">${name}</option>`;
        })
        .join("");
      elLobbyThemeSelect.innerHTML = opts || '<option value="default">Default</option>';
    }

    if (elLobbyThemeSelect.value !== currentId) {
      elLobbyThemeSelect.value = currentId;
    }
  }

  function renderBoardPreview(scenarioId) {
    if (!elLobbyBoardPreview) return;

    // Create a sample board for preview
    if (!previewBoard) {
      previewBoard = createAttractSampleBoard();
    }

    try {
      renderBoard(elLobbyBoardPreview, previewBoard, {
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

  function updateStartStatus(room) {
    if (!elLobbyStartStatus) return;

    const players = Array.isArray(room?.players) ? room.players : [];
    const readyCount = players.filter((p) => p?.ready).length;
    const totalCount = players.length;
    const minPlayers = room?.settings?.minPlayers ?? 3;
    const maxPlayers = room?.settings?.maxPlayers ?? 4;

    if (totalCount < minPlayers) {
      elLobbyStartStatus.textContent = `Waiting for ${minPlayers - totalCount} more player${minPlayers - totalCount > 1 ? "s" : ""}...`;
      elLobbyStartStatus.className = "lobbyStartStatus lobbyStartStatusWaiting";
    } else if (readyCount < totalCount) {
      const notReady = totalCount - readyCount;
      elLobbyStartStatus.textContent = `Waiting for ${notReady} player${notReady > 1 ? "s" : ""} to ready up...`;
      elLobbyStartStatus.className = "lobbyStartStatus lobbyStartStatusWaiting";
    } else {
      elLobbyStartStatus.textContent = "All players ready! Host can start the game.";
      elLobbyStartStatus.className = "lobbyStartStatus lobbyStartStatusReady";
    }
  }

  function render(room) {
    if (!room || room.status !== "lobby") {
      hide();
      return;
    }

    if (!isActive) show();

    const roomCode = room.roomCode || "";
    const joinUrl = `${location.protocol}//${location.host}/phone?room=${encodeURIComponent(roomCode)}`;

    if (elLobbyRoomCode) elLobbyRoomCode.textContent = roomCode;
    if (elLobbyJoinRoomCode) elLobbyJoinRoomCode.textContent = roomCode;
    if (elLobbyJoinUrl) {
      const displayUrl = `${location.host}/phone`;
      elLobbyJoinUrl.textContent = displayUrl;
    }

    renderQr(joinUrl);
    renderPlayers(room.players);
    renderScenarios(room);
    renderThemes(room);
    renderBoardPreview(room.settings?.scenarioId);
    updateStartStatus(room);
  }

  function init() {
    if (elLobbyScenarioSelect && onScenarioChange) {
      elLobbyScenarioSelect.addEventListener("change", () => {
        const nextId = elLobbyScenarioSelect.value;
        if (nextId) onScenarioChange(nextId);
      });
    }

    if (elLobbyThemeSelect && onThemeChange) {
      elLobbyThemeSelect.addEventListener("change", async () => {
        const nextId = elLobbyThemeSelect.value;
        if (nextId) await onThemeChange(nextId);
      });
    }
  }

  function getIsActive() {
    return isActive;
  }

  return {
    init,
    show,
    hide,
    render,
    getIsActive
  };
}
