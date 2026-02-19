# Gameplay Improvements — Phase 2: House Rules & Room Settings (P1)

## Status
- Complete (2026-02-13)

## Goal
Allow the host to configure a small set of **room house rules** (custom VP target, timer nudges, trade toggles) without UI clutter.

## Non-goals
- No deep rules variants or multiple board types.
- No persistent player profiles.

## Player-facing outcomes
- Host can set a custom VP target and see “Mode: Custom” clearly on TV.
- Quick Game remains simple; “Advanced” is optional.

## Shipped in this phase
- **House rules plumbing**: `room.houseRules` persisted and exposed in room snapshots as `settings.houseRules`.
- **Host-only API**: `POST /api/rooms/:code/houseRules` `{ playerId, houseRules }`.
- **Victory target override**: `victoryPointsToWin` supports `6–15` and is resolved into `game.settings` (and `game.victoryPointsToWin`).
- **Phone lobby**: host sees an “Advanced” section with a “VP to win” selector.
- **TV lobby**: Mode label shows `Classic / Quick / Custom` (custom when any override is set).

## Notes / follow-ups
- Timer nudges + trade toggles are **not implemented yet**, but the `houseRules` shape is ready for additional fields.

## Technical plan
### Server
- Add `room.houseRules` persisted.
- Add `POST /api/rooms/:code/houseRules` `{ playerId, houseRules }` (host-only).
- Pass `houseRules` into `createNewGame`.

### Engine
- Extend `createNewGame({ ..., houseRules })`.
- Store resolved settings in `game.settings`.
- Support overrides:
  - `victoryPointsToWin` (6–15)

### TV/Phone
- Lobby host controls: collapsed “Advanced” settings.
- TV shows `Classic / Quick / Custom` derived from overrides.

## APIs & data shape changes
- Room public snapshot: add `settings: { gameMode, houseRules? }`.
- Game snapshot: add `settings` (resolved).

## Acceptance criteria
- Host can configure custom VP=6 and game ends appropriately.
- Settings persist across restart and are visible on TV.

## Manual test scenarios
1) Create room, set custom VP=6, start, confirm early win triggers.
2) Quick mode plus custom nudges (when implemented) behaves predictably.

## Risk & rollback
- Risk: settings creep / UI overload.
- Rollback: keep server storage but hide UI behind “Advanced” toggle.
