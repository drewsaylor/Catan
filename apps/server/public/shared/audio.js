import { getSettings, onSettingsChange } from "/shared/settings.js";

let ctx = null;
let unlocked = false;

let buses = null;
let unlistenSettings = null;

let noiseBuffer = null;
const decodedByUrl = new Map();
const decodePromiseByUrl = new Map();

const lastPlayByKey = new Map();
let voiceIdSeq = 1;
let voices = [];

let ambientEnabled = false;
let ambientVoice = null;

// Music configuration - easy to extend by adding more tracks to the game array
const MUSIC_TRACKS = {
  lobby: "/shared/assets/music/scape-main.mp3",
  game: [
    "/shared/assets/music/harmony.mp3",
    "/shared/assets/music/sea-shanty.mp3"
    // Add more game tracks here - they'll automatically be included in the cycle
  ]
};

// Music state
let currentMusicMode = null; // "lobby" | "game" | null
let gameTrackIndex = 0;
let musicSource = null;
let musicGain = null;
let nextMusicSource = null;
let nextMusicGain = null;
let musicEnabled = false;

const MUSIC_FADE_SEC = 2.0;
const MUSIC_CROSSFADE_SEC = 3.0;

const CONCURRENCY = {
  total: 8,
  ui: 4,
  moment: 2
};

const DEFAULT_DUCK = { amount: 0.28, attackSec: 0.02, holdSec: 0.18, releaseSec: 0.65 };

function getAudioContext() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

function clampNonNegative(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, v);
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function nowMs() {
  return Date.now();
}

function ensureGraph() {
  const c = getAudioContext();
  if (!c) return null;
  if (buses) return buses;

  const master = c.createGain();
  master.gain.value = 1;
  master.connect(c.destination);

  const sfx = c.createGain();
  sfx.gain.value = 1;
  sfx.connect(master);

  const music = c.createGain();
  music.gain.value = 1;
  music.connect(master);

  const duck = c.createGain();
  duck.gain.value = 1;
  duck.connect(music);

  buses = { master, sfx, music, duck };
  applySettingsToGraph();

  if (!unlistenSettings) unlistenSettings = onSettingsChange(() => applySettingsToGraph());
  return buses;
}

function applySettingsToGraph() {
  const c = ctx;
  if (!c || !buses) return;
  const s = getSettings();
  const t = c.currentTime;

  const mute = !!s?.muteAll;
  const sfxVol = mute ? 0 : clamp01(s?.sfxVolume ?? 0);
  const musicVol = mute ? 0 : clamp01(s?.musicVolume ?? 0);

  try {
    buses.sfx.gain.setTargetAtTime(sfxVol, t, 0.015);
    buses.music.gain.setTargetAtTime(musicVol, t, 0.02);
  } catch {
    // Ignore WebAudio failures.
  }

  if (musicVol <= 0.001 || mute) {
    if (ambientVoice) stopAmbient();
    stopMusic();
  } else if (ambientEnabled) {
    maybeStartAmbient();
  } else if (musicEnabled && currentMusicMode) {
    maybeStartMusic();
  }
}

export function isAudioUnlocked() {
  return unlocked;
}

export async function unlockAudio() {
  const c = getAudioContext();
  if (!c) return false;
  try {
    if (c.state !== "running") await c.resume();
    if (c.state === "running") {
      ensureGraph();

      // Prewarm: a tiny, silent buffer to avoid first-sound delay.
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(c.destination);
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, c.sampleRate);
      src.connect(g);
      src.start();
      src.stop(c.currentTime + 0.01);

      unlocked = true;
      if (ambientEnabled) maybeStartAmbient();
      else if (musicEnabled && currentMusicMode) {
        preloadMusic();
        maybeStartMusic();
      }
      return true;
    }
  } catch {
    // Ignore: audio may be blocked by the browser.
  }
  return false;
}

