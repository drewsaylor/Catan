# Reliability Improvements — Overview

## Goals

- Prevent double-actions on poor Wi‑Fi.
- Make reconnects deterministic.
- Ensure persistence does not corrupt state.

## Phases

- Phase 1 (P0): Room revisions + stale update protection
- Phase 2 (P0): Action idempotency
- Phase 3 (P1): Persistence hardening + pruning
