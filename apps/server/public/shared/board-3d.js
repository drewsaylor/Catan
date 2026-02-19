import * as THREE from "/vendor/three/three.module.js";
import { prefersLowPower } from "/shared/render-capabilities.js";
import { getSettings } from "/shared/settings.js";
import { getWorld3dParams, onThemeChange } from "/shared/theme-loader.js";

// === DEBUG OVERLAY ===

/**
 * Checks if debug pick mode is enabled via URL param.
 * @returns {boolean}
 */
function isDebugPickEnabled() {
  if (typeof window === "undefined" || typeof URLSearchParams === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("debugPick") === "1";
  } catch {
    return false;
  }
}

/**
 * Creates the debug overlay div for displaying pick info.
 * @param {HTMLElement} container
 * @returns {{ element: HTMLElement, updateCounts: Function, updateLastPick: Function, destroy: Function }}
 */
function createDebugOverlay(container) {
  const overlay = document.createElement("div");
  overlay.className = "board3d-debug-overlay";
  overlay.style.cssText = `
    position: absolute;
    top: 8px;
    left: 8px;
    background: rgba(0, 0, 0, 0.75);
    color: #4cc9f0;
    font-family: ui-monospace, monospace;
    font-size: 11px;
    padding: 6px 10px;
    border-radius: 4px;
    pointer-events: none;
    z-index: 1000;
    line-height: 1.5;
  `;

  const countsLine = document.createElement("div");
  countsLine.textContent = "Vertices: -, Edges: -, Hexes: -";

  const lastPickLine = document.createElement("div");
  lastPickLine.textContent = "Last pick: none";

  overlay.appendChild(countsLine);
  overlay.appendChild(lastPickLine);

  // Ensure container has relative positioning for overlay
  const containerStyle = window.getComputedStyle(container);
  if (containerStyle.position === "static") {
    container.style.position = "relative";
  }

  container.appendChild(overlay);

  return {
    element: overlay,
    updateCounts(vertexCount, edgeCount, hexCount) {
      countsLine.textContent = `Vertices: ${vertexCount}, Edges: ${edgeCount}, Hexes: ${hexCount}`;
    },
    updateLastPick(kind, id) {
      if (!kind || !id) {
        lastPickLine.textContent = "Last pick: none";
      } else {
        lastPickLine.textContent = `Last pick: kind=${kind} id=${id}`;
      }
    },
    destroy() {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }
  };
}

/**
 * Creates a debug wireframe material for pick meshes.
 * @returns {THREE.MeshBasicMaterial}
 */
function createDebugPickMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true,
    transparent: true,
    opacity: 0.6,
    depthWrite: false
  });
}

// === RUNTIME VALIDATION ===

/** @type {Set<string>} Tracks warnings that have been logged this session */
const loggedWarnings = new Set();

/**
 * Logs a warning once per session.
 * @param {string} key - Unique key for this warning
 * @param {string} message - Warning message
 */
function warnOnce(key, message) {
  if (loggedWarnings.has(key)) return;
  loggedWarnings.add(key);
  console.warn(`[board-3d] ${message}`);
}

/**
 * Validates selectable IDs against board data.
 * Logs warnings (once per session) for invalid IDs.
 * @param {Object} params
 * @param {string[]} params.selectableVertexIds
 * @param {string[]} params.selectableEdgeIds
 * @param {string[]} params.selectableHexIds
 * @param {Set<string>} params.validVertexIds
 * @param {Set<string>} params.validEdgeIds
 * @param {Set<string>} params.validHexIds
 */
function validateSelectableIds({
  selectableVertexIds,
  selectableEdgeIds,
  selectableHexIds,
  validVertexIds,
  validEdgeIds,
  validHexIds,
}) {
  const invalidVertices = [];
  const invalidEdges = [];
  const invalidHexes = [];

  for (const id of selectableVertexIds) {
    if (!validVertexIds.has(id)) invalidVertices.push(id);
  }
  for (const id of selectableEdgeIds) {
    if (!validEdgeIds.has(id)) invalidEdges.push(id);
  }
  for (const id of selectableHexIds) {
    if (!validHexIds.has(id)) invalidHexes.push(id);
  }

  if (invalidVertices.length > 0) {
    warnOnce(
      `invalid-vertex-ids:${invalidVertices.join(",")}`,
      `Selectable vertex IDs not found in board data: ${invalidVertices.join(", ")}`
    );
  }
  if (invalidEdges.length > 0) {
    warnOnce(
      `invalid-edge-ids:${invalidEdges.join(",")}`,
      `Selectable edge IDs not found in board data: ${invalidEdges.join(", ")}`
    );
  }
  if (invalidHexes.length > 0) {
    warnOnce(
      `invalid-hex-ids:${invalidHexes.join(",")}`,
      `Selectable hex IDs not found in board data: ${invalidHexes.join(", ")}`
    );
  }
}

/**
 * Validates pick mesh counts against board data.
 * Logs warnings (once per session) for mismatches.
 * @param {Object} params
 * @param {number} params.hexPickCount
 * @param {number} params.edgePickCount
 * @param {number} params.vertexPickCount
 * @param {number} params.boardHexCount
 * @param {number} params.boardEdgeCount
 * @param {number} params.boardVertexCount
 */
function validatePickMeshCounts({
  hexPickCount,
  edgePickCount,
  vertexPickCount,
  boardHexCount,
  boardEdgeCount,
  boardVertexCount,
}) {
  if (hexPickCount !== boardHexCount) {
    warnOnce(
      "hex-pick-mismatch",
      `Hex pick mesh count (${hexPickCount}) does not match board hex count (${boardHexCount})`
    );
  }
  if (edgePickCount !== boardEdgeCount) {
    warnOnce(
      "edge-pick-mismatch",
      `Edge pick mesh count (${edgePickCount}) does not match board edge count (${boardEdgeCount})`
    );
  }
  if (vertexPickCount !== boardVertexCount) {
    warnOnce(
      "vertex-pick-mismatch",
      `Vertex pick mesh count (${vertexPickCount}) does not match board vertex count (${boardVertexCount})`
    );
  }
}

// === END DEBUG/VALIDATION ===

// === 3D DICE SYSTEM ===
// Animated 3D dice for dice_roll moments

/**
 * Pip positions for each die face (1-6)
 * Coordinates are relative to face center, normalized to -0.3 to 0.3
 */
const DICE_PIP_LAYOUTS = {
  1: [[0, 0]],
  2: [[-0.2, -0.2], [0.2, 0.2]],
  3: [[-0.2, -0.2], [0, 0], [0.2, 0.2]],
  4: [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]],
  5: [[-0.2, -0.2], [0.2, -0.2], [0, 0], [-0.2, 0.2], [0.2, 0.2]],
  6: [[-0.2, -0.25], [-0.2, 0], [-0.2, 0.25], [0.2, -0.25], [0.2, 0], [0.2, 0.25]]
};

/**
 * Ease-out-back easing for dice animation.
 * @param {number} t - Progress (0-1)
 * @returns {number} Eased value
 */
function easeOutBackDice(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * Creates a 3D die mesh with pip textures on faces.
 * @param {number} size - Die size in world units
 * @returns {{ mesh: THREE.Group, setFace: (n: number) => void, disposables: any[] }}
 */
function createDie3d(size = 40) {
  const disposables = [];
  const group = new THREE.Group();

  // Create die body (rounded cube approximation using chamfered box)
  const bodySize = size * 0.92;
  const bodyGeo = new THREE.BoxGeometry(bodySize, bodySize, bodySize, 2, 2, 2);
  disposables.push(bodyGeo);

  // Apply slight spherical deformation for rounded look
  const posAttr = bodyGeo.getAttribute("position");
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const v = new THREE.Vector3(x, y, z);
    const dist = v.length();
    const sphereDist = bodySize * 0.58;
    if (dist > sphereDist * 0.95) {
      v.normalize().multiplyScalar(sphereDist + (dist - sphereDist) * 0.7);
      posAttr.setXYZ(i, v.x, v.y, v.z);
    }
  }
  bodyGeo.computeVertexNormals();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xfafaf5,
    roughness: 0.25,
    metalness: 0.02,
    emissive: 0x000000,
    emissiveIntensity: 0
  });
  disposables.push(bodyMat);

  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(bodyMesh);

  // Create pip material
  const pipMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.6,
    metalness: 0.1
  });
  disposables.push(pipMat);

  // Pip geometry (small sphere)
  const pipRadius = size * 0.08;
  const pipGeo = new THREE.SphereGeometry(pipRadius, 8, 6);
  disposables.push(pipGeo);

  // Face normals and rotations for placing pips
  const faces = [
    { normal: [0, 0, 1], up: [0, 1, 0] },   // Front (+Z) - face 1
    { normal: [0, 0, -1], up: [0, 1, 0] },  // Back (-Z) - face 6
    { normal: [1, 0, 0], up: [0, 1, 0] },   // Right (+X) - face 3
    { normal: [-1, 0, 0], up: [0, 1, 0] },  // Left (-X) - face 4
    { normal: [0, 1, 0], up: [0, 0, -1] },  // Top (+Y) - face 2
    { normal: [0, -1, 0], up: [0, 0, 1] }   // Bottom (-Y) - face 5
  ];

  // Standard die face values (opposite faces sum to 7)
  const faceValues = [1, 6, 3, 4, 2, 5];

  // Create pips for each face
  const faceOffset = bodySize * 0.5 + pipRadius * 0.2;
  for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
    const face = faces[faceIdx];
    const faceValue = faceValues[faceIdx];
    const pips = DICE_PIP_LAYOUTS[faceValue];

    const normal = new THREE.Vector3(...face.normal);
    const up = new THREE.Vector3(...face.up);
    const right = new THREE.Vector3().crossVectors(up, normal).normalize();

    for (const [px, py] of pips) {
      const pipMesh = new THREE.Mesh(pipGeo, pipMat);
      const pos = normal.clone().multiplyScalar(faceOffset);
      pos.add(right.clone().multiplyScalar(px * bodySize));
      pos.add(up.clone().multiplyScalar(py * bodySize));
      pipMesh.position.copy(pos);
      group.add(pipMesh);
    }
  }

  // Rotation targets for showing each face value (facing camera at +Z)
  const faceRotations = {
    1: { x: 0, y: 0, z: 0 },
    2: { x: -Math.PI / 2, y: 0, z: 0 },
    3: { x: 0, y: -Math.PI / 2, z: 0 },
    4: { x: 0, y: Math.PI / 2, z: 0 },
    5: { x: Math.PI / 2, y: 0, z: 0 },
    6: { x: Math.PI, y: 0, z: 0 }
  };

  function setFace(n) {
    const rot = faceRotations[n] || faceRotations[1];
    group.rotation.set(rot.x, rot.y, rot.z);
  }

  return { mesh: group, setFace, disposables };
}

/**
 * Creates a 3D dice panel that can be embedded in a container.
 * @param {HTMLElement} container - DOM container for the dice
 * @param {Object} options - Configuration options
 * @returns {Object} Dice controller with animate/update methods
 */
