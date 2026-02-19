# Catan LAN — Polish Plan (“Jackbox-Level” Roadmap)

**North Star (what “Jackbox-level” means here)**  
A room of 3–4 people can play with **zero rules coaching**. The TV feels like the host: it announces what matters, celebrates moments, and keeps pacing tight. Phones feel responsive, forgiving, and fun. The game is always readable, never awkwardly silent/confusing, and recovers gracefully from disconnects/misclicks.

## Product Principles (P0)
1) **Clarity beats completeness**: every screen answers “What’s happening?” and “What do I do next?”
2) **Pacing beats purity** (when in Quick Game): reduce dead time, keep turns moving.
3) **Delight is consistent**: micro-animations + sound cues reinforce state changes.
4) **Resilience is invisible**: reconnects, stale taps, and 404 rooms recover without drama.
5) **Accessibility is default**: readable typography/contrast + reduced motion + mute.

## Modes (Hybrid pacing)

### Classic (default)
- Traditional pacing, minimal automation.
- Turn timer exists but is gentle (visual, not punitive).

### Quick Game (optional room setting)
- Defaults tuned for 20–40 minutes.
- Examples of “quickening” knobs (document-only targets; pick actual numbers during implementation):
  - Lower VP target (e.g., 8–10) OR keep 10 but add pacing assist.
  - Shorter turn timer with “nudge” beats (not hard-forced).
  - Stronger prompting + auto-focus UI to expected action.
  - Faster setup support (see Setup polish section).

---

# Roadmap Overview
This plan is organized into phases. Each phase has:
- **Goal**
- **Player-facing outcomes**
- **Engineering tasks (TV-first)**
- **Acceptance criteria**
- **Manual test scenarios**

## Progress (as of Feb 12, 2026)
- ✅ Phase 0 — Baseline & Foundations
- ✅ Phase 1 — TV Show Layer v1
- ✅ Phase 2 — Phone Guidance & Responsiveness
- ✅ Phase 3 — Quick Game Mode
- ✅ Phase 4 — Audio & Music Pack
- ✅ Phase 6 — Resilience, Recovery, and Host Controls
- ✅ Phase 7 — Accessibility Pass
- ✅ Phase 5 — Visual Finish: Motion, Typography, Board Highlights

## Phase 0 — Baseline & Foundations (must-have before “pretty”)
**Goal:** make polish work predictable: event detection, settings, and safe animation hooks.

**Status:** ✅ Implemented (Feb 12, 2026)

### Outcomes
- TV/Phone have consistent settings for sound + motion.
- We can reliably detect “moments” (dice rolled, build placed, robber moved, trade opened/accepted) without fragile DOM hacks.

### Engineering tasks
- [x] Add **client settings** module (shared):
  - Settings: `sfxVolume`, `musicVolume`, `muteAll`, `reducedMotion`
  - Persist: `localStorage` per device
  - UI: simple gear/settings entry (TV) + settings in phone menu
- [x] Add **audio unlock** strategy:
  - On first user gesture, unlock WebAudio and prewarm sounds.
  - If blocked, fall back silently (no errors).
- [x] Add **show beat detection**:
  - TV computes beats from state diffs:
    - turn change
    - dice roll change (`lastRoll.at`)
    - robber step transitions (`phase/subphase/expected`)
    - structure count deltas (roads/settlements/cities)
    - trade offer open/new/accepted/canceled (from offers list + statuses)
    - game over/winner
  - Beats go into a small queue to avoid overlapping animations.

### Acceptance criteria
- Toggling mute/reduced motion updates immediately and persists reload.
- Beats fire exactly once per state change and don’t double-trigger on reconnect.

### Manual tests
- Reload TV mid-game: no audio spam; no repeated “turn start” overlay loops.
- Phone reconnect: no repeated toasts; settings persist.

---

## Phase 1 — TV Show Layer v1 (biggest perceived quality jump)
**Goal:** TV feels like a host with readable pacing and celebratory moment cards.

**Status:** ✅ Implemented (Feb 12, 2026)

### Outcomes
- Every turn feels like a “segment”: clear start, clear action focus, clear wrap.
- Big moments have **visual + audio signatures**.

### Engineering tasks (TV)
- [x] Add **Show Overlay system** (single top-layer UI container):
  - Components:
    - `MomentCard` (center overlay: title + subtitle + optional badges)
    - `ToastRail` (non-blocking small callouts)
    - `Spotlight` (darken background + highlight board region or player)
  - Rules:
    - Obey `reducedMotion`: use fade-only, no movement.
    - Never block gameplay; overlays time out.
