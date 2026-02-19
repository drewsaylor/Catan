const QUALITY_ORDER = ["low", "medium", "high"];

export const QUALITY_PROFILES = Object.freeze({
  low: Object.freeze({
    key: "low",
    water: "static",
    shadows: "off",
    postFx: "off",
    maxPixelRatio: 1.25
  }),
  medium: Object.freeze({
    key: "medium",
    water: "simple",
    shadows: "off",
    postFx: "off",
    maxPixelRatio: 1.5
  }),
  high: Object.freeze({
    key: "high",
    water: "full",
    shadows: "light",
    postFx: "on",
    maxPixelRatio: 2
  })
});

function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function safeMatchMedia(query) {
  try {
    return !!window.matchMedia?.(query)?.matches;
  } catch {
    return false;
  }
}

export function getClientRole() {
  const path = String(globalThis.location?.pathname || "");
  if (path.startsWith("/tv")) return "tv";
  if (path.startsWith("/phone")) return "phone";
  return "unknown";
}

let cachedWebglSupport = null;

export function detectWebGLSupport() {
  if (cachedWebglSupport && cachedWebglSupport.reason !== "no-document") return cachedWebglSupport;

  const out = {
    supported: false,
    webgl2: false,
    webgl1: false,
    reason: "unknown"
  };

  if (!globalThis.document?.createElement) {
    out.reason = "no-document";
    cachedWebglSupport = out;
    return cachedWebglSupport;
  }

  const canvas = document.createElement("canvas");
  const opts = { alpha: false, antialias: false, depth: true, stencil: false, powerPreference: "high-performance" };

  try {
    const gl2 = canvas.getContext?.("webgl2", opts);
    if (gl2) {
      out.supported = true;
      out.webgl2 = true;
      out.reason = "webgl2";
      cachedWebglSupport = out;
      return cachedWebglSupport;
    }
  } catch {
    // Ignore and fall back.
  }

  try {
    const gl1 = canvas.getContext?.("webgl", opts) || canvas.getContext?.("experimental-webgl", opts);
    if (gl1) {
      out.supported = true;
      out.webgl1 = true;
      out.reason = "webgl1";
      cachedWebglSupport = out;
      return cachedWebglSupport;
    }
  } catch {
    // Ignore and fall back.
  }

  out.reason = "unsupported";
  cachedWebglSupport = out;
  return cachedWebglSupport;
}

export function getDeviceHeuristics() {
  const w = Number(globalThis.innerWidth || globalThis.screen?.width || 0);
  const h = Number(globalThis.innerHeight || globalThis.screen?.height || 0);
  const width = Math.max(0, Math.floor(w));
  const height = Math.max(0, Math.floor(h));
  const dpr = clamp(globalThis.devicePixelRatio || 1, 1, 4);
  const devicePixels = Math.max(0, Math.floor(width * height * dpr * dpr));

  const memory = Number(globalThis.navigator?.deviceMemory);
  const deviceMemoryGB = Number.isFinite(memory) ? clamp(memory, 0.5, 64) : null;

  const cores = Number(globalThis.navigator?.hardwareConcurrency);
  const hardwareConcurrency = Number.isFinite(cores) ? clamp(cores, 1, 64) : null;

  const saveData = !!globalThis.navigator?.connection?.saveData;
  const effectiveType = String(globalThis.navigator?.connection?.effectiveType || "");

  return {
    width,
    height,
    dpr,
    devicePixels,
    deviceMemoryGB,
    hardwareConcurrency,
    saveData,
    effectiveType,
    prefersReducedMotion: safeMatchMedia("(prefers-reduced-motion: reduce)"),
    maxTouchPoints: Number(globalThis.navigator?.maxTouchPoints) || 0
  };
}

export function prefersLowPowerHint(device = getDeviceHeuristics()) {
  const d = device && typeof device === "object" ? device : getDeviceHeuristics();
  if (d.saveData) return true;
  // A11y != power saver, but it correlates with “keep it calmer” expectations.
  if (d.prefersReducedMotion) return true;
  return false;
}

function normalizeRequestedQuality(value) {
  const v = String(value || "").toLowerCase();
  if (QUALITY_ORDER.includes(v)) return v;
  return "auto";
}

function nextLower(profile) {
  const idx = QUALITY_ORDER.indexOf(profile);
  if (idx <= 0) return QUALITY_ORDER[0];
  return QUALITY_ORDER[idx - 1];
}

function nextHigher(profile) {
  const idx = QUALITY_ORDER.indexOf(profile);
  if (idx < 0) return QUALITY_ORDER[QUALITY_ORDER.length - 1];
  if (idx >= QUALITY_ORDER.length - 1) return QUALITY_ORDER[QUALITY_ORDER.length - 1];
  return QUALITY_ORDER[idx + 1];
}

