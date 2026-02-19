# Party Modes & Variety — Phase 2: Party Variants (Event Deck + Speed Rounds) (P2)

## Goal

Add optional variants that create memorable “party moments” while keeping rules safe and understandable.

## Non-goals

- No free text chat.
- No competitive ranked play or matchmaking.

## Player-facing outcomes

Optional toggles/presets:

- **Event deck (lightweight):** occasional global events that are clear and fast.
- **Speed trade round:** a short timed segment where everyone can accept trades quickly (no negotiation UI overhaul required).

## Technical plan

### Server

- If events affect hidden info, server must be source of truth.
- Add clear logging for each event.

### Engine

- Define a minimal event system:
  - deterministic draw order (seeded)
  - explicit legality checks
- Keep events simple, e.g.:
  - “Market Boom: once this round, bank trades are 3:1” (clear and reversible)
  - “Road Work: roads cost -1 wood this turn” (careful; impacts balance)

### TV

- Show event announcement as a moment card with short explanation and a timer if needed.

### Phone

- Show a concise event banner on relevant panels.

### Shared

- Ensure events integrate with moment detection for pacing.

## APIs & data shape changes

- Room settings add:
  - `settings.variants.eventDeckEnabled: boolean`
  - `settings.variants.speedTradeEnabled: boolean`

## Acceptance criteria

- Variants never create “stuck” game states.
- Event text is always short and unambiguous.

## Manual test scenarios

1. Enable event deck: play 10+ turns; no repeats spam; no confusion.
2. Enable speed trade: trades still validated server-side; no resource exploits.

## Risk & rollback

- Risk: balance or rules confusion.
- Rollback: ship only one variant first (event deck), keep speed trade as later.
