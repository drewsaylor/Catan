# Catan LAN (TV + Phones) — Project Plan

This file is the “source of truth” plan for this prototype: what exists today, what’s missing, and a suggested sequence to complete a fuller Catan/JB-style experience.

## Current Status (implemented)

**Core loop**

- Lobby: room creation, join via room code, ready/unready, host reassignment on disconnect (lobby only).
- Game start: host picks preset + starts when 3–4 players are ready.
- Setup: 2 settlement + 2 road placements via phone board interaction (legal placement highlighting).
- Turns: roll dice → (robber flow on 7) → main → end turn.

**Board + UI**

- TV: board render (ports + robber) + player list (VP) + join info + dice panel + open offers + game log + phase banner + turn timer.
- Phone: join/lobby controls + prompts/toasts + board interaction with pan/zoom + build controls + trade + bank trade + robber UI + VP display.
- Visuals: consistent “LAN / party game” UI theme, readable logs, board highlighting.

**Rules/scaffolding**

- Board presets: `classic-balanced`, `high-ore`, `high-brick-wood`.
- Resource production: dice distribution from settlements/cities, bank depletion handling.
- Build actions: roads/settlements/cities with legality checks.
- Robber (7): discards enforced, move robber, steal 1 random card from an eligible adjacent player.
- Bank trades + ports: 4:1 baseline, 3:1 generic port, 2:1 specific ports (ownership-based).

**Trading**

- Offer creation (current player, main phase only): to `all` or a specific player.
- Offer responses: accept/reject (with targeting rules), cancel by offer creator.
- Server validates resource availability at creation and acceptance time.
- Accept performs actual resource exchange between players’ private hands.
- Offers made by current player expire when they end their turn.

**Victory points + win condition**

- VP from settlements (1) and cities (2), always-visible scoreboard.
- Game ends at 10 VP and shows winner on TV + phones.

**Persistence + reconnect (v1)**

- Rooms persist to disk (`apps/server/data/rooms/*.json`) and are restored on server restart (best-effort; no pruning).
- TV uses `/tv?room=CODE` for refresh-safe sessions; phones use localStorage + `playerId` to rejoin.

## Known Constraints / “Not Yet”

- Dev cards are main-phase only (v1).
- No matchmaking beyond room code, no auth (fine for LAN prototype).
- Trade offers are “current player only” (no off-turn counteroffers) and expire on end turn.
- Persistence is best-effort (no pruning; connections aren’t persisted; players show offline until they reconnect).
- Hidden state (hands/dev cards) is server-private; the engine does not mutate hands.

## Architecture Notes (how it’s wired today)

**Packages**

- `packages/game-engine/`: deterministic-ish game state machine (board, phases, legality, trade offer state, log entries).
- `packages/shared/`: resource helpers (`RESOURCE_TYPES`, `emptyHand`, normalizers).
- `apps/server/`: room management with JSON-on-disk persistence, SSE streams, private player state (hands), applies costs/exchange, serves static assets.
- `apps/server/public/`: phone + TV clients (no framework; ES modules + fetch + SSE).

**State split**

- Public game snapshot is emitted to TV + phones via SSE.
- Private hand state lives server-side (`room.privateByPlayerId`) and is emitted only to that phone.
- Engine returns `privateUpdates` for resource production; server applies them to hands.
- Server also applies build costs and trade exchanges (engine currently does not mutate hands).

This split is good enough for the prototype, but for “full rules” we should decide whether:

- A) keep “hands as server-private” (current approach), or
- B) move all hand/bank mutations into the engine for stronger rule centralization.

## Milestone Status (worked out of order)

1. ✅ Robber + discard on 7
2. ✅ Bank trading + ports
3. ✅ Victory points + win condition + scoreboard
4. ✅ Dev cards + largest army
5. ✅ Longest road
6. ✅ Persistence + reconnection quality (v1)
7. 🟡 Polish: TV “show” layer (partially implemented; ongoing)

Below are detailed tasks for each milestone.

---

## Milestone 1 — Robber + Discard on 7

**Status:** ✅ Core flow implemented (discard → move → steal); robber blocks production.

### Goals

