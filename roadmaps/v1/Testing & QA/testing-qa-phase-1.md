# Testing & QA — Phase 1: Engine Test Expansion (P0)

## Status

- Complete (2026-02-12)

## Goal

Expand deterministic engine tests to cover the most breakable rules.

## Technical plan

### Engine tests (`packages/game-engine/*.test.js`)

- Add tests for:
  - robber 7 flow transitions and hints
  - bank trade ratios (4:1, 3:1, 2:1)
  - VP win condition (including hidden VP interactions)
  - trade offer legality and expiry
  - piece limits (new)

## Acceptance criteria

- `node --test` covers core gameplay invariants.
