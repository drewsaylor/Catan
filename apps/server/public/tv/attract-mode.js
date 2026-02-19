/**
 * Attract Mode Module
 *
 * Provides a Jackbox-like idle screen with a 3D board preview.
 * Shows tips and QR codes to encourage players to join.
 */

import { getTipsForContext } from "/shared/tips-catalog.js";
import { qrSvg } from "/shared/qr.js";
import { renderBoard } from "/shared/board-renderer.js";

const ATTRACT_IDLE_TIMEOUT_MS = 30000;
const ATTRACT_TIP_INTERVAL_MS = 5500;

/**
 * Create a sample board for attract mode preview.
 * @returns {object} - Board data structure
 */
export function createAttractSampleBoard() {
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

/**
 * Create an attract mode controller.
 *
 * @param {object} options
 * @param {HTMLElement} options.elAttractMode - Container element
 * @param {HTMLElement} options.elAttractBoard - Board preview element
 * @param {HTMLElement} options.elAttractTip - Tip text element
 * @param {HTMLElement} options.elAttractQr - QR code element
 * @param {HTMLElement} options.elAttractCreateBtn - Create room button
 * @param {Function} options.onCreateRoom - Callback for room creation
 * @param {Function} options.getRoomState - Function to get current room state
 * @param {Function} options.sleep - Sleep/delay function
 * @returns {object} - Attract mode controller
 */
export function createAttractModeController({
  elAttractMode,
  elAttractBoard,
  elAttractTip,
  elAttractQr,
  elAttractCreateBtn,
  onCreateRoom,
  getRoomState,
  sleep
}) {
  let isActive = false;
  let tipIndex = 0;
  let tipTimer = null;
  let idleTimer = null;
  let sampleBoard = null;
  let tips = [];

  function init() {
    if (!elAttractMode) return;
    sampleBoard = createAttractSampleBoard();
    tips = getTipsForContext("lobby", { limit: 8, shuffle: true });
    elAttractCreateBtn?.addEventListener("click", async () => {
      await hide();
      if (onCreateRoom) await onCreateRoom();
    });
  }

  async function show() {
    if (!elAttractMode || isActive) return;
    isActive = true;
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

    tipIndex = 0;
    if (tips.length > 0 && elAttractTip) {
      elAttractTip.textContent = tips[0].text;
      startTipCarousel();
    }

    if (elAttractBoard && sampleBoard) {
      try {
        renderBoard(elAttractBoard, sampleBoard, {
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

  async function hide() {
    if (!elAttractMode || !isActive) return;
    stopTipCarousel();
    elAttractMode.classList.add("hiding");
    await sleep(350);
    isActive = false;
    elAttractMode.style.display = "none";
    elAttractMode.classList.remove("hiding");
  }

  function startTipCarousel() {
    stopTipCarousel();
    if (!elAttractTip || tips.length === 0) return;
    tipTimer = setInterval(() => {
      if (!isActive) {
        stopTipCarousel();
        return;
      }
      elAttractTip.classList.add("fading");
      setTimeout(() => {
        tipIndex = (tipIndex + 1) % tips.length;
        elAttractTip.textContent = tips[tipIndex].text;
        elAttractTip.classList.remove("fading");
      }, 300);
    }, ATTRACT_TIP_INTERVAL_MS);
  }

  function stopTipCarousel() {
    if (tipTimer) {
      clearInterval(tipTimer);
      tipTimer = null;
    }
  }

  function checkIdle() {
    const room = getRoomState();
    const hasPlayers = Array.isArray(room?.players) && room.players.length > 0;
    const isInGame = room?.status === "in_game";

    if (hasPlayers || isInGame) {
      cancelIdleTimer();
      if (isActive) hide();
      return;
    }

    if (!idleTimer && !isActive) {
      idleTimer = setTimeout(() => {
        idleTimer = null;
        const currentRoom = getRoomState();
        const currentHasPlayers = Array.isArray(currentRoom?.players) && currentRoom.players.length > 0;
        if (!currentHasPlayers && !isActive) show();
      }, ATTRACT_IDLE_TIMEOUT_MS);
    }
  }

  function cancelIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function getIsActive() {
    return isActive;
  }

  return {
    init,
    show,
    hide,
    checkIdle,
    cancelIdleTimer,
    getIsActive,
    getSampleBoard: () => sampleBoard
  };
}