export function installAudioUnlock(target = document) {
  if (!target?.addEventListener) return () => {};
  let removed = false;

  const onFirst = () => {
    if (removed) return;
    removed = true;
    remove();
    unlockAudio();
  };

  const opts = { passive: true, capture: true };
  const events = ["pointerdown", "touchstart", "mousedown", "keydown"];
  for (const evt of events) target.addEventListener(evt, onFirst, opts);

  function remove() {
    for (const evt of events) target.removeEventListener(evt, onFirst, opts);
  }

  return remove;
}

function normalizeKey(key) {
  const k = String(key || "").trim();
  if (!k) return "";
  if (k === "victory") return "win";
  if (k === "turn_start") return "turn";
  if (k === "dice_roll") return "dice";
  return k;
}

function gcVoices() {
  const c = ctx;
  if (!c) {
    voices = [];
    return;
  }
  const t = c.currentTime;
  voices = voices.filter((v) => t < (v.endsAt ?? 0) + 0.05);
}

function stopVoice(v, { fadeSec = 0.03 } = {}) {
  const c = ctx;
  if (!c || !v) return;
  try {
    const t = c.currentTime;
    if (v.mixGain) {
      const g = v.mixGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.setTargetAtTime(0.0001, t, Math.max(0.001, fadeSec));
    }
    for (const src of v.sources || []) {
      if (typeof src.stop === "function") {
        try {
          src.stop(t + Math.max(0.01, fadeSec));
        } catch {
          // Ignore.
        }
      }
    }
    v.endsAt = t;
  } catch {
    // Ignore.
  }
}

function ensureCapacity(category) {
  gcVoices();

  const totalLimit = CONCURRENCY.total;
  const catLimit = CONCURRENCY[category] ?? totalLimit;
  if (voices.length >= totalLimit) {
    if (category !== "moment") return false;
    const oldest = voices.reduce((best, v) => (!best || v.startedAt < best.startedAt ? v : best), null);
    if (oldest) stopVoice(oldest, { fadeSec: 0.04 });
    gcVoices();
  }

  const catVoices = voices.filter((v) => v.category === category);
  if (catVoices.length >= catLimit) {
    if (category !== "moment") return false;
    const oldest = catVoices.reduce((best, v) => (!best || v.startedAt < best.startedAt ? v : best), null);
    if (oldest) stopVoice(oldest, { fadeSec: 0.04 });
    gcVoices();
  }

  return true;
}

function duckAmbient({ amount, attackSec, holdSec, releaseSec } = {}) {
  const c = ctx;
  if (!c) return;
  ensureGraph();
  if (!buses) return;

  const spec = {
    amount: clamp01(amount ?? DEFAULT_DUCK.amount),
    attackSec: clampNonNegative(attackSec ?? DEFAULT_DUCK.attackSec),
    holdSec: clampNonNegative(holdSec ?? DEFAULT_DUCK.holdSec),
    releaseSec: clampNonNegative(releaseSec ?? DEFAULT_DUCK.releaseSec)
  };
  const min = Math.max(0.05, Math.min(1, spec.amount));

  try {
    const t0 = c.currentTime;
    const t1 = t0 + Math.max(0.001, spec.attackSec);
    const t2 = t1 + spec.holdSec;
    const g = buses.duck.gain;

    g.cancelScheduledValues(t0);
    g.setValueAtTime(Math.max(0.0001, g.value), t0);
    g.linearRampToValueAtTime(min, t1);
    g.setTargetAtTime(1, t2, Math.max(0.01, spec.releaseSec));
  } catch {
    // Ignore.
  }
}

function ensureNoiseBuffer() {
  const c = ctx;
  if (!c) return null;
  if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer;
  try {
    const seconds = 1;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffer = buf;
    return noiseBuffer;
  } catch {
    return null;
  }
}

function createStereoPanner(c, pan) {
  const v = Number(pan);
  if (!Number.isFinite(v) || Math.abs(v) < 0.001) return null;
  try {
    if (typeof c.createStereoPanner !== "function") return null;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, v));
    return p;
  } catch {
    return null;
  }
}

