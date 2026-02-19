import { getSettings } from "/shared/settings.js";

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

export function createShowLayer(rootEl) {
  if (!rootEl) throw new Error("show layer root missing");

  rootEl.innerHTML = `
    <div class="spotlight" data-role="spotlight" aria-hidden="true">
      <div class="spotlightHole" data-role="spotlightHole"></div>
    </div>
    <div class="toastRail" data-role="toastRail" aria-hidden="true"></div>
    <div class="showMomentSlot" data-role="momentSlot" aria-hidden="true"></div>
    <div class="confettiLayer" data-role="confettiLayer" aria-hidden="true"></div>
  `;

  const elSpotlight = rootEl.querySelector('[data-role="spotlight"]');
  const elSpotlightHole = rootEl.querySelector('[data-role="spotlightHole"]');
  const elToastRail = rootEl.querySelector('[data-role="toastRail"]');
  const elMomentSlot = rootEl.querySelector('[data-role="momentSlot"]');
  const elConfetti = rootEl.querySelector('[data-role="confettiLayer"]');

  let momentTimer = null;
  let spotlightTimer = null;

  function clearMoment() {
    if (momentTimer) clearTimeout(momentTimer);
    momentTimer = null;
    if (!elMomentSlot) return;
    elMomentSlot.innerHTML = "";
  }

  function clearSpotlight() {
    if (spotlightTimer) clearTimeout(spotlightTimer);
    spotlightTimer = null;
    elSpotlight?.classList.remove("show");
    elSpotlightHole?.classList.remove("pulse");
  }

  async function showMoment({ title, subtitle = "", badgesHtml = "", tone = "info", durationMs = 1300 } = {}) {
    clearMoment();
    const safeTitle = title == null ? "" : String(title);
    const safeSubtitle = subtitle == null ? "" : String(subtitle);
    const t = safeTone(tone);

    const card = elementFromHtml(`
      <div class="momentCard" data-tone="${escapeHtml(t)}">
        <div class="momentTitle">${escapeHtml(safeTitle)}</div>
        ${safeSubtitle ? `<div class="momentSubtitle">${escapeHtml(safeSubtitle)}</div>` : ""}
        ${badgesHtml ? `<div class="momentBadges">${badgesHtml}</div>` : ""}
      </div>
    `);
    elMomentSlot?.append(card);
    await nextFrame();
    card?.classList.add("show");

    momentTimer = setTimeout(() => {
      card?.classList.remove("show");
      setTimeout(() => {
        if (card?.parentNode) card.parentNode.removeChild(card);
      }, 240);
    }, clampNonNegativeInt(durationMs));
  }

  async function toast({ title, subtitle = "", badgesHtml = "", tone = "info", durationMs = 1900 } = {}) {
    const safeTitle = title == null ? "" : String(title);
    const safeSubtitle = subtitle == null ? "" : String(subtitle);
    const t = safeTone(tone);

    const card = elementFromHtml(`
      <div class="showToast" data-tone="${escapeHtml(t)}">
        <div class="toastTitle">${escapeHtml(safeTitle)}</div>
        ${safeSubtitle ? `<div class="toastSubtitle">${escapeHtml(safeSubtitle)}</div>` : ""}
        ${badgesHtml ? `<div class="toastBadges">${badgesHtml}</div>` : ""}
      </div>
    `);

    elToastRail?.prepend(card);
    const maxToasts = 4;
    while (elToastRail?.children?.length > maxToasts) elToastRail.lastElementChild?.remove();

    await nextFrame();
    card?.classList.add("show");

    setTimeout(() => {
      card?.classList.remove("show");
      setTimeout(() => card?.remove(), 240);
    }, clampNonNegativeInt(durationMs));
  }

  async function spotlightRect(rect, { tone = "info", pad = 14, durationMs = 800, pulse = true, shade = 0.55 } = {}) {
    if (!elSpotlight || !elSpotlightHole) return;
    clearSpotlight();

    const r = rect && typeof rect === "object" ? rect : null;
    if (!r) return;

    const p = clampNonNegativeInt(pad);
    const x = Math.max(0, Math.floor(r.left - p));
    const y = Math.max(0, Math.floor(r.top - p));
    const w = Math.max(0, Math.floor(r.width + p * 2));
    const h = Math.max(0, Math.floor(r.height + p * 2));

    const t = safeTone(tone);
    const color =
      t === "good"
        ? "rgba(57, 217, 138, 0.75)"
        : t === "warn"
          ? "rgba(255, 209, 102, 0.78)"
          : t === "bad"
            ? "rgba(255, 92, 122, 0.78)"
            : "rgba(95, 211, 255, 0.72)";

    const radius = Math.max(14, Math.floor(Math.min(w, h) * 0.18));
    elSpotlightHole.style.setProperty("--spotColor", color);
    elSpotlightHole.style.setProperty("--spotRadius", `${radius}px`);
    elSpotlightHole.style.setProperty("--spotShade", `rgba(0,0,0,${Math.max(0, Math.min(0.8, Number(shade) || 0))})`);
    elSpotlightHole.style.left = `${x}px`;
    elSpotlightHole.style.top = `${y}px`;
    elSpotlightHole.style.width = `${w}px`;
    elSpotlightHole.style.height = `${h}px`;

    elSpotlight.classList.add("show");
    if (pulse && !getSettings()?.reducedMotion) elSpotlightHole.classList.add("pulse");

    spotlightTimer = setTimeout(() => clearSpotlight(), clampNonNegativeInt(durationMs));
  }

  function spotlightElement(el, opts) {
    if (!el?.getBoundingClientRect) return;
    return spotlightRect(el.getBoundingClientRect(), opts);
  }

  function confetti({ count = 50, durationMs = 1750 } = {}) {
    if (!elConfetti) return;
    if (getSettings()?.reducedMotion) return;

    elConfetti.innerHTML = "";
    const n = Math.max(10, Math.min(90, clampNonNegativeInt(count)));
    const colors = [
      "rgba(95, 211, 255, 0.85)",
      "rgba(201, 255, 79, 0.80)",
      "rgba(255, 209, 102, 0.82)",
      "rgba(57, 217, 138, 0.82)"
    ];

    for (let i = 0; i < n; i += 1) {
      const piece = document.createElement("div");
      piece.className = "confettiPiece";
      const x = Math.random() * 100;
      const rot = Math.floor(120 + Math.random() * 520);
      const delay = Math.floor(Math.random() * 180);
      const dur = Math.floor(1200 + Math.random() * 900);
      piece.style.setProperty("--x", String(x.toFixed(2)));
      piece.style.setProperty("--rot", `${rot}deg`);
      piece.style.setProperty("--delay", `${delay}ms`);
      piece.style.setProperty("--dur", `${dur}ms`);
      piece.style.setProperty("--c", colors[i % colors.length]);
      elConfetti.append(piece);
    }

    setTimeout(() => {
      elConfetti.innerHTML = "";
    }, clampNonNegativeInt(durationMs));
  }

  return {
    showMoment,
    toast,
    spotlightRect,
    spotlightElement,
    confetti,
    clearMoment,
    clearSpotlight
  };
}
