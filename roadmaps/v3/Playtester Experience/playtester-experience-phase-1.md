# Playtester Experience — Phase 1: First-Time Player Guidance (P0)

## Goal
Make the game accessible to first-time players through contextual guidance, quick reference overlays, and clearer turn indicators.

## Non-goals
- No sound effects (Phase 2).
- No victory celebration polish (Phase 2).
- No accessibility audit (Phase 3).

## Player-facing outcomes
- "How to play" quick reference overlay available on phone.
- Contextual hints appear during first game (dismissible).
- "Your turn" indicator is unmistakably clear.

## Technical plan
### Server
- Track "first game" state per player session (not persistent, just current session).

### Engine
- No changes required.

### TV
- Display clearer current-player indicator (highlight, animation, name callout).
- Show brief action hints when appropriate (e.g., "Roll dice to start your turn").

### Phone
- Add "How to play" button that opens quick reference overlay.
- Quick reference includes:
  - Turn flow (roll → trade → build → end turn)
  - Resource types and what they build
  - Winning condition (10 VP)
- Implement contextual hints system:
  - First roll: "Tap the dice to roll"
  - First build opportunity: "You can build a road here"
  - First trade: "Propose a trade with other players"
- Hints dismissible and don't repeat after first occurrence.
- "Your turn" notification is prominent (toast, color change, haptic).

### Shared
- Create a hints system:
  - `showHint(hintId, message, options)` — display hint once
  - `dismissHint(hintId)` — mark as seen
  - `hasSeenHint(hintId)` — check if already shown
- Store hint state in session storage (resets on refresh).
- Create quick reference content module with game rules summary.

## APIs & data shape changes
- No API changes.
- Session storage keys for hint state.

## Acceptance criteria
- Quick reference overlay accessible from phone UI.
- Contextual hints appear at appropriate moments during first game.
- Hints don't repeat after dismissal.
- "Your turn" indicator is immediately obvious.
- Hints work with reduced motion (no distracting animations).

## Manual test scenarios
1) New player joins → during first turn, sees contextual hints.
2) Open quick reference → verify rules summary is clear and complete.
3) Dismiss a hint → verify it doesn't reappear.
4) Watch another player's turn → verify "your turn" indicator when it becomes their turn.
5) Enable reduced motion → verify hints still appear but without animation.

## Risk & rollback
- Risk: Hints may be intrusive or annoying.
- Rollback: Add "disable hints" toggle in settings; default hints off.