- [x] Add beat-to-overlay mapping:
  - **Turn Start**: “{Player}’s Turn” stinger + subtle player highlight
  - **Dice Roll**: dice shake animation + impact sound + “Rolled {sum}”
  - **Robber (7)**:
    - “Rolled 7” stinger
    - “Discard” segment indicator (who still needs to discard)
    - “Robber moved” segment + map pulse on target hex
    - “Stole from {player}” sting (no resource reveal)
  - **Build**:
    - “Built: Road/Settlement/City” callout
    - Board pulse at location (or brief glow)
  - **Trade Offer Opened**:
    - “Trade Offer” stinger + from→to + give/want badges
    - Highlight Offers panel briefly
  - **Trade Accepted**:
    - “Trade Complete” stinger + both players
  - **Game Over**:
    - Winner celebration sequence (confetti animation, fanfare, scoreboard emphasis)
- [x] Improve TV readability (layout polish targets):
  - Phase banner becomes “Now playing: …”
  - Current player gets a stronger but tasteful highlight
  - Offers panel has clear “new” affordance and timeout highlight

### Acceptance criteria
- In a noisy room, players can glance at the TV and know what changed.
- Dice, robber, build, trade, and win moments all have distinct beats.

### Manual tests
- Start game → finish first 2 turns: no dead UI time; no confusing state.
- Roll 7: TV clearly indicates discard step and robber outcomes.

---

## Phase 2 — Phone Guidance & Responsiveness (support the TV host)
**Goal:** phones feel “gamepad-like”: immediate feedback, obvious next steps, no modal pain.

**Status:** ✅ Implemented (Feb 12, 2026)

### Outcomes
- Players always see a single “Primary Action” and why others are blocked.
- Mis-taps are gently corrected with clear messaging.

### Engineering tasks (Phone)
- Add **Primary Action card** at top:
  - Mirrors `game.hints.expected` (“Roll dice”, “Place road”, “Discard”, etc.)
  - Shows 1-line hint (“Tap a highlighted edge” / “Select cards to discard”)
- Add **interaction feedback**:
  - Tap on illegal edge/vertex/hex gives a quick “bonk” haptic + toast (“Not legal there.”)
  - Successful actions give “good” haptic + optional sfx (respect settings)
- Upgrade trade responsiveness:
  - New offer: small toast + optional subtle sound
  - Accepted/rejected: toast with who + badges (where safe)
- Add “Help / What’s next?” quick explainer:
  - 2–4 bullets based on current phase
  - Especially for setup + robber

### Acceptance criteria
- A first-time player can complete setup placements without asking questions.
- Error messages are actionable and non-technical.

### Manual tests
- Try to build when not your turn: immediate feedback + no broken UI state.
- Receive trade offers while zoomed/panning: still discoverable.

---

## Phase 3 — Quick Game Mode (Hybrid pacing delivered)
**Goal:** Quick Game feels intentionally designed, not “sped up randomly”.

**Status:** ✅ Implemented (Feb 12, 2026)

### Outcomes
- Host can choose Quick Game at room creation (or pre-start).
- Timer and prompts create urgency without being punishing.

### Engineering tasks (Room + Engine + UI)
- Add **room setting**: `gameMode: "classic" | "quick"`
- Quick Game tuning targets:
  - Stronger prompting + shorter animations
  - Optional: lower VP target
  - Optional: setup assist (see below)
- Setup assist targets (Quick mode only):
  - Clear “Place settlement here” legal highlight + stronger glow
  - After placement, auto-focus next expected action
- Turn pacing targets:
  - TV “nudge” when timer reaches thresholds (visual only by default; optional sound)
  - Phone shows “End turn” more prominently when no actions are available (heuristic)

### Acceptance criteria
- Quick Game reduces downtime and makes progress feel constant.
- Classic mode remains calm and readable.

### Manual tests
- Play Quick Game with 4 players: turns feel brisk; no one gets lost in prompts.

---

## Phase 4 — Audio & Music Pack (Full Jackbox A/V)
**Goal:** cohesive sound identity: stingers, UI ticks, and “moment” audio.

**Status:** ✅ Implemented (Feb 12, 2026)

### Outcomes
- Sound reinforces game state changes.
- Audio is never annoying: respects mute/volume and avoids repetition spam.

### Engineering tasks
- Define sound taxonomy:
  - UI: tick, bonk, confirm
  - Moments: turn start, dice roll, robber, build, trade, victory
  - Ambient/music bed (TV-only, optional)
