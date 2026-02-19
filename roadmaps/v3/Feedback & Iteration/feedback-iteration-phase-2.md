# Feedback & Iteration — Phase 2: Session Analytics (Privacy-Friendly) (P1)

## Goal
Track basic session analytics (game duration, player count, completion rate, error paths) locally without collecting PII.

## Non-goals
- No external analytics services.
- No user tracking across sessions.
- No personally identifiable information.

## Player-facing outcomes
- No visible changes (analytics are invisible to players).
- Privacy-friendly: all data stays on host device.

## Technical plan
### Server
- Create analytics storage module:
  - Store analytics in `DATA_DIR/analytics/` as JSON files.
  - Filename format: `session-{timestamp}-{roomId}.json`
- Track session events:
  - Game start (timestamp, player count)
  - Game end (timestamp, completion status, winner)
  - Error events (error type, context, no stack traces with paths)

### Engine
- Emit analytics events at key moments:
  - `gameStarted` — when game transitions from lobby to play
  - `gameEnded` — when game reaches victory condition
  - `gameAbandoned` — when game is left incomplete
  - `errorOccurred` — when recoverable errors happen

### TV
- No changes required (analytics handled server-side).

### Phone
- Log client-side errors to server (sanitized, no PII).

### Shared
- Define analytics event shapes:
  ```json
  {
    "sessionId": "random-uuid",
    "events": [
      {
        "type": "gameStarted",
        "timestamp": "2024-01-15T12:00:00Z",
        "data": { "playerCount": 4 }
      },
      {
        "type": "gameEnded",
        "timestamp": "2024-01-15T12:40:00Z",
        "data": { "completed": true, "durationSeconds": 2400 }
      }
    ]
  }
  ```
- Create analytics event emitter utility.
- Ensure no PII in any event data.

## APIs & data shape changes
- New endpoint: `POST /api/analytics/event`
- New data directory: `DATA_DIR/analytics/`

## Acceptance criteria
- Game duration tracked accurately.
- Player count recorded at game start.
- Completion vs. abandonment tracked.
- Error events logged with context (no stack traces with file paths).
- All data stored locally in DATA_DIR/analytics/.
- No PII in analytics data.

## Manual test scenarios
1) Complete a game → verify session JSON created with duration and completion.
2) Abandon a game → verify abandonment recorded.
3) Trigger an error → verify error logged without PII.
4) Check analytics JSON → verify no identifying information.

## Risk & rollback
- Risk: Analytics may impact performance.
- Rollback: Disable analytics via config flag; keep code but stop recording.
