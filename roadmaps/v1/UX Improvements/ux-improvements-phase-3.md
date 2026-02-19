# UX Improvements — Phase 3: Post-Game Stats + Rematch (P1)

**Status:** Completed (2026-02-14)

## Goal
Add a clean “session loop”: game ends cleanly and can restart without rejoining.

## Player-facing outcomes
- TV end screen: “Play again” (same room) + “New room”.
- Phones show winner + VP breakdown, and can rejoin rematch automatically.

## Technical plan
### Server
- Implemented `POST /api/rooms/:code/rematch` (host-only):
  - resets game state
  - keeps players and room settings

### TV/Phone
- TV shows “Play again” + “New room” after game over.
- Phones show winner + VP breakdown after game over.
- Host sees “Play again”; others show “waiting for host”.

## Acceptance criteria
- Rematch does not require players to rejoin.

## Risk & rollback
- Risk: state reset bugs.
- Rollback: implement “New room” first, rematch later.
