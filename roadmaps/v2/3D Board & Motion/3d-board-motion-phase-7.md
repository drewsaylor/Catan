# 3D Board & Motion — Phase 7: Dice + Resource Flyouts + Board FX (P1)

## Goal

Make the board feel alive during the core loop: 3D dice roll, resource payout flyouts, and tasteful FX for key moments.

## Non-goals

- No cinematic camera sweeps yet (Phase 8).
- No heavy post-processing required.

## Player-facing outcomes

- Dice roll feels like an event.
- When resources pay out, it’s obvious who got what (without revealing hidden info incorrectly).
- Selectable highlights feel premium (glow/pulse).

## Technical plan

### Server

- No changes required; client can detect dice roll from state/log changes.

### Engine

- No changes.

### TV

- Dice:
  - 3D dice in the dice panel area or as a short overlay.
- Resource payouts:
  - Show “resource chips” flying from producing hexes to each player’s UI row (aggregate counts; never show private totals beyond what is already allowed).

### Phone

- Dice:
  - Keep lighter weight: either simple 3D dice or a short 2D overlay synced to roll.
- Resource payouts:
  - Optional: subtle “+N” toasts; avoid clutter.

### Shared

- Add an FX helper:
  - pulse/selectable material
  - one-shot particle bursts (very small)
- Moment detection (decision complete for v2):
  - Use shared diffing (or a small local diff) to detect:
    - `diceRolled`
    - `buildPlaced`
    - `robberMoved`
    - `tradeAccepted`
  - Trigger FX accordingly.

## APIs & data shape changes

- None.

## Acceptance criteria

- Dice animation never blocks gameplay actions.
- Resource flyouts don’t leak hidden information.
- FX respect reduced motion (disable movement; keep subtle fades if needed).

## Manual test scenarios

1. Roll dice repeatedly; dice animation doesn’t stack or lag.
2. Resource payout to multiple players on a 6/8-heavy board; TV remains readable.
3. Reduced motion on: dice + payouts become minimal (no motion), still clear.

## Risk & rollback

- Risk: visual clutter, especially on phones.
- Rollback: ship TV-only flyouts first; phones get only toasts.
