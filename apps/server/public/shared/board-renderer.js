import { renderBoard as renderBoard2d } from "/shared/board-ui.js";
import { getSettings } from "/shared/settings.js";
import { supportsWebGL } from "/shared/render-capabilities.js";

const stateByContainer = new WeakMap();
let board3dModulePromise = null;
let bundleCheckPromise = null;
let bundleAvailable = null;

/**
 * Check if the production bundle exists.
 * Returns a promise that resolves to true if /build/3d.bundle.js is available.
 */
async function checkBundleExists() {
  if (bundleAvailable !== null) return bundleAvailable;
  if (bundleCheckPromise) return bundleCheckPromise;

  bundleCheckPromise = (async () => {
    try {
      const res = await fetch("/build/3d.bundle.js", { method: "HEAD" });
      bundleAvailable = res.ok;
    } catch {
      bundleAvailable = false;
    }
    return bundleAvailable;
  })();

  return bundleCheckPromise;
}

function normalizeBoardRenderer(value) {
  const v = String(value || "").toLowerCase();
  if (v === "2d" || v === "3d" || v === "auto") return v;
  return "auto";
}

function resolveRendererMode({ boardRenderer, webglSupported }) {
  const mode = normalizeBoardRenderer(boardRenderer);
  if (mode === "3d") return webglSupported ? "3d" : "2d";
  // Phase 1 is opt-in: "auto" stays on 2D until we flip the default later.
  return "2d";
}

function resolveRendererQuality({ rendererQuality = "auto", lowPowerMode = false } = {}) {
  if (lowPowerMode) return "low";
  const v = String(rendererQuality || "auto").toLowerCase();
  if (v === "auto" || v === "low" || v === "medium" || v === "high") return v;
  return "auto";
}

/**
 * Load the 3D board module, preferring the production bundle if available.
 * Falls back to the development module path if the bundle doesn't exist.
 */
async function loadBoard3dModule() {
  if (board3dModulePromise) return board3dModulePromise;

  // Check if the production bundle is available
  const hasBundledVersion = await checkBundleExists();

  if (hasBundledVersion) {
    // Use the production bundle (fewer requests, works offline)
    board3dModulePromise = import("/build/3d.bundle.js");
  } else {
    // Fall back to development modules (requires individual file serving)
    board3dModulePromise = import("/shared/board-3d.js");
  }

  return board3dModulePromise;
}

function destroy2d(container) {
  try {
    renderBoard2d(container, null, null);
  } catch {
    // Ignore.
  }
}

function destroy3d(container, mod) {
  try {
    mod?.renderBoard3d?.(container, null, null);
  } catch {
    // Ignore.
  }
}

