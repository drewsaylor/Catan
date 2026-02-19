# Security & Abuse Controls — Phase 1: Input Limits + Safer Defaults (P0)

> Status: ✅ Completed (2026-02-12)

## Goal
Reduce risk from malformed requests and accidental endpoint spam.

## Technical plan
### Server
- Limit JSON request body size (e.g. 64KB).
- Reject control chars in `playerName`.
- Validate IDs and action payload shapes.
- Add basic rate limiting per IP for join + action.

## Acceptance criteria
- Oversized requests get a clear 413/400.
- Flooding join/action gets throttled.

## Risk & rollback
- Risk: false positives on shared Wi‑Fi.
- Rollback: tune bucket sizes and exempt localhost.