export function createDice3dPanel(container, options = {}) {
  if (!container) return null;

  const size = options.size || 56;
  const gap = options.gap || 12;

  // Create canvas for Three.js
  const canvas = document.createElement("canvas");
  canvas.className = "dice3d-canvas";
  canvas.style.cssText = `
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
  `;

  // Wrapper for positioning
  const wrapper = document.createElement("div");
  wrapper.className = "dice3d-wrapper";
  wrapper.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: ${size * 2 + gap}px;
    height: ${size}px;
    pointer-events: none;
  `;
  wrapper.appendChild(canvas);

  // Track disposables
  const disposables = [];

  // Set up Three.js scene
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "low-power"
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(size * 2 + gap, size, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, (size * 2 + gap) / size, 1, 500);
  camera.position.set(0, 0, size * 2.2);
  camera.lookAt(0, 0, 0);

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
  keyLight.position.set(50, 80, 100);
  scene.add(keyLight);

  // Create two dice
  const die1 = createDie3d(size * 0.7);
  const die2 = createDie3d(size * 0.7);
  disposables.push(...die1.disposables, ...die2.disposables);

  die1.mesh.position.set(-(size * 0.5 + gap / 2), 0, 0);
  die2.mesh.position.set(size * 0.5 + gap / 2, 0, 0);

  scene.add(die1.mesh);
  scene.add(die2.mesh);

  // Animation state
  let animating = false;
  let animationId = null;
  let animStartTime = 0;
  let animDuration = 400;
  let targetD1 = 1;
  let targetD2 = 1;
  let currentD1 = 1;
  let currentD2 = 1;
  let destroyed = false;
  let reducedMotion = false;

  function render() {
    if (destroyed) return;
    renderer.render(scene, camera);
  }

  function setValues(d1, d2, immediate = false) {
    targetD1 = Math.max(1, Math.min(6, Math.floor(d1) || 1));
    targetD2 = Math.max(1, Math.min(6, Math.floor(d2) || 1));

    if (immediate || reducedMotion) {
      currentD1 = targetD1;
      currentD2 = targetD2;
      die1.setFace(currentD1);
      die2.setFace(currentD2);
      render();
      return;
    }
  }

  function animateRoll(d1, d2, duration = 400) {
    if (destroyed) return Promise.resolve();
    if (reducedMotion) {
      setValues(d1, d2, true);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      targetD1 = Math.max(1, Math.min(6, Math.floor(d1) || 1));
      targetD2 = Math.max(1, Math.min(6, Math.floor(d2) || 1));
      animDuration = Math.max(100, duration);
      animStartTime = performance.now();
      animating = true;

      // Random starting rotations for tumble effect
      die1.mesh.rotation.set(
        Math.random() * Math.PI * 4,
        Math.random() * Math.PI * 4,
        Math.random() * Math.PI * 2
      );
      die2.mesh.rotation.set(
        Math.random() * Math.PI * 4,
        Math.random() * Math.PI * 4,
        Math.random() * Math.PI * 2
      );

      const startRot1 = { x: die1.mesh.rotation.x, y: die1.mesh.rotation.y, z: die1.mesh.rotation.z };
      const startRot2 = { x: die2.mesh.rotation.x, y: die2.mesh.rotation.y, z: die2.mesh.rotation.z };

      // Target rotations based on face values
      const faceRotations = {
        1: { x: 0, y: 0, z: 0 },
        2: { x: -Math.PI / 2, y: 0, z: 0 },
        3: { x: 0, y: -Math.PI / 2, z: 0 },
        4: { x: 0, y: Math.PI / 2, z: 0 },
        5: { x: Math.PI / 2, y: 0, z: 0 },
        6: { x: Math.PI, y: 0, z: 0 }
      };

      const endRot1 = faceRotations[targetD1] || faceRotations[1];
      const endRot2 = faceRotations[targetD2] || faceRotations[1];

      // Add extra spins for dramatic effect
      const extraSpins = Math.PI * 2;
      const target1 = {
        x: endRot1.x + extraSpins * Math.sign(endRot1.x - startRot1.x || 1),
        y: endRot1.y + extraSpins,
        z: endRot1.z
      };
      const target2 = {
        x: endRot2.x + extraSpins * Math.sign(endRot2.x - startRot2.x || -1),
        y: endRot2.y - extraSpins,
        z: endRot2.z
      };

      function tick() {
        if (destroyed) {
          animating = false;
          resolve();
          return;
        }

        const elapsed = performance.now() - animStartTime;
        const progress = Math.min(1, elapsed / animDuration);
        const eased = easeOutBackDice(progress);

        die1.mesh.rotation.x = startRot1.x + (target1.x - startRot1.x) * eased;
        die1.mesh.rotation.y = startRot1.y + (target1.y - startRot1.y) * eased;
        die1.mesh.rotation.z = startRot1.z + (target1.z - startRot1.z) * eased;

        die2.mesh.rotation.x = startRot2.x + (target2.x - startRot2.x) * eased;
        die2.mesh.rotation.y = startRot2.y + (target2.y - startRot2.y) * eased;
        die2.mesh.rotation.z = startRot2.z + (target2.z - startRot2.z) * eased;

        render();

        if (progress < 1) {
          animationId = requestAnimationFrame(tick);
        } else {
          // Snap to exact final rotation
          die1.setFace(targetD1);
          die2.setFace(targetD2);
          currentD1 = targetD1;
          currentD2 = targetD2;
          render();
          animating = false;
          animationId = null;
          resolve();
        }
      }

      if (animationId) cancelAnimationFrame(animationId);
      animationId = requestAnimationFrame(tick);
    });
  }

  function setReducedMotion(value) {
    reducedMotion = !!value;
  }

  function mount() {
    if (destroyed) return;
    // Find the dice group in the container and position relative to it
    const diceGroup = container.querySelector(".diceGroup");
    if (diceGroup) {
      diceGroup.style.position = "relative";
      diceGroup.appendChild(wrapper);
    }
    render();
  }

  function unmount() {
    if (wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
  }

  function destroy() {
    destroyed = true;
    if (animationId) cancelAnimationFrame(animationId);
    unmount();
    for (const d of disposables) {
      try { d.dispose?.(); } catch { /* ignore */ }
    }
    try { renderer.dispose(); } catch { /* ignore */ }
    try { renderer.forceContextLoss?.(); } catch { /* ignore */ }
  }

  // Initial render
  setValues(1, 1, true);

  return {
    element: wrapper,
    mount,
    unmount,
    setValues,
    animateRoll,
    setReducedMotion,
    destroy,
    get isAnimating() { return animating; }
  };
}

// === END 3D DICE SYSTEM ===

// === RESOURCE FLYOUT SYSTEM ===
// Animated resource chip flyouts from producing hexes to player UI

/**
 * Creates a resource flyout manager for animating resource gains.
 * Uses CSS animations for performance and simplicity.
 * @param {HTMLElement} container - Container for flyout elements
 * @returns {Object} Flyout controller
 */
export function createResourceFlyoutManager(container) {
  if (!container) return null;

  // Ensure container has relative positioning
  const containerStyle = window.getComputedStyle(container);
  if (containerStyle.position === "static") {
    container.style.position = "relative";
  }

  // Create flyout layer
  const layer = document.createElement("div");
  layer.className = "resource-flyout-layer";
  layer.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 1000;
  `;
  container.appendChild(layer);

  // Inject CSS if not already present
  if (!document.getElementById("resource-flyout-styles")) {
    const style = document.createElement("style");
    style.id = "resource-flyout-styles";
    style.textContent = `
      .resource-flyout {
        position: absolute;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 700;
        color: white;
        text-shadow: 0 1px 2px rgba(0,0,0,0.4);
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        pointer-events: none;
        opacity: 0;
        transform: scale(0.5);
        will-change: transform, opacity, left, top;
      }
      .resource-flyout.animating {
        animation: resourceFlyout var(--flyout-duration, 500ms) var(--ease-out, ease-out) forwards;
      }
      .resource-flyout.res-wood { background: linear-gradient(135deg, #2f8f52 0%, #1d6b3a 100%); }
      .resource-flyout.res-brick { background: linear-gradient(135deg, #b84b3b 0%, #8c362a 100%); }
      .resource-flyout.res-sheep { background: linear-gradient(135deg, #6fcf7a 0%, #4da858 100%); }
      .resource-flyout.res-wheat { background: linear-gradient(135deg, #d6b84b 0%, #b89a2e 100%); }
      .resource-flyout.res-ore { background: linear-gradient(135deg, #9aa3ad 0%, #6e7680 100%); }

      @keyframes resourceFlyout {
        0% {
          opacity: 0;
          transform: scale(0.5);
        }
        15% {
          opacity: 1;
          transform: scale(1.1);
        }
        30% {
          transform: scale(1);
        }
        85% {
          opacity: 1;
        }
        100% {
          opacity: 0;
          transform: scale(0.8) translateY(-20px);
        }
      }

      html[data-reduced-motion="true"] .resource-flyout.animating {
        animation: resourceFlyoutReduced 300ms ease-out forwards;
      }

      @keyframes resourceFlyoutReduced {
        0% { opacity: 0; transform: scale(1); }
        20% { opacity: 1; }
        80% { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  let destroyed = false;
  let reducedMotion = false;

  /**
   * Shows a resource flyout from a source position.
   * @param {Object} params - Flyout parameters
   * @param {string} params.resource - Resource type (wood, brick, sheep, wheat, ore)
   * @param {number} params.count - Number of resources
   * @param {{x: number, y: number}} params.from - Starting position (relative to container)
   * @param {{x: number, y: number}} params.to - Ending position (relative to container)
   * @param {number} params.duration - Animation duration in ms (default 500)
   */
  function showFlyout({ resource, count, from, to, duration = 500 }) {
    if (destroyed) return;
    if (!resource || count <= 0) return;

    const el = document.createElement("div");
    el.className = `resource-flyout res-${resource}`;
    el.textContent = `+${count}`;
    el.style.setProperty("--flyout-duration", `${duration}ms`);
    el.style.left = `${from.x}px`;
    el.style.top = `${from.y}px`;

    layer.appendChild(el);

    // Trigger animation
    requestAnimationFrame(() => {
      el.classList.add("animating");
      // Animate position using CSS custom properties and transition
      el.style.left = `${to.x}px`;
      el.style.top = `${to.y}px`;
    });

    // Remove after animation
    const cleanupDelay = reducedMotion ? 350 : duration + 50;
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, cleanupDelay);
  }

  /**
   * Shows multiple resource flyouts (aggregated by resource type).
   * @param {Array<{resource: string, count: number, hexId: string}>} resources - Resources to show
   * @param {Function} getHexPosition - Function to get hex center position by ID
   * @param {{x: number, y: number}} targetPosition - Target position for flyouts
   * @param {number} staggerMs - Stagger delay between flyouts (default 80)
   */
  function showResourceGain(resources, getHexPosition, targetPosition, staggerMs = 80) {
    if (destroyed) return;
    if (!resources || !resources.length) return;

    // Aggregate by resource type
    const byResource = new Map();
    for (const r of resources) {
      if (!r?.resource || r.count <= 0) continue;
      const existing = byResource.get(r.resource) || { count: 0, hexIds: [] };
      existing.count += r.count;
      if (r.hexId) existing.hexIds.push(r.hexId);
      byResource.set(r.resource, existing);
    }

    let delay = 0;
    for (const [resource, data] of byResource.entries()) {
      // Get centroid of all producing hexes for this resource
      let fromX = 0;
      let fromY = 0;
      let count = 0;
      for (const hexId of data.hexIds) {
        const pos = getHexPosition?.(hexId);
        if (pos) {
          fromX += pos.x;
          fromY += pos.y;
          count++;
        }
      }
      if (count === 0) {
        // Fallback to center
        fromX = targetPosition.x;
        fromY = targetPosition.y - 50;
      } else {
        fromX /= count;
        fromY /= count;
      }

      setTimeout(() => {
        showFlyout({
          resource,
          count: data.count,
          from: { x: fromX, y: fromY },
          to: targetPosition,
          duration: reducedMotion ? 300 : 500
        });
      }, delay);

      delay += reducedMotion ? 40 : staggerMs;
    }
  }

  function setReducedMotion(value) {
    reducedMotion = !!value;
  }

  function destroy() {
    destroyed = true;
    if (layer.parentNode) layer.parentNode.removeChild(layer);
  }

  return {
    showFlyout,
    showResourceGain,
    setReducedMotion,
    destroy
  };
}

// === END RESOURCE FLYOUT SYSTEM ===

// === FX HELPER SYSTEM ===
// Visual effects for build moments and selectable highlights

/**
 * Creates particle burst effect at a position.
 * Uses CSS animations for performance.
 * @param {HTMLElement} container - Container for particles
 * @param {{x: number, y: number}} position - Burst center position
 * @param {Object} options - Burst options
 */
function createParticleBurst(container, position, options = {}) {
  const {
    count = 8,
    color = "#4cc9f0",
    size = 6,
    spread = 40,
    duration = 400,
    reducedMotion = false
  } = options;

  if (reducedMotion) return; // Skip particles in reduced motion mode

  // Inject particle styles if needed
  if (!document.getElementById("particle-burst-styles")) {
    const style = document.createElement("style");
    style.id = "particle-burst-styles";
    style.textContent = `
      .particle-burst {
        position: absolute;
        border-radius: 50%;
        pointer-events: none;
        will-change: transform, opacity;
      }
      .particle-burst.animating {
        animation: particleBurst var(--particle-duration, 400ms) ease-out forwards;
      }
      @keyframes particleBurst {
        0% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(0);
        }
        20% {
          opacity: 1;
          transform: translate(calc(-50% + var(--dx) * 0.3), calc(-50% + var(--dy) * 0.3)) scale(1.2);
        }
        100% {
          opacity: 0;
          transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.3);
        }
      }
    `;
    document.head.appendChild(style);
  }

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const dist = spread * (0.6 + Math.random() * 0.4);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;

    const particle = document.createElement("div");
    particle.className = "particle-burst";
    particle.style.cssText = `
      left: ${position.x}px;
      top: ${position.y}px;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      box-shadow: 0 0 ${size * 2}px ${color};
      --dx: ${dx}px;
      --dy: ${dy}px;
      --particle-duration: ${duration}ms;
    `;

    container.appendChild(particle);

    requestAnimationFrame(() => {
      particle.classList.add("animating");
    });

    setTimeout(() => {
      if (particle.parentNode) particle.parentNode.removeChild(particle);
    }, duration + 50);
  }
}

/**
 * Creates an FX helper for managing visual effects on the board.
 * @param {HTMLElement} container - Container for FX elements
 * @param {Object} options - Configuration options
 * @returns {Object} FX controller
 */
export function createBoardFxHelper(container, options = {}) {
  if (!container) return null;

  let destroyed = false;
  let reducedMotion = options.reducedMotion || false;
  let quality = options.quality || "auto";

  // Create FX layer
  const layer = document.createElement("div");
  layer.className = "board-fx-layer";
  layer.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 900;
  `;

  // Ensure container has relative positioning
  const containerStyle = window.getComputedStyle(container);
  if (containerStyle.position === "static") {
    container.style.position = "relative";
  }
  container.appendChild(layer);

  // Inject FX styles
  if (!document.getElementById("board-fx-styles")) {
    const style = document.createElement("style");
    style.id = "board-fx-styles";
    style.textContent = `
      .fx-pulse-ring {
        position: absolute;
        border-radius: 50%;
        pointer-events: none;
        border: 3px solid currentColor;
        opacity: 0;
        will-change: transform, opacity;
      }
      .fx-pulse-ring.animating {
        animation: fxPulseRing var(--pulse-duration, 600ms) ease-out forwards;
      }
      @keyframes fxPulseRing {
        0% {
          opacity: 0.8;
          transform: translate(-50%, -50%) scale(0.5);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(2);
        }
      }

      html[data-reduced-motion="true"] .fx-pulse-ring.animating {
        animation: none;
        opacity: 0;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Shows a build effect at a position (settlement, city, road).
   * @param {{x: number, y: number}} position - Effect position
   * @param {Object} opts - Effect options
   */
  function showBuildEffect(position, opts = {}) {
    if (destroyed) return;
    if (reducedMotion) return;
    if (quality === "low") return; // Skip particles on low quality

    const {
      tone = "good",
      particleCount = 10,
      duration = 450
    } = opts;

    const colors = {
      good: "#44d07b",
      warn: "#ffd166",
      bad: "#ff4d4d",
      info: "#4cc9f0"
    };

    createParticleBurst(layer, position, {
      count: particleCount,
      color: colors[tone] || colors.good,
      duration,
      spread: 35,
      reducedMotion
    });
  }

  /**
   * Shows a pulse ring effect at a position.
   * @param {{x: number, y: number}} position - Effect position
   * @param {Object} opts - Effect options
   */
  function showPulseRing(position, opts = {}) {
    if (destroyed) return;
    if (reducedMotion) return;

    const {
      tone = "info",
      size = 60,
      duration = 600
    } = opts;

    const colors = {
      good: "#44d07b",
      warn: "#ffd166",
      bad: "#ff4d4d",
      info: "#4cc9f0"
    };

    const ring = document.createElement("div");
    ring.className = "fx-pulse-ring";
    ring.style.cssText = `
      left: ${position.x}px;
      top: ${position.y}px;
      width: ${size}px;
      height: ${size}px;
      color: ${colors[tone] || colors.info};
      --pulse-duration: ${duration}ms;
    `;

    layer.appendChild(ring);

    requestAnimationFrame(() => {
      ring.classList.add("animating");
    });

    setTimeout(() => {
      if (ring.parentNode) ring.parentNode.removeChild(ring);
    }, duration + 50);
  }

  /**
   * Shows effect for robber movement.
   * @param {{x: number, y: number}} position - Robber position
   */
  function showRobberEffect(position) {
    if (destroyed) return;
    if (reducedMotion) return;
    if (quality === "low") return;

    createParticleBurst(layer, position, {
      count: 6,
      color: "#9b1d20",
      size: 5,
      spread: 30,
      duration: 380,
      reducedMotion
    });

    showPulseRing(position, {
      tone: "warn",
      size: 50,
      duration: 500
    });
  }

  function setReducedMotion(value) {
    reducedMotion = !!value;
  }

  function setQuality(q) {
    quality = q;
  }

  function destroy() {
    destroyed = true;
    if (layer.parentNode) layer.parentNode.removeChild(layer);
  }

  return {
    showBuildEffect,
    showPulseRing,
    showRobberEffect,
    setReducedMotion,
    setQuality,
    destroy
  };
}

// === END FX HELPER SYSTEM ===

// === PLACEMENT ANIMATIONS ===
// Easing functions for placement animations

/**
 * Ease-out-back easing function for satisfying overshoot effect.
 * @param {number} t - Progress (0-1)
 * @returns {number} Eased value
 */
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * Simple ease-out for robber movement (no overshoot).
 * @param {number} t - Progress (0-1)
 * @returns {number} Eased value
 */
function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

// === CINEMATIC CAMERA SYSTEM ===
// Provides smooth camera movements for dramatic moments (TV display)

/**
 * Cinematic camera animation targets.
 * @typedef {"player_area" | "build_location" | "robber_tile" | "reset"} CinematicTarget
 */

/**
 * Default cinematic camera settings.
 */
const CINEMATIC_DEFAULTS = {
  turnStartDuration: 1000,
  buildDuration: 800,
  robberDuration: 1000,
  resetDuration: 1200,
  subtleZoom: 1.15,
  focusZoom: 1.35,
  robberZoom: 1.25
};

/**
 * Creates a cinematic camera controller for smooth, gentle camera movements.
 * Respects reducedMotion setting - completely disables animations when enabled.
 * @param {Object} cameraController - The base camera controller
 * @param {Object} options - Options including board dimensions
 * @returns {Object} Cinematic camera controller
 */
function createCinematicCameraController(cameraController, options = {}) {
  const hexesById = options.hexesById || new Map();
  const verticesById = options.verticesById || new Map();
  const edgesById = options.edgesById || new Map();
  const centerX = options.centerX || 0;
  const centerY = options.centerY || 0;
  const hexSize = options.hexSize || 1;

  // Animation state
  const state = {
    isAnimating: false,
    startTime: 0,
    duration: 0,
    startTargetX: 0,
    startTargetY: 0,
    startZoom: 1,
    endTargetX: 0,
    endTargetY: 0,
    endZoom: 1,
    onComplete: null,
    animationFrameId: null
  };

  // Callbacks
  let onCameraUpdate = options.onCameraUpdate || (() => {});

  /**
   * Check if cinematicCamera is enabled and reducedMotion is disabled.
   * @returns {boolean}
   */
  function isEnabled() {
    try {
      const settings = getSettings();
      // Cinematic camera requires: setting enabled AND reducedMotion disabled
      return !!settings?.cinematicCamera && !settings?.reducedMotion;
    } catch {
      return false;
    }
  }

  /**
   * Converts hex coordinates to world coordinates.
   * @param {string} hexId
   * @returns {{x: number, y: number} | null}
   */
  function hexToWorld(hexId) {
    const h = hexesById.get(hexId);
    if (!h?.center) return null;
    const x = Number(h.center.x) - centerX;
    const y = -(Number(h.center.y) - centerY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  /**
   * Converts vertex coordinates to world coordinates.
   * @param {string} vertexId
   * @returns {{x: number, y: number} | null}
   */
  function vertexToWorld(vertexId) {
    const v = verticesById.get(vertexId);
    if (!v) return null;
    const x = Number(v.x) - centerX;
    const y = -(Number(v.y) - centerY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  /**
   * Converts edge midpoint to world coordinates.
   * @param {string} edgeId
   * @returns {{x: number, y: number} | null}
   */
  function edgeToWorld(edgeId) {
    const e = edgesById.get(edgeId);
    if (!e) return null;
    const vA = verticesById.get(e.vA);
    const vB = verticesById.get(e.vB);
    if (!vA || !vB) return null;
    const x = ((Number(vA.x) + Number(vB.x)) / 2) - centerX;
    const y = -(((Number(vA.y) + Number(vB.y)) / 2) - centerY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  /**
   * Stops any active animation.
   */
  function stopAnimation() {
    if (state.animationFrameId) {
      cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }
    state.isAnimating = false;
    state.onComplete = null;
  }

  /**
   * Animation loop tick.
   */
  function animationTick() {
    if (!state.isAnimating) return;

    const now = performance.now();
    const elapsed = now - state.startTime;
    const rawProgress = Math.min(1, elapsed / state.duration);
    const progress = easeOutQuad(rawProgress);

    // Lerp camera position and zoom
    const currentX = state.startTargetX + (state.endTargetX - state.startTargetX) * progress;
    const currentY = state.startTargetY + (state.endTargetY - state.startTargetY) * progress;
    const currentZoom = state.startZoom + (state.endZoom - state.startZoom) * progress;

    // Apply to camera controller (direct state manipulation for smooth lerp)
    cameraController.setTargetPosition(currentX, currentY);
    cameraController.setZoom(currentZoom);

    // Trigger render
    onCameraUpdate();

    if (rawProgress >= 1) {
      // Animation complete
      state.isAnimating = false;
      const callback = state.onComplete;
      state.onComplete = null;
      if (callback) callback();
    } else {
      state.animationFrameId = requestAnimationFrame(animationTick);
    }
  }

  /**
   * Starts a smooth camera animation to a target position and zoom.
   * @param {Object} target - Target position {x, y} in world coordinates
   * @param {number} zoom - Target zoom level
   * @param {number} duration - Animation duration in ms
   * @param {Function} [onComplete] - Callback when animation completes
   */
  function animateTo(target, zoom, duration, onComplete) {
    if (!isEnabled()) {
      // If disabled, snap immediately
      if (target) {
        cameraController.setTargetPosition(target.x, target.y);
      }
      cameraController.setZoom(zoom);
      onCameraUpdate();
      if (onComplete) onComplete();
      return;
    }

    stopAnimation();

    const currentState = cameraController.getState();
    state.startTargetX = currentState.targetX;
    state.startTargetY = currentState.targetY;
    state.startZoom = currentState.zoom;
    state.endTargetX = target?.x ?? 0;
    state.endTargetY = target?.y ?? 0;
    state.endZoom = Math.max(1, zoom);
    state.duration = Math.max(100, duration);
    state.startTime = performance.now();
    state.isAnimating = true;
    state.onComplete = onComplete;

    state.animationFrameId = requestAnimationFrame(animationTick);
  }

  /**
   * Focus camera on a hex tile (e.g., robber movement).
   * @param {string} hexId - Hex ID to focus on
   * @param {Object} [opts] - Options
   */
  function focusHex(hexId, opts = {}) {
    const pos = hexToWorld(hexId);
    if (!pos) return;
    const zoom = opts.zoom ?? CINEMATIC_DEFAULTS.robberZoom;
    const duration = opts.duration ?? CINEMATIC_DEFAULTS.robberDuration;
    animateTo(pos, zoom, duration, opts.onComplete);
  }

  /**
   * Focus camera on a vertex (e.g., settlement placement).
   * @param {string} vertexId - Vertex ID to focus on
   * @param {Object} [opts] - Options
   */
  function focusVertex(vertexId, opts = {}) {
    const pos = vertexToWorld(vertexId);
    if (!pos) return;
    const zoom = opts.zoom ?? CINEMATIC_DEFAULTS.focusZoom;
    const duration = opts.duration ?? CINEMATIC_DEFAULTS.buildDuration;
    animateTo(pos, zoom, duration, opts.onComplete);
  }

  /**
   * Focus camera on an edge (e.g., road placement).
   * @param {string} edgeId - Edge ID to focus on
   * @param {Object} [opts] - Options
   */
  function focusEdge(edgeId, opts = {}) {
    const pos = edgeToWorld(edgeId);
    if (!pos) return;
    const zoom = opts.zoom ?? CINEMATIC_DEFAULTS.focusZoom;
    const duration = opts.duration ?? CINEMATIC_DEFAULTS.buildDuration;
    animateTo(pos, zoom, duration, opts.onComplete);
  }

  /**
   * Focus camera on a player's area (average of their structures).
   * @param {string} playerId - Player ID
   * @param {Object} structures - Current game structures
   * @param {Object} [opts] - Options
   */
  function focusPlayerArea(playerId, structures, opts = {}) {
    if (!playerId || !structures) return;

    // Collect all vertex positions for this player's structures
    const points = [];
    const settlements = structures.settlements || {};
    const roads = structures.roads || {};

    for (const [vertexId, s] of Object.entries(settlements)) {
      if (s?.playerId === playerId) {
        const pos = vertexToWorld(vertexId);
        if (pos) points.push(pos);
      }
    }

    for (const [edgeId, r] of Object.entries(roads)) {
      if (r?.playerId === playerId) {
        const pos = edgeToWorld(edgeId);
        if (pos) points.push(pos);
      }
    }

    if (points.length === 0) {
      // No structures yet, just do a subtle zoom on center
      animateTo({ x: 0, y: 0 }, CINEMATIC_DEFAULTS.subtleZoom, opts.duration ?? CINEMATIC_DEFAULTS.turnStartDuration, opts.onComplete);
      return;
    }

    // Calculate centroid of player's structures
    let sumX = 0, sumY = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
    }
    const centroid = { x: sumX / points.length, y: sumY / points.length };

    const zoom = opts.zoom ?? CINEMATIC_DEFAULTS.subtleZoom;
    const duration = opts.duration ?? CINEMATIC_DEFAULTS.turnStartDuration;
    animateTo(centroid, zoom, duration, opts.onComplete);
  }

  /**
   * Reset camera to default view (centered, zoom 1).
   * @param {Object} [opts] - Options
   */
  function resetView(opts = {}) {
    const duration = opts.duration ?? CINEMATIC_DEFAULTS.resetDuration;
    animateTo({ x: 0, y: 0 }, 1.0, duration, opts.onComplete);
  }

  /**
   * Updates the onCameraUpdate callback.
   * @param {Function} fn
   */
  function setOnCameraUpdate(fn) {
    onCameraUpdate = typeof fn === "function" ? fn : () => {};
  }

  /**
   * Cleanup - stop animations.
   */
  function destroy() {
    stopAnimation();
  }

  return {
    isEnabled,
    focusHex,
    focusVertex,
    focusEdge,
    focusPlayerArea,
    resetView,
    animateTo,
    stopAnimation,
    setOnCameraUpdate,
    destroy,
    get isAnimating() { return state.isAnimating; }
  };
}

// === END CINEMATIC CAMERA SYSTEM ===

// === POST-FX SYSTEM ===
// Lightweight post-processing effects (quality-gated)

/**
 * Creates a vignette post-processing effect.
 * Only enabled on high quality with postFx setting enabled.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @returns {Object} Post-FX controller
 */
function createPostFxController(renderer, scene, camera) {
  // Vignette overlay (simple screen-space quad)
  let vignetteEnabled = false;
  let vignetteMesh = null;
  let vignetteScene = null;
  let vignetteCamera = null;

  /**
   * Check if post-FX should be enabled based on settings and quality.
   * @param {string} quality - Renderer quality setting
   * @returns {boolean}
   */
  function shouldEnable(quality) {
    try {
      const settings = getSettings();
      // Only enable on high quality with postFx setting
      return quality === "high" && !!settings?.postFx && !settings?.reducedMotion;
    } catch {
      return false;
    }
  }

  /**
   * Creates the vignette overlay mesh.
   */
  function createVignette() {
    if (vignetteMesh) return;

    // Create a separate scene for the overlay
    vignetteScene = new THREE.Scene();
    vignetteCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Vignette shader
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `;

    const fragmentShader = `
      varying vec2 vUv;
      uniform float uIntensity;
      uniform float uSmoothness;

      void main() {
        vec2 uv = vUv;
        vec2 center = vec2(0.5, 0.5);
        float dist = distance(uv, center);

        // Smooth vignette falloff
        float vignette = smoothstep(0.4, 0.8, dist);
        vignette *= uIntensity;

        // Dark corners with transparency
        gl_FragColor = vec4(0.0, 0.0, 0.0, vignette * 0.35);
      }
    `;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uIntensity: { value: 0.8 },
        uSmoothness: { value: 0.4 }
      },
      transparent: true,
      depthTest: false,
      depthWrite: false
    });

    vignetteMesh = new THREE.Mesh(geometry, material);
    vignetteScene.add(vignetteMesh);
  }

  /**
   * Destroys the vignette overlay.
   */
  function destroyVignette() {
    if (vignetteMesh) {
      vignetteMesh.geometry.dispose();
      vignetteMesh.material.dispose();
      vignetteMesh = null;
    }
    vignetteScene = null;
    vignetteCamera = null;
  }

  /**
   * Updates post-FX state based on quality setting.
   * @param {string} quality
   */
  function update(quality) {
    const shouldBeEnabled = shouldEnable(quality);

    if (shouldBeEnabled && !vignetteEnabled) {
      createVignette();
      vignetteEnabled = true;
    } else if (!shouldBeEnabled && vignetteEnabled) {
      destroyVignette();
      vignetteEnabled = false;
    }
  }

  /**
   * Renders the post-FX overlay (call after main scene render).
   */
  function render() {
    if (!vignetteEnabled || !vignetteMesh || !vignetteScene || !vignetteCamera) return;

    // Render vignette overlay on top
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(vignetteScene, vignetteCamera);
    renderer.autoClear = autoClear;
  }

  /**
   * Cleanup post-FX resources.
   */
  function destroy() {
    destroyVignette();
    vignetteEnabled = false;
  }

  return {
    update,
    render,
    destroy,
    get isEnabled() { return vignetteEnabled; }
  };
}