- Implement the “7” outcome: players with >7 cards discard half; current player moves robber; current player steals 1 random card from a player adjacent to robber hex.

### Engine tasks (`packages/game-engine/`)

- ✅ Add turn subphases for 7 flow:
  - `robber_discard` (collect discards)
  - `robber_move` (current player selects hex)
  - `robber_steal` (current player selects victim if applicable; else auto-skip)
- ✅ Add hints for expected actions + legal targets:
  - Legal hex IDs for robber move (exclude current robber hex optionally).
  - Legal victim player IDs (adjacent settlements/cities on robber hex).
- ✅ Add actions:
  - `DISCARD_CARDS` (player submits discard counts)
  - `MOVE_ROBBER` (hexId)
  - `STEAL_CARD` (fromPlayerId)
- ✅ Update log entries:
  - “Rolled 7”
  - “X discarded N”
  - “Robber moved to …”
  - “Stole a card from …”

### Server tasks (`apps/server/server.js`)

- ✅ Enforce discard legality server-side (since hands are private):
  - Required discard count = `floor(handTotal/2)` if `handTotal > 7`.
  - Reject if discard includes more than player has.
  - Apply discard deltas to private hand and return to bank (or simply remove; standard Catan discards go back to bank supply).
- ✅ Implement stealing:
  - Randomly choose one resource type from victim hand (weighted by counts).
  - Transfer 1 card victim → stealer.
- ✅ Ensure phase gating + SSE updates.

### Phone UX (`apps/server/public/phone/`)

- ✅ When expected is discard:
  - Show a discard UI for that player only (simple number inputs + “Submit discard”).
- ✅ When expected is move robber:
  - Highlight all hexes; tap a hex to move robber.
- ✅ When expected is steal:
  - If multiple victims, show buttons for each eligible victim; else auto-resolve.

### TV UX (`apps/server/public/tv/`)

- ✅ Show the current step via the Phase banner (“Discard / Move robber / Steal”).
- ✅ Show robber move visually (updates `robberHexId`).
- (Optional) Add a dedicated “7 Event” panel (beyond the phase banner + log).

### Acceptance criteria

- Rolling 7 blocks the main phase until discards + robber resolution completes.
- Discard is enforced correctly and reflected in hands.
- Robber blocks production on its hex.
- Steal transfers exactly one card and is logged.

---

## Milestone 2 — Bank Trades + Ports

**Status:** ✅ Implemented (ports render on board; bank trade uses 4:1 / 3:1 / 2:1 rules).

### Goals

- Allow current player to trade with the bank at 4:1, plus ports at 3:1 and 2:1 (if you own a settlement/city on that port).

### Engine tasks

- ✅ Extend board generation to include ports (at least classic distribution).
  - Simplest: add `ports` array with edges/vertices or coastal vertex mapping.
- ✅ Add helper logic:
  - Compute player’s available trade ratios (min ratio per resource).
- ✅ Add actions:
  - `BANK_TRADE` with `give` and `receive` counts (normalize + validate).
- ✅ Add hints:
  - Show “Bank trade available” during main phase.

### Server tasks

- ✅ Validate and apply bank trade against private hands:
  - Ensure player has resources to give.
  - Ensure bank has resources to give back (bank depletion edge cases).
  - Update bank counts and player hand.

### Phone UX

- ✅ Add a “Bank trade” UI in main phase:
  - Choose a give resource + amount and receive resource + amount.
  - Show ratio and whether player has a matching port.

### Acceptance criteria

- Trades obey 4:1 baseline, and ports reduce ratio appropriately.
- Bank inventory updates and blocks impossible trades.

---

## Milestone 3 — Victory Points + Win Condition

**Status:** ✅ Implemented (VP from settlements/cities; game ends at 10 VP).

### Goals

- Track VP from:
  - settlements (1)
  - cities (2)
  - (later) longest road / largest army / dev cards
- End game at target VP (default 10) and show winner on TV and phones.

### Engine tasks

- ✅ Add scoring computation:
  - `pointsByPlayerId(game)` derived from structures + awards.
- ✅ Add `gameOver` state:
  - When a build action increases points to threshold, set `phase = "game_over"`.
- ✅ Add hints for “Game over”.