function playTone(
  c,
  { type = "sine", freq = 440, freqTo = null, startAt = 0, dur = 0.12, gain = 0.25, pan = 0 } = {},
  mix
) {
  const t0 = c.currentTime + clampNonNegative(startAt);
  const t2 = t0 + Math.max(0.02, clampNonNegative(dur));
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(clampNonNegative(freq), t0);
  if (Number.isFinite(freqTo)) osc.frequency.linearRampToValueAtTime(clampNonNegative(freqTo), t2);

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, clampNonNegative(gain)), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.06);

  osc.connect(g);

  const p = createStereoPanner(c, pan);
  if (p) {
    g.connect(p);
    p.connect(mix);
  } else {
    g.connect(mix);
  }

  osc.start(t0);
  osc.stop(t2 + 0.08);

  return { src: osc, endsAt: t2 + 0.08 };
}

function playNoiseBurst(
  c,
  { startAt = 0, dur = 0.1, gain = 0.18, filter = "bandpass", freq = 1200, q = 1.2, pan = 0 } = {},
  mix
) {
  const buf = ensureNoiseBuffer();
  if (!buf) return null;

  const t0 = c.currentTime + clampNonNegative(startAt);
  const t2 = t0 + Math.max(0.02, clampNonNegative(dur));
  const src = c.createBufferSource();
  src.buffer = buf;

  const biquad = c.createBiquadFilter();
  biquad.type = filter;
  biquad.frequency.setValueAtTime(clampNonNegative(freq), t0);
  biquad.Q.setValueAtTime(clampNonNegative(q), t0);

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, clampNonNegative(gain)), t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.06);

  src.connect(biquad);
  biquad.connect(g);

  const p = createStereoPanner(c, pan);
  if (p) {
    g.connect(p);
    p.connect(mix);
  } else {
    g.connect(mix);
  }

  src.start(t0);
  src.stop(t2 + 0.08);

  return { src, endsAt: t2 + 0.08 };
}