// === END POST-FX SYSTEM ===

/**
 * Animation state tracker for placement animations.
 * Tracks start time, duration, and completion state.
 */
class AnimationManager {
  constructor() {
    /** @type {Map<string, { startTime: number, duration: number, startScale: number, targetScale: number, mesh: any }>} */
    this.scaleAnimations = new Map();
    /** @type {{ startTime: number, duration: number, startPos: { x: number, y: number, z: number }, targetPos: { x: number, y: number, z: number }, mesh: any } | null} */
    this.robberAnimation = null;
    /** @type {Set<string>} */
    this.animatedIds = new Set();
    /** @type {number | null} */
    this.frameId = null;
    /** @type {Function | null} */
    this.onFrame = null;
  }

  /**
   * Check if reducedMotion is enabled in settings.
   * @returns {boolean}
   */
  isReducedMotion() {
    try {
      const settings = getSettings();
      return !!settings?.reducedMotion;
    } catch {
      return false;
    }
  }

  /**
   * Start a scale animation for a piece.
   * @param {string} id - Unique ID for the animation
   * @param {any} mesh - THREE.js mesh or group
   * @param {number} duration - Animation duration in ms
   */
  startScaleAnimation(id, mesh, duration = 350) {
    if (!mesh) return;

    // Already animated this piece
    if (this.animatedIds.has(id)) return;
    this.animatedIds.add(id);

    // If reduced motion, set scale immediately and skip animation
    if (this.isReducedMotion()) {
      mesh.scale.set(1, 1, 1);
      return;
    }

    // Set initial small scale
    const startScale = 0.6;
    mesh.scale.set(startScale, startScale, startScale);

    this.scaleAnimations.set(id, {
      startTime: performance.now(),
      duration,
      startScale,
      targetScale: 1.0,
      mesh
    });

    this._ensureAnimationLoop();
  }

  /**
   * Start a position lerp animation for robber.
   * @param {any} mesh - THREE.js mesh or group
   * @param {{ x: number, y: number, z: number }} targetPos - Target position
   * @param {number} duration - Animation duration in ms
   */
  startRobberAnimation(mesh, targetPos, duration = 280) {
    if (!mesh) return;

    // If reduced motion, set position immediately
    if (this.isReducedMotion()) {
      mesh.position.set(targetPos.x, targetPos.y, targetPos.z);
      return;
    }

    const startPos = {
      x: mesh.position.x,
      y: mesh.position.y,
      z: mesh.position.z
    };

    // Only animate if actually moving
    const dist = Math.hypot(targetPos.x - startPos.x, targetPos.y - startPos.y);
    if (dist < 0.5) {
      mesh.position.set(targetPos.x, targetPos.y, targetPos.z);
      return;
    }

    this.robberAnimation = {
      startTime: performance.now(),
      duration,
      startPos,
      targetPos,
      mesh
    };

    this._ensureAnimationLoop();
  }

  /**
   * Clear animation state for a specific ID.
   * @param {string} id - Animation ID to clear
   */
  clearAnimation(id) {
    this.scaleAnimations.delete(id);
  }

  /**
   * Update all active animations.
   * @returns {boolean} True if any animations are still running
   */
  update() {
    const now = performance.now();
    let hasActiveAnimations = false;

    // Update scale animations
    for (const [id, anim] of this.scaleAnimations.entries()) {
      const elapsed = now - anim.startTime;
      const progress = Math.min(1, elapsed / anim.duration);
      const eased = easeOutBack(progress);

      const scale = anim.startScale + (anim.targetScale - anim.startScale) * eased;
      anim.mesh.scale.set(scale, scale, scale);

      if (progress >= 1) {
        anim.mesh.scale.set(1, 1, 1);
        this.scaleAnimations.delete(id);
      } else {
        hasActiveAnimations = true;
      }
    }

    // Update robber animation
    if (this.robberAnimation) {
      const anim = this.robberAnimation;
      const elapsed = now - anim.startTime;
      const progress = Math.min(1, elapsed / anim.duration);
      const eased = easeOutQuad(progress);

      const x = anim.startPos.x + (anim.targetPos.x - anim.startPos.x) * eased;
      const y = anim.startPos.y + (anim.targetPos.y - anim.startPos.y) * eased;
      const z = anim.startPos.z + (anim.targetPos.z - anim.startPos.z) * eased;
      anim.mesh.position.set(x, y, z);

      if (progress >= 1) {
        anim.mesh.position.set(anim.targetPos.x, anim.targetPos.y, anim.targetPos.z);
        this.robberAnimation = null;
      } else {
        hasActiveAnimations = true;
      }
    }

    return hasActiveAnimations;
  }

  /**
   * Ensure the animation loop is running.
   */
  _ensureAnimationLoop() {
    if (this.frameId !== null) return;

    const tick = () => {
      const hasMore = this.update();
      if (this.onFrame) this.onFrame();

      if (hasMore) {
        this.frameId = requestAnimationFrame(tick);
      } else {
        this.frameId = null;
      }
    };

    this.frameId = requestAnimationFrame(tick);
  }

  /**
   * Stop all animations and clean up.
   */
  destroy() {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.scaleAnimations.clear();
    this.robberAnimation = null;
    this.animatedIds.clear();
    this.onFrame = null;
  }
}

// === PIECE MESHES ===
// Improved 3D geometry for game pieces

/**
 * Creates a beveled road geometry (extruded plank shape).
 * @param {number} tileHeight - Base tile height for scaling
 * @returns {THREE.BufferGeometry}
 */
function createRoadGeometry(tileHeight) {
  // Road dimensions - slightly taller and thicker than basic box
  const width = 1; // Will be scaled by edge length
  const height = Math.max(12, tileHeight * 0.65);
  const depth = Math.max(5, tileHeight * 0.40);
  const bevel = Math.min(1.5, depth * 0.25);

  // Create beveled road shape (rectangle with rounded corners)
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hh = height / 2;

  // Simple rectangle - bevel via ExtrudeGeometry
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 1,
    steps: 1
  });

  // Center the geometry vertically
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateX(Math.PI / 2);

  return geometry;
}

/**
 * Creates a house-shaped settlement geometry (pentagon prism).
 * @param {number} tileHeight - Base tile height for scaling
 * @returns {THREE.BufferGeometry}
 */
function createSettlementGeometry(tileHeight) {
  // Settlement dimensions
  const baseWidth = Math.max(12, tileHeight * 0.65);
  const baseDepth = Math.max(12, tileHeight * 0.65);
  const wallHeight = Math.max(8, tileHeight * 0.48);
  const roofHeight = Math.max(6, tileHeight * 0.36);
  const totalHeight = wallHeight + roofHeight;

  // Create house shape (pentagon for side profile)
  const shape = new THREE.Shape();
  const hw = baseWidth / 2;
  const hd = baseDepth / 2;

  // House outline looking from side (Y axis)
  shape.moveTo(-hw, 0);           // Bottom left
  shape.lineTo(hw, 0);            // Bottom right
  shape.lineTo(hw, wallHeight);   // Right wall top
  shape.lineTo(0, totalHeight);   // Roof peak
  shape.lineTo(-hw, wallHeight);  // Left wall top
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: baseDepth,
    bevelEnabled: true,
    bevelThickness: 1.2,
    bevelSize: 1.0,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 1,
    steps: 1
  });

  // Center and orient correctly
  geometry.translate(0, 0, -hd);
  geometry.rotateX(-Math.PI / 2);

  return geometry;
}

/**
 * Creates a city geometry (larger house with tower element).
 * @param {number} tileHeight - Base tile height for scaling
 * @returns {THREE.BufferGeometry}
 */
function createCityGeometry(tileHeight) {
  // City is a more complex structure - main building + tower
  const baseWidth = Math.max(14, tileHeight * 0.75);
  const baseDepth = Math.max(14, tileHeight * 0.75);
  const wallHeight = Math.max(12, tileHeight * 0.72);
  const roofHeight = Math.max(8, tileHeight * 0.48);
  const totalHeight = wallHeight + roofHeight;

  // Tower dimensions
  const towerWidth = baseWidth * 0.45;
  const towerHeight = totalHeight * 1.35;

  // Main building shape
  const mainShape = new THREE.Shape();
  const hw = baseWidth / 2;

  mainShape.moveTo(-hw, 0);
  mainShape.lineTo(hw, 0);
  mainShape.lineTo(hw, wallHeight);
  mainShape.lineTo(0, totalHeight);
  mainShape.lineTo(-hw, wallHeight);
  mainShape.closePath();

  const mainGeo = new THREE.ExtrudeGeometry(mainShape, {
    depth: baseDepth,
    bevelEnabled: true,
    bevelThickness: 1.5,
    bevelSize: 1.2,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 1,
    steps: 1
  });
  mainGeo.translate(0, 0, -baseDepth / 2);
  mainGeo.rotateX(-Math.PI / 2);

  // Tower (simple box on one side)
  const towerGeo = new THREE.BoxGeometry(towerWidth, towerWidth, towerHeight);
  towerGeo.translate(hw * 0.4, -baseDepth * 0.3, towerHeight / 2);

  // Merge geometries
  const merged = mergeBufferGeometries([mainGeo, towerGeo]);

  // Dispose temporary geometries
  mainGeo.dispose();
  towerGeo.dispose();

  return merged || mainGeo;
}

