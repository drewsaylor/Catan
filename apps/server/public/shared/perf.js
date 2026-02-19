const DEFAULT_MAX_SAMPLES = 30;

import { getSettings, onSettingsChange } from "./settings.js";
import { formatQualityDebug, getClientRole, resolveQualityProfile } from "./renderer-quality.js";

function nowMs() {
  try {
    if (globalThis.performance?.now) return performance.now();
  } catch {
    // Ignore and fall back.
  }
  return Date.now();
}

function makeRollingWindow(maxSamples = DEFAULT_MAX_SAMPLES) {
  const size = Number.isFinite(maxSamples) ? Math.max(1, Math.floor(maxSamples)) : DEFAULT_MAX_SAMPLES;
  return {
    maxSamples: size,
    samples: new Array(size).fill(0),
    index: 0,
    count: 0,
    sum: 0,
    last: 0
  };
}

function pushSample(win, value) {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  win.last = v;

  if (win.count < win.maxSamples) {
    win.samples[win.index] = v;
    win.sum += v;
    win.count += 1;
    win.index = (win.index + 1) % win.maxSamples;
    return;
  }

  const prev = win.samples[win.index] ?? 0;
  win.sum -= prev;
  win.samples[win.index] = v;
  win.sum += v;
  win.index = (win.index + 1) % win.maxSamples;
}

function avg(win) {
  return win.count > 0 ? win.sum / win.count : 0;
}

function fmtMs(ms) {
  if (!Number.isFinite(ms)) return "—";
  const v = Math.max(0, ms);
  if (v < 10) return `${v.toFixed(1)}ms`;
  return `${Math.round(v)}ms`;
}

function fmtBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  const b = Math.max(0, Math.floor(bytes));
  if (b < 1024) return `${b}B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)}KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)}MB`;
}

const renderByTag = new Map();
const payloadByTag = new Map();

const fpsWindow = makeRollingWindow(60);
const drawCallsWindow = makeRollingWindow(60);
const trianglesWindow = makeRollingWindow(60);

let totalDrawCalls = 0;
let totalTriangles = 0;
let webglHookInstalled = false;
let hudLoopStarted = false;

function getOrCreateTag(map, tag) {
  const key = String(tag || "render");
  let entry = map.get(key);
  if (!entry) {
    entry = { window: makeRollingWindow() };
    map.set(key, entry);
  }
  return { key, entry };
}

export function markRenderStart(tag) {
  const { entry } = getOrCreateTag(renderByTag, tag);
  entry.startedAt = nowMs();
}

export function markRenderEnd(tag) {
  const { entry } = getOrCreateTag(renderByTag, tag);
  if (!Number.isFinite(entry.startedAt)) return;
  const dur = nowMs() - entry.startedAt;
  entry.startedAt = null;
  pushSample(entry.window, dur);
  scheduleOverlayUpdate();
}

export function markPayloadSize(tag, bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n)) return;
  const { entry } = getOrCreateTag(payloadByTag, tag);
  pushSample(entry.window, n);
  scheduleOverlayUpdate();
}

let textEncoder = null;
try {
  if (globalThis.TextEncoder) textEncoder = new TextEncoder();
} catch {
  textEncoder = null;
}

export function measureUtf8Bytes(text) {
  const s = String(text ?? "");
  if (!textEncoder) return s.length;
  return textEncoder.encode(s).length;
}

let overlayRoot = null;
let overlayPre = null;
let overlayUpdateQueued = false;

function raf(fn) {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(fn);
  return setTimeout(() => fn(nowMs()), 16);
}

function ensureOverlay() {
  if (overlayRoot) return;
  if (!document?.body) return;

  overlayRoot = document.createElement("div");
  overlayRoot.id = "perfOverlay";
  overlayRoot.style.position = "fixed";
  overlayRoot.style.right = "10px";
  overlayRoot.style.bottom = "10px";
  overlayRoot.style.zIndex = "999999";
  overlayRoot.style.pointerEvents = "none";
  overlayRoot.style.background = "rgba(0,0,0,0.72)";
  overlayRoot.style.color = "rgba(255,255,255,0.92)";
  overlayRoot.style.border = "1px solid rgba(255,255,255,0.14)";
  overlayRoot.style.borderRadius = "10px";
  overlayRoot.style.padding = "10px 12px";
  overlayRoot.style.maxWidth = "70vw";
  overlayRoot.style.fontFamily =
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  overlayRoot.style.fontSize = "12px";
  overlayRoot.style.lineHeight = "1.25";
  overlayRoot.style.whiteSpace = "pre";

  overlayPre = document.createElement("pre");
  overlayPre.style.margin = "0";
  overlayPre.style.whiteSpace = "pre-wrap";
  overlayPre.style.wordBreak = "break-word";
  overlayRoot.appendChild(overlayPre);

  document.body.appendChild(overlayRoot);
}

function scheduleOverlayUpdate() {
  if (overlayUpdateQueued) return;
  overlayUpdateQueued = true;

  raf(() => {
    overlayUpdateQueued = false;
    renderOverlay();
  });
}

function fmtFps(fps) {
  if (!Number.isFinite(fps) || fps <= 0) return "—";
  const v = Math.max(0, fps);
  if (v < 10) return v.toFixed(1);
  return String(Math.round(v));
}

