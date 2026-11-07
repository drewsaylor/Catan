// Room controls for the host. The cast TV has no input, so they live on the phone.
import { escapeHtml } from "/shared/common.js";
import { humanizeErrorMessage } from "/shared/error-copy.js";

const CONFIRM_MS = 4000;

export function createHostMenu({ getRoom, getPlayerId, post }) {
  const backdrop = document.querySelector("#hostMenuBackdrop");
  const playersEl = document.querySelector("#hostMenuPlayers");
  const pauseBtn = document.querySelector("#hostPauseBtn");
  const resetBtn = document.querySelector("#hostResetBtn");
  const gameSection = document.querySelector("#hostMenuGame");
  const errEl = document.querySelector("#hostMenuErr");
  let armedKey = null;
  let armedTimer = null;

  const route = (name) => `/api/rooms/${encodeURIComponent(getRoom().roomCode)}/admin/${name}`;

  function disarm() {
    armedKey = null;
    clearTimeout(armedTimer);
  }

  // Destructive actions need a second tap on the same button.
  function needsConfirm(key) {
    if (armedKey === key) {
      disarm();
      return false;
    }
    disarm();
    armedKey = key;
    armedTimer = setTimeout(() => {
      disarm();
      render();
    }, CONFIRM_MS);
    render();
    return true;
  }

  async function run(name, body) {
    errEl.textContent = "";
    try {
      await post(route(name), { playerId: getPlayerId(), ...body });
    } catch (e) {
      errEl.textContent = humanizeErrorMessage(e);
    }
    render();
  }

  function render() {
    const room = getRoom();
    if (!room || backdrop.style.display === "none") return;
    const me = getPlayerId();
    playersEl.innerHTML = room.players
      .filter((p) => p.playerId !== me)
      .map((p) => {
        const removeKey = `kick:${p.playerId}`;
        const hostKey = `host:${p.playerId}`;
        return `
          <div class="hostMenuPlayer">
            <span class="dot" style="background:${p.color}"></span>
            <span class="hostMenuName">${escapeHtml(p.name)}${p.connected ? "" : ' <span class="muted">offline</span>'}</span>
            <button class="btn" data-action="host" data-id="${p.playerId}">${armedKey === hostKey ? "Sure?" : "Make host"}</button>
            <button class="btn danger" data-action="kick" data-id="${p.playerId}">${armedKey === removeKey ? "Sure?" : "Remove"}</button>
          </div>`;
      })
      .join("");
    if (!playersEl.innerHTML) playersEl.innerHTML = `<div class="muted">No one else has joined yet.</div>`;

    const inGame = room.status === "in_game" && room.game?.phase !== "game_over";
    gameSection.style.display = inGame ? "" : "none";
    pauseBtn.textContent = room.timer?.paused ? "Resume turn timer" : "Pause turn timer";
    resetBtn.textContent = armedKey === "reset" ? "Tap again to end this game" : "End game, back to lobby";
  }

  function open() {
    errEl.textContent = "";
    disarm();
    backdrop.style.display = "";
    render();
  }

  function close() {
    disarm();
    backdrop.style.display = "none";
  }

  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) close();
  });
  document.querySelector("#hostMenuCloseBtn").addEventListener("click", close);
  pauseBtn.addEventListener("click", () => run("timer", { paused: !getRoom().timer?.paused }));
  resetBtn.addEventListener("click", async () => {
    if (needsConfirm("reset")) return;
    await run("reset", { confirm: true });
    close();
  });
  playersEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (needsConfirm(`${action}:${id}`)) return;
    if (action === "kick") run("kick", { targetPlayerId: id });
    else run("host", { hostPlayerId: id }).then(close);
  });

  return { open, close, render };
}
