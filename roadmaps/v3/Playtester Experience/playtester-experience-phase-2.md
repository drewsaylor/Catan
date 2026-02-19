# Playtester Experience — Phase 2: Game Feel Improvements (P1)

## Goal

Polish key game moments with better victory celebration, sound effects, and smoother turn transitions.

## Non-goals

- No accessibility changes (Phase 3).
- No new gameplay features.
- No visual asset changes (handled in Asset Quality track).

## Player-facing outcomes

- Victory is celebrated with satisfying visual + audio feedback.
- Key moments have sound effects (dice roll, build, trade).
- Turn transitions feel smooth and clear.

## Technical plan

### Server

- No changes required.

### Engine

- No changes required.

### TV

- Victory screen polish:
  - Winner highlight animation
  - Confetti or particle effect (respects reduced motion)
  - Victory sound effect
- Turn transition improvements:
  - Smoother visual transition between players
  - Brief "Player X's turn" announcement

### Phone

- Sound effects for:
  - Dice roll (short, satisfying)
  - Successful build (placement sound)
  - Trade completed (confirmation sound)
  - Resource received (collection sound)
- Mute button / volume control in settings.
- Haptic feedback on key moments (complements Phase 1 interaction polish).

### Shared

- Create sound effect system:
  - `playSound(soundId)` — play a sound effect
  - `setSoundVolume(level)` — global volume control
  - `isSoundEnabled()` — check mute state
- Sound effects library:
  - dice-roll.mp3 / .ogg
  - build-success.mp3 / .ogg
  - trade-complete.mp3 / .ogg
  - resource-collect.mp3 / .ogg
  - victory.mp3 / .ogg
- Sounds preloaded during game init.
- Respect user's sound/mute preferences.

## APIs & data shape changes

- Client settings add:
  - `soundEnabled: boolean` (default true)
  - `soundVolume: number` (0-1, default 0.7)

## Acceptance criteria

- Victory screen has visual + audio celebration.
- Sound effects play for dice roll, build, trade.
- Sounds respect mute setting.
- Turn transitions are visually smooth.
- Reduced motion mode disables visual effects but keeps audio.

## Manual test scenarios

1. Win a game → verify victory celebration plays (visual + sound).
2. Roll dice → hear dice roll sound.
3. Build a settlement → hear build sound.
4. Complete a trade → hear trade sound.
5. Mute sounds → verify no audio plays.
6. Enable reduced motion → verify celebration audio plays but confetti is disabled.

## Risk & rollback

- Risk: Sounds may be annoying or too loud.
- Risk: Audio may not work on all devices.
- Rollback: Default sounds to off; ensure graceful degradation if audio fails.