/**
 * Merges multiple buffer geometries into one.
 * Simple implementation for combining city parts.
 * @param {THREE.BufferGeometry[]} geometries
 * @returns {THREE.BufferGeometry}
 */
function mergeBufferGeometries(geometries) {
  const positions = [];
  const normals = [];
  let indexOffset = 0;
  const indices = [];

  for (const geo of geometries) {
    const pos = geo.getAttribute("position");
    const norm = geo.getAttribute("normal");
    const idx = geo.getIndex();

    if (!pos) continue;

    // Copy positions
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }

    // Copy normals
    if (norm) {
      for (let i = 0; i < norm.count; i++) {
        normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      }
    }

    // Copy and offset indices
    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        indices.push(idx.getX(i) + indexOffset);
      }
    }

    indexOffset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length > 0) {
    merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  }
  if (indices.length > 0) {
    merged.setIndex(indices);
  }
  merged.computeVertexNormals();

  return merged;
}

/**
 * Creates an enhanced robber geometry (cloaked figure).
 * @param {number} tileHeight - Base tile height for scaling
 * @returns {{ body: THREE.BufferGeometry, head: THREE.BufferGeometry }}
 */
function createRobberGeometry(tileHeight) {
  // Body - tapered cylinder (cloak shape)
  const topRadius = Math.max(9, tileHeight * 0.36);
  const bottomRadius = Math.max(11, tileHeight * 0.44);
  const bodyHeight = tileHeight * 1.0;

  const bodyGeo = new THREE.CylinderGeometry(topRadius, bottomRadius, bodyHeight, 12);
  bodyGeo.rotateX(Math.PI / 2);

  // Head - sphere
  const headRadius = Math.max(7, tileHeight * 0.32);
  const headGeo = new THREE.SphereGeometry(headRadius, 12, 10);

  return { body: bodyGeo, head: headGeo };
}

// === END PIECE MESHES ===

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function pointToSegmentDistanceSquared(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLen2 = abx * abx + aby * aby;
  if (abLen2 <= 1e-9) return apx * apx + apy * apy;
  let t = (apx * abx + apy * aby) / abLen2;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

function tokenPipCount(token) {
  switch (Number(token)) {
    case 2:
    case 12:
      return 1;
    case 3:
    case 11:
      return 2;
    case 4:
    case 10:
      return 3;
    case 5:
    case 9:
      return 4;
    case 6:
    case 8:
      return 5;
    default:
      return 0;
  }
}

function portAbbr(kind) {
  switch (kind) {
    case "wood":
      return "Wd";
    case "brick":
      return "Br";
    case "sheep":
      return "Sh";
    case "wheat":
      return "Wh";
    case "ore":
      return "Or";
    default:
      return "";
  }
}

function fmt2(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

function stableBoardKey(board) {
  const b = board && typeof board === "object" ? board : null;
  if (!b) return "board:none";
  const layout = String(b.layout || "");
  const size = fmt2(b.hexSize);
  const bounds = b.bounds && typeof b.bounds === "object" ? b.bounds : {};
  const boundsKey = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].map((v) => fmt2(v)).join(",");
  const hexKey = Array.isArray(b.hexes)
    ? b.hexes.map((h) => `${String(h?.id || "")}:${String(h?.resource || "")}:${String(h?.token ?? "")}`).join(",")
    : "";
  const portKey = Array.isArray(b.ports)
    ? b.ports.map((p) => `${String(p?.id || "")}:${String(p?.kind || "")}:${String(p?.edgeId || "")}`).join(",")
    : "";
  const vCount = Array.isArray(b.vertices) ? b.vertices.length : 0;
  const eCount = Array.isArray(b.edges) ? b.edges.length : 0;
  const hCount = Array.isArray(b.hexes) ? b.hexes.length : 0;
  return `layout:${layout}|size:${size}|bounds:${boundsKey}|counts:${vCount}:${eCount}:${hCount}|hex:${hexKey}|ports:${portKey}`;
}

function resourceColor(resource) {
  switch (resource) {
    case "wood":
      return 0x2f8f52;
    case "brick":
      return 0xb84b3b;
    case "sheep":
      return 0x6fcf7a;
    case "wheat":
      return 0xd6b84b;
    case "ore":
      return 0x9aa3ad;
    case "desert":
      return 0xc8b089;
    default:
      return 0x2a2f3a;
  }
}

function toneEmissiveHex(tone) {
  switch (String(tone || "")) {
    case "good":
      return 0x44d07b;
    case "warn":
      return 0xffd166;
    case "bad":
      return 0xff4d4d;
    case "info":
    default:
      return 0x4cc9f0;
  }
}

// === THEME PARAMS ===
// Default world3d theme params
const DEFAULT_WORLD3D_PARAMS = {
  waterColor: "#1a4a6e",
  skyTint: "#0a1428",
  ambientIntensity: 0.62,
  tileRoughness: 0.85
};

/**
 * Gets current theme world3d params with defaults
 * @returns {Object} world3d params
 */
function getThemeWorld3dParams() {
  const themeParams = getWorld3dParams();
  if (!themeParams) return { ...DEFAULT_WORLD3D_PARAMS };
  return {
    waterColor: typeof themeParams.waterColor === "string" ? themeParams.waterColor : DEFAULT_WORLD3D_PARAMS.waterColor,
    skyTint: typeof themeParams.skyTint === "string" ? themeParams.skyTint : DEFAULT_WORLD3D_PARAMS.skyTint,
    ambientIntensity: typeof themeParams.ambientIntensity === "number" ? themeParams.ambientIntensity : DEFAULT_WORLD3D_PARAMS.ambientIntensity,
    tileRoughness: typeof themeParams.tileRoughness === "number" ? themeParams.tileRoughness : DEFAULT_WORLD3D_PARAMS.tileRoughness
  };
}

/**
 * Parses a hex color string to THREE.Color
 * @param {string} hex
 * @returns {THREE.Color}
 */
function parseThemeColor(hex) {
  try {
    return new THREE.Color(hex);
  } catch {
    return new THREE.Color(0x1a4a6e);
  }
}

function normalizeRendererQuality(value) {
  const v = String(value || "auto").toLowerCase().trim();
  if (v === "low" || v === "medium" || v === "high" || v === "auto") return v;
  return "auto";
}

function pixelRatioForQuality(quality) {
  const dpr = Number.isFinite(window?.devicePixelRatio) ? Math.max(1, window.devicePixelRatio) : 1;
  switch (quality) {
    case "low":
      return 1;
    case "medium":
      return clamp(dpr, 1, 1.5);
    case "high":
      return clamp(dpr, 1, 2);
    case "auto":
    default:
      return prefersLowPower() ? 1 : clamp(dpr, 1, 2);
  }
}

function antialiasForQuality(quality) {
  if (quality === "low") return false;
  if (quality === "medium") return false;
  if (quality === "high") return true;
  return !prefersLowPower();
}

function powerPreferenceForQuality(quality) {
  if (quality === "high") return "high-performance";
  if (quality === "low") return "low-power";
  return prefersLowPower() ? "low-power" : "high-performance";
}

// === CAMERA CONTROLS ===
// Creates a camera controller for pan/zoom with touch gesture support.
// Maintains target position and zoom level, clamps to board bounds.
function createCameraController(camera, bounds, options = {}) {
  const boardW = Math.max(1, Number(bounds.maxX) - Number(bounds.minX));
  const boardH = Math.max(1, Number(bounds.maxY) - Number(bounds.minY));
  const pad = options.pad || 40;
  const halfBoardW = boardW / 2 + pad;
  const halfBoardH = boardH / 2 + pad;

  // Camera state
  const state = {
    // Target position (center of view in world coordinates)
    targetX: 0,
    targetY: 0,
    // Zoom level (1.0 = fit board, >1 = zoomed in)
    zoom: 1.0,
    // Default zoom bounds
    minZoom: 1.0,
    maxZoom: 3.5,
    // Base frustum dimensions (set when fitting camera)
    baseFrustumW: 1,
    baseFrustumH: 1,
    // Quality setting (affects update rate)
    quality: options.quality || "auto"
  };

  // Clamp target position to keep board in view
  function clampTarget() {
    // Calculate visible area at current zoom
    const visibleW = state.baseFrustumW / state.zoom;
    const visibleH = state.baseFrustumH / state.zoom;

    // Maximum pan distance from center
    const maxPanX = Math.max(0, halfBoardW - visibleW / 2);
    const maxPanY = Math.max(0, halfBoardH - visibleH / 2);

    state.targetX = clamp(state.targetX, -maxPanX, maxPanX);
    state.targetY = clamp(state.targetY, -maxPanY, maxPanY);
  }

  // Apply current state to camera
  function applyToCamera(viewW, viewH) {
    const w = Math.max(1, viewW);
    const h = Math.max(1, viewH);
    const aspect = w / h;

    // Calculate base frustum to fit board
    let frustumW, frustumH;
    if (halfBoardW / halfBoardH > aspect) {
      // Board is wider than viewport
      frustumW = halfBoardW * 2;
      frustumH = frustumW / aspect;
    } else {
      // Board is taller than viewport
      frustumH = halfBoardH * 2;
      frustumW = frustumH * aspect;
    }

    state.baseFrustumW = frustumW;
    state.baseFrustumH = frustumH;

    // Apply zoom
    const zoomedW = frustumW / state.zoom;
    const zoomedH = frustumH / state.zoom;

    // Clamp target after zoom change
    clampTarget();

    // Get camera's view direction vectors for panning in view space
    const camRight = new THREE.Vector3();
    const camUp = new THREE.Vector3();
    camera.matrixWorld.extractBasis(camRight, camUp, new THREE.Vector3());

    // Calculate offset in view space (camera X is right, camera Y is up)
    // state.targetX/Y are in world XY plane, need to project to view
    const offsetX = state.targetX;
    const offsetY = state.targetY;

    // For orthographic camera, adjust frustum bounds
    camera.left = -zoomedW / 2 + offsetX;
    camera.right = zoomedW / 2 + offsetX;
    camera.bottom = -zoomedH / 2 + offsetY;
    camera.top = zoomedH / 2 + offsetY;

    camera.updateProjectionMatrix();
  }

  // Pan by delta in world units (X right, Y up in view)
  function pan(deltaX, deltaY) {
    state.targetX -= deltaX;
    state.targetY -= deltaY;
    clampTarget();
  }

  // Pan by screen pixels
  function panByPixels(deltaPixelsX, deltaPixelsY, viewW, viewH) {
    const visibleW = state.baseFrustumW / state.zoom;
    const visibleH = state.baseFrustumH / state.zoom;
    const worldPerPixelX = visibleW / viewW;
    const worldPerPixelY = visibleH / viewH;
    pan(deltaPixelsX * worldPerPixelX, -deltaPixelsY * worldPerPixelY);
  }

  // Zoom by factor, optionally around a focal point (in pixels)
  function zoomBy(factor, focalPixelX, focalPixelY, viewW, viewH) {
    const oldZoom = state.zoom;
    const newZoom = clamp(oldZoom * factor, state.minZoom, state.maxZoom);
    if (newZoom === oldZoom) return;

    // Zoom around focal point
    if (typeof focalPixelX === "number" && typeof focalPixelY === "number") {
      // Convert focal point to world coordinates before zoom
      const visibleW = state.baseFrustumW / oldZoom;
      const visibleH = state.baseFrustumH / oldZoom;
      const focalWorldX = state.targetX + (focalPixelX - viewW / 2) * (visibleW / viewW);
      const focalWorldY = state.targetY - (focalPixelY - viewH / 2) * (visibleH / viewH);

      // Apply zoom
      state.zoom = newZoom;

      // Calculate new visible area
      const newVisibleW = state.baseFrustumW / newZoom;
      const newVisibleH = state.baseFrustumH / newZoom;

      // Adjust target so focal point stays at same screen position
      state.targetX = focalWorldX - (focalPixelX - viewW / 2) * (newVisibleW / viewW);
      state.targetY = focalWorldY + (focalPixelY - viewH / 2) * (newVisibleH / viewH);
    } else {
      state.zoom = newZoom;
    }

    clampTarget();
  }

  // Set absolute zoom level
  function setZoom(zoom) {
    state.zoom = clamp(zoom, state.minZoom, state.maxZoom);
    clampTarget();
  }

  // Reset to default view
  function reset() {
    state.targetX = 0;
    state.targetY = 0;
    state.zoom = 1.0;
  }

  // Get current state (for debugging/saving)
  function getState() {
    return { ...state };
  }

  // Set quality (affects update rate for low-power devices)
  function setQuality(q) {
    state.quality = q;
  }

  // Set absolute target position (for cinematic camera animations)
  function setTargetPosition(x, y) {
    state.targetX = x;
    state.targetY = y;
    clampTarget();
  }

  return {
    applyToCamera,
    pan,
    panByPixels,
    zoomBy,
    setZoom,
    setTargetPosition,
    reset,
    getState,
    setQuality,
    get zoom() { return state.zoom; },
    get targetX() { return state.targetX; },
    get targetY() { return state.targetY; }
  };
}

// === TOUCH GESTURE HANDLER ===
// Handles touch events for pan (1 finger), pinch-zoom (2 fingers), and double-tap reset.
// Implements "suppress click after drag/pinch" to prevent accidental placements.
function createTouchGestureHandler(canvas, cameraController, options = {}) {
  const onCameraChange = options.onCameraChange || (() => {});
  const getViewSize = options.getViewSize || (() => ({ width: canvas.width, height: canvas.height }));

  // Gesture state
  const state = {
    // Active touches
    touches: new Map(),
    // Gesture mode: null, 'pan', 'pinch'
    mode: null,
    // For pinch: initial distance and zoom
    pinchStartDist: 0,
    pinchStartZoom: 1,
    pinchCenterX: 0,
    pinchCenterY: 0,
    // For pan: last position
    lastPanX: 0,
    lastPanY: 0,
    // Suppress click after gesture
    suppressClickUntil: 0,
    // Movement threshold to count as drag (not tap)
    dragThreshold: 8,
    totalMovement: 0,
    // Double-tap detection
    lastTapTime: 0,
    lastTapX: 0,
    lastTapY: 0,
    doubleTapTimeout: 300,
    doubleTapDistance: 30,
    // Track if gesture was significant
    gestureWasSignificant: false
  };

  // Calculate distance between two touch points
  function touchDistance(t1, t2) {
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.hypot(dx, dy);
  }

  // Calculate center of two touch points
  function touchCenter(t1, t2) {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2
    };
  }

  // Get rect-relative coordinates
  function toCanvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function handleTouchStart(ev) {
    // Store all touches
    for (const touch of ev.changedTouches) {
      state.touches.set(touch.identifier, {
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY
      });
    }

    const touchCount = state.touches.size;

    if (touchCount === 1) {
      // Single finger - prepare for pan
      const touch = Array.from(state.touches.values())[0];
      state.mode = 'pan';
      state.lastPanX = touch.startX;
      state.lastPanY = touch.startY;
      state.totalMovement = 0;
      state.gestureWasSignificant = false;
    } else if (touchCount === 2) {
      // Two fingers - switch to pinch
      const [t1, t2] = Array.from(state.touches.values());
      state.mode = 'pinch';
      state.pinchStartDist = touchDistance(
        { clientX: t1.currentX, clientY: t1.currentY },
        { clientX: t2.currentX, clientY: t2.currentY }
      );
      state.pinchStartZoom = cameraController.zoom;
      const center = touchCenter(
        { clientX: t1.currentX, clientY: t1.currentY },
        { clientX: t2.currentX, clientY: t2.currentY }
      );
      state.pinchCenterX = center.x;
      state.pinchCenterY = center.y;
      state.gestureWasSignificant = false;
      // Prevent default to stop browser zoom
      ev.preventDefault();
    }
  }

  function handleTouchMove(ev) {
    // Update stored touches
    for (const touch of ev.changedTouches) {
      const stored = state.touches.get(touch.identifier);
      if (stored) {
        stored.currentX = touch.clientX;
        stored.currentY = touch.clientY;
      }
    }

    const { width, height } = getViewSize();

    if (state.mode === 'pan' && state.touches.size === 1) {
      const touch = Array.from(state.touches.values())[0];
      const deltaX = touch.currentX - state.lastPanX;
      const deltaY = touch.currentY - state.lastPanY;

      state.totalMovement += Math.abs(deltaX) + Math.abs(deltaY);

      if (state.totalMovement > state.dragThreshold) {
        state.gestureWasSignificant = true;
        cameraController.panByPixels(deltaX, deltaY, width, height);
        onCameraChange();
        ev.preventDefault();
      }

      state.lastPanX = touch.currentX;
      state.lastPanY = touch.currentY;
    } else if (state.mode === 'pinch' && state.touches.size === 2) {
      const [t1, t2] = Array.from(state.touches.values());
      const currentDist = touchDistance(
        { clientX: t1.currentX, clientY: t1.currentY },
        { clientX: t2.currentX, clientY: t2.currentY }
      );

      // Calculate zoom factor
      const zoomFactor = currentDist / state.pinchStartDist;
      const newZoom = state.pinchStartZoom * zoomFactor;

      // Get focal point in canvas coordinates
      const center = touchCenter(
        { clientX: t1.currentX, clientY: t1.currentY },
        { clientX: t2.currentX, clientY: t2.currentY }
      );
      const canvasCoords = toCanvasCoords(center.x, center.y);

      // Apply zoom
      cameraController.setZoom(newZoom);

      // Also handle pinch-pan
      const panDeltaX = center.x - state.pinchCenterX;
      const panDeltaY = center.y - state.pinchCenterY;
      cameraController.panByPixels(panDeltaX, panDeltaY, width, height);
      state.pinchCenterX = center.x;
      state.pinchCenterY = center.y;

      state.gestureWasSignificant = true;
      onCameraChange();
      ev.preventDefault();
    }
  }

  function handleTouchEnd(ev) {
    const removedTouches = [];
    for (const touch of ev.changedTouches) {
      removedTouches.push(state.touches.get(touch.identifier));
      state.touches.delete(touch.identifier);
    }

    const remainingCount = state.touches.size;

    // Check for double-tap on single touch release
    if (removedTouches.length === 1 && remainingCount === 0 && state.mode === 'pan') {
      const removed = removedTouches[0];
      if (removed && !state.gestureWasSignificant) {
        const now = Date.now();
        const timeSinceLastTap = now - state.lastTapTime;
        const distFromLastTap = Math.hypot(
          removed.startX - state.lastTapX,
          removed.startY - state.lastTapY
        );

        if (timeSinceLastTap < state.doubleTapTimeout && distFromLastTap < state.doubleTapDistance) {
          // Double-tap detected - reset view
          cameraController.reset();
          onCameraChange();
          state.lastTapTime = 0;
          ev.preventDefault();
        } else {
          // Store for potential double-tap
          state.lastTapTime = now;
          state.lastTapX = removed.startX;
          state.lastTapY = removed.startY;
        }
      }
    }

    // Suppress click if gesture was significant
    if (state.gestureWasSignificant) {
      state.suppressClickUntil = Date.now() + 200; // 200ms window
    }

    // Reset mode if no touches left
    if (remainingCount === 0) {
      state.mode = null;
      state.gestureWasSignificant = false;
    } else if (remainingCount === 1) {
      // Transition from pinch back to pan
      state.mode = 'pan';
      const touch = Array.from(state.touches.values())[0];
      state.lastPanX = touch.currentX;
      state.lastPanY = touch.currentY;
      state.totalMovement = 0;
    }
  }

  function handleTouchCancel(ev) {
    for (const touch of ev.changedTouches) {
      state.touches.delete(touch.identifier);
    }
    if (state.touches.size === 0) {
      state.mode = null;
    }
  }

  // Check if click should be suppressed (call before handling click)
  function shouldSuppressClick() {
    return Date.now() < state.suppressClickUntil;
  }

  // Clear suppression (call if needed)
  function clearSuppression() {
    state.suppressClickUntil = 0;
  }

  // Attach event listeners
  function attach() {
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchCancel, { passive: false });
  }

  // Detach event listeners
  function detach() {
    canvas.removeEventListener('touchstart', handleTouchStart);
    canvas.removeEventListener('touchmove', handleTouchMove);
    canvas.removeEventListener('touchend', handleTouchEnd);
    canvas.removeEventListener('touchcancel', handleTouchCancel);
  }

  // Auto-attach on creation
  attach();

  return {
    shouldSuppressClick,
    clearSuppression,
    attach,
    detach,
    reset: () => {
      state.touches.clear();
      state.mode = null;
      state.suppressClickUntil = 0;
    }
  };
}

