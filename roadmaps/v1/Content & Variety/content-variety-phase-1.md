# Content & Variety — Phase 1: More Presets + Optional Random Board (P1)

## Status

- Complete (2026-02-14)

## Goal

Increase replayability while keeping lobby choices simple.

## Technical plan

### Engine

- Add 3–5 curated presets (balanced, trade-heavy, etc.).
- Add optional random “balanced-ish” generator:
  - avoids adjacent 6/8 tokens
  - avoids extreme desert placement

### UI

- Lobby keeps selection simple (no huge option list).

## Acceptance criteria

- Presets and randomizer are deterministic given a seed (optional) and don’t create obviously broken boards.