- Implement audio playback layer (shared):
  - Concurrency rules (no more than N overlapping)
  - Cooldowns per sound key
  - Ducking: moment stingers duck ambient briefly
- Provide default sound set:
  - If using synthesized audio initially: implement distinct timbres per category.
  - If using asset files later: central mapping table + preload + fallback.

### Acceptance criteria
- Sounds never stack uncontrollably during reconnect or burst events.
- Mute works instantly; volumes are consistent.

### Manual tests
- Spam trade offers: stinger cooldown prevents audio chaos.
- Reload TV: no repeated victory fanfare.

---

## Phase 5 — Visual Finish: Motion, Typography, Board Highlights
**Goal:** make everything feel intentional: spacing, timing, and motion language.

**Status:** ✅ Implemented (Feb 12, 2026)

### Outcomes
- Unified animation timing (durations/easing).
- Board highlights communicate legality AND celebration.

### Engineering tasks
- Establish motion tokens (CSS variables):
  - durations: fast/med/slow
  - easings
  - reduced-motion overrides
- Board polish targets:
  - Better pulses for selectable edges/vertices/hexes
  - “Placed” animation (brief glow) rather than only a flash
- Typography polish:
  - Fix hierarchy: headers, phase text, badges, log
  - Ensure readable from couch distance

### Acceptance criteria
- TV is readable from across a room on a typical 1080p or 4k display. Optimize for TVs between 55 and 75 inches.
- Reduced motion mode still looks good (fade-only).

---

## Phase 6 — Resilience, Recovery, and Host Controls (party-proofing)
**Goal:** the game keeps going even when people disconnect, refresh, or do weird things.

**Status:** ✅ Implemented (Feb 12, 2026)

### Outcomes
- Clear offline indicators, auto-recovering SSE, fewer “stuck” situations.
- Host can handle grief/chaos.

### Engineering tasks
- Improve reconnect UX:
  - TV: “Reconnecting…” overlay with room persistence behavior explained in 1 line
  - Phone: “Rejoining…” state that doesn’t drop user context
- Add host controls (TV-first):
  - Pause/resume timer
  - Kick player (pre-game; optionally in-game)
  - Reassign host in-game (if needed)
  - “Reset room” confirmation flow
- Add spectator-safe behaviors:
  - TV never shows private hand info; avoid accidental leaks in overlays.

### Acceptance criteria
- A phone refresh doesn’t break that player’s experience beyond a short rejoin.
- Host can recover from a player leaving mid-game without confusion.

---

## Phase 7 — Accessibility Pass (ship-quality)
**Goal:** the game is playable for more people and looks professional.

**Status:** ✅ Implemented (Feb 12, 2026)

### Outcomes
- High contrast mode readiness (at least baseline contrast).
- ARIA labels for primary controls; focus states.
- Reduced motion and mute are first-class.

### Engineering tasks
- [x] Add **High contrast** setting (TV + phone) and theme overrides.
- [x] Add baseline **focus-visible** styling + 44px touch targets.
- [x] Add ARIA toggle semantics for settings (pressed state) and primary controls.
- [x] Allow mobile zoom; keep board gesture handling stable.

### Acceptance criteria
- Core flows are usable on common mobile browsers with large text enabled.
- TV UI maintains readability and contrast.

### Manual tests
- Phone: pinch-zoom (or OS large text) still allows join → ready → play; no clipped controls.
- TV/Phone: tab focus shows clear focus rings; settings modal focus lands on Close.
- Toggle high contrast / reduced motion / mute: applies instantly and persists reload.

---

# Definition of Done (Jackbox-level “feel”)
A playtest group can:
- Create room on TV, join 3–4 phones, ready up, and start
- Complete setup placements without guidance
- Play 3 full rounds with:
  - dice rolls, builds, at least 1 trade, and at least 1 robber event
- Experience:
  - clear turn ownership
  - clear next actions
  - consistent audio/visual cues
  - no confusing dead-ends on disconnect/reload

---

# Manual Smoke Test Checklist (use before calling it “polished”)
1) Lobby: join/ready/unready; host swap on disconnect
2) Start game: setup round 1 + 2 placements (all players)
3) Turn: roll dice → main → build road/settlement
4) Trade: create offer → accept/reject → offer expiry on end turn
5) Robber: roll 7 → discard enforcement → move robber → steal
6) Reconnect: refresh TV, refresh 1 phone, continue playing
7) Win: reach 10 VP and confirm celebration + final state