// === OCEAN RENDERING ===
// Creates animated ocean water around the island with quality-gated effects.
// - low: Static gradient blue (no animation)
// - medium: Simple UV scroll using time uniform
// - high: Time-based waves with vertex displacement

/**
 * Determines the effective ocean quality level based on settings.
 * @param {string} rendererQuality - "low", "medium", "high", or "auto"
 * @param {boolean} reducedMotion - Whether reduced motion is enabled
 * @param {boolean} lowPowerMode - Whether low power mode is enabled
 * @returns {"low" | "medium" | "high"}
 */
function getOceanQuality(rendererQuality, reducedMotion, lowPowerMode) {
  // Reduced motion always disables animation
  if (reducedMotion) return "low";

  // Low power mode caps at medium
  if (lowPowerMode) {
    if (rendererQuality === "high") return "medium";
    if (rendererQuality === "low") return "low";
    return "low";
  }

  // Auto detection
  if (rendererQuality === "auto") {
    return prefersLowPower() ? "low" : "medium";
  }

  return rendererQuality === "high" ? "high" : rendererQuality === "medium" ? "medium" : "low";
}

/**
 * Creates ocean shader material with quality-appropriate effects.
 * @param {"low" | "medium" | "high"} oceanQuality
 * @returns {{ material: THREE.ShaderMaterial, uniforms: Object }}
 */
