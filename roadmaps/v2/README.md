# Catan LAN — V2 Roadmap (3D Showpiece Edition)

This folder is the **implementation roadmap** for a V2 that takes the game to the “next level” visually and experientially:

- **TV is the host** (Jackbox pacing: announces what matters, stays readable, celebrates moments).
- **Phones are controllers** (fast, forgiving, tactile).
- **Board is 3D** (Three.js) on **both TV + phones**, with **water around the island** and satisfying motion.

## Prereqs

This roadmap assumes the work in these files/folders is already complete and stable:

- `/Users/andrew.saylor/Documents/test/Catan/PLAN.md`
- `/Users/andrew.saylor/Documents/test/Catan/POLISH-PLAN.md`
- `/Users/andrew.saylor/Documents/test/Catan/v1 Roadmap`

## V2 Definition (Decision-Complete)

- **Scope:** LAN-only party game (no accounts, no internet hosting, no matchmaking).
- **Players:** 3–6.
- **Primary V2 pillar:** 3D board + motion + water around the board.
- **Secondary pillar:** “TV host” pacing + moment celebration (text host + SFX + music, no voice required).
- **Compatibility:** must keep a **2D fallback** for devices without WebGL / low power modes.

### V2 Success Metrics (measurable)

- **Perceived quality:** “commercial digital boardgame” feel (not prototype).
- **Zero-coaching:** a room of 4 can play without rules explanations.
- **Performance targets:**
  - **TV:** 60fps target, never below 30fps sustained.
  - **Phones:** 45fps target on mid-range, never below 24fps sustained.
  - **Thermals:** no obvious throttling within a 40–60 minute session.
- **Accessibility:** reduced motion + high contrast + colorblind mode remain first-class.

## How to use these docs (Agent-friendly)

Each phase file is designed to be pasted into Codex/Claude as a **single “one-shot” task**:

- Clear goal + non-goals
- Concrete file-level technical plan
- Acceptance criteria + manual test scenarios
- Explicit rollback plan

### Priorities

- **P0:** must-have for V2 “3D Showpiece”.
- **P1:** should-have for V2 (big delight / UX uplift).
- **P2:** optional polish / expansions.

## Tracks in this roadmap

1. 3D Board & Motion
2. Show & Pacing
3. Theme Packs & Cosmetics
4. Party Modes & Variety
5. Production Quality

## Recommended implementation order (critical path first)

1. Production Quality — Phase 1 (WebGL capability + quality scaler)
2. 3D Board & Motion — Phase 1 (Three.js wiring + toggle + fallback)
3. 3D Board & Motion — Phase 2 (Static 3D board mesh)
4. 3D Board & Motion — Phase 3 (Picking + highlight parity)
5. 3D Board & Motion — Phase 4 (Camera controls parity)
6. 3D Board & Motion — Phase 5 (Ocean + island border)
7. Remaining P1/P2 phases in parallel (see `parallelization.md`)

## Global acceptance checklist (V2)

### Visual / Motion

- TV and phone both render the board in 3D (or fall back to 2D cleanly).
- Water/ocean is visible around the island and animates (disabled in reduced motion).
- Road/settlement/city/robber updates are readable and satisfying.

### Gameplay flow

- Create room on TV → join 3–6 phones → complete setup → roll dice → build → trade → robber (7) → endgame.
- No input regressions: all “tap highlight” flows still work on 3D.

### Resilience

- Refresh TV mid-game and resume.
- Refresh 2 phones mid-game and resume.
- Toggle reduced motion / high contrast mid-game: immediate and stable.

### Performance

- Phone stays responsive with pan/zoom + picking.
- No major jank when highlights update, dice rolls, or builds happen.