function playSynth(key, { volume = 1 } = {}) {
  const c = ctx;
  if (!c) return null;
  ensureGraph();
  if (!buses) return null;

  const mix = c.createGain();
  mix.gain.value = clamp01(volume);
  mix.connect(buses.sfx);

  const sources = [];
  let endsAt = c.currentTime;

  const add = (o) => {
    if (!o) return;
    sources.push(o.src);
    endsAt = Math.max(endsAt, o.endsAt ?? endsAt);
  };

  if (key === "ui_tick") {
    add(playTone(c, { type: "square", freq: 1180, freqTo: 820, dur: 0.04, gain: 0.2 }, mix));
  } else if (key === "ui_confirm") {
    add(playTone(c, { type: "triangle", freq: 660, freqTo: 880, dur: 0.12, gain: 0.22 }, mix));
    add(playTone(c, { type: "triangle", freq: 990, dur: 0.07, startAt: 0.03, gain: 0.08, pan: 0.15 }, mix));
  } else if (key === "ui_bonk") {
    add(playTone(c, { type: "sine", freq: 240, freqTo: 150, dur: 0.16, gain: 0.26 }, mix));
    add(playNoiseBurst(c, { dur: 0.05, gain: 0.05, filter: "lowpass", freq: 520, q: 0.7 }, mix));
  } else if (key === "dice") {
    add(playNoiseBurst(c, { dur: 0.08, gain: 0.12, filter: "bandpass", freq: 1400, q: 1.4, pan: -0.2 }, mix));
    add(
      playNoiseBurst(c, { startAt: 0.06, dur: 0.09, gain: 0.11, filter: "bandpass", freq: 1100, q: 1.2, pan: 0.2 }, mix)
    );
    add(playTone(c, { type: "triangle", freq: 520, freqTo: 420, startAt: 0.02, dur: 0.16, gain: 0.12 }, mix));
  } else if (key === "build") {
    add(playTone(c, { type: "square", freq: 660, freqTo: 560, dur: 0.12, gain: 0.18 }, mix));
    add(playNoiseBurst(c, { dur: 0.06, gain: 0.07, filter: "lowpass", freq: 900, q: 0.8 }, mix));
  } else if (key === "trade") {
    add(playTone(c, { type: "sine", freq: 590, dur: 0.14, gain: 0.16, pan: -0.08 }, mix));
    add(playTone(c, { type: "sine", freq: 740, dur: 0.14, startAt: 0.055, gain: 0.16, pan: 0.08 }, mix));
    add(playTone(c, { type: "triangle", freq: 990, dur: 0.08, startAt: 0.11, gain: 0.07 }, mix));
  } else if (key === "turn") {
    add(playTone(c, { type: "triangle", freq: 440, dur: 0.12, gain: 0.14, pan: -0.1 }, mix));
    add(playTone(c, { type: "triangle", freq: 660, dur: 0.12, startAt: 0.08, gain: 0.14, pan: 0.05 }, mix));
    add(playTone(c, { type: "triangle", freq: 880, dur: 0.14, startAt: 0.16, gain: 0.12, pan: 0.1 }, mix));
  } else if (key === "robber") {
    add(playTone(c, { type: "sine", freq: 220, freqTo: 120, dur: 0.45, gain: 0.18 }, mix));
    add(playNoiseBurst(c, { dur: 0.22, gain: 0.06, filter: "lowpass", freq: 520, q: 0.9 }, mix));
    add(playNoiseBurst(c, { startAt: 0.18, dur: 0.26, gain: 0.05, filter: "bandpass", freq: 520, q: 1.1 }, mix));
  } else if (key === "win") {
    add(playTone(c, { type: "triangle", freq: 523.25, dur: 0.22, gain: 0.12, pan: -0.12 }, mix));
    add(playTone(c, { type: "triangle", freq: 659.25, dur: 0.22, startAt: 0.02, gain: 0.12, pan: 0.0 }, mix));
    add(playTone(c, { type: "triangle", freq: 783.99, dur: 0.22, startAt: 0.04, gain: 0.12, pan: 0.12 }, mix));
    add(playTone(c, { type: "triangle", freq: 1046.5, dur: 0.34, startAt: 0.22, gain: 0.1 }, mix));
    add(playNoiseBurst(c, { startAt: 0.22, dur: 0.14, gain: 0.06, filter: "highpass", freq: 1800, q: 0.8 }, mix));
  } else {
    return null;
  }

  return { mixGain: mix, sources, endsAt };
}

async function decodeUrlToBuffer(url) {
  if (!url) return null;
  const c = ctx;
  if (!c) return null;
  if (decodedByUrl.has(url)) return decodedByUrl.get(url) || null;
  if (decodePromiseByUrl.has(url)) return decodePromiseByUrl.get(url);

  const p = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.arrayBuffer();
      const buf = await c.decodeAudioData(arr);
      decodedByUrl.set(url, buf);
      return buf;
    } catch {
      decodedByUrl.set(url, null);
      return null;
    } finally {
      decodePromiseByUrl.delete(url);
    }
  })();

  decodePromiseByUrl.set(url, p);
  return p;
}

function playAsset(url, { volume = 1 } = {}) {
  const c = ctx;
  if (!c) return null;
  const buf = decodedByUrl.get(url) || null;
  if (!buf) return null;

  ensureGraph();
  if (!buses) return null;

  const mix = c.createGain();
  mix.gain.value = clamp01(volume);
  mix.connect(buses.sfx);

  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(mix);
  const t0 = c.currentTime;
  src.start(t0);
  const endsAt = t0 + (buf.duration || 0);
  try {
    src.stop(endsAt + 0.01);
  } catch {
    // Ignore.
  }
  return { mixGain: mix, sources: [src], endsAt };
}