function createOceanMaterial(oceanQuality) {
  const uniforms = {
    uTime: { value: 0.0 },
    uDeepColor: { value: new THREE.Color(0x0a3d62) },
    uShallowColor: { value: new THREE.Color(0x1e90ff) },
    uFoamColor: { value: new THREE.Color(0xffffff) },
    uBoardRadius: { value: 100.0 },
    uQuality: { value: oceanQuality === "high" ? 2 : oceanQuality === "medium" ? 1 : 0 }
  };

  // Vertex shader: displacement for high quality, passthrough for others
  const vertexShader = `
    uniform float uTime;
    uniform float uBoardRadius;
    uniform int uQuality;

    varying vec2 vUv;
    varying float vDistFromCenter;

    void main() {
      vUv = uv;
      vec3 pos = position;

      // Calculate distance from center for shore effects
      vDistFromCenter = length(pos.xy) / uBoardRadius;

      // High quality: vertex displacement for waves
      if (uQuality == 2) {
        float wave1 = sin(pos.x * 0.02 + uTime * 0.8) * 2.0;
        float wave2 = sin(pos.y * 0.025 + uTime * 0.6) * 1.5;
        float wave3 = sin((pos.x + pos.y) * 0.015 + uTime * 1.0) * 1.0;
        pos.z += (wave1 + wave2 + wave3) * 0.5;
      }

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;

  // Fragment shader: gradient with optional animation
  const fragmentShader = `
    uniform float uTime;
    uniform vec3 uDeepColor;
    uniform vec3 uShallowColor;
    uniform vec3 uFoamColor;
    uniform float uBoardRadius;
    uniform int uQuality;

    varying vec2 vUv;
    varying float vDistFromCenter;

    void main() {
      // Base gradient from center (shallow) to edges (deep)
      float t = clamp(vDistFromCenter * 0.4, 0.0, 1.0);
      vec3 baseColor = mix(uShallowColor, uDeepColor, t);

      // Medium/High: animated UV scroll for water motion
      if (uQuality >= 1) {
        float scroll1 = sin(vUv.x * 20.0 + uTime * 0.5) * 0.5 + 0.5;
        float scroll2 = sin(vUv.y * 15.0 + uTime * 0.4) * 0.5 + 0.5;
        float ripple = scroll1 * scroll2 * 0.15;
        baseColor = mix(baseColor, uShallowColor, ripple);
      }

      // High quality: additional specular-like highlights
      if (uQuality == 2) {
        float highlight = sin(vUv.x * 40.0 + uTime) * sin(vUv.y * 35.0 + uTime * 0.7);
        highlight = max(0.0, highlight) * 0.1;
        baseColor += vec3(highlight);
      }

      gl_FragColor = vec4(baseColor, 0.92);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  return { material, uniforms };
}

/**
 * Creates the ocean mesh plane positioned below the island.
 * @param {number} boardRadius - Radius of the board for sizing
 * @param {"low" | "medium" | "high"} oceanQuality
 * @returns {{ mesh: THREE.Mesh, material: THREE.ShaderMaterial, uniforms: Object, geometry: THREE.PlaneGeometry }}
 */
function createOceanMesh(boardRadius, oceanQuality) {
  // Ocean should extend well beyond the visible board
  const oceanSize = boardRadius * 4;

  // Segment count based on quality (more segments = smoother waves)
  const segments = oceanQuality === "high" ? 64 : oceanQuality === "medium" ? 32 : 8;

  const geometry = new THREE.PlaneGeometry(oceanSize, oceanSize, segments, segments);
  const { material, uniforms } = createOceanMaterial(oceanQuality);

  // Update the board radius uniform for proper gradient
  uniforms.uBoardRadius.value = boardRadius;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = -2; // Below the island
  mesh.renderOrder = -10; // Render first (behind everything)

  return { mesh, material, uniforms, geometry };
}

/**
 * Creates a shoreline ring mesh around the island for visual separation.
 * @param {Array<{x: number, y: number}>} vertices - Board vertex positions
 * @param {number} centerX - Board center X
 * @param {number} centerY - Board center Y
 * @param {number} hexSize - Size of hexes for scaling
 * @returns {{ mesh: THREE.Mesh, material: THREE.ShaderMaterial, uniforms: Object, geometry: THREE.BufferGeometry } | null}
 */
function createShorelineMesh(vertices, centerX, centerY, hexSize) {
  if (!vertices || vertices.length < 3) return null;

  // Calculate convex hull of vertex positions for the shore ring
  const points = vertices
    .map(v => ({
      x: Number(v.x) - centerX,
      y: -(Number(v.y) - centerY)
    }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (points.length < 3) return null;

  // Simple convex hull using gift wrapping algorithm
  const hull = computeConvexHull(points);
  if (hull.length < 3) return null;

  // Create ring geometry from hull
  const innerOffset = hexSize * 0.1;
  const outerOffset = hexSize * 0.45;

  const innerPoints = [];
  const outerPoints = [];

  // Compute center of hull
  let cx = 0, cy = 0;
  for (const p of hull) {
    cx += p.x;
    cy += p.y;
  }
  cx /= hull.length;
  cy /= hull.length;

  // Expand/contract hull points to create inner/outer rings
  for (const p of hull) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    innerPoints.push({
      x: p.x + nx * innerOffset,
      y: p.y + ny * innerOffset
    });
    outerPoints.push({
      x: p.x + nx * outerOffset,
      y: p.y + ny * outerOffset
    });
  }

  // Build ring geometry with triangles
  const positions = [];
  const uvs = [];

  for (let i = 0; i < hull.length; i++) {
    const i2 = (i + 1) % hull.length;

    const inner1 = innerPoints[i];
    const inner2 = innerPoints[i2];
    const outer1 = outerPoints[i];
    const outer2 = outerPoints[i2];

    // Triangle 1: inner1, outer1, inner2
    positions.push(inner1.x, inner1.y, 0);
    positions.push(outer1.x, outer1.y, 0);
    positions.push(inner2.x, inner2.y, 0);

    uvs.push(0, i / hull.length);
    uvs.push(1, i / hull.length);
    uvs.push(0, i2 / hull.length);

    // Triangle 2: inner2, outer1, outer2
    positions.push(inner2.x, inner2.y, 0);
    positions.push(outer1.x, outer1.y, 0);
    positions.push(outer2.x, outer2.y, 0);

    uvs.push(0, i2 / hull.length);
    uvs.push(1, i / hull.length);
    uvs.push(1, i2 / hull.length);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  // Shoreline shader with foam effect
  const uniforms = {
    uTime: { value: 0.0 },
    uFoamColor: { value: new THREE.Color(0xffffff) },
    uWaterColor: { value: new THREE.Color(0x4fc3f7) }
  };

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform vec3 uFoamColor;
    uniform vec3 uWaterColor;
    varying vec2 vUv;

    void main() {
      // Foam effect - stronger at inner edge (where water meets land)
      float foam = 1.0 - vUv.x; // vUv.x = 0 at inner, 1 at outer
      foam = pow(foam, 1.5);

      // Animate foam with subtle pulse
      float pulse = sin(uTime * 2.0 + vUv.y * 20.0) * 0.1 + 0.9;
      foam *= pulse;

      vec3 color = mix(uWaterColor, uFoamColor, foam * 0.7);
      float alpha = 0.6 + foam * 0.3;

      gl_FragColor = vec4(color, alpha);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = 0.5; // Just above ocean, below island
  mesh.renderOrder = -5;

  return { mesh, material, uniforms, geometry };
}

/**
 * Computes convex hull of 2D points using gift wrapping algorithm.
 * @param {Array<{x: number, y: number}>} points
 * @returns {Array<{x: number, y: number}>}
 */
function computeConvexHull(points) {
  if (points.length < 3) return points.slice();

  // Find leftmost point
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].x < points[start].x) {
      start = i;
    }
  }

  const hull = [];
  let current = start;

  do {
    hull.push(points[current]);
    let next = 0;

    for (let i = 1; i < points.length; i++) {
      if (next === current) {
        next = i;
        continue;
      }

      // Cross product to determine turn direction
      const cross =
        (points[i].x - points[current].x) * (points[next].y - points[current].y) -
        (points[i].y - points[current].y) * (points[next].x - points[current].x);

      if (cross > 0) {
        next = i;
      }
    }

    current = next;
  } while (current !== start && hull.length < points.length);

  return hull;
}

/**
 * Updates ocean animation based on elapsed time.
 * @param {Object} oceanUniforms - Ocean shader uniforms
 * @param {Object} shoreUniforms - Shoreline shader uniforms (can be null)
 * @param {number} deltaTime - Time since last update in seconds
 * @param {"low" | "medium" | "high"} oceanQuality
 */
function updateOceanAnimation(oceanUniforms, shoreUniforms, deltaTime, oceanQuality) {
  // Skip animation for low quality (static)
  if (oceanQuality === "low") return;

  // Update time uniforms
  if (oceanUniforms?.uTime) {
    oceanUniforms.uTime.value += deltaTime;
  }
  if (shoreUniforms?.uTime) {
    shoreUniforms.uTime.value += deltaTime;
  }
}

// === END OCEAN RENDERING ===

function createBoardView3d(container, board, options) {
  const vertices = Array.isArray(board.vertices) ? board.vertices : [];
  const edges = Array.isArray(board.edges) ? board.edges : [];
  const hexes = Array.isArray(board.hexes) ? board.hexes : [];
  const ports = Array.isArray(board.ports) ? board.ports : [];

  const hexSize = Math.max(1, Number(board.hexSize) || 1);

  const verticesById = new Map(vertices.map((v) => [v.id, v]));
  const edgesById = new Map(edges.map((e) => [e.id, e]));
  const hexesById = new Map(hexes.map((h) => [h.id, h]));

  const bounds = board.bounds || { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const centerX = (Number(bounds.minX) + Number(bounds.maxX)) / 2;
  const centerY = (Number(bounds.minY) + Number(bounds.maxY)) / 2;

  const root = document.createElement("div");
  root.className = "board board3d";

  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Catan board (3D)");
  root.appendChild(canvas);

  container.innerHTML = "";
  container.appendChild(root);

  // === DEBUG MODE SETUP ===
  const debugMode = isDebugPickEnabled();
  let debugOverlay = null;
  let debugPickMat = null;
  if (debugMode) {
    debugOverlay = createDebugOverlay(root);
    debugPickMat = createDebugPickMaterial();
  }

  // Valid ID sets for runtime validation
  const validVertexIds = new Set(vertices.map((v) => String(v.id)));
  const validEdgeIds = new Set(edges.map((e) => String(e.id)));
  const validHexIds = new Set(hexes.map((h) => String(h.id)));

  let quality = normalizeRendererQuality(options?.rendererQuality);
  let lastSizeKey = "";
  let destroyed = false;
  let renderQueued = false;
  let lastHighlightMode = "";
  let lastSelectableVertexIds = [];
  let lastSelectableEdgeIds = [];
  let lastSelectableHexIds = [];
  let lastRobberHexId = null;

  const interaction = {
    selectableVertexSet: new Set(),
    selectableEdgeSet: new Set(),
    selectableHexSet: new Set(),
    canCaptureVertices: false,
    canCaptureEdges: false,
    canCaptureHexes: false,
    onVertexClick: null,
    onEdgeClick: null,
    onHexClick: null,
    onIllegalClick: null
  };

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: antialiasForQuality(quality),
    alpha: true,
    powerPreference: powerPreferenceForQuality(quality)
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(pixelRatioForQuality(quality));
  const maxAnisotropy = typeof renderer.capabilities?.getMaxAnisotropy === "function" ? renderer.capabilities.getMaxAnisotropy() : 1;

  const scene = new THREE.Scene();

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -20000, 20000);
  camera.up.set(0, 0, 1);

  // Get theme world3d params for lighting and materials
  let themeParams = getThemeWorld3dParams();

  const ambient = new THREE.AmbientLight(0xffffff, themeParams.ambientIntensity);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
  keyLight.position.set(700, -900, 900);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
  fillLight.position.set(-700, 800, 700);
  scene.add(fillLight);

  const world = new THREE.Group();
  scene.add(world);

  const hexGroup = new THREE.Group();
  world.add(hexGroup);

  // Theme change handler - will be subscribed after requestRender is defined
  let unsubscribeTheme = null;
  function handleThemeChange() {
    themeParams = getThemeWorld3dParams();
    ambient.intensity = themeParams.ambientIntensity;
    // Update tile roughness for hex materials
    for (const mesh of hexGroup.children) {
      if (mesh.userData.isHexTile && mesh.material && typeof mesh.material.roughness === "number") {
        mesh.material.roughness = themeParams.tileRoughness;
        mesh.material.needsUpdate = true;
      }
    }
    // requestRender will be defined by the time this is called
    if (typeof requestRender === "function") requestRender();
  }

  const tokenGroup = new THREE.Group();
  world.add(tokenGroup);

  const portGroup = new THREE.Group();
  world.add(portGroup);

  const structGroup = new THREE.Group();
  world.add(structGroup);

  const tileHeight = Math.max(6, Number(board.hexSize) * 0.11);
  const surfaceEpsilon = Math.max(0.02, tileHeight * 0.002);
  const surfaceZ = tileHeight + surfaceEpsilon;

  const pickGroup = new THREE.Group();
  pickGroup.name = "pick";
  world.add(pickGroup);

  const hintGroup = new THREE.Group();
  hintGroup.name = "hints";
  world.add(hintGroup);

  // Use debug wireframe material if debug mode is enabled
  const pickMat = debugMode && debugPickMat
    ? trackDisposable(debugPickMat)
    : trackDisposable(
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.0,
          depthWrite: false
        })
      );

  const hintColor = 0x4cc9f0;
  const vertexHintMat = trackDisposable(
    new THREE.MeshBasicMaterial({
      color: hintColor,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    })
  );
  const edgeHintMat = trackDisposable(
    new THREE.MeshBasicMaterial({
      color: hintColor,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    })
  );

  /** @type {Map<string, any>} */
  const hexById = new Map();
  /** @type {Map<string, any>} */
  const roadById = new Map();
  /** @type {Map<string, any>} */
  const settlementById = new Map();

  /** @type {Map<string, any>} */
  const hexPickById = new Map();
  /** @type {Map<string, any>} */
  const edgePickById = new Map();
  /** @type {Map<string, any>} */
  const vertexPickById = new Map();

  /** @type {Map<string, any>} */
  const edgeHintById = new Map();
  /** @type {Map<string, any>} */
  const vertexHintById = new Map();

  /** @type {Array<any>} */
  const billboardPlanes = [];

  /** @type {Set<any>} */
  const disposable = new Set();
  /** @type {Map<any, any>} */
  const pulseTimerByMesh = new Map();

  function trackDisposable(obj) {
    if (obj && typeof obj.dispose === "function") disposable.add(obj);
    return obj;
  }

  function colorForPlayer(players, playerId) {
    const list = Array.isArray(players) ? players : [];
    const p = list.find((pl) => pl?.playerId === playerId) || null;
    const raw = String(p?.color || "white");
    try {
      return new THREE.Color(raw);
    } catch {
      return new THREE.Color("white");
    }
  }

  function shapePointForVertexId(vertexId) {
    const v = verticesById.get(vertexId);
    if (!v) return null;
    const x = Number(v.x) - centerX;
    const y = -(Number(v.y) - centerY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  const hexPickZ = surfaceZ + surfaceEpsilon;
  const edgePickZ = surfaceZ + Math.max(2, tileHeight * 0.22);
  const vertexPickZ = surfaceZ + Math.max(3, tileHeight * 0.26);
  const hintZ = surfaceZ + Math.max(4, tileHeight * 0.34);

  const vertexPickR = Math.max(8, hexSize * 0.16);
  const vertexHintOuterR = Math.max(8, hexSize * 0.14);
  const vertexHintInnerR = Math.max(3, vertexHintOuterR * 0.6);
  const vertexPickGeo = trackDisposable(new THREE.SphereGeometry(vertexPickR, 12, 12));
  const vertexHintGeo = trackDisposable(new THREE.RingGeometry(vertexHintInnerR, vertexHintOuterR, 24));

  const edgePickW = Math.max(18, hexSize * 0.22);
  const edgePickD = Math.max(8, tileHeight * 0.7);
  const edgePickGeo = trackDisposable(new THREE.BoxGeometry(1, edgePickW, edgePickD));

  const edgeHintW = Math.max(10, hexSize * 0.12);
  const edgeHintD = Math.max(5, tileHeight * 0.42);
  const edgeHintGeo = trackDisposable(new THREE.BoxGeometry(1, edgeHintW, edgeHintD));

  for (const h of hexes) {
    if (!h?.id) continue;
    const cornerIds = Array.isArray(h.cornerVertexIds) ? h.cornerVertexIds : [];
    const pts = cornerIds.map((id) => shapePointForVertexId(id)).filter(Boolean);
    if (pts.length < 3) continue;

    // Ensure CCW winding for consistent normals.
    let area2 = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      area2 += a.x * b.y - b.x * a.y;
    }
    if (area2 < 0) pts.reverse();

    const shape = new THREE.Shape();
    shape.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) shape.lineTo(pts[i].x, pts[i].y);
    shape.closePath();

    const pickGeo = trackDisposable(new THREE.ShapeGeometry(shape));
    const pickMesh = new THREE.Mesh(pickGeo, pickMat);
    pickMesh.position.z = hexPickZ;
    pickMesh.renderOrder = 1;
    pickMesh.userData = { kind: "hex", id: String(h.id) };
    pickGroup.add(pickMesh);
    hexPickById.set(String(h.id), pickMesh);

    const geom = trackDisposable(
      new THREE.ExtrudeGeometry(shape, {
        depth: tileHeight,
        bevelEnabled: true,
        bevelThickness: Math.max(0.8, tileHeight * 0.28),
        bevelSize: Math.max(1.2, Number(board.hexSize) * 0.028),
        bevelOffset: 0,
        bevelSegments: 2,
        curveSegments: 2,
        steps: 1
      })
    );
    const mat = trackDisposable(
      new THREE.MeshStandardMaterial({
        color: resourceColor(h.resource),
        roughness: themeParams.tileRoughness,
        metalness: 0.05,
        emissive: 0x000000,
        emissiveIntensity: 0.9
      })
    );
    const mesh = new THREE.Mesh(geom, mat);
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    mesh.userData.isHexTile = true; // Tag for theme updates
    hexGroup.add(mesh);
    hexById.set(String(h.id), mesh);
  }

  for (const e of edges) {
    if (!e?.id) continue;
    const vA = verticesById.get(e.vA);
    const vB = verticesById.get(e.vB);
    if (!vA || !vB) continue;

    const x1 = Number(vA.x) - centerX;
    const y1 = -(Number(vA.y) - centerY);
    const x2 = Number(vB.x) - centerX;
    const y2 = -(Number(vB.y) - centerY);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.max(1, Math.hypot(dx, dy));
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const angle = Math.atan2(dy, dx);

    const pickMesh = new THREE.Mesh(edgePickGeo, pickMat);
    pickMesh.position.set(mx, my, edgePickZ + edgePickD / 2);
    pickMesh.rotation.z = angle;
    pickMesh.scale.x = len;
    pickMesh.userData = { kind: "edge", id: String(e.id) };
    pickGroup.add(pickMesh);
    edgePickById.set(String(e.id), pickMesh);

    const hintMesh = new THREE.Mesh(edgeHintGeo, edgeHintMat);
    hintMesh.position.set(mx, my, hintZ + edgeHintD / 2);
    hintMesh.rotation.z = angle;
    hintMesh.scale.x = len;
    hintMesh.renderOrder = 40;
    hintMesh.visible = false;
    hintGroup.add(hintMesh);
    edgeHintById.set(String(e.id), hintMesh);
  }

  for (const v of vertices) {
    if (!v?.id) continue;
    const x = Number(v.x) - centerX;
    const y = -(Number(v.y) - centerY);

    const pickMesh = new THREE.Mesh(vertexPickGeo, pickMat);
    pickMesh.position.set(x, y, vertexPickZ + vertexPickR * 0.55);
    pickMesh.userData = { kind: "vertex", id: String(v.id) };
    pickGroup.add(pickMesh);
    vertexPickById.set(String(v.id), pickMesh);

    const hintMesh = new THREE.Mesh(vertexHintGeo, vertexHintMat);
    hintMesh.position.set(x, y, hintZ);
    hintMesh.renderOrder = 45;
    hintMesh.visible = false;
    hintGroup.add(hintMesh);
    vertexHintById.set(String(v.id), hintMesh);
  }

  // === PICK MESH VALIDATION AND DEBUG OVERLAY UPDATE ===
  // Validate that pick mesh counts match board data counts
  validatePickMeshCounts({
    hexPickCount: hexPickById.size,
    edgePickCount: edgePickById.size,
    vertexPickCount: vertexPickById.size,
    boardHexCount: hexes.length,
    boardEdgeCount: edges.length,
    boardVertexCount: vertices.length
  });

  // Update debug overlay with counts
  if (debugOverlay) {
    debugOverlay.updateCounts(vertexPickById.size, edgePickById.size, hexPickById.size);
  }

  // === IMPROVED PIECE MESHES ===
  // Use new beveled/house-shaped geometries for better visual quality
  const roadGeo = trackDisposable(createRoadGeometry(tileHeight));
  const settlementGeo = trackDisposable(createSettlementGeometry(tileHeight));
  const cityGeo = trackDisposable(createCityGeometry(tileHeight));

  // Compute bounding boxes for proper positioning
  roadGeo.computeBoundingBox();
  settlementGeo.computeBoundingBox();
  cityGeo.computeBoundingBox();

  // Get heights from bounding boxes (fallback to reasonable defaults)
  const roadHeight = roadGeo.boundingBox
    ? Math.abs(roadGeo.boundingBox.max.z - roadGeo.boundingBox.min.z)
    : Math.max(5, tileHeight * 0.40);
  const settlementHeight = settlementGeo.boundingBox
    ? Math.abs(settlementGeo.boundingBox.max.z - settlementGeo.boundingBox.min.z)
    : Math.max(14, tileHeight * 0.84);
  const cityHeight = cityGeo.boundingBox
    ? Math.abs(cityGeo.boundingBox.max.z - cityGeo.boundingBox.min.z)
    : Math.max(27, tileHeight * 1.2);

  // Enhanced robber with tapered cloak shape
  const robberGeos = createRobberGeometry(tileHeight);
  const robberBodyGeo = trackDisposable(robberGeos.body);
  const robberHeadGeo = trackDisposable(robberGeos.head);
  const robberMat = trackDisposable(new THREE.MeshStandardMaterial({
    color: 0x12151c,
    roughness: 0.55,
    metalness: 0.1,
    emissive: 0x000000,
    emissiveIntensity: 0
  }));
  const robberMesh = new THREE.Group();
  const robberBodyMesh = new THREE.Mesh(robberBodyGeo, robberMat);
  const robberHeadMesh = new THREE.Mesh(robberHeadGeo, robberMat.clone());
  robberHeadMesh.position.z = tileHeight * 0.68;
  robberMesh.add(robberBodyMesh);
  robberMesh.add(robberHeadMesh);
  robberMesh.visible = false;
  world.add(robberMesh);

  // === ANIMATION MANAGER INSTANCE ===
  const animationManager = new AnimationManager();

  const tokenSize = Math.max(30, Number(board.hexSize) * 0.62);
  const tokenGeo = trackDisposable(new THREE.PlaneGeometry(tokenSize, tokenSize));
  const tokenMatByNumber = new Map();

  function buildTokenTexture(tokenNumber) {
    const n = Math.max(2, Math.min(12, Math.floor(Number(tokenNumber))));
    const isHot = n === 6 || n === 8;
    const isWide = n >= 10;
    const size = isWide ? 560 : 520;

    const canvasEl = document.createElement("canvas");
    canvasEl.width = size;
    canvasEl.height = size;

    const ctx = canvasEl.getContext("2d");
    if (!ctx) return null;

    const cx = size / 2;
    const cy = size / 2;
    const circleR = size * 0.36;

    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, circleR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
    ctx.shadowBlur = Math.round(size * 0.045);
    ctx.fillStyle = "rgba(250, 246, 233, 0.96)";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(10, Math.round(size * 0.02));
    ctx.strokeStyle = "rgba(10, 16, 30, 0.22)";
    ctx.stroke();
    ctx.restore();

    const textY = cy - size * 0.06;
    const fontSize = Math.round(size * (isWide ? 0.38 : 0.42));
    ctx.fillStyle = isHot ? "rgba(155, 29, 32, 0.95)" : "rgba(10, 16, 30, 0.92)";
    ctx.font = `900 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n), cx, textY);

    const pips = tokenPipCount(n);
    if (pips) {
      const pipY = cy + size * 0.245;
      const pipGap = size * 0.075;
      const pipR = size * 0.026;
      const startX = cx - ((pips - 1) * pipGap) / 2;

      ctx.fillStyle = isHot ? "rgba(155, 29, 32, 0.92)" : "rgba(10, 16, 30, 0.86)";
      for (let i = 0; i < pips; i += 1) {
        ctx.beginPath();
        ctx.arc(startX + i * pipGap, pipY, pipR, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
      }
    }

    const tex = trackDisposable(new THREE.CanvasTexture(canvasEl));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.max(1, Math.min(8, maxAnisotropy));
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  }

  function tokenMaterialForNumber(tokenNumber) {
    const n = Math.max(2, Math.min(12, Math.floor(Number(tokenNumber))));
    let existing = tokenMatByNumber.get(n);
    if (existing) return existing;

    const tex = buildTokenTexture(n);
    if (!tex) return null;
    const mat = trackDisposable(
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      })
    );
    existing = mat;
    tokenMatByNumber.set(n, existing);
    return existing;
  }

  for (const h of hexes) {
    if (!h?.id) continue;
    if (h.token == null) continue;
    const tokenNumber = Number(h.token);
    if (!Number.isFinite(tokenNumber)) continue;
    const mat = tokenMaterialForNumber(tokenNumber);
    if (!mat) continue;

    const cx = Number(h.center?.x ?? 0) - centerX;
    const cy = -(Number(h.center?.y ?? 0) - centerY);
    const mesh = new THREE.Mesh(tokenGeo, mat);
    mesh.position.set(cx, cy, surfaceZ + tileHeight * 0.06);
    mesh.renderOrder = 12;
    tokenGroup.add(mesh);
  }

  const portStemGeo = trackDisposable(
    new THREE.BoxGeometry(1, Math.max(6, tileHeight * 0.32), Math.max(2.2, tileHeight * 0.14))
  );
  const portPostGeo = trackDisposable(
    new THREE.CylinderGeometry(Math.max(6, tileHeight * 0.24), Math.max(6, tileHeight * 0.24), tileHeight * 0.95, 10)
  );
  portPostGeo.rotateX(Math.PI / 2);

  const portLabelGeo = trackDisposable(new THREE.PlaneGeometry(Math.max(48, tokenSize * 0.62), Math.max(30, tokenSize * 0.36)));
  const portLabelMatByKind = new Map();

  function portFillColor(kind) {
    if (kind === "generic") return "rgba(10, 16, 30, 0.90)";
    const c = resourceColor(kind);
    const hex = `#${c.toString(16).padStart(6, "0")}`;
    return `${hex}EE`;
  }

  function portLabelTexture(kind) {
    const k = kind === "generic" ? "generic" : String(kind || "");
    let existing = portLabelMatByKind.get(k);
    if (existing) return existing;

    const size = 420;
    const canvasEl = document.createElement("canvas");
    canvasEl.width = size;
    canvasEl.height = size;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return null;

    ctx.clearRect(0, 0, size, size);

    const pad = size * 0.12;
    const w = size - pad * 2;
    const h = size - pad * 2;
    const r = size * 0.14;

    ctx.save();
    ctx.translate(pad, pad);
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(w, 0, w, h, r);
    ctx.arcTo(w, h, 0, h, r);
    ctx.arcTo(0, h, 0, 0, r);
    ctx.arcTo(0, 0, w, 0, r);
    ctx.closePath();
    ctx.fillStyle = portFillColor(k);
    ctx.shadowColor = "rgba(0, 0, 0, 0.26)";
    ctx.shadowBlur = Math.round(size * 0.04);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(10, Math.round(size * 0.02));
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.stroke();
    ctx.restore();

    const ratioText = k === "generic" ? "3:1" : "2:1";
    const subText = k === "generic" ? "" : portAbbr(k);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    ctx.font = `900 ${Math.round(size * 0.26)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
    ctx.fillText(ratioText, size / 2, k === "generic" ? size * 0.53 : size * 0.47);

    if (subText) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.90)";
      ctx.font = `900 ${Math.round(size * 0.20)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
      ctx.fillText(subText, size / 2, size * 0.62);
    }

    const tex = trackDisposable(new THREE.CanvasTexture(canvasEl));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.max(1, Math.min(8, maxAnisotropy));
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;

    const mat = trackDisposable(
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    portLabelMatByKind.set(k, mat);
    return mat;
  }

  for (const p of ports) {
    const vertexIds = Array.isArray(p?.vertexIds) ? p.vertexIds : [];
    const vA = verticesById.get(vertexIds[0]);
    const vB = verticesById.get(vertexIds[1]);
    if (!vA || !vB) continue;

    const mx = (Number(vA.x) + Number(vB.x)) / 2 - centerX;
    const my = -((Number(vA.y) + Number(vB.y)) / 2 - centerY);
    let dx = mx;
    let dy = my;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const offset = Number(board.hexSize) * 0.42;
    const px = mx + dx * offset;
    const py = my + dy * offset;

    const stemLen = Math.hypot(px - mx, py - my);
    const stemAngle = Math.atan2(py - my, px - mx);

    const stemMat = trackDisposable(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.05, opacity: 0.8, transparent: true }));
    const stemMesh = new THREE.Mesh(portStemGeo, stemMat);
    stemMesh.position.set((mx + px) / 2, (my + py) / 2, surfaceZ + portStemGeo.parameters.depth / 2);
    stemMesh.rotation.z = stemAngle;
    stemMesh.scale.x = stemLen;
    portGroup.add(stemMesh);

    const kind = p?.kind === "generic" ? "generic" : String(p?.kind || "");
    const postMat = trackDisposable(
      new THREE.MeshStandardMaterial({
        color: kind === "generic" ? 0x0a101e : resourceColor(kind),
        roughness: 0.7,
        metalness: 0.06
      })
    );
    const postMesh = new THREE.Mesh(portPostGeo, postMat);
    postMesh.position.set(px, py, surfaceZ + portPostGeo.parameters.height / 2);
    portGroup.add(postMesh);

    const labelMat = portLabelTexture(kind);
    if (!labelMat) continue;
    const labelMesh = new THREE.Mesh(portLabelGeo, labelMat);
    labelMesh.position.set(px, py, surfaceZ + portPostGeo.parameters.height + tileHeight * 0.18);
    labelMesh.renderOrder = 20;
    portGroup.add(labelMesh);
    billboardPlanes.push(labelMesh);
  }

  const boardW = Math.max(1, Number(bounds.maxX) - Number(bounds.minX));
  const boardH = Math.max(1, Number(bounds.maxY) - Number(bounds.minY));
  const pad = Math.max(40, Number(board.hexSize) * 0.9);
  const halfBoardW = boardW / 2 + pad;
  const halfBoardH = boardH / 2 + pad;
  const boardRadius = Math.hypot(halfBoardW, halfBoardH);

  // === OCEAN MESH SETUP ===
  // Get current settings for quality-gated ocean effects
  const currentSettings = getSettings();
  let oceanQuality = getOceanQuality(
    quality,
    currentSettings.reducedMotion,
    currentSettings.lowPowerMode
  );

  // Create ocean mesh (renders underneath everything)
  const oceanResult = createOceanMesh(boardRadius, oceanQuality);
  const oceanMesh = oceanResult.mesh;
  const oceanUniforms = oceanResult.uniforms;
  trackDisposable(oceanResult.geometry);
  trackDisposable(oceanResult.material);
  scene.add(oceanMesh); // Add to scene before world group so it renders first

  // Create shoreline mesh around the island
  const shoreResult = createShorelineMesh(vertices, centerX, centerY, hexSize);
  let shoreUniforms = null;
  if (shoreResult) {
    trackDisposable(shoreResult.geometry);
    trackDisposable(shoreResult.material);
    world.add(shoreResult.mesh);
    shoreUniforms = shoreResult.uniforms;
  }

  // Ocean animation state
  let lastOceanTime = performance.now();
  let oceanAnimationId = null;
  // === END OCEAN MESH SETUP ===

  camera.position.set(0, -boardRadius * 1.05, boardRadius * 1.05);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  // === CAMERA CONTROLLER INSTANCE ===
  // Create camera controller for pan/zoom with quality-aware updates
  const cameraController = createCameraController(camera, bounds, {
    pad,
    quality
  });

  // Track current view dimensions for camera controller
  let currentViewW = 1;
  let currentViewH = 1;

  // === CINEMATIC CAMERA CONTROLLER INSTANCE ===
  // Creates smooth camera animations for dramatic moments (TV display)
  // Will be fully initialized after requestRender is defined
  const cinematicCamera = createCinematicCameraController(cameraController, {
    hexesById,
    verticesById,
    edgesById,
    centerX,
    centerY,
    hexSize
  });

  // === POST-FX CONTROLLER INSTANCE ===
  // Creates lightweight vignette effect (quality-gated)
  const postFx = createPostFxController(renderer, scene, camera);

  // === TOUCH GESTURE HANDLER INSTANCE ===
  // Will be created after requestRender is defined (needs the callback)
  let touchGestures = null;

  function fitCameraToBoard(viewW, viewH) {
    const w = Math.max(1, viewW);
    const h = Math.max(1, viewH);
    const aspect = w / h;
    const zMax = surfaceZ + tileHeight * 1.8;

    const corners = [
      new THREE.Vector3(-halfBoardW, -halfBoardH, 0),
      new THREE.Vector3(halfBoardW, -halfBoardH, 0),
      new THREE.Vector3(-halfBoardW, halfBoardH, 0),
      new THREE.Vector3(halfBoardW, halfBoardH, 0),
      new THREE.Vector3(-halfBoardW, -halfBoardH, zMax),
      new THREE.Vector3(halfBoardW, -halfBoardH, zMax),
      new THREE.Vector3(-halfBoardW, halfBoardH, zMax),
      new THREE.Vector3(halfBoardW, halfBoardH, zMax)
    ];

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of corners) {
      c.applyMatrix4(camera.matrixWorldInverse);
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
    }

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const currentAspect = width / height;
    let outMinX = minX;
    let outMaxX = maxX;
    let outMinY = minY;
    let outMaxY = maxY;

    if (currentAspect < aspect) {
      const targetWidth = height * aspect;
      const extra = (targetWidth - width) / 2;
      outMinX -= extra;
      outMaxX += extra;
    } else {
      const targetHeight = width / aspect;
      const extra = (targetHeight - height) / 2;
      outMinY -= extra;
      outMaxY += extra;
    }

    camera.left = outMinX;
    camera.right = outMaxX;
    camera.bottom = outMinY;
    camera.top = outMaxY;
    camera.updateProjectionMatrix();
  }

  function requestRender() {
    if (destroyed) return;
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (destroyed) return;
      for (const plane of billboardPlanes) {
        plane.quaternion.copy(camera.quaternion);
      }
      renderer.render(scene, camera);
      // === POST-FX RENDER ===
      // Render vignette overlay on top (if enabled)
      postFx.render();
    });
  }

  // === CONNECT ANIMATION MANAGER TO RENDER ===
  // When animations update, trigger a render
  animationManager.onFrame = () => {
    if (!destroyed) {
      renderQueued = false; // Allow immediate render
      requestRender();
    }
  };

  // === CONNECT CINEMATIC CAMERA TO RENDER ===
  // When cinematic camera updates, apply to camera and render
  cinematicCamera.setOnCameraUpdate(() => {
    if (!destroyed) {
      cameraController.applyToCamera(currentViewW, currentViewH);
      renderQueued = false; // Allow immediate render for smooth animation
      requestRender();
    }
  });

  // === SUBSCRIBE TO THEME CHANGES ===
  // Now that requestRender is defined, subscribe to theme changes
  unsubscribeTheme = onThemeChange(handleThemeChange);

  function updateSize() {
    const rect = root.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const key = `${w}x${h}`;
    if (key === lastSizeKey) return;
    lastSizeKey = key;

    // Track current dimensions for camera controller
    currentViewW = w;
    currentViewH = h;

    const pr = pixelRatioForQuality(quality);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);

    // Use camera controller to apply camera settings
    cameraController.applyToCamera(w, h);

    // Also run legacy fitCameraToBoard for initial setup compatibility
    // (camera controller will override frustum, but this sets up the projection initially)
    fitCameraToBoard(w, h);
    requestRender();
  }

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => updateSize()) : null;
  ro?.observe(root);
  updateSize();

  // === INITIALIZE TOUCH GESTURE HANDLER ===
  // Now that requestRender is defined, create the touch gesture handler
  touchGestures = createTouchGestureHandler(canvas, cameraController, {
    onCameraChange: () => {
      // Apply camera changes and re-render
      cameraController.applyToCamera(currentViewW, currentViewH);
      requestRender();
    },
    getViewSize: () => ({ width: currentViewW, height: currentViewH })
  });

  // === OCEAN ANIMATION LOOP ===
  // Continuous animation for ocean waves (quality-gated)
  function oceanAnimationLoop() {
    if (destroyed) return;

    const now = performance.now();
    const deltaTime = (now - lastOceanTime) / 1000; // Convert to seconds
    lastOceanTime = now;

    // Update ocean animation uniforms
    updateOceanAnimation(oceanUniforms, shoreUniforms, deltaTime, oceanQuality);

    // Render the updated scene
    for (const plane of billboardPlanes) {
      plane.quaternion.copy(camera.quaternion);
    }
    renderer.render(scene, camera);

    // Continue animation loop only if not static quality
    if (oceanQuality !== "low") {
      oceanAnimationId = requestAnimationFrame(oceanAnimationLoop);
    }
  }

  // Start ocean animation if quality supports it
  if (oceanQuality !== "low") {
    oceanAnimationId = requestAnimationFrame(oceanAnimationLoop);
  }
  // === END OCEAN ANIMATION LOOP ===

  function applyHighlightMode(highlightMode) {
    const mode = String(highlightMode || "");
    if (mode) root.dataset.highlight = mode;
    else root.removeAttribute("data-highlight");

    const isQuick = mode === "quick-setup";
    vertexHintMat.opacity = isQuick ? 0.88 : 0.7;
    edgeHintMat.opacity = isQuick ? 0.8 : 0.62;
  }

  function setHexHighlight(selectableHexIds, robberHexId, highlightMode) {
    const selectable = new Set(Array.isArray(selectableHexIds) ? selectableHexIds : []);
    const isQuick = String(highlightMode || "") === "quick-setup";
    for (const [id, mesh] of hexById.entries()) {
      const mat = mesh?.material;
      if (!mat) continue;
      const isSelectable = selectable.has(id);
      const isRobber = robberHexId && id === robberHexId;
      mat.emissive?.setHex?.(isRobber ? 0x9b1d20 : isSelectable ? 0xffd166 : 0x000000);
      const selectableIntensity = isQuick ? 0.7 : 0.55;
      mat.emissiveIntensity = isRobber ? 0.8 : isSelectable ? selectableIntensity : 0.0;
    }
  }

  function setVertexEdgeHighlight(selectableVertexIds, selectableEdgeIds) {
    const vertexSet = new Set(Array.isArray(selectableVertexIds) ? selectableVertexIds.map(String) : []);
    const edgeSet = new Set(Array.isArray(selectableEdgeIds) ? selectableEdgeIds.map(String) : []);

    for (const [id, mesh] of vertexHintById.entries()) {
      mesh.visible = vertexSet.has(id);
    }
    for (const [id, mesh] of edgeHintById.entries()) {
      mesh.visible = edgeSet.has(id);
    }
  }

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const boardPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -surfaceZ);
  const planePoint = new THREE.Vector3();

  function clientToNdc(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (!w || !h) return null;
    pointerNdc.x = ((clientX - rect.left) / w) * 2 - 1;
    pointerNdc.y = -(((clientY - rect.top) / h) * 2 - 1);
    return pointerNdc;
  }

  function tryHandlePick(kind, id) {
    if (!id || !kind) return false;

    // Update debug overlay with last picked item
    if (debugOverlay) {
      debugOverlay.updateLastPick(kind, id);
    }

    if (kind === "vertex") {
      if (interaction.onVertexClick && interaction.selectableVertexSet.has(id)) {
        interaction.onVertexClick(id);
        return true;
      }
      if (interaction.canCaptureVertices && interaction.onIllegalClick && !interaction.selectableVertexSet.has(id)) {
        interaction.onIllegalClick({ kind: "vertex", id });
        return true;
      }
      return false;
    }

    if (kind === "edge") {
      if (interaction.onEdgeClick && interaction.selectableEdgeSet.has(id)) {
        interaction.onEdgeClick(id);
        return true;
      }
      if (interaction.canCaptureEdges && interaction.onIllegalClick && !interaction.selectableEdgeSet.has(id)) {
        interaction.onIllegalClick({ kind: "edge", id });
        return true;
      }
      return false;
    }

    if (kind === "hex") {
      if (interaction.onHexClick && interaction.selectableHexSet.has(id)) {
        interaction.onHexClick(id);
        return true;
      }
      if (interaction.canCaptureHexes && interaction.onIllegalClick && !interaction.selectableHexSet.has(id)) {
        interaction.onIllegalClick({ kind: "hex", id });
        return true;
      }
      return false;
    }

    return false;
  }

  function trySnapFromRay(ray) {
    if (!ray?.intersectPlane(boardPlane, planePoint)) return false;
    const px = planePoint.x;
    const py = planePoint.y;

    if (interaction.onVertexClick && interaction.selectableVertexSet.size) {
      let bestId = null;
      let bestD2 = Infinity;
      for (const v of vertices) {
        const id = String(v?.id || "");
        if (!interaction.selectableVertexSet.has(id)) continue;
        const x = Number(v.x) - centerX;
        const y = -(Number(v.y) - centerY);
        const dx = x - px;
        const dy = y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestId = id;
        }
      }
      const threshold = hexSize * 0.22;
      if (bestId && bestD2 <= threshold * threshold) {
        interaction.onVertexClick(bestId);
        return true;
      }
      return false;
    }

    if (interaction.onEdgeClick && interaction.selectableEdgeSet.size) {
      let bestId = null;
      let bestD2 = Infinity;
      for (const e of edges) {
        const id = String(e?.id || "");
        if (!interaction.selectableEdgeSet.has(id)) continue;
        const vA = verticesById.get(e.vA);
        const vB = verticesById.get(e.vB);
        if (!vA || !vB) continue;
        const ax = Number(vA.x) - centerX;
        const ay = -(Number(vA.y) - centerY);
        const bx = Number(vB.x) - centerX;
        const by = -(Number(vB.y) - centerY);
        const d2 = pointToSegmentDistanceSquared(px, py, ax, ay, bx, by);
        if (d2 < bestD2) {
          bestD2 = d2;
          bestId = id;
        }
      }
      const threshold = hexSize * 0.2;
      if (bestId && bestD2 <= threshold * threshold) {
        interaction.onEdgeClick(bestId);
        return true;
      }
    }

    return false;
  }

  function handleCanvasClick(ev) {
    if (destroyed) return;
    if (ev?.defaultPrevented) return;
    if (typeof ev?.clientX !== "number" || typeof ev?.clientY !== "number") return;

    // === SUPPRESS CLICK AFTER DRAG/PINCH ===
    // Prevent accidental placements during camera manipulation
    if (touchGestures && touchGestures.shouldSuppressClick()) {
      return;
    }

    const ndc = clientToNdc(ev.clientX, ev.clientY);
    if (!ndc) return;

    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(pickGroup, true);

    for (const hit of hits) {
      const obj = hit?.object || null;
      const kind = obj?.userData?.kind;
      const id = obj?.userData?.id;
      if (typeof kind !== "string" || typeof id !== "string") continue;
      if (tryHandlePick(kind, id)) return;
    }

    // Touch UX fallback: if the ray misses tiny pick meshes, snap to the nearest selectable vertex/edge.
    trySnapFromRay(raycaster.ray);
  }

  canvas.addEventListener("click", handleCanvasClick);

  function updateRoads(structures, players, placedEdgeIds) {
    const roads = structures?.roads && typeof structures.roads === "object" ? structures.roads : {};
    const placedSet = new Set(Array.isArray(placedEdgeIds) ? placedEdgeIds.map(String) : []);
    const used = new Set();

    for (const [edgeId, r] of Object.entries(roads)) {
      const e = edgesById.get(edgeId);
      if (!e) continue;
      const vA = verticesById.get(e.vA);
      const vB = verticesById.get(e.vB);
      if (!vA || !vB) continue;

      const x1 = Number(vA.x) - centerX;
      const y1 = -(Number(vA.y) - centerY);
      const x2 = Number(vB.x) - centerX;
      const y2 = -(Number(vB.y) - centerY);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.max(1, Math.hypot(dx, dy));
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;

      let mesh = roadById.get(edgeId);
      const isNew = !mesh;
      if (!mesh) {
        const mat = trackDisposable(new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.7,
          metalness: 0.05,
          emissive: 0x000000,
          emissiveIntensity: 0
        }));
        mesh = new THREE.Mesh(roadGeo, mat);
        mesh.position.z = surfaceZ + roadHeight / 2;
        structGroup.add(mesh);
        roadById.set(edgeId, mesh);
      }

      mesh.visible = true;
      mesh.position.x = mx;
      mesh.position.y = my;
      mesh.position.z = surfaceZ + roadHeight / 2;
      mesh.rotation.z = Math.atan2(dy, dx);
      mesh.scale.x = len;
      mesh.material.color.copy(colorForPlayer(players, r?.playerId));
      used.add(edgeId);

      // === PLACEMENT ANIMATION ===
      // Animate newly placed roads (scale from 0.6 to 1.0 with overshoot)
      if (isNew && placedSet.has(edgeId)) {
        animationManager.startScaleAnimation(`road:${edgeId}`, mesh, 350);
      }
    }

    for (const [edgeId, mesh] of roadById.entries()) {
      if (used.has(edgeId)) continue;
      mesh.visible = false;
    }
  }

  function updateSettlements(structures, players, placedVertexIds) {
    const settlements = structures?.settlements && typeof structures.settlements === "object" ? structures.settlements : {};
    const placedSet = new Set(Array.isArray(placedVertexIds) ? placedVertexIds.map(String) : []);
    const used = new Set();

    for (const [vertexId, s] of Object.entries(settlements)) {
      const v = verticesById.get(vertexId);
      if (!v) continue;
      const kind = s?.kind === "city" ? "city" : "settlement";

      const x = Number(v.x) - centerX;
      const y = -(Number(v.y) - centerY);

      let entry = settlementById.get(vertexId);
      const isNew = !entry;
      const wasUpgraded = entry && entry.kind !== kind && kind === "city";

      if (!entry) {
        const mat = trackDisposable(new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.8,
          metalness: 0.05,
          emissive: 0x000000,
          emissiveIntensity: 0
        }));
        const mesh = new THREE.Mesh(kind === "city" ? cityGeo : settlementGeo, mat);
        entry = { mesh, kind };
        structGroup.add(mesh);
        settlementById.set(vertexId, entry);
      }

      const mesh = entry.mesh;
      if (entry.kind !== kind) {
        mesh.geometry = kind === "city" ? cityGeo : settlementGeo;
        entry.kind = kind;
      }

      mesh.visible = true;
      const zHeight = kind === "city" ? cityHeight : settlementHeight;
      mesh.position.set(x, y, surfaceZ + zHeight / 2);
      mesh.material.color.copy(colorForPlayer(players, s?.playerId));
      used.add(vertexId);

      // === PLACEMENT ANIMATION ===
      // Animate newly placed settlements or city upgrades
      if (placedSet.has(vertexId)) {
        if (isNew) {
          // New settlement - scale animation
          animationManager.startScaleAnimation(`settlement:${vertexId}`, mesh, 380);
        } else if (wasUpgraded) {
          // City upgrade - animate with slightly longer duration
          animationManager.startScaleAnimation(`city:${vertexId}`, mesh, 420);
        }
      }
    }

    for (const [vertexId, entry] of settlementById.entries()) {
      if (used.has(vertexId)) continue;
      entry.mesh.visible = false;
    }
  }

  // Track previous robber position for animation
  let previousRobberHexId = null;

  function updateRobber(robberHexId) {
    const id = typeof robberHexId === "string" ? robberHexId : null;
    const h = id ? hexesById.get(id) : null;
    if (!h) {
      robberMesh.visible = false;
      previousRobberHexId = null;
      return;
    }

    const cx = Number(h.center?.x ?? 0) - centerX;
    const cy = -(Number(h.center?.y ?? 0) - centerY);
    const targetZ = surfaceZ + tileHeight * 0.6;
    const targetPos = { x: cx, y: cy, z: targetZ };

    // Check if robber is moving to a new hex
    const isMoving = previousRobberHexId !== null && previousRobberHexId !== id;

    robberMesh.visible = true;

    if (isMoving) {
      // === ROBBER MOVEMENT ANIMATION ===
      // Animate position lerp when moving to new hex
      animationManager.startRobberAnimation(robberMesh, targetPos, 280);
    } else {
      // Initial placement or same hex - no animation
      robberMesh.position.set(cx, cy, targetZ);
    }

    previousRobberHexId = id;
  }

  function clearPulseTimer(mesh) {
    const t = pulseTimerByMesh.get(mesh);
    if (t) clearTimeout(t);
    pulseTimerByMesh.delete(mesh);
  }

  function pulseMesh(mesh, { tone = "info", durationMs = 650 } = {}, restore) {
    if (!mesh) return;
    const mat = mesh.material;
    if (!mat) return;
    if (!mat.emissive) mat.emissive = new THREE.Color(0x000000);

    const prevHex = typeof mat.emissive?.getHex === "function" ? mat.emissive.getHex() : 0x000000;
    const prevIntensity = Number.isFinite(mat.emissiveIntensity) ? mat.emissiveIntensity : 0;

    const nextHex = toneEmissiveHex(tone);
    clearPulseTimer(mesh);

    try {
      mat.emissive.setHex(nextHex);
      mat.emissiveIntensity = 0.9;
    } catch {
      // Ignore.
    }
    requestRender();

    const ms = Math.max(120, Math.floor(Number(durationMs) || 0));
    const timer = setTimeout(() => {
      pulseTimerByMesh.delete(mesh);
      if (typeof restore === "function") {
        restore();
        requestRender();
        return;
      }
      try {
        mat.emissive.setHex(prevHex);
        mat.emissiveIntensity = prevIntensity;
      } catch {
        // Ignore.
      }
      requestRender();
    }, ms);
    pulseTimerByMesh.set(mesh, timer);
  }

  function pulseRoad(edgeId, opts) {
    const mesh = edgeId ? roadById.get(String(edgeId)) : null;
    if (!mesh || !mesh.visible) return;
    pulseMesh(mesh, { tone: "good", ...(opts || {}) });
  }

  function pulseSettlement(vertexId, opts) {
    const entry = vertexId ? settlementById.get(String(vertexId)) : null;
    const mesh = entry?.mesh || null;
    if (!mesh || !mesh.visible) return;
    pulseMesh(mesh, { tone: "good", ...(opts || {}) });
  }

  function pulseHex(hexId, opts) {
    const mesh = hexId ? hexById.get(String(hexId)) : null;
    if (!mesh) return;
    pulseMesh(mesh, { tone: "warn", ...(opts || {}) }, () =>
      setHexHighlight(lastSelectableHexIds, lastRobberHexId, lastHighlightMode)
    );
  }

  function update(nextOptions) {
    quality = normalizeRendererQuality(nextOptions?.rendererQuality);
    renderer.setPixelRatio(pixelRatioForQuality(quality));

    // Update camera controller quality for throttled updates on low-power devices
    cameraController.setQuality(quality);

    // === UPDATE POST-FX ===
    // Enable/disable vignette based on quality and settings
    postFx.update(quality);

    // === UPDATE OCEAN QUALITY ===
    // Check if ocean quality needs to change based on settings
    const updatedSettings = getSettings();
    const newOceanQuality = getOceanQuality(
      quality,
      updatedSettings.reducedMotion,
      updatedSettings.lowPowerMode
    );

    // If quality changed, update uniforms and restart/stop animation
    if (newOceanQuality !== oceanQuality) {
      oceanQuality = newOceanQuality;
      oceanUniforms.uQuality.value = oceanQuality === "high" ? 2 : oceanQuality === "medium" ? 1 : 0;

      // Stop existing animation if running
      if (oceanAnimationId) {
        cancelAnimationFrame(oceanAnimationId);
        oceanAnimationId = null;
      }

      // Start animation if quality supports it
      if (oceanQuality !== "low") {
        lastOceanTime = performance.now();
        oceanAnimationId = requestAnimationFrame(oceanAnimationLoop);
      }
    }

    lastHighlightMode = String(nextOptions?.highlightMode || "");
    lastSelectableHexIds = Array.isArray(nextOptions?.selectableHexIds) ? nextOptions.selectableHexIds : [];
    lastSelectableEdgeIds = Array.isArray(nextOptions?.selectableEdgeIds) ? nextOptions.selectableEdgeIds : [];
    lastSelectableVertexIds = Array.isArray(nextOptions?.selectableVertexIds) ? nextOptions.selectableVertexIds : [];
    lastRobberHexId = typeof nextOptions?.robberHexId === "string" ? nextOptions.robberHexId : null;

    // === RUNTIME VALIDATION ===
    // Validate that selectable IDs exist in board data (logs warnings once per session)
    validateSelectableIds({
      selectableVertexIds: lastSelectableVertexIds.map(String),
      selectableEdgeIds: lastSelectableEdgeIds.map(String),
      selectableHexIds: lastSelectableHexIds.map(String),
      validVertexIds,
      validEdgeIds,
      validHexIds
    });

    applyHighlightMode(nextOptions?.highlightMode);

    interaction.selectableVertexSet = new Set(Array.isArray(nextOptions?.selectableVertexIds) ? nextOptions.selectableVertexIds.map(String) : []);
    interaction.selectableEdgeSet = new Set(Array.isArray(nextOptions?.selectableEdgeIds) ? nextOptions.selectableEdgeIds.map(String) : []);
    interaction.selectableHexSet = new Set(Array.isArray(nextOptions?.selectableHexIds) ? nextOptions.selectableHexIds.map(String) : []);
    interaction.canCaptureVertices = !!nextOptions?.onIllegalClick && !!nextOptions?.captureAllVertices;
    interaction.canCaptureEdges = !!nextOptions?.onIllegalClick && !!nextOptions?.captureAllEdges;
    interaction.canCaptureHexes = !!nextOptions?.onIllegalClick && !!nextOptions?.captureAllHexes;
    interaction.onVertexClick = typeof nextOptions?.onVertexClick === "function" ? nextOptions.onVertexClick : null;
    interaction.onEdgeClick = typeof nextOptions?.onEdgeClick === "function" ? nextOptions.onEdgeClick : null;
    interaction.onHexClick = typeof nextOptions?.onHexClick === "function" ? nextOptions.onHexClick : null;
    interaction.onIllegalClick = typeof nextOptions?.onIllegalClick === "function" ? nextOptions.onIllegalClick : null;

    setHexHighlight(nextOptions?.selectableHexIds, nextOptions?.robberHexId, nextOptions?.highlightMode);
    setVertexEdgeHighlight(nextOptions?.selectableVertexIds, nextOptions?.selectableEdgeIds);

    // === PLACEMENT ANIMATION SUPPORT ===
    // Pass placedEdgeIds/placedVertexIds for animation triggering
    const placedEdgeIds = Array.isArray(nextOptions?.placedEdgeIds) ? nextOptions.placedEdgeIds : [];
    const placedVertexIds = Array.isArray(nextOptions?.placedVertexIds) ? nextOptions.placedVertexIds : [];

    updateRoads(nextOptions?.structures, nextOptions?.players, placedEdgeIds);
    updateSettlements(nextOptions?.structures, nextOptions?.players, placedVertexIds);
    updateRobber(nextOptions?.robberHexId);

    requestRender();
  }

  function destroy() {
    destroyed = true;
    canvas.removeEventListener("click", handleCanvasClick);

    // === CLEANUP THEME SUBSCRIPTION ===
    if (typeof unsubscribeTheme === "function") {
      unsubscribeTheme();
    }

    // === CLEANUP PLACEMENT ANIMATIONS ===
    animationManager.destroy();

    // === CLEANUP CINEMATIC CAMERA ===
    cinematicCamera.destroy();

    // === CLEANUP POST-FX ===
    postFx.destroy();

    // === CLEANUP OCEAN ANIMATION ===
    if (oceanAnimationId) {
      cancelAnimationFrame(oceanAnimationId);
      oceanAnimationId = null;
    }

    // === CLEANUP TOUCH GESTURE HANDLER ===
    if (touchGestures) {
      touchGestures.detach();
      touchGestures = null;
    }

    // === CLEANUP DEBUG OVERLAY ===
    if (debugOverlay) {
      debugOverlay.destroy();
    }

    ro?.disconnect?.();
    try {
      renderer.dispose();
    } catch {
      // Ignore.
    }
    try {
      renderer.forceContextLoss?.();
    } catch {
      // Ignore.
    }
    try {
      const gl = renderer.getContext?.();
      gl?.getExtension?.("WEBGL_lose_context")?.loseContext?.();
    } catch {
      // Ignore.
    }
    for (const d of disposable) {
      try {
        d.dispose();
      } catch {
        // Ignore.
      }
    }
    disposable.clear();
    for (const t of pulseTimerByMesh.values()) {
      try {
        clearTimeout(t);
      } catch {
        // Ignore.
      }
    }
    pulseTimerByMesh.clear();

    if (root.parentNode === container) container.removeChild(root);
  }

  // === RESET VIEW FUNCTION ===
  // Resets camera to default framing (zoom = 1, centered)
  // Useful for TV host "reset view" button or programmatic reset
  function resetView() {
    cameraController.reset();
    cameraController.applyToCamera(currentViewW, currentViewH);
    requestRender();
  }

  // === CINEMATIC CAMERA METHODS ===
  // Exposed for TV to trigger dramatic camera moves during moments

  /**
   * Focus camera on a player's area with subtle zoom.
   * Used for turn start moments.
   * @param {string} playerId
   * @param {Object} structures - Current game structures
   * @param {Object} [opts]
   */
  function focusPlayerArea(playerId, structures, opts) {
    cinematicCamera.focusPlayerArea(playerId, structures, opts);
  }

  /**
   * Focus camera on an edge (road placement).
   * @param {string} edgeId
   * @param {Object} [opts]
   */
  function focusEdge(edgeId, opts) {
    cinematicCamera.focusEdge(edgeId, opts);
  }

  /**
   * Focus camera on a vertex (settlement/city placement).
   * @param {string} vertexId
   * @param {Object} [opts]
   */
  function focusVertex(vertexId, opts) {
    cinematicCamera.focusVertex(vertexId, opts);
  }

  /**
   * Focus camera on a hex tile (robber movement).
   * @param {string} hexId
   * @param {Object} [opts]
   */
  function focusHex(hexId, opts) {
    cinematicCamera.focusHex(hexId, opts);
  }

  /**
   * Smoothly reset camera to default view.
   * @param {Object} [opts]
   */
  function cinematicReset(opts) {
    cinematicCamera.resetView(opts);
  }

  /**
   * Check if cinematic camera is currently animating.
   * @returns {boolean}
   */
  function isCinematicAnimating() {
    return cinematicCamera.isAnimating;
  }

  return {
    update,
    destroy,
    canvas,
    pulseRoad,
    pulseSettlement,
    pulseHex,
    resetView,
    // Cinematic camera methods
    focusPlayerArea,
    focusEdge,
    focusVertex,
    focusHex,
    cinematicReset,
    isCinematicAnimating
  };
}

