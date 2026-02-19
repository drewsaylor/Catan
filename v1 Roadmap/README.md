# Catan LAN — V1 Release Roadmap (Post `PLAN.md` + `POLISH-PLAN.md`)

This folder is the **implementation roadmap** for a **V1 “release-ready”** Catan LAN party game, designed with **Jackbox UX** as the blueprint:

- **TV is the host**: announces what matters, keeps pacing tight, stays readable from across the room.
- **Phones are controllers**: feel responsive, forgiving, and always show “what do I do next?”

## Prereqs Satisfied
This roadmap assumes the work in these files is already fully completed:

- `PLAN.md`
- `POLISH-PLAN.md`

## V1 Definition (Decision-Complete)
- **Scope:** LAN-only party game (no accounts, no matchmaking, no public internet hosting).
- **Players:** **3–6** players configurable per room (**default max = 4**).
- **Host runtime:** Node script (`npm start`) as baseline deploy target.
- **Success metrics:**
  - 4-hour session without needing a server restart.
  - Phones can refresh/rejoin without losing identity or breaking state.
  - Smooth interaction on mid-range phones (no obvious jank during common actions).
  - Clear handling of: room full, room restarted, disconnects, duplicate taps.

## How To Use These Docs (AI-Agent Friendly)
Each phase file is **self-contained**. Run phases as separate agent tasks to keep changes small and easy to verify.

### Phase doc conventions
Every phase file includes:
- **Goal**
- **Non-goals**
- **Player-facing outcomes**
- **Technical plan** (Server / Engine / TV / Phone / Shared)
- **APIs & data shape changes**
- **Acceptance criteria**
- **Manual test scenarios**
- **Risk & rollback**

### Priorities
- **P0:** must-have for V1
- **P1:** should-have for V1
- **P2:** nice-to-have

## Recommended Implementation Order (P0 first)
1) Host & Ops Improvements — Phase 1
2) Gameplay Improvements — Phase 1 + UI Improvements — Phase 1/2 (6-player enablement)
3) Reliability Improvements — Phase 2 (action idempotency)
4) Performance Improvements — Phase 1/2
5) Testing & QA — Phase 1/2
6) Security & Abuse Controls — Phase 1
7) Documentation & Release — Phase 1
8) Remaining P1/P2 phases

## Global Acceptance Checklist (V1)
### Lobby + Start
- Create room on TV
- Join **3, 4, 5, 6** phones (separate runs)
- Ready/unready, host start, room full handling

### Game Flow
- Setup placements complete (all players)
- Dice → build → trade → robber (7) flow
- Endgame triggers and shows winner correctly

### Resilience
- Refresh TV mid-game and resume
- Refresh **two** phones mid-game and resume
- Disconnect/reconnect Wi‑Fi once and resume

### Session Loop
- Post-game state is stable
- Rematch/new room behaviors work as designed (when implemented)