const SOUND_LIBRARY = {
  ui_tick: { category: "ui", cooldownMs: 60, baseGain: 0.85, url: null },
  ui_confirm: { category: "ui", cooldownMs: 120, baseGain: 0.95, url: null },
  ui_bonk: { category: "ui", cooldownMs: 220, baseGain: 0.95, url: null },
  turn: { category: "moment", cooldownMs: 650, baseGain: 1, duck: true, url: null },
  dice: { category: "moment", cooldownMs: 450, baseGain: 1, duck: true, url: null },
  robber: { category: "moment", cooldownMs: 1200, baseGain: 1, duck: true, url: null },
  build: { category: "moment", cooldownMs: 260, baseGain: 0.95, duck: true, url: null },
  trade: { category: "moment", cooldownMs: 900, baseGain: 0.95, duck: true, url: null },
  win: { category: "moment", cooldownMs: 6000, baseGain: 1, duck: true, url: null }
};

export function preloadSounds(keys = []) {
  const c = getAudioContext();
  if (!c || c.state !== "running") return;
  const list = Array.isArray(keys) ? keys : [];
  for (const raw of list) {
    const key = normalizeKey(raw);
    const def = SOUND_LIBRARY[key] || null;
    const url = def?.url || null;
    if (!url) continue;
    decodeUrlToBuffer(url);
  }
}

export function playSfx(key, { gain = 1 } = {}) {
  const k = normalizeKey(key);
  const def = SOUND_LIBRARY[k] || null;
  if (!def) return false;

  const s = getSettings();
  if (s.muteAll) return false;

  const sfxVol = clamp01(s.sfxVolume);
  if (sfxVol <= 0.001) return false;

  const volume = clampNonNegative(def.baseGain) * clampNonNegative(gain);
  if (volume <= 0.001) return false;

  const c = getAudioContext();
  if (!c || c.state !== "running") return false;
  ctx = c;
  ensureGraph();

  const now = nowMs();
  const last = lastPlayByKey.get(k) ?? 0;
  if (now - last < clampNonNegative(def.cooldownMs)) return false;

  if (!ensureCapacity(def.category)) return false;
  lastPlayByKey.set(k, now);

  if (def.category === "moment" && def.duck) duckAmbient(DEFAULT_DUCK);

  if (def.url) decodeUrlToBuffer(def.url);
  const voice = def.url ? playAsset(def.url, { volume }) : null;
  const fallback = voice || playSynth(k, { volume });
  if (!fallback) return false;

  const v = {
    id: voiceIdSeq++,
    key: k,
    category: def.category,
    startedAt: c.currentTime,
    endsAt: fallback.endsAt ?? c.currentTime,
    mixGain: fallback.mixGain,
    sources: fallback.sources
  };
  voices.push(v);
  return true;
}

