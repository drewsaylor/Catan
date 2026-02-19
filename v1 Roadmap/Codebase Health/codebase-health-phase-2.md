# Codebase Health — Phase 2: Unified Error Handling + Action Gate Helpers (P1)

**Status:** Completed (2026-02-14)

## Goal
Centralize error handling and gating reasons so UX copy is consistent.

## Technical plan
- Add shared mapping: server error codes → user-facing copy (party-game tone).
- Add shared helpers for action gating (“can I do X?”) to reduce drift between server/engine/UI.

## Acceptance criteria
- Most action failures show consistent, actionable messages.
