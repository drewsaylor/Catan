# Show & Pacing — Phase 3: Attract Mode + Tutorial Shorts + Highlight Reel (P2)

## Goal
Add Jackbox-like “TV attract mode” and bite-sized tutorials so the room always knows how to start and what to do.

## Non-goals
- No long tutorial.
- No video assets required.

## Player-facing outcomes
- When no room is active, TV loops an attract screen:
  - animated 3D board + water
  - “Scan to join” / “Create room”
- Optional quick tips appear during lobby/setup.

## Technical plan
### Server
- No changes.

### Engine
- No changes.

### TV
- Idle detection (no room or no players) triggers attract loop.
- A small “tip carousel” in lobby:
  - 3–6 simple tips keyed to current phase.

### Phone
- Optional: first-join “2 tap tutorial” for pan/zoom + tap highlights.

### Shared
- A tips catalog keyed by context:
  - lobby
  - setup
  - robber
  - trading

## APIs & data shape changes
- None.

## Acceptance criteria
- Attract mode never blocks creating/joining a room.
- Tips are dismissible and don’t spam.

## Manual test scenarios
1) Leave TV open for 5 minutes with no room: attract mode appears.
2) Create room: attract mode exits immediately.
3) Join phones: tips don’t block ready/start.

## Risk & rollback
- Risk: attract loop adds complexity and bugs.
- Rollback: ship a static attract screen first, then animate later.
