# Party Modes & Variety — Phase 1: Scenario Presets v2 (Curated “Pick & Play”) (P1)

## Status (Implemented)
Implemented on 2026-02-14.

## Goal
Let the host start a fun session instantly by choosing from curated presets that bundle rules + board + pacing.

## Non-goals
- No new expansions rules.
- No complicated per-knob tuning UI; use presets.

## Player-facing outcomes
- Host chooses a scenario on TV:
  - Classic
  - Quick (already exists; tune for V2)
  - Trader’s Paradise (trade-forward)
  - High Conflict (more 7s / robber pressure) (careful with balance)
- Scenario auto-selects a theme (optional) to match vibe.

## Technical plan
### Server
- Add a `scenarios` list (static JSON) with:
  - preset board id/seed
  - gameMode
  - victoryPointsToWin override
  - house rules toggles
  - themeId
- Enforce host-only scenario changes before game start.

### Engine
- No changes required beyond existing mode/house rules support.
- If adding new knobs, they must be validated centrally.

### TV
- Add “Scenario” picker on room creation/start screen.
- Show a short 1–2 line description for each scenario.

### Phone
- Show scenario name + 1-line “rules summary” in lobby.

### Shared
- Helpers for rendering scenario summaries safely (no huge copy blocks).

## APIs & data shape changes
- Room settings add:
  - `settings.scenarioId` (string)
- Server provides:
  - `GET /api/scenarios` (or static `/scenarios.json`)
  - `POST /api/rooms/:code/settings` supports `{ scenarioId }`

## Acceptance criteria
- A scenario can be selected and reliably applies settings to the game start.
- Players can see “what mode are we in?” at a glance.

## Manual test scenarios
1) Start Classic scenario: baseline behavior unchanged.
2) Start Quick scenario: pacing nudges still work; setup assist correct.
3) Switch scenario pre-start with 4+ players: no desync.

## Risk & rollback
- Risk: too many knobs cause bugs.
- Rollback: ship 2–3 scenarios only; expand later.
