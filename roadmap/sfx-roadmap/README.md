# SFX Roadmap

World of Warcraft sound effects implementation for Catan LAN game.

## Overview

This roadmap breaks down the 25 game sounds into 3 phases, prioritized by gameplay impact. Each phase is a self-contained plan that Claude Code can execute in a separate conversation.

## Current State

The code infrastructure is already in place:
- `SOUND_LIBRARY` in `audio.js` has URLs configured for all 25 sounds
- `tv.js` and `phone.js` have `playSfx()` calls wired up
- The system gracefully falls back to synthesized sounds when files are missing
- Target directory: `apps/server/public/shared/assets/sfx/`

## Phases

| Phase | Name | Sounds | Priority |
|-------|------|--------|----------|
| 1 | [Essential](phase-1-essential.md) | 9 | High - Core gameplay |
| 2 | [Major Moments](phase-2-major-moments.md) | 5 | Medium - Special events |
| 3 | [Polish](phase-3-polish.md) | 11 | Low - Nice-to-have |

## How to Execute a Phase

1. Open a new Claude Code conversation
2. Say: "Execute the plan in `roadmap/sfx-roadmap/phase-N-*.md`"
3. Claude will use web search to find appropriate WoW sounds
4. Files will be downloaded to `apps/server/public/shared/assets/sfx/`

## Technical Requirements

- Format: MP3 (preferred) or OGG
- Duration: < 3 seconds (most sounds)
- Volume: Normalized, not too loud
- License: For personal/educational use only

## Progress Tracking

- [ ] Phase 1: Essential (9 sounds)
- [ ] Phase 2: Major Moments (5 sounds)
- [ ] Phase 3: Polish (11 sounds)