const viewByContainer = new WeakMap();

export function renderBoard3d(container, board, options) {
  if (!container) return;

  if (!board) {
    const existing = viewByContainer.get(container);
    if (existing?.view) existing.view.destroy();
    viewByContainer.delete(container);
    container.innerHTML = `<div class="muted">No board yet.</div>`;
    return;
  }

  const nextKey = stableBoardKey(board);
  const existing = viewByContainer.get(container);
  if (!existing || existing.boardKey !== nextKey) {
    if (existing?.view) existing.view.destroy();
    const view = createBoardView3d(container, board, options);
    viewByContainer.set(container, { boardKey: nextKey, view });
  }

  const view = viewByContainer.get(container)?.view;
  view?.update(options);
}

export function applyBoardMoment3d(container, moment) {
  const entry = viewByContainer.get(container);
  const view = entry?.view || null;
  if (!view) return false;

  const rawType = typeof moment?.type === "string" ? moment.type : "";
  const rawKind = typeof moment?.kind === "string" ? moment.kind : "";
  const kind = rawType === "build" && rawKind ? `build_${rawKind}` : rawKind || rawType;
  const data = moment?.data && typeof moment.data === "object" ? moment.data : moment || {};

  if (kind === "build_road" && data?.edgeId) {
    view.pulseRoad(data.edgeId, { tone: "good", durationMs: 620 });
    return true;
  }
  if ((kind === "build_settlement" || kind === "build_city") && data?.vertexId) {
    view.pulseSettlement(data.vertexId, { tone: "good", durationMs: 620 });
    return true;
  }
  if (kind === "robber_moved" && data?.hexId) {
    view.pulseHex(data.hexId, { tone: "warn", durationMs: 740 });
    return true;
  }

  return false;
}

