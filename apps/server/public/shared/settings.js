const STORAGE_KEY = "catan.settings.v1";

function clamp01(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(1, v));
}

function prefersReducedMotion() {
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  } catch {
    return false;
  }
}

function prefersHighContrast() {
  try {
    if (!!window.matchMedia?.("(prefers-contrast: more)")?.matches) return true;
    if (!!window.matchMedia?.("(forced-colors: active)")?.matches) return true;
  } catch {
    return false;
  }
  return false;
}

function normalizeBoardRenderer(value, fallback) {
  const v = String(value || "").toLowerCase();
  if (["auto", "2d", "3d"].includes(v)) return v;
  return fallback;
}

function normalizeRendererQuality(value, fallback) {
  const v = String(value || "").toLowerCase();
  if (["auto", "low", "medium", "high"].includes(v)) return v;
  return fallback;
}

function defaultSettings() {
  return {
    sfxVolume: 0.9,
    musicVolume: 0.6,
    muteAll: false,
    reducedMotion: prefersReducedMotion(),
    highContrast: prefersHighContrast(),
    showQr: true,
    colorblind: false,
    boardRenderer: "auto",
    rendererQuality: "auto",
    lowPowerMode: false,
    cinematicCamera: true,
    postFx: true
  };
}

function normalizeSettings(input) {
  const d = defaultSettings();
  const obj = input && typeof input === "object" ? input : {};
  return {
    sfxVolume: clamp01(obj.sfxVolume, d.sfxVolume),
    musicVolume: clamp01(obj.musicVolume, d.musicVolume),
    muteAll: "muteAll" in obj ? !!obj.muteAll : d.muteAll,
    reducedMotion: "reducedMotion" in obj ? !!obj.reducedMotion : d.reducedMotion,
    highContrast: "highContrast" in obj ? !!obj.highContrast : d.highContrast,
    showQr: "showQr" in obj ? !!obj.showQr : d.showQr,
    colorblind: "colorblind" in obj ? !!obj.colorblind : d.colorblind,
    boardRenderer: normalizeBoardRenderer(obj.boardRenderer, d.boardRenderer),
    rendererQuality: normalizeRendererQuality(obj.rendererQuality, d.rendererQuality),
    lowPowerMode: "lowPowerMode" in obj ? !!obj.lowPowerMode : d.lowPowerMode,
    cinematicCamera: "cinematicCamera" in obj ? !!obj.cinematicCamera : d.cinematicCamera,
    postFx: "postFx" in obj ? !!obj.postFx : d.postFx
  };
}

function readStoredSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStoredSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore: localStorage may be unavailable.
  }
}

let currentSettings = null;
let initialized = false;
const listeners = new Set();

export function applySettingsToDocument(settings) {
  const root = document?.documentElement;
  if (!root) return;
  root.dataset.reducedMotion = settings?.reducedMotion ? "true" : "false";
  root.dataset.muteAll = settings?.muteAll ? "true" : "false";
  root.dataset.highContrast = settings?.highContrast ? "true" : "false";
  root.dataset.showQr = settings?.showQr === false ? "false" : "true";
  root.dataset.colorblind = settings?.colorblind ? "true" : "false";
  root.dataset.boardRenderer = String(settings?.boardRenderer || "auto");
  root.dataset.rendererQuality = String(settings?.rendererQuality || "auto");
  root.dataset.lowPowerMode = settings?.lowPowerMode ? "true" : "false";
  root.dataset.cinematicCamera = settings?.cinematicCamera ? "true" : "false";
  root.dataset.postFx = settings?.postFx ? "true" : "false";
}

export function initSettings() {
  if (initialized) return currentSettings;
  const stored = readStoredSettings();
  currentSettings = stored || defaultSettings();
  initialized = true;
  applySettingsToDocument(currentSettings);
  return currentSettings;
}

export function getSettings() {
  if (!initialized) initSettings();
  return currentSettings;
}

export function setSettings(patch, { persist = true } = {}) {
  const next = normalizeSettings({ ...getSettings(), ...(patch || {}) });
  currentSettings = next;
  applySettingsToDocument(currentSettings);
  if (persist) writeStoredSettings(currentSettings);

  for (const fn of listeners) {
    try {
      fn(currentSettings);
    } catch {
      // Ignore listener errors.
    }
  }

  return currentSettings;
}

export function onSettingsChange(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}
