# Asset Integration — Phase 6: Awards (P2)

## Goal

Add visual indicators for longest road, largest army, and victory point awards.

## Non-goals

- No animated award effects
- No award history tracking
- No sound effects for awards

## Player-facing outcomes

- Players with longest road show a road trophy badge
- Players with largest army show a military trophy badge
- Victory point breakdown shows clear iconography

## Technical plan

### Server

- No changes required

### Engine

- No changes required

### TV

- **Player panel**: Add award badges to player cards
  - Check `game.awards.longestRoadPlayerId`
  - Check `game.awards.largestArmyPlayerId`
  - Display corresponding icon badge
- **End-game summary**: Show awards with icons

### Phone

- **Player list**: Add small award indicators
- **VP breakdown** (phone.js:2335-2336): Replace "LR +2" / "LA +2" with icon + text

### Shared

- **Verify/regenerate award icons**:
  - `award-longest-road.png` - Winding road emblem
  - `award-largest-army.png` - Crossed swords emblem
  - Consider: `award-victory-point.png` for hidden VP cards

### Data References

- `vp-breakdown.js:44-45`: Determines award holders
- `phone.js:2327-2328`: VP breakdown display
- `phone.js:3581`: Largest army player check

## APIs & data shape changes

- No API changes
- `game.awards.longestRoadPlayerId` already exists
- `game.awards.largestArmyPlayerId` already exists

## Acceptance criteria

- [ ] Longest road holder shows badge on TV player card
- [ ] Largest army holder shows badge on TV player card
- [ ] Phone VP breakdown shows award icons
- [ ] Icons are distinct from each other
- [ ] Awards update when holder changes

## Manual test scenarios

1. Build longest road → verify badge appears on player card
2. Play most knights → verify army badge appears
3. Lose longest road to another player → verify badge moves
4. Check VP breakdown → verify icons display

## Risk & rollback

- **Risk**: Badges may clutter player cards
- **Risk**: Awards may be hard to see on small screens
- **Rollback**: Keep text-only award indicators
