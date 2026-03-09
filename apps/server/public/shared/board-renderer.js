import { renderBoard as renderBoard2d } from "/shared/board-ui.js";

/**
 * Renders the board using the 2D renderer.
 * The 3D renderer has been removed for simplicity.
 */
export function renderBoard(container, board, options) {
  if (!container) return;
  renderBoard2d(container, board, options);
}

/**
 * No-op since 3D is removed.
 */
export async function applyBoardMoment(_container, _moment) {
  return false;
}

/**
 * No-op camera focus functions (3D removed).
 */
export async function focusPlayerArea(_container, _playerId, _structures, _opts) {
  return false;
}

export async function focusEdge(_container, _edgeId, _opts) {
  return false;
}

export async function focusVertex(_container, _vertexId, _opts) {
  return false;
}

export async function focusHex(_container, _hexId, _opts) {
  return false;
}

export async function cinematicReset(_container, _opts) {
  return false;
}
