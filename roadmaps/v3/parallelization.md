# V3 Parallelization (Dependencies + What Can Be Done Together)

This doc maps the V3 phases into parallel workstreams. Goal: multiple agents can work without stepping on each other by agreeing on **contracts** first.

## Key contracts (agree first; enables parallel work)

### Contract A — "Feedback Storage" API

A server-side module handles feedback and analytics storage:

- Input: feedback object or analytics event
- Output: saved to DATA_DIR/{feedback,analytics}/
- Validation: rating 1-5, text max 1000 chars, no PII

**Why:** lets feedback collection and analytics run in parallel with shared storage.

### Contract B — "Hints System" API

A shared hints system for first-time player guidance:

- `showHint(hintId, message, options)` — display hint once
- `dismissHint(hintId)` — mark as seen
- `hasSeenHint(hintId)` — check if already shown
- Storage: session storage (resets on refresh)

**Why:** lets playtester guidance work independently of other UI changes.

### Contract C — "Sound System" API

A shared sound effect system:

- `playSound(soundId)` — play a sound
- `setSoundVolume(level)` — volume control
- `isSoundEnabled()` — mute state
- Preloading during game init

**Why:** lets game feel improvements happen independently.

### Contract D — "Asset Loading" API

A shared asset loading manager:

- `preloadAssets(assetList)` — load critical assets early
- `lazyLoadAsset(assetPath)` — load on demand
- WebP support with PNG fallback

**Why:** lets performance work happen independently of asset creation.

## Workstreams (parallel-ready)

### Stream 1 — Feedback & Iteration (Priority for today's playtest)

- Phase 1 (Feedback Collection) should be completed first.
- Phase 2 (Analytics) can proceed after Phase 1's storage is stable.
- Phase 3 (Reports) can proceed after Phase 2 data is being collected.

### Stream 2 — Playtester Experience

- Phase 1 (First-Time Guidance) can start immediately.
- Phase 2 (Game Feel) can proceed after hints system is stable.
- Phase 3 (Accessibility) can proceed anytime after Phase 1.

### Stream 3 — Performance & Feel

- Phase 1 (Interaction Polish) can start immediately.
- Phase 2 (Memory & Load Time) can proceed in parallel with Phase 1.
- Phase 3 (3D Performance) can proceed after Phase 2's asset loading is stable.

### Stream 4 — Asset Quality

- Phase 1 (Resource & UI Icons) can start immediately (pure asset work).
- Phase 2 (Board Textures) can proceed after Phase 1 establishes workflow.
- Phase 3 (Structure & Badge) can proceed after Phase 2 establishes texture workflow.

## Dependency graph (high level)

```
Feedback P1 → Feedback P2 → Feedback P3
     ↓
(unblocks analytics data for reports)

Playtester P1 → Playtester P2 → Playtester P3
     ↓
(hints system enables game feel work)

Performance P1 ─┬─→ Performance P3
Performance P2 ─┘
     ↓
(asset loading enables 3D performance)

Asset P1 → Asset P2 → Asset P3
(pure asset pipeline, minimal code deps)
```

## Recommended order for today's playtest

**Critical path (must do):**

1. Feedback & Iteration — Phase 1 (collect feedback)
2. Playtester Experience — Phase 1 (first-time guidance)

**Nice to have (if time permits):** 3. Performance & Feel — Phase 1 (interaction polish) 4. Asset Quality — Phase 1 (visual refresh)

## Suggested "one-shot" agent tickets

Use each phase doc as a ticket. For smaller slices, split by:

- Server-only changes
- Shared utilities
- TV-only integration
- Phone-only integration
- Pure asset generation
