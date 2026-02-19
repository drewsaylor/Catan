# Catan LAN — V3 Roadmap (Asset Quality & Playtester Polish)

This folder is the **implementation roadmap** for a V3 that prepares the game for real user playtesting:

- **Asset Quality:** Upgrade visual assets using Google's Nano Banana model.
- **Performance & Feel:** Optimize for smooth gameplay on real devices.
- **Playtester Experience:** Make the game easier to jump into for first-time players.
- **Feedback & Iteration:** Capture feedback from playtest sessions.

## Prereqs

This roadmap assumes the work in these files/folders is already complete and stable:

- `/Users/andrew.saylor/Documents/test/Catan/PLAN.md`
- `/Users/andrew.saylor/Documents/test/Catan/POLISH-PLAN.md`
- `/Users/andrew.saylor/Documents/test/Catan/v1 Roadmap`
- `/Users/andrew.saylor/Documents/test/Catan/v2 Roadmap`

## V3 Definition

- **Scope:** LAN-only party game (no accounts, no internet hosting, no matchmaking).
- **Players:** 3–6.
- **Primary V3 pillar:** Asset quality upgrade (Nano Banana regeneration).
- **Secondary pillar:** Playtester-ready polish (guidance, feedback collection, performance).
- **Compatibility:** must maintain 2D fallback, accessibility features, and all V2 capabilities.

### V3 Success Metrics (measurable)

- **Visual quality:** Assets look professional and cohesive across all themes.
- **First-time player success:** Players can complete a game without external rules explanation.
- **Performance targets:**
  - **TV:** 60fps target, never below 30fps sustained.
  - **Phones:** 45fps target on mid-range, never below 24fps sustained.
  - **Load time:** Initial load under 3 seconds on typical connection.
- **Feedback capture:** 80%+ of playtest sessions generate feedback data.

## How to use these docs (Agent-friendly)

Each phase file is designed to be pasted into Codex/Claude as a **single "one-shot" task**:

- Clear goal + non-goals
- Concrete file-level technical plan
- Acceptance criteria + manual test scenarios
- Explicit rollback plan

### Priorities

- **P0:** must-have for V3 playtesting readiness.
- **P1:** should-have for V3 (big delight / UX uplift).
- **P2:** optional polish / expansions.

## Tracks in this roadmap

1. Asset Quality (Nano Banana Upgrade)
2. Performance & Feel
3. Playtester Experience
4. Feedback & Iteration

## Recommended implementation order (for today's playtest)

1. Feedback & Iteration — Phase 1 (so you can collect feedback)
2. Playtester Experience — Phase 1 (first-time player guidance)
3. Performance & Feel — Phase 1 (interaction polish)
4. Asset Quality — Phase 1 (visual refresh with Nano Banana)

## Global acceptance checklist (V3)

### Visual Quality

- Resource icons are crisp and consistent across 2D/3D.
- UI icons match the overall visual style.
- Textures work with all themes and accessibility modes.

### Playtester Experience

- First-time players can understand the game flow.
- Key moments (your turn, dice roll, victory) are clearly communicated.
- Contextual hints appear without being intrusive.

### Performance

- No perceptible lag on button presses.
- Smooth transitions between game states.
- No jank during dice rolls, builds, or trades.

### Feedback Collection

- Game end prompts for rating (optional).
- Feedback stored locally in DATA_DIR/feedback/.
- No PII collected; privacy-friendly analytics only.
