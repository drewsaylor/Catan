import { getSettings } from "/shared/settings.js";

// Everything that plays over the TV stage. Nothing here takes input, and nothing dims the board:
// moments sit briefly at the board's centre, toasts stay in the left rail, pings mark a spot.

function clampNonNegativeInt(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function safeTone(tone) {
  const t = String(tone || "info");
  if (t === "good" || t === "warn" || t === "bad" || t === "info") return t;
  return "info";
}

function elementFromHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.firstElementChild;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function createShowLayer(rootEl, { toastRail = null } = {}) {
  if (!rootEl) throw new Error("show layer root missing");

  rootEl.innerHTML = `
    <div class="pingLayer" data-role="pingLayer" aria-hidden="true"></div>
    <div class="showMomentSlot" data-role="momentSlot"></div>
    <div class="confettiLayer" data-role="confettiLayer" aria-hidden="true"></div>
  `;

  const elPings = rootEl.querySelector('[data-role="pingLayer"]');
  const elMomentSlot = rootEl.querySelector('[data-role="momentSlot"]');
  const elConfetti = rootEl.querySelector('[data-role="confettiLayer"]');

  let momentTimer = null;

  function clearMoment() {
    if (momentTimer) clearTimeout(momentTimer);
    momentTimer = null;
    elMomentSlot.innerHTML = "";
  }

  // `artHtml` is trusted markup built by the caller (dice, sprites); title and subtitle are escaped.
  async function showMoment({ title = "", subtitle = "", artHtml = "", tone = "info", durationMs = 1300 } = {}) {
    clearMoment();
    const card = elementFromHtml(`
      <div class="momentCard" data-tone="${safeTone(tone)}">
        ${artHtml ? `<div class="momentArt">${artHtml}</div>` : ""}
        ${title ? `<div class="momentTitle">${escapeHtml(title)}</div>` : ""}
        ${subtitle ? `<div class="momentSubtitle">${escapeHtml(subtitle)}</div>` : ""}
      </div>
    `);
    elMomentSlot.append(card);
    await nextFrame();
    card.classList.add("show");

    momentTimer = setTimeout(() => {
      card.classList.remove("show");
      setTimeout(() => card.remove(), 240);
    }, clampNonNegativeInt(durationMs));
  }

  async function toast({ title = "", subtitle = "", tone = "info", durationMs = 2600 } = {}) {
    if (!toastRail) return;
    const card = elementFromHtml(`
      <div class="showToast" data-tone="${safeTone(tone)}">
        <div class="toastTitle">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="toastSubtitle">${escapeHtml(subtitle)}</div>` : ""}
      </div>
    `);
    toastRail.prepend(card);
    while (toastRail.children.length > 2) toastRail.lastElementChild?.remove();

    await nextFrame();
    card.classList.add("show");

    setTimeout(() => {
      card.classList.remove("show");
      setTimeout(() => card.remove(), 240);
    }, clampNonNegativeInt(durationMs));
  }

  // An expanding ring over one spot on the board, in the acting player's colour.
  function ping(el, { color = "#fff", durationMs = 1100 } = {}) {
    if (!el?.getBoundingClientRect) return;
    const rect = el.getBoundingClientRect();
    const ring = document.createElement("div");
    ring.className = "boardPing";
    ring.style.left = `${rect.left + rect.width / 2}px`;
    ring.style.top = `${rect.top + rect.height / 2}px`;
    ring.style.setProperty("--c", color);
    elPings.append(ring);
    setTimeout(() => ring.remove(), clampNonNegativeInt(durationMs));
  }

  function confetti({ count = 50, durationMs = 2400, colors = [] } = {}) {
    if (getSettings()?.reducedMotion) return;

    elConfetti.innerHTML = "";
    const palette = colors.length ? colors : ["#5fd3ff", "#c9ff4f", "#ffd166", "#39d98a"];
    const n = Math.max(10, Math.min(90, clampNonNegativeInt(count)));

    for (let i = 0; i < n; i += 1) {
      const piece = document.createElement("div");
      piece.className = "confettiPiece";
      piece.style.setProperty("--x", (Math.random() * 100).toFixed(2));
      piece.style.setProperty("--rot", `${Math.floor(120 + Math.random() * 520)}deg`);
      piece.style.setProperty("--delay", `${Math.floor(Math.random() * 180)}ms`);
      piece.style.setProperty("--dur", `${Math.floor(1200 + Math.random() * 900)}ms`);
      piece.style.setProperty("--c", palette[i % palette.length]);
      elConfetti.append(piece);
    }

    setTimeout(() => {
      elConfetti.innerHTML = "";
    }, clampNonNegativeInt(durationMs));
  }

  return { showMoment, toast, ping, confetti, clearMoment };
}
