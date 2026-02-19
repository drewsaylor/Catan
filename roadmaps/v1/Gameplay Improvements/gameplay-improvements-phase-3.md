# Gameplay Improvements — Phase 3: Party-Safe Social + Trade Enhancements (P2)

## Status

- Complete (2026-02-14)

## Goal

Add lightweight “party vibe” social signals and trade QoL without moderation risk.

## Non-goals

- No free text chat.
- No off-LAN play or accounts.

## Player-facing outcomes

- Players can emote quickly (“Nice!”, “Ouch”, “GG”) without disrupting turns.
- Current player can repeat/suggest trade offers quickly.

## Shipped in this phase

- **Emotes (no chat)**: fixed emote set (`Nice!`, `Ouch`, `GG`) from phones, broadcast to TV as toasts.
- **Host toggle**: emotes can be disabled per-room (`settings.houseRules.emotesEnabled`).
- **Trade QoL**: phone Trade panel adds “Suggest” and “Repeat last” to prefill offers (still validated by server on send).

## Technical plan

### Server

- Add optional emote broadcast event (no persistence required).

### Phone

- Emote button strip (host can disable).
- Trade: “Repeat last offer” and “Suggest” (client-only heuristic).

### TV

- Show emote toasts in show layer.

## APIs & data shape changes

- `POST /api/rooms/:code/emote` `{ playerId, emote }` (emote is one of `nice|ouch|gg`).
- SSE event `emote`: `{ at, playerId, name, color, emote }`.

## Acceptance criteria

- Emotes are non-blocking and never reveal hidden info.
- Trade suggestions never bypass server validation.

## Manual test scenarios

1. Spam emotes during reconnect; UI remains stable.
2. Suggest offer with insufficient cards; server rejects, phone explains.

## Risk & rollback

- Risk: spam annoyance.
- Rollback: adjust cooldown and/or host disable.
