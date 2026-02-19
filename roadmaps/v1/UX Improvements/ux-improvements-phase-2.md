# UX Improvements — Phase 2: Coach System v2 (“Why can’t I?”) (P1)

**Status:** Completed (2026-02-13)

## Goal
Replace “silent disabled buttons” with clear, one-line reasons.

## Player-facing outcomes
- Every blocked action explains why:
  - Not your turn
  - Need to roll first
  - No resources
  - Illegal placement
  - Out of pieces

## Technical plan
### Shared
- Add an error-code → user copy mapping module.

### Phone
- When server rejects an action, show an actionable toast and update “Primary action” hint.

## Acceptance criteria
- Players don’t need rules coaching to understand why an action failed.

## Risk & rollback
- Risk: inconsistent messaging.
- Rollback: centralize mapping and remove one-off toasts.
