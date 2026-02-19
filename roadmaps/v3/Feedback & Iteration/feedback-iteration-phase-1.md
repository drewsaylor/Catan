# Feedback & Iteration — Phase 1: Feedback Collection Setup (P0)

## Goal

Implement a simple, non-intrusive feedback collection system that prompts players at game end for optional rating and comments.

## Non-goals

- No analytics tracking (Phase 2).
- No report generation (Phase 3).
- No cloud storage or external services.

## Player-facing outcomes

- At game end, players see an optional "Rate this game" prompt.
- Players can provide 1-5 star rating.
- Players can optionally add text feedback.
- Feedback is stored locally on the host device.

## Technical plan

### Server

- Create feedback storage module:
  - Store feedback in `DATA_DIR/feedback/` as JSON files.
  - Filename format: `feedback-{timestamp}-{roomId}.json`
- Create feedback API endpoint:
  - `POST /api/feedback` — submit feedback
  - Validates input (rating 1-5, text max 1000 chars).

### Engine

- No changes required.

### TV

- After game ends, show brief "Thanks for playing!" message.
- No feedback prompt on TV (feedback collected on phones).

### Phone

- After game ends, show feedback prompt:
  - "How was your experience?" with 1-5 star rating.
  - Optional text field: "Any feedback? (optional)"
  - "Submit" and "Skip" buttons.
- Feedback prompt appears once per player per game.
- Gracefully handle offline (store locally, submit when online).

### Shared

- Define feedback data shape:
  ```json
  {
    "timestamp": "2024-01-15T12:00:00Z",
    "roomId": "abc123",
    "playerId": "player1",
    "rating": 4,
    "comment": "Great game, but trades were confusing",
    "gameStats": {
      "duration": 2400,
      "playerCount": 4,
      "completed": true
    }
  }
  ```
- Create feedback submission utility.
- No PII collected (playerId is session-only identifier).

## APIs & data shape changes

- New endpoint: `POST /api/feedback`
- New data directory: `DATA_DIR/feedback/`

## Acceptance criteria

- Feedback prompt appears at game end on phones.
- Rating (1-5) can be submitted.
- Optional text feedback can be submitted.
- Feedback stored as JSON in DATA_DIR/feedback/.
- Skip option works without submitting anything.
- No PII in stored feedback.

## Manual test scenarios

1. Complete a game → see feedback prompt on phone.
2. Submit 5-star rating with comment → verify saved to DATA_DIR/feedback/.
3. Skip feedback → verify nothing saved.
4. Submit rating without comment → verify saved correctly.
5. Check saved JSON → verify no PII present.

## Risk & rollback

- Risk: Feedback prompt may be annoying.
- Rollback: Make prompt skippable by default; add "don't ask again" option.