function fmtCount(n) {
  if (!Number.isFinite(n)) return "—";
  const v = Math.max(0, Math.floor(n));
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)}k`;
  return `${(v / 1_000_000).toFixed(v < 10_000_000 ? 1 : 0)}m`;
}

function estimateTriangles(gl, mode, count) {
  const m = Number(mode);
  const c = Number(count);
  if (!Number.isFinite(m) || !Number.isFinite(c) || c <= 0) return 0;
  if (m === gl.TRIANGLES) return Math.floor(c / 3);
  if (m === gl.TRIANGLE_STRIP || m === gl.TRIANGLE_FAN) return Math.max(0, Math.floor(c - 2));
  return 0;
}

function instrumentWebGLContext(gl) {
  if (!gl || typeof gl !== "object") return;
  if (gl.__perfInstrumented) return;
  try {
    Object.defineProperty(gl, "__perfInstrumented", { value: true, enumerable: false });
  } catch {
    // Ignore.
  }

  const wrap = (name, triFn) => {
    const orig = gl[name];
    if (typeof orig !== "function") return;
    gl[name] = function (...args) {
      totalDrawCalls += 1;
      try {
        totalTriangles += triFn(...args);
      } catch {
        // Ignore triangle estimation failures.
      }
      return orig.apply(this, args);
    };
  };

  wrap("drawArrays", (mode, first, count) => estimateTriangles(gl, mode, count));
  wrap("drawElements", (mode, count, type, offset) => estimateTriangles(gl, mode, count));
  wrap("drawRangeElements", (mode, start, end, count, type, offset) => estimateTriangles(gl, mode, count));

  // Instancing (WebGL2 + ANGLE extension).
  wrap(
    "drawArraysInstanced",
    (mode, first, count, instanceCount) => estimateTriangles(gl, mode, count) * Math.max(1, Number(instanceCount) || 1)
  );
  wrap(
    "drawElementsInstanced",
    (mode, count, type, offset, instanceCount) =>
      estimateTriangles(gl, mode, count) * Math.max(1, Number(instanceCount) || 1)
  );
  wrap(
    "drawArraysInstancedANGLE",
    (mode, first, count, instanceCount) => estimateTriangles(gl, mode, count) * Math.max(1, Number(instanceCount) || 1)
  );
  wrap(
    "drawElementsInstancedANGLE",
    (mode, count, type, offset, instanceCount) =>
      estimateTriangles(gl, mode, count) * Math.max(1, Number(instanceCount) || 1)
  );
}

function hookCanvasGetContext(proto) {
  if (!proto?.getContext || typeof proto.getContext !== "function") return;
  const orig = proto.getContext;
  proto.getContext = function (type, attrs) {
    const ctx = orig.call(this, type, attrs);
    const t = String(type || "").toLowerCase();
    if (ctx && (t === "webgl" || t === "webgl2" || t === "experimental-webgl" || t === "experimental-webgl2")) {
      instrumentWebGLContext(ctx);
    }
    return ctx;
  };
}

function ensureWebGLHook() {
  if (webglHookInstalled) return;
  webglHookInstalled = true;
  try {
    hookCanvasGetContext(globalThis.HTMLCanvasElement?.prototype);
  } catch {
    // Ignore.
  }
  try {
    hookCanvasGetContext(globalThis.OffscreenCanvas?.prototype);
  } catch {
    // Ignore.
  }
}

function startHudLoop() {
  if (hudLoopStarted) return;
  if (typeof raf !== "function") return;
  hudLoopStarted = true;

  let lastFrameAt = null;
  let lastOverlayAt = null;
  let lastDrawCalls = 0;
  let lastTriangles = 0;

  const tick = (t) => {
    if (lastFrameAt != null) {
      const dt = t - lastFrameAt;
      if (dt > 0 && dt < 1000) pushSample(fpsWindow, 1000 / dt);
    }
    lastFrameAt = t;

    const dc = totalDrawCalls - lastDrawCalls;
    const tri = totalTriangles - lastTriangles;
    lastDrawCalls = totalDrawCalls;
    lastTriangles = totalTriangles;
    pushSample(drawCallsWindow, dc);
    pushSample(trianglesWindow, tri);

    if (lastOverlayAt == null || t - lastOverlayAt >= 250) {
      lastOverlayAt = t;
      scheduleOverlayUpdate();
    }

    raf(tick);
  };

  raf(tick);
}

function renderOverlay() {
  ensureOverlay();
  if (!overlayPre) return;

  const lines = [];
  const title = String(location?.pathname || "").replace(/^\//, "") || "perf";
  lines.push(`${title} perf`);

  const fpsLast = fpsWindow.last;
  const fpsAvg = avg(fpsWindow);
  if (fpsWindow.count > 0) lines.push(`fps: ${fmtFps(fpsLast)} (avg ${fmtFps(fpsAvg)})`);

  if (drawCallsWindow.count > 0 || trianglesWindow.count > 0) {
    lines.push(
      `gl: ${fmtCount(drawCallsWindow.last)} calls, ${fmtCount(trianglesWindow.last)} tris (avg ${fmtCount(avg(drawCallsWindow))}/${fmtCount(avg(trianglesWindow))})`
    );
  }

  try {
    const s = getSettings();
    const quality = resolveQualityProfile(s, { role: getClientRole() });
    lines.push(formatQualityDebug(quality));
  } catch {
    // Ignore quality detection failures.
  }

  const renderRows = [...renderByTag.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [tag, entry] of renderRows) {
    lines.push(`render ${tag}: ${fmtMs(entry.window.last)} (avg ${fmtMs(avg(entry.window))})`);
  }

  const payloadRows = [...payloadByTag.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [tag, entry] of payloadRows) {
    lines.push(`payload ${tag}: ${fmtBytes(entry.window.last)} (avg ${fmtBytes(avg(entry.window))})`);
  }

  overlayPre.textContent = lines.join("\n");
}

const browserRuntime = !!globalThis.document?.createElement;
if (browserRuntime) {
  ensureWebGLHook();
  startHudLoop();
  try {
    onSettingsChange(() => scheduleOverlayUpdate());
  } catch {
    // Ignore settings wiring failures.
  }
  scheduleOverlayUpdate();
}