function maybeStartAmbient() {
  const c = getAudioContext();
  if (!c || c.state !== "running") return false;
  ctx = c;
  ensureGraph();
  if (!buses) return false;
  if (ambientVoice) return true;

  const s = getSettings();
  if (s.muteAll) return false;
  if (clamp01(s.musicVolume) <= 0.001) return false;

  try {
    const t0 = c.currentTime;
    const mix = c.createGain();
    mix.gain.setValueAtTime(0.0001, t0);
    mix.gain.setTargetAtTime(0.18, t0, 0.9);

    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(520, t0);
    lp.Q.setValueAtTime(0.7, t0);

    const oscA = c.createOscillator();
    oscA.type = "triangle";
    oscA.frequency.value = 110;
    oscA.detune.value = -6;

    const oscB = c.createOscillator();
    oscB.type = "sine";
    oscB.frequency.value = 138.59;
    oscB.detune.value = 4;

    const oscC = c.createOscillator();
    oscC.type = "triangle";
    oscC.frequency.value = 164.81;
    oscC.detune.value = 2;

    const gA = c.createGain();
    const gB = c.createGain();
    const gC = c.createGain();
    gA.gain.value = 0.25;
    gB.gain.value = 0.19;
    gC.gain.value = 0.22;

    oscA.connect(gA);
    oscB.connect(gB);
    oscC.connect(gC);
    gA.connect(lp);
    gB.connect(lp);
    gC.connect(lp);
    lp.connect(mix);
    mix.connect(buses.duck);

    const n = ensureNoiseBuffer();
    const noise = n ? c.createBufferSource() : null;
    const noiseHp = noise ? c.createBiquadFilter() : null;
    const noiseG = noise ? c.createGain() : null;
    if (noise && noiseHp && noiseG) {
      noise.buffer = n;
      noise.loop = true;
      noiseHp.type = "highpass";
      noiseHp.frequency.value = 420;
      noiseHp.Q.value = 0.9;
      noiseG.gain.value = 0.015;
      noise.connect(noiseHp);
      noiseHp.connect(noiseG);
      noiseG.connect(mix);
    }

    oscA.start(t0);
    oscB.start(t0);
    oscC.start(t0);
    if (noise) noise.start(t0);

    ambientVoice = {
      mixGain: mix,
      sources: [oscA, oscB, oscC, ...(noise ? [noise] : [])],
      stop: () => {
        const t = c.currentTime;
        try {
          mix.gain.cancelScheduledValues(t);
          mix.gain.setValueAtTime(Math.max(0.0001, mix.gain.value), t);
          mix.gain.setTargetAtTime(0.0001, t, 0.35);
        } catch {
          // Ignore.
        }
        for (const src of [oscA, oscB, oscC, ...(noise ? [noise] : [])]) {
          try {
            src.stop(t + 0.7);
          } catch {
            // Ignore.
          }
        }
        ambientVoice = null;
      }
    };
    return true;
  } catch {
    ambientVoice = null;
    return false;
  }
}

export function setAmbientEnabled(enabled) {
  ambientEnabled = !!enabled;
  if (!ambientEnabled) stopAmbient();
  else maybeStartAmbient();
  return ambientEnabled;
}

export function stopAmbient() {
  if (!ambientVoice) return;
  try {
    ambientVoice.stop?.();
  } catch {
    // Ignore.
  }
  ambientVoice = null;
}

// =============================================================================
// Music System - File-based music with crossfades
// =============================================================================

export async function preloadMusic() {
  const c = getAudioContext();
  if (!c || c.state !== "running") return;
  const urls = [MUSIC_TRACKS.lobby, ...MUSIC_TRACKS.game];
  await Promise.all(urls.map((url) => decodeUrlToBuffer(url)));
}

function stopMusicSource(source, gain, { fadeSec = 0.5 } = {}) {
  const c = ctx;
  if (!c || !source || !gain) return;
  try {
    const t = c.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.value), t);
    gain.gain.setTargetAtTime(0.0001, t, Math.max(0.01, fadeSec / 3));
    source.stop(t + fadeSec + 0.1);
  } catch {
    // Ignore.
  }
}

function stopMusic() {
  if (musicSource && musicGain) {
    stopMusicSource(musicSource, musicGain, { fadeSec: MUSIC_FADE_SEC });
  }
  if (nextMusicSource && nextMusicGain) {
    stopMusicSource(nextMusicSource, nextMusicGain, { fadeSec: MUSIC_FADE_SEC });
  }
  musicSource = null;
  musicGain = null;
  nextMusicSource = null;
  nextMusicGain = null;
}

async function playTrack(url, { loop = false, fadeInSec = MUSIC_FADE_SEC, targetGain = 0.8 } = {}) {
  const c = ctx;
  if (!c || c.state !== "running") return null;
  ensureGraph();
  if (!buses) return null;

  const buf = await decodeUrlToBuffer(url);
  if (!buf) return null;

  const s = getSettings();
  if (s.muteAll || clamp01(s.musicVolume) <= 0.001) return null;

  try {
    const t0 = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = loop;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.setTargetAtTime(targetGain, t0, Math.max(0.01, fadeInSec / 3));

    src.connect(gain);
    gain.connect(buses.duck);
    src.start(t0);

    return { source: src, gain };
  } catch {
    return null;
  }
}