### Server + UI

- ✅ TV: always-visible scoreboard (players + VP) + winner tag.
- ✅ Phone: show your VP and “Winner” banner/toast.

### Acceptance criteria

- Game ends immediately when a player reaches VP threshold on their turn.
- All clients show winner consistently.

---

## Milestone 4 — Development Cards + Largest Army

**Status:** ✅ Implemented (v1: Knight, Victory Point, Year of Plenty, Road Building, Monopoly + Largest Army).

### Goals

- Add dev card deck, buying, holding, and playing (at least: Knight, Victory Point, Year of Plenty, Road Building, Monopoly).
- Track largest army (2 VP).

### Engine tasks

- Add dev deck + discard pile + per-player played knights count.
- Add rules:
  - Can’t play dev cards bought this turn (except in variants; keep classic).
  - Knights move robber + steal (reusing M1 actions).
- Add actions and hints for dev card play.

### Server tasks

- Implement cost to buy dev card (wheat+sheep+ore).
- Keep dev cards private (like hands) and emit to owning phone only.

### Phone UX

- Add “Dev cards” panel:
  - Buy button, list of cards, play flows for each.

### Acceptance criteria

- Deck behaves correctly (no duplication), hidden info remains hidden, largest army awarded.

---

## Milestone 5 — Longest Road

**Status:** ✅ Implemented (award is computed from current road length; ties mean no holder).

### Goals

- Compute longest road continuously; award 2 VP to current holder.

### Engine tasks

- Add road graph computation:
  - Longest simple path with blocking rules (opponent settlement/city blocks).
  - Handle branches and cycles.
- Award tracking:
  - Store `longestRoadPlayerId` + length, update when roads are built.

### Acceptance criteria

- Matches classic longest road behavior on typical board states.

---

## Milestone 6 — Persistence + Reconnect Quality (optional)

**Status:** ✅ Implemented (v1 JSON persistence + refresh/rejoin flows).

### Goals

- Survive server restarts, allow players to rejoin and continue.

### Tasks

- Add a persistence layer keyed by room code.
  - Implemented (v1): JSON on disk at `apps/server/data/rooms/*.json`.
- Persist room + game state:
  - room state, engine game state, private hands/dev cards, join metadata
  - connection state is not persisted (players show offline until they reconnect)
- Add “resume” logic on TV and phones.
  - TV: keep using `/tv?room=CODE` (so refreshes/reloads keep the same room).
  - Phone: keep using localStorage + `playerId` rejoin.

### Acceptance criteria

- Restart server → resume room without losing state.

---

## Milestone 7 — “Jackbox-Style” Show Layer / Polish

**Status:** 🟡 Partially implemented (phase banner + turn timer + basic flashes + open offers; more polish remains).

### Goals

- Make the TV feel like the “show host”: clearer pacing, animations, timers, and spotlighting.

### TV tasks

- ✅ Add a “phase banner” and turn timer.
- 🟡 Add animations for dice roll, trade offers, builds (basic flashes exist; robber-specific beats could be improved).
- ✅ Add an “open offers” panel (mirrors phone trade list).

### Phone tasks

- ⏳ Add haptics/sfx hooks (if desired).
- ✅ Improve error messaging (inline errors + toasts; no blocking alerts).

### Acceptance criteria

- A new player can understand what to do without explanation.

---

## Backlog / Nice-to-Haves

- Spectator mode (TV-only or extra phones).
- Chat / quick emotes (party-game vibe).
- More presets / randomized board generator with token balancing rules.
- Accessibility pass (contrast, font sizes, ARIA labels on key controls).
- Anti-grief controls: host kick, pause, reassign host in-game.

## Open Questions (decisions to make soon)

1. **Rules fidelity vs. party pacing**
   - True-to-Catan can be 60–120 minutes; Jackbox-like might want 20–40 minutes.
   - Options: lower VP target, faster setup, fewer dev cards, simplified ports.
2. **Engine vs server authority for hidden state**
   - Keep private hands on server (current) or move into engine with “redacted snapshots”.
3. **Trade UX**
   - Keep “current player offers only” (classic flow-ish) or allow off-turn counteroffers (party-friendly).