function show3dLoading(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="board">
      <div class="muted" style="padding:14px;">Loading 3D…</div>
    </div>
  `;
}

export function renderBoard(container, board, options) {
  if (!container) return;

  const settings = getSettings();
  const webglSupported = supportsWebGL();
  const desiredQuality = resolveRendererQuality(settings);

  const state = stateByContainer.get(container) || {
    mode: null,
    three: null,
    token: 0,
    failed: false,
    latestBoard: null,
    latestOptions: null,
    latestQuality: "auto"
  };
  stateByContainer.set(container, state);

  const resolvedMode = state.failed ? "2d" : resolveRendererMode({ boardRenderer: settings?.boardRenderer, webglSupported });

  state.latestBoard = board;
  state.latestOptions = options;
  state.latestQuality = desiredQuality;

  if (state.mode && state.mode !== resolvedMode) {
    if (state.mode === "2d") destroy2d(container);
    if (state.mode === "3d") destroy3d(container, state.three);
  }
  state.mode = resolvedMode;

  if (resolvedMode === "2d") {
    renderBoard2d(container, board, options);
    return;
  }

  if (state.three) {
    state.three.renderBoard3d(container, board, { ...(options || {}), rendererQuality: desiredQuality });
    return;
  }

  show3dLoading(container);
  const token = (state.token += 1);

  loadBoard3dModule()
    .then((mod) => {
      if (!mod || typeof mod.renderBoard3d !== "function") throw new Error("board-3d module missing renderBoard3d");
      state.three = mod;
      if (state.mode !== "3d") return;
      if (token !== state.token) return;
      mod.renderBoard3d(container, state.latestBoard, { ...(state.latestOptions || {}), rendererQuality: state.latestQuality });
    })
    .catch(() => {
      state.failed = true;
      state.three = null;
      if (state.mode !== "3d") return;
      state.mode = "2d";
      renderBoard2d(container, state.latestBoard, state.latestOptions);
    });
}

export async function applyBoardMoment(container, moment) {
  if (!container || !moment) return false;
  const state = stateByContainer.get(container);
  if (!state || state.mode !== "3d") return false;

  if (state.three?.applyBoardMoment3d) {
    return !!state.three.applyBoardMoment3d(container, moment);
  }

  try {
    const mod = await loadBoard3dModule();
    if (state.mode !== "3d") return false;
    if (mod?.applyBoardMoment3d) return !!mod.applyBoardMoment3d(container, moment);
  } catch {
    // Ignore moment hook failures.
  }

  return false;
}

// === CINEMATIC CAMERA EXPORTS ===
// Exposed for TV to trigger dramatic camera moves during moments.
// These are no-ops in 2D mode - only active when 3D is enabled.

/**
 * Focus camera on a player's area (turn start).
 * @param {HTMLElement} container
 * @param {string} playerId
 * @param {Object} structures
 * @param {Object} [opts]
 * @returns {Promise<boolean>}
 */
export async function focusPlayerArea(container, playerId, structures, opts) {
  if (!container) return false;
  const state = stateByContainer.get(container);
  if (!state || state.mode !== "3d") return false;

  if (state.three?.focusPlayerArea3d) {
    return !!state.three.focusPlayerArea3d(container, playerId, structures, opts);
  }

  try {
    const mod = await loadBoard3dModule();
    if (state.mode !== "3d") return false;
    if (mod?.focusPlayerArea3d) return !!mod.focusPlayerArea3d(container, playerId, structures, opts);
  } catch {
    // Ignore.
  }

  return false;
}

/**
 * Focus camera on an edge (road placement).
 * @param {HTMLElement} container
 * @param {string} edgeId
 * @param {Object} [opts]
 * @returns {Promise<boolean>}
 */
export async function focusEdge(container, edgeId, opts) {
  if (!container) return false;
  const state = stateByContainer.get(container);
  if (!state || state.mode !== "3d") return false;

  if (state.three?.focusEdge3d) {
    return !!state.three.focusEdge3d(container, edgeId, opts);
  }

  try {
    const mod = await loadBoard3dModule();
    if (state.mode !== "3d") return false;
    if (mod?.focusEdge3d) return !!mod.focusEdge3d(container, edgeId, opts);
  } catch {
    // Ignore.
  }

  return false;
}

/**
 * Focus camera on a vertex (settlement/city placement).
 * @param {HTMLElement} container
 * @param {string} vertexId
 * @param {Object} [opts]
 * @returns {Promise<boolean>}
 */
export async function focusVertex(container, vertexId, opts) {
  if (!container) return false;
  const state = stateByContainer.get(container);
  if (!state || state.mode !== "3d") return false;

  if (state.three?.focusVertex3d) {
    return !!state.three.focusVertex3d(container, vertexId, opts);
  }

  try {
    const mod = await loadBoard3dModule();
    if (state.mode !== "3d") return false;
    if (mod?.focusVertex3d) return !!mod.focusVertex3d(container, vertexId, opts);
  } catch {
    // Ignore.
  }

  return false;
}

/**
 * Focus camera on a hex (robber movement).
 * @param {HTMLElement} container
 * @param {string} hexId
 * @param {Object} [opts]
 * @returns {Promise<boolean>}
 */
export async function focusHex(container, hexId, opts) {
  if (!container) return false;
  const state = stateByContainer.get(container);
  if (!state || state.mode !== "3d") return false;

  if (state.three?.focusHex3d) {
    return !!state.three.focusHex3d(container, hexId, opts);
  }

  try {
    const mod = await loadBoard3dModule();
    if (state.mode !== "3d") return false;
    if (mod?.focusHex3d) return !!mod.focusHex3d(container, hexId, opts);
  } catch {
    // Ignore.
  }

  return false;
}

/**
 * Smoothly reset camera to default view.
 * @param {HTMLElement} container
 * @param {Object} [opts]
 * @returns {Promise<boolean>}
 */
export async function cinematicReset(container, opts) {
  if (!container) return false;
  const state = stateByContainer.get(container);
  if (!state || state.mode !== "3d") return false;

  if (state.three?.cinematicReset3d) {
    return !!state.three.cinematicReset3d(container, opts);
  }

  try {
    const mod = await loadBoard3dModule();
    if (state.mode !== "3d") return false;
    if (mod?.cinematicReset3d) return !!mod.cinematicReset3d(container, opts);
  } catch {
    // Ignore.
  }

  return false;
}
