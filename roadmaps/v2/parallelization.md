# V2 Parallelization (Dependencies + What Can Be Done Together)

This doc maps the V2 phases into parallel workstreams. Goal: multiple agents can work without stepping on each other by agreeing on **contracts** first (API shapes + module boundaries).

## Key contracts (agree first; enables parallel work)

### Contract A — “Board Renderer” API (shared)

A new shared module (name TBD in implementation) must support the same call signature as the existing 2D board:

- Input:
  - `board` (from game snapshot)
  - `players`, `structures`, `robberHexId`
  - `selectableVertexIds`, `selectableEdgeIds`, `selectableHexIds`
  - `placedVertexIds`, `placedEdgeIds`
  - `highlightMode`
  - `captureAllVertices/Edges/Hexes`
  - `onVertexClick`, `onEdgeClick`, `onHexClick`, `onIllegalClick`
- Output:
  - deterministic updates; no double event firing
  - destroy/unmount lifecycle

**Why:** lets TV + phone swap 2D/3D without rewriting gameplay logic.

### Contract B — “Quality / Capability” API (shared)

A shared helper determines:

- `supportsWebGL` (hard gate)
- `defaultQuality`: `low | medium | high | ultra`
- `maxPixelRatio` clamp per quality
- feature toggles: `water`, `shadows`, `postFx`, `dice3d`, `particles`

**Why:** prevents “3D works on my laptop only” and lets 3D ship on phones.

### Contract C — “Moments” API (shared, optional early)

A shared “moment detector” maps `(prevRoomState, nextRoomState) -> moments[]`.
Moments are used by:

- TV show layer (toasts/moment cards/spotlights)
- 3D renderer (play animations)
- Phone haptics/toasts

**Why:** centralizes Jackbox-style pacing.

## Workstreams (parallel-ready)

### Stream 1 — Core 3D Renderer

- 3D Board & Motion Phase 1 → 2 → 3 → 4 is the core critical chain.
- Phase 5 (ocean) can start once Phase 2 is stable.
- Phase 6/7/8 can start once Phase 3 is stable.

### Stream 2 — Performance + Quality Scaling (must exist early)

- Production Quality Phase 1 can be built in parallel with 3D Phase 1.
- It should land before 3D Phase 4 finishes (phone controls), so tuning happens early.

### Stream 3 — Show & Pacing

- Show & Pacing Phase 1 can be built in parallel with 3D Phase 2.
- Show & Pacing Phase 2 can proceed after Phase 1’s moment schema is stable.
- Show & Pacing Phase 3 can proceed anytime after basic show layer hooks exist.

### Stream 4 — Themes

- Theme phase 1 can be built in parallel with 3D Phase 2 (it mostly defines data + wiring).
- Theme phase 2 can proceed after theme manifest is stable and 3D materials have hooks.

### Stream 5 — Party Modes

- Party phase 1 can proceed largely in parallel with rendering, as long as it doesn’t require new renderer features.
- Party phase 2 is later and can proceed after moment hooks exist.

## Dependency graph (high level)

- Production Quality P1 → (unblocks safe phone 3D defaults)
- 3D P1 → 3D P2 → 3D P3 → 3D P4
- 3D P2 → 3D P5
- 3D P3 → 3D P6 → 3D P7 → 3D P8
- Show P1 → Show P2 → Show P3
- Theme P1 → Theme P2

## Suggested “one-shot” agent tickets (copy/paste)

Use each phase doc as a ticket. If you need even smaller slices, split within a phase by file ownership:

- Shared-only changes
- TV-only integration
- Phone-only integration
- Server/engine changes