// === RESET VIEW EXPORT ===
// Resets the 3D board camera to default framing.
// Useful for TV host "reset view" button.
export function resetBoard3dView(container) {
  const entry = viewByContainer.get(container);
  const view = entry?.view || null;
  if (!view) return false;
  view.resetView();
  return true;
}

// === CINEMATIC CAMERA EXPORTS ===
// Exposed for TV to trigger dramatic camera moves during moments.
// All movements respect reducedMotion setting - snap immediately if disabled.

/**
 * Focus camera on a player's area with subtle zoom (turn start).
 * @param {HTMLElement} container
 * @param {string} playerId
 * @param {Object} structures - Current game structures
 * @param {Object} [opts]
 * @returns {boolean} Success
 */
export function focusPlayerArea3d(container, playerId, structures, opts) {
  const entry = viewByContainer.get(container);
  const view = entry?.view || null;
  if (!view?.focusPlayerArea) return false;
  view.focusPlayerArea(playerId, structures, opts);
  return true;
}

/**
 * Focus camera on an edge (road placement).
 * @param {HTMLElement} container
 * @param {string} edgeId
 * @param {Object} [opts]
 * @returns {boolean} Success
 */
export function focusEdge3d(container, edgeId, opts) {
  const entry = viewByContainer.get(container);
  const view = entry?.view || null;
  if (!view?.focusEdge) return false;
  view.focusEdge(edgeId, opts);
  return true;
}

/**
 * Focus camera on a vertex (settlement/city placement).
 * @param {HTMLElement} container
 * @param {string} vertexId
 * @param {Object} [opts]
 * @returns {boolean} Success
 */
export function focusVertex3d(container, vertexId, opts) {
  const entry = viewByContainer.get(container);
  const view = entry?.view || null;
  if (!view?.focusVertex) return false;
  view.focusVertex(vertexId, opts);
  return true;
}

/**
 * Focus camera on a hex tile (robber movement).
 * @param {HTMLElement} container
 * @param {string} hexId
 * @param {Object} [opts]
 * @returns {boolean} Success
 */
export function focusHex3d(container, hexId, opts) {
  const entry = viewByContainer.get(container);
  const view = entry?.view || null;
  if (!view?.focusHex) return false;
  view.focusHex(hexId, opts);
  return true;
}

/**
 * Smoothly reset camera to default view (cinematic).
 * @param {HTMLElement} container
 * @param {Object} [opts]
 * @returns {boolean} Success
 */
export function cinematicReset3d(container, opts) {
  const entry = viewByContainer.get(container);
  const view = entry?.view || null;
  if (!view?.cinematicReset) return false;
  view.cinematicReset(opts);
  return true;
}
