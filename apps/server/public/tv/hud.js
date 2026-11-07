// Display pieces for the TV stage. These only read a room snapshot and write the DOM.
import { computeVpBreakdownByPlayerId } from "/shared/vp-breakdown.js";
import { inkOnColor } from "/shared/player-colors.js";

const RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"];
const GAIN_CHIP_MS = 3800;
const BUBBLE_MS = 2200;

export function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function count(n) {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function resourceIcon(resource) {
  return `<img class="resIcon" src="/shared/icons/${escapeHtml(resource)}.png" alt="${escapeHtml(resource)}" />`;
}

const PIPS = {
  1: ["c"],
  2: ["tl", "br"],
  3: ["tl", "c", "br"],
  4: ["tl", "tr", "bl", "br"],
  5: ["tl", "tr", "c", "bl", "br"],
  6: ["tl", "ml", "bl", "tr", "mr", "br"]
};

export function dieHtml(n) {
  const pips = (PIPS[n] || []).map((pos) => `<span class="pip ${pos}"></span>`).join("");
  return `<div class="die${PIPS[n] ? "" : " empty"}">${pips}</div>`;
}

export function diceHudHtml(lastRoll) {
  if (!lastRoll) return `${dieHtml(0)}${dieHtml(0)}<div class="diceSum muted">–</div>`;
  const isSeven = lastRoll.sum === 7;
  return `${dieHtml(lastRoll.d1)}${dieHtml(lastRoll.d2)}<div class="diceSum${isSeven ? " seven" : ""}">${count(lastRoll.sum)}</div>`;
}

export function settlementSprite(color) {
  return `<svg class="settlementSprite" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M4 36V17L20 4l16 13v19Z" fill="${escapeHtml(color)}" stroke="rgba(16,12,10,.85)" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M20 4l16 13v19H20Z" fill="rgba(0,0,0,.22)"/>
    <path d="M15 36V24h10v12Z" fill="rgba(16,12,10,.55)"/>
  </svg>`;
}

// What the room should be looking at right now, in a few words.
export function turnActionText(game) {
  const expected = game?.hints?.expected || null;
  if (expected === "PLACE_SETTLEMENT") return "Place a settlement";
  if (expected === "PLACE_ROAD") return "Place a road";
  if (expected === "ROLL_DICE") return "Roll the dice";
  if (expected === "DISCARD_CARDS") return "Discarding…";
  if (expected === "MOVE_ROBBER") return "Move the robber";
  if (expected === "STEAL_CARD") return "Pick someone to rob";
  if (game?.phase === "turn" && game?.subphase === "main") return "Build, trade or end turn";
  return game?.hints?.prompt || "";
}

export function turnKickerText(game) {
  if (game?.phase === "setup_round_1") return "Setup · Round 1";
  if (game?.phase === "setup_round_2") return "Setup · Round 2";
  const turn = count(game?.turnNumber);
  return turn ? `Turn ${turn}` : "";
}

export function pendingDiscards(room) {
  const hints = room?.game?.hints;
  const required = hints?.discardRequiredByPlayerId || room?.game?.robber?.discardRequiredByPlayerId || {};
  const submitted = hints?.discardSubmittedByPlayerId || room?.game?.robber?.discardSubmittedByPlayerId || {};
  return (room?.players || [])
    .filter((p) => count(required[p.playerId]) > 0 && !submitted[p.playerId])
    .map((p) => ({ playerId: p.playerId, name: p.name, count: count(required[p.playerId]) }));
}

export function sortByTurnOrder(players, turnOrder) {
  const order = Array.isArray(turnOrder) ? turnOrder : [];
  const rank = (p) => {
    const i = order.indexOf(p.playerId);
    return i === -1 ? order.length : i;
  };
  return [...(players || [])].sort((a, b) => rank(a) - rank(b));
}

function resourceListHtml(counts) {
  return RESOURCES.filter((r) => count(counts?.[r]) > 0)
    .map((r) => `<span class="resCount">${count(counts[r])}${resourceIcon(r)}</span>`)
    .join("");
}

export function offerHtml(offer, players) {
  const from = (players || []).find((p) => p.playerId === offer.fromPlayerId);
  return `<div class="offerRow" data-offer-id="${escapeHtml(offer.id)}">
    <span class="offerName" style="--c:${escapeHtml(from?.color || "#fff")}">${escapeHtml(from?.name || "Player")}</span>
    <span class="offerSide">${resourceListHtml(offer.give)}</span>
    <span class="offerArrow" aria-label="for">⇄</span>
    <span class="offerSide">${resourceListHtml(offer.want)}</span>
  </div>`;
}

// Bank bookkeeping repeats what the gain chips already show.
const TICKER_SKIP = new Set(["Resources distributed.", "No resources produced.", "Starting resources distributed."]);

export function tickerHtml(entries, players) {
  const byId = new Map((players || []).map((p) => [p.playerId, p]));
  return (entries || [])
    .filter((e) => e?.message && !TICKER_SKIP.has(e.message))
    .slice(-8)
    .map((e) => {
      const actor = byId.get(e.actorPlayerId ?? e.data?.playerId ?? e.data?.by);
      const name = actor && !e.message.includes(actor.name) ? `<b>${escapeHtml(actor.name)}</b> ` : "";
      const message = name ? e.message.charAt(0).toLowerCase() + e.message.slice(1) : e.message;
      return `<div class="tickerRow"><span class="tickerDot" style="--c:${escapeHtml(actor?.color || "rgba(255,255,255,.4)")}"></span><span>${name}${escapeHtml(message)}</span></div>`;
    })
    .join("");
}

// Player cards keep their DOM between renders so chips, bubbles and bumps can finish animating.
export function createPlayerCards(container) {
  const cards = new Map();

  function cardFor(player) {
    let card = cards.get(player.playerId);
    if (card) return card;
    const root = document.createElement("article");
    root.className = "playerCard";
    root.dataset.playerId = player.playerId;
    root.innerHTML = `<div class="pcBody"></div><div class="pcGains"></div><div class="pcBubble"></div>`;
    card = {
      root,
      body: root.querySelector(".pcBody"),
      gains: root.querySelector(".pcGains"),
      bubble: root.querySelector(".pcBubble"),
      points: null,
      bodyKey: null,
      bubbleTimer: null
    };
    cards.set(player.playerId, card);
    return card;
  }

  function update(room) {
    const game = room?.game || {};
    const players = sortByTurnOrder(room?.players, game.turnOrder);
    const discards = new Map(pendingDiscards(room).map((p) => [p.playerId, p.count]));
    const liveIds = new Set(players.map((p) => p.playerId));

    for (const [id, card] of cards) {
      if (liveIds.has(id)) continue;
      card.root.remove();
      cards.delete(id);
    }

    players.forEach((player, index) => {
      const card = cardFor(player);
      const id = player.playerId;
      const points = count(game.pointsByPlayerId?.[id]);
      const knights = count(game.playedKnightsByPlayerId?.[id]);
      const hasRoad = game.awards?.longestRoadPlayerId === id;
      const hasArmy = game.awards?.largestArmyPlayerId === id;
      const discard = discards.get(id) || 0;

      card.root.style.setProperty("--c", player.color);
      card.root.style.setProperty("--ink", inkOnColor(player.colorName));
      card.root.classList.toggle("active", game.currentPlayerId === id);
      card.root.classList.toggle("offline", !player.connected);
      if (container.children[index] !== card.root) container.insertBefore(card.root, container.children[index] || null);

      const key = [
        player.name,
        points,
        knights,
        count(player.cardCount),
        hasRoad,
        hasArmy,
        discard,
        player.connected
      ].join("|");
      if (key === card.bodyKey) return;
      card.bodyKey = key;
      card.body.innerHTML = `
        <div class="pcVp"><span class="pcVpValue">${points}</span><span class="pcVpLabel">VP</span></div>
        <div class="pcMain">
          <div class="pcName">${escapeHtml(player.name)}</div>
          <div class="pcStats">
            <span class="pcStat" title="Cards"><img src="/shared/icons/dev-card-back.png" alt="" />${count(player.cardCount)}</span>
            <span class="pcStat" title="Knights played"><img src="/shared/icons/dev-knight.png" alt="" />${knights}</span>
            ${hasRoad ? `<img class="pcAward" src="/shared/icons/award-longest-road.png" alt="Longest road" />` : ""}
            ${hasArmy ? `<img class="pcAward" src="/shared/icons/award-largest-army.png" alt="Largest army" />` : ""}
          </div>
          ${!player.connected ? `<div class="pcFlag">Reconnecting…</div>` : ""}
          ${discard ? `<div class="pcFlag warn">Discard ${discard}</div>` : ""}
        </div>`;

      if (card.points != null && points > card.points) {
        card.root.classList.remove("vpBump");
        void card.root.offsetWidth;
        card.root.classList.add("vpBump");
      }
      card.points = points;
    });
  }

  function showGains(gainsByPlayerId) {
    for (const [id, gains] of Object.entries(gainsByPlayerId || {})) {
      const card = cards.get(id);
      if (!card) continue;
      const chip = document.createElement("div");
      chip.className = "gainChip";
      chip.innerHTML = RESOURCES.filter((r) => count(gains?.[r]) > 0)
        .map((r) => `<span class="resCount">+${count(gains[r])}${resourceIcon(r)}</span>`)
        .join("");
      if (!chip.innerHTML) continue;
      card.gains.replaceChildren(chip);
      setTimeout(() => chip.remove(), GAIN_CHIP_MS);
    }
  }

  function showBubble(playerId, label, tone = "good") {
    const card = cards.get(playerId);
    if (!card) return;
    if (card.bubbleTimer) clearTimeout(card.bubbleTimer);
    card.bubble.textContent = label;
    card.bubble.dataset.tone = tone;
    card.bubble.classList.add("show");
    card.bubbleTimer = setTimeout(() => card.bubble.classList.remove("show"), BUBBLE_MS);
  }

  return { update, showGains, showBubble };
}

export function endPanelHtml(room) {
  const game = room?.game || {};
  const players = room?.players || [];
  const points = game.finalPointsByPlayerId || game.pointsByPlayerId || {};
  const breakdown =
    computeVpBreakdownByPlayerId(
      game,
      players.map((p) => p.playerId)
    ) || {};
  const winner = players.find((p) => p.playerId === game.winnerPlayerId) || null;
  const host = players.find((p) => p.playerId === room?.hostPlayerId) || null;
  const ranked = [...players].sort((a, b) => count(points[b.playerId]) - count(points[a.playerId]));

  const rows = ranked
    .map((p, index) => {
      const b = breakdown[p.playerId] || {};
      const parts = [
        [count(b.settlementCount), "settlement", "settlements"],
        [count(b.cityCount), "city", "cities"]
      ]
        .filter(([n]) => n > 0)
        .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
      if (b.longestRoad) parts.push("Longest road");
      if (b.largestArmy) parts.push("Largest army");
      if (count(b.hidden) > 0) parts.push(`${count(b.hidden)} hidden VP`);
      return `<li class="standing${p.playerId === game.winnerPlayerId ? " winner" : ""}" style="--c:${escapeHtml(p.color)}">
        <span class="standingRank">${index + 1}</span>
        ${settlementSprite(p.color)}
        <span class="standingMain">
          <span class="standingName">${escapeHtml(p.name)}</span>
          <span class="standingDetail">${escapeHtml(parts.join(" · "))}</span>
        </span>
        <span class="standingVp">${count(points[p.playerId])}</span>
      </li>`;
    })
    .join("");

  return `
    <div class="eyebrow">Game over</div>
    <h1 class="endTitle" style="--c:${escapeHtml(winner?.color || "#fff")}">${winner ? `${escapeHtml(winner.name)} wins!` : "No winner"}</h1>
    <ol class="standings">${rows}</ol>
    <div class="endHint">${host ? `${escapeHtml(host.name)} can tap <b>Play again</b> on their phone` : "Tap <b>Play again</b> on the host phone"}</div>`;
}