export function resolveQualityProfile(
  { rendererQuality = "auto", lowPowerMode = false } = {},
  { role = getClientRole(), device = null, webgl = null } = {}
) {
  const requested = normalizeRequestedQuality(rendererQuality);
  const d = device && typeof device === "object" ? device : getDeviceHeuristics();
  const w = webgl && typeof webgl === "object" ? webgl : detectWebGLSupport();
  const reasons = [];

  if (!w.supported) {
    reasons.push("webgl:unsupported");
    return {
      supported: false,
      profile: "off",
      profileConfig: null,
      maxPixelRatio: 0,
      reasons,
      device: d,
      webgl: w,
      requestedQuality: requested
    };
  }

  let profile = "medium";

  if (lowPowerMode) {
    profile = "low";
    reasons.push("lowPowerMode:on");
  } else if (requested !== "auto") {
    profile = requested;
    reasons.push(`forced:${requested}`);
  } else {
    reasons.push("auto");

    if (role === "tv") {
      profile = "high";
      reasons.push("role:tv");
    } else if (prefersLowPowerHint(d)) {
      profile = "low";
      reasons.push("hint:lowPower");
    } else if (d.deviceMemoryGB != null && d.deviceMemoryGB <= 2) {
      profile = "low";
      reasons.push("deviceMemory<=2");
    } else {
      const pixels = Number(d.devicePixels) || 0;
      const cores = Number(d.hardwareConcurrency) || 0;
      const mem = Number(d.deviceMemoryGB) || 0;

      if (pixels >= 5_000_000 && mem > 0 && mem <= 4) {
        profile = "low";
        reasons.push("devicePixels>=5M");
      } else if ((mem >= 6 && cores >= 8 && pixels <= 5_000_000) || (cores >= 8 && pixels <= 3_500_000)) {
        profile = "high";
        reasons.push("strongDevice");
      } else {
        profile = "medium";
        reasons.push("default:medium");
      }
    }
  }

  const cfg = QUALITY_PROFILES[profile] || QUALITY_PROFILES.medium;
  const dpr = clamp(d.dpr || 1, 1, 4);
  const maxPixelRatio = clamp(cfg.maxPixelRatio ?? 1, 0.5, 4);

  return {
    supported: true,
    profile: cfg.key,
    profileConfig: cfg,
    maxPixelRatio,
    pixelRatio: Math.min(dpr, maxPixelRatio),
    reasons,
    device: d,
    webgl: w,
    requestedQuality: requested
  };
}

function makeRollingWindow(maxSamples) {
  const size = Number.isFinite(maxSamples) ? Math.max(5, Math.floor(maxSamples)) : 60;
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

export function createAutoQualityScaler({
  initialProfile = "medium",
  minProfile = "low",
  maxProfile = "high",
  onChange = null,
  lowFpsThreshold = 45,
  highFpsThreshold = 57,
  downshiftAfterMs = 1400,
  upshiftAfterMs = 4500,
  windowSamples = 60
} = {}) {
  let currentProfile = QUALITY_ORDER.includes(initialProfile) ? initialProfile : "medium";
  let lastFrameAt = null;
  let belowSince = null;
  let aboveSince = null;

  const fpsWindow = makeRollingWindow(windowSamples);

  function clampProfile(p) {
    const minIdx = Math.max(0, QUALITY_ORDER.indexOf(minProfile));
    const maxIdx = Math.max(minIdx, QUALITY_ORDER.indexOf(maxProfile));
    const idx = QUALITY_ORDER.indexOf(p);
    if (idx < 0) return QUALITY_ORDER[minIdx];
    return QUALITY_ORDER[Math.max(minIdx, Math.min(maxIdx, idx))];
  }

  currentProfile = clampProfile(currentProfile);

  function setProfile(next, { reason = "" } = {}) {
    const clamped = clampProfile(next);
    if (clamped === currentProfile) return;
    currentProfile = clamped;
    belowSince = null;
    aboveSince = null;
    if (typeof onChange === "function") {
      try {
        onChange(currentProfile, { reason });
      } catch {
        // Ignore callback errors.
      }
    }
  }

  function onFrame(now) {
    const t = Number.isFinite(now) ? now : globalThis.performance?.now?.() || Date.now();
    if (lastFrameAt != null) {
      const dt = t - lastFrameAt;
      if (dt > 0 && dt < 1000) {
        pushSample(fpsWindow, 1000 / dt);
      }
    }
    lastFrameAt = t;

    const fps = avg(fpsWindow);
    const low = Number(lowFpsThreshold) || 45;
    const high = Number(highFpsThreshold) || 57;

    if (fps > 0 && fps < low) {
      aboveSince = null;
      if (belowSince == null) belowSince = t;
      if (t - belowSince >= downshiftAfterMs) {
        setProfile(nextLower(currentProfile), { reason: `fps<${low}` });
      }
      return { fps, profile: currentProfile };
    }

    if (fps >= high) {
      belowSince = null;
      if (aboveSince == null) aboveSince = t;
      if (t - aboveSince >= upshiftAfterMs) {
        setProfile(nextHigher(currentProfile), { reason: `fps>=${high}` });
      }
      return { fps, profile: currentProfile };
    }

    belowSince = null;
    aboveSince = null;
    return { fps, profile: currentProfile };
  }

  return {
    onFrame,
    getProfile: () => currentProfile,
    getFps: () => avg(fpsWindow),
    setProfile
  };
}

export function formatQualityDebug(selection) {
  const s = selection && typeof selection === "object" ? selection : null;
  if (!s) return "quality: unknown";
  const profile = String(s.profile || "unknown");
  const requested = String(s.requestedQuality || "auto");
  const pr = Number.isFinite(s.pixelRatio) ? s.pixelRatio.toFixed(2) : "—";
  const mem = s.device?.deviceMemoryGB != null ? `${s.device.deviceMemoryGB}GB` : "—";
  const cores = s.device?.hardwareConcurrency != null ? String(s.device.hardwareConcurrency) : "—";
  const px = Number.isFinite(s.device?.devicePixels) ? String(s.device.devicePixels) : "—";
  const reasons = Array.isArray(s.reasons) && s.reasons.length ? s.reasons.join(",") : "";
  return `quality: ${profile} (req ${requested}, pr ${pr}, mem ${mem}, cores ${cores}, px ${px}${reasons ? `; ${reasons}` : ""})`;
}