async function crossfadeToTrack(url, { fadeSec = MUSIC_CROSSFADE_SEC, loop = false, targetGain = 0.8 } = {}) {
  const c = ctx;
  if (!c || c.state !== "running") return;

  // Fade out current track
  if (musicSource && musicGain) {
    stopMusicSource(musicSource, musicGain, { fadeSec });
  }

  // Start new track with fade in
  const result = await playTrack(url, { loop, fadeInSec: fadeSec, targetGain });
  if (result) {
    musicSource = result.source;
    musicGain = result.gain;
  }
}

function scheduleNextGameTrack() {
  if (currentMusicMode !== "game") return;
  if (!musicSource) return;

  musicSource.onended = async () => {
    if (currentMusicMode !== "game") return;

    gameTrackIndex = (gameTrackIndex + 1) % MUSIC_TRACKS.game.length;
    const nextUrl = MUSIC_TRACKS.game[gameTrackIndex];

    const result = await playTrack(nextUrl, { loop: false, fadeInSec: 0.5, targetGain: 0.8 });
    if (result) {
      musicSource = result.source;
      musicGain = result.gain;
      scheduleNextGameTrack();
    }
  };
}

async function maybeStartMusic() {
  const c = getAudioContext();
  if (!c || c.state !== "running") return false;
  ctx = c;
  ensureGraph();
  if (!buses) return false;
  if (musicSource) return true;

  const s = getSettings();
  if (s.muteAll || clamp01(s.musicVolume) <= 0.001) return false;

  if (currentMusicMode === "lobby") {
    const result = await playTrack(MUSIC_TRACKS.lobby, { loop: true, fadeInSec: MUSIC_FADE_SEC, targetGain: 0.8 });
    if (result) {
      musicSource = result.source;
      musicGain = result.gain;
      return true;
    }
  } else if (currentMusicMode === "game") {
    const url = MUSIC_TRACKS.game[gameTrackIndex % MUSIC_TRACKS.game.length];
    const result = await playTrack(url, { loop: false, fadeInSec: MUSIC_FADE_SEC, targetGain: 0.8 });
    if (result) {
      musicSource = result.source;
      musicGain = result.gain;
      scheduleNextGameTrack();
      return true;
    }
  }

  return false;
}

export async function setMusicMode(mode) {
  // Disable old ambient system if it was running
  if (ambientEnabled) {
    ambientEnabled = false;
    stopAmbient();
  }

  musicEnabled = true;

  if (mode === currentMusicMode) return;

  const prevMode = currentMusicMode;
  currentMusicMode = mode;

  if (!mode) {
    stopMusic();
    return;
  }

  const c = getAudioContext();
  if (!c || c.state !== "running") return;

  if (mode === "lobby") {
    if (prevMode === "game") {
      // Crossfade from game to lobby
      await crossfadeToTrack(MUSIC_TRACKS.lobby, { fadeSec: MUSIC_CROSSFADE_SEC, loop: true });
    } else {
      // Start lobby music fresh
      stopMusic();
      await maybeStartMusic();
    }
  } else if (mode === "game") {
    // Reset game track index when starting a new game
    if (prevMode !== "game") {
      gameTrackIndex = 0;
    }

    if (prevMode === "lobby") {
      // Crossfade from lobby to first game track
      const url = MUSIC_TRACKS.game[gameTrackIndex];
      await crossfadeToTrack(url, { fadeSec: MUSIC_CROSSFADE_SEC, loop: false });
      scheduleNextGameTrack();
    } else {
      // Start game music fresh
      stopMusic();
      await maybeStartMusic();
    }
  }
}
