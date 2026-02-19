export function qs(sel, el = document) {
  return el.querySelector(sel);
}

export function qsa(sel, el = document) {
  return [...el.querySelectorAll(sel)];
}

export function setText(el, text) {
  el.textContent = text == null ? "" : String(text);
}

export function clampInt(n, min, max) {
  const v = Number.isFinite(n) ? Math.floor(n) : min;
  return Math.max(min, Math.min(max, v));
}

export function sanitizeRoomCode(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

const ACTION_ID_REUSE_WINDOW_MS = 400;
const ACTION_CACHE_MAX = 180;
const actionIdCache = new Map();
const inFlightActionBySignature = new Map();

function clampNonNegativeInt(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function makeActionId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // Ignore and fall back.
  }

  try {
    const cryptoObj = globalThis.crypto;
    if (cryptoObj?.getRandomValues) {
      const bytes = new Uint8Array(16);
      cryptoObj.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    // Ignore and fall back.
  }

  // Last resort: non-crypto UUID v4 shape.
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function stableStringify(value) {
  if (value == null) return "null";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "number") return Number.isFinite(value) ? String(value) : "null";
  if (t === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  if (t !== "object") return "null";

  const obj = value;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(",")}}`;
}

function actionSignature(path, body) {
  if (!body || typeof body !== "object") return null;
  if (!("playerId" in body) || !("type" in body)) return null;

  const clone = { ...body };
  delete clone.actionId;
  return `${String(path)}|${stableStringify(clone)}`;
}

function actionIdForSignature(signature) {
  const now = Date.now();
  const cached = actionIdCache.get(signature);
  if (cached && now - cached.at <= ACTION_ID_REUSE_WINDOW_MS) return cached.id;

  const next = { id: makeActionId(), at: now };
  actionIdCache.delete(signature);
  actionIdCache.set(signature, next);
  while (actionIdCache.size > ACTION_CACHE_MAX) {
    const oldest = actionIdCache.keys().next().value;
    if (!oldest) break;
    actionIdCache.delete(oldest);
  }
  return next.id;
}

export class ApiError extends Error {
  constructor(code, { status = null, data = null } = {}) {
    super(String(code || "UNKNOWN_ERROR"));
    this.name = "ApiError";
    this.code = String(code || "UNKNOWN_ERROR");
    this.status = Number.isFinite(status) ? status : null;
    this.data = data ?? null;
  }
}

function errorInfoFromResponse(res, json) {
  const status = Number.isFinite(res?.status) ? res.status : null;
  const err = json && typeof json === "object" ? json.error : null;
  if (typeof err === "string" && err.trim()) return { code: err.trim(), data: null, status };
  if (err && typeof err === "object") {
    const code = typeof err.code === "string" && err.code.trim() ? err.code.trim() : "UNKNOWN_ERROR";
    const data = "data" in err ? err.data : null;
    return { code, data, status };
  }
  return { code: status ? `HTTP_${status}` : "CONNECTION_ERROR", data: null, status };
}

export async function api(path, { method = "GET", body = null } = {}) {
  const isActionPost = method === "POST" && /\/api\/rooms\/[^/]+\/action$/.test(String(path));
  const signature = isActionPost ? actionSignature(path, body) : null;

  if (signature && inFlightActionBySignature.has(signature)) {
    return inFlightActionBySignature.get(signature);
  }

  let requestBody = body;
  if (signature) {
    const actionId = actionIdForSignature(signature);
    requestBody = { ...body, actionId };
  }

  const promise = (async () => {
    const startedAt = Date.now();
    const res = await fetch(path, {
      method,
      headers: requestBody ? { "Content-Type": "application/json" } : undefined,
      body: requestBody ? JSON.stringify(requestBody) : undefined
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      const info = errorInfoFromResponse(res, json);
      throw new ApiError(info.code, { status: info.status, data: info.data });
    }
    // If a fast request is duplicated just after completion, reuse the same actionId briefly.
    if (signature && clampNonNegativeInt(Date.now() - startedAt) <= ACTION_ID_REUSE_WINDOW_MS) {
      const cached = actionIdCache.get(signature);
      if (cached) cached.at = Date.now();
    }
    return json;
  })();

  if (signature) {
    inFlightActionBySignature.set(signature, promise);
    promise.finally(() => inFlightActionBySignature.delete(signature));
  }

  return promise;
}

export function formatTs(ms) {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function listResourceBadges(counts, { prefix = "+" } = {}) {
  if (!counts || typeof counts !== "object") return "";
  const order = ["wood", "brick", "sheep", "wheat", "ore"];
  const items = [];
  for (const r of order) {
    const n = counts[r] ?? 0;
    if (!Number.isFinite(n) || n <= 0) continue;
    items.push(`<span class="badge res-${r}">${escapeHtml(prefix)}${Math.floor(n)} ${escapeHtml(r)}</span>`);
  }
  return items.join("");
}

function renderTurnOrder(turnOrder, playerById) {
  if (!Array.isArray(turnOrder) || turnOrder.length === 0) return "";
  const chips = turnOrder
    .map((pid) => {
      const p = playerById.get(pid);
      const name = p?.name || "Player";
      const color = p?.color || "rgba(255,255,255,0.28)";
      return `<span class="badge"><span class="miniDot" style="--c:${escapeHtml(color)}"></span>${escapeHtml(name)}</span>`;
    })
    .join("");
  return `<div class="logBadges">${chips}</div>`;
}

function renderGains(gains, playerById) {
  if (!gains || typeof gains !== "object") return "";
  const rows = [];
  for (const [pid, delta] of Object.entries(gains)) {
    const p = playerById.get(pid);
    const name = p?.name || "Player";
    const color = p?.color || "rgba(255,255,255,0.28)";
    const badges = listResourceBadges(delta);
    if (!badges) continue;
    rows.push(
      `<div class="logBadges"><span class="badge"><span class="miniDot" style="--c:${escapeHtml(color)}"></span>${escapeHtml(name)}</span>${badges}</div>`
    );
  }
  return rows.join("");
}

function actorFromEntry(entry, playerById) {
  const id = entry?.actorPlayerId || entry?.data?.by || entry?.data?.playerId || entry?.data?.fromPlayerId || null;
  return id ? playerById.get(id) || { playerId: id, name: "Player", color: "rgba(255,255,255,0.28)" } : null;
}

function renderEntry(entry, playerById) {
  const at = entry?.at ? formatTs(entry.at) : "";
  const type = entry?.type || "event";
  const actor = actorFromEntry(entry, playerById);
  const isGame = !actor;
  const name = actor ? actor.name : type === "system" ? "System" : "Game";
  const dotColor = actor ? actor.color : "rgba(95, 211, 255, 0.70)";
  const message = entry?.message || "";

  let extra = "";
  if (type === "system" && entry?.data?.turnOrder) {
    extra = renderTurnOrder(entry.data.turnOrder, playerById);
  } else if (type === "bank" && entry?.data?.gains) {
    extra = renderGains(entry.data.gains, playerById);
  } else if (type === "turn" && entry?.data?.nextPlayerId) {
    const next = playerById.get(entry.data.nextPlayerId);
    if (next) {
      extra = `<div class="logBadges"><span class="badge"><span class="miniDot" style="--c:${escapeHtml(next.color)}"></span>Next: ${escapeHtml(
        next.name
      )}</span></div>`;
    }
  } else if (type === "roll" && entry?.data?.sum) {
    extra = `<div class="logBadges"><span class="badge">Dice: ${escapeHtml(entry.data.sum)}</span></div>`;
  } else if (type === "trade" && entry?.data?.give && entry?.data?.want) {
    const give = listResourceBadges(entry.data.give, { prefix: "-" });
    const want = listResourceBadges(entry.data.want, { prefix: "+" });
    extra = `<div class="logBadges">${give ? `<span class="badge">Gives</span>${give}` : ""}${want ? `<span class="badge">Wants</span>${want}` : ""}</div>`;
  } else if (type === "robber" && entry?.data?.fromPlayerId) {
    const from = playerById.get(entry.data.fromPlayerId);
    if (from) {
      extra = `<div class="logBadges"><span class="badge"><span class="miniDot" style="--c:${escapeHtml(from.color)}"></span>From: ${escapeHtml(
        from.name
      )}</span></div>`;
    }
  }

  return `<div class="logItem ${isGame ? "game" : "player"}">
    <div class="logDot" style="--c:${escapeHtml(dotColor)}"></div>
    <div class="logBody">
      <div class="logMeta">
        <div class="logName">${escapeHtml(name)}</div>
        <div class="logTime">${escapeHtml(at)}</div>
      </div>
      <div class="logMsg">${escapeHtml(message)}</div>
      ${extra || ""}
    </div>
  </div>`;
}

export function renderLog(logEl, entries, { players = [] } = {}) {
  const playerById = new Map((players || []).map((p) => [p.playerId, p]));
  const list = (entries || [])
    .slice(-60)
    .map((e) => renderEntry(e, playerById))
    .join("");
  logEl.innerHTML = `<div class="logList">${list || `<div class="muted">No events yet.</div>`}</div>`;
  logEl.scrollTop = logEl.scrollHeight;
}
