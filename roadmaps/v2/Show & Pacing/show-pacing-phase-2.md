# Show & Pacing — Phase 2: Host Script + Segment Polish (Text-only Jackbox Pacing) (P1)

## Goal
Make the game feel like it has a “host personality” without needing voice: punchy titles, short quips, and clean segment transitions.

## Non-goals
- No TTS narrator.
- No new game rules.

## Player-facing outcomes
- TV callouts feel more like a show:
  - fun but short text
  - consistent tone
  - clear “what’s next”
- Phones feel coached, not scolded.

## Technical plan
### Server
- No changes.

### Engine
- No changes.

### TV
- Add a “host script” table keyed by moment kind:
  - Turn start: 2–4 variants
  - Dice roll: 2–4 variants
  - 7/robber: clear multi-step headings
  - Build: short celebratory stingers
- Add segment transitions:
  - “Setup” → “Main turns” → “Endgame”
  - Recap moments on end turn (optional, brief)

### Phone
- Add short “What’s next?” copy tied to moment kinds and current expected action.

### Shared
- A `hostCopyForMoment(moment, { audience: "tv"|"phone" })` helper returns:
  - `title`, `subtitle`, optional `tone`

## APIs & data shape changes
- None.

## Acceptance criteria
- Copy stays short and actionable.
- No hidden info leaks (no “You stole ore” style messages).

## Manual test scenarios
1) Roll 7: TV copy clearly indicates discard → move robber → steal.
2) Trade accepted: TV celebrates without exposing amounts beyond what’s already visible.
3) Reduced motion on: transitions still clear (no reliance on movement).

## Risk & rollback
- Risk: too much text becomes noise.
- Rollback: keep only P0 moments (turn, dice, robber, build, win) and cut the rest.
