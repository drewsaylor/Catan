# Phase 3: Polish

Additional sounds that add flavor and completeness to the experience.

## Target Directory

```
apps/server/public/shared/assets/sfx/
```

## Sounds to Find (11 total)

| Filename | Game Event | WoW Sound Description |
|----------|------------|----------------------|
| `monopoly.mp3` | Monopoly card played | Auction / market sound |
| `year-of-plenty.mp3` | Year of Plenty played | Quest added / bonus |
| `road-building.mp3` | Road Building played | Mining / construction |
| `steal-success.mp3` | Successfully stole a card | Rogue shadow strike / pickpocket |
| `steal-fail.mp3` | Failed to steal (no cards) | No mana / ability fail |
| `discard.mp3` | Discarding cards (7 roll) | Throw item / discard |
| `collect.mp3` | Collecting resources | Item pickup / loot |
| `turn-nudge.mp3` | Slow player reminder | Ship bell / chime |
| `event-ended.mp3` | Party event expired | Tutorial popup dismiss |
| `segment-start.mp3` | Game segment transition | Group finder alert |
| `dev-buy.mp3` | Bought a dev card | Parchment / paper sound |

## Instructions

### Step 1: Search for WoW Sounds

Use web search to find World of Warcraft sound effect resources. Good search terms:
- "World of Warcraft rogue sounds"
- "WoW item pickup sound"
- "WoW auction house sounds"
- "WoW notification sounds"

### Step 2: Find Specific Sounds

For each sound, search for the WoW equivalent:

1. **monopoly.mp3** - Search: "WoW auction house gavel", "WoW gold transaction"
2. **year-of-plenty.mp3** - Search: "WoW quest accepted sound", "WoW bonus reward"
3. **road-building.mp3** - Search: "WoW mining sound", "WoW garrison building"
4. **steal-success.mp3** - Search: "WoW rogue pickpocket", "WoW shadow strike"
5. **steal-fail.mp3** - Search: "WoW not enough mana", "WoW ability fail"
6. **discard.mp3** - Search: "WoW delete item sound", "WoW throw away"
7. **collect.mp3** - Search: "WoW item pickup sound", "WoW loot collected"
8. **turn-nudge.mp3** - Search: "WoW bell chime", "WoW ship bell notification"
9. **event-ended.mp3** - Search: "WoW tutorial dismiss", "WoW popup close"
10. **segment-start.mp3** - Search: "WoW dungeon finder pop", "WoW group ready"
11. **dev-buy.mp3** - Search: "WoW scroll open sound", "WoW parchment paper"

### Step 3: Download Files

Download each sound file to the target directory:
```
apps/server/public/shared/assets/sfx/{filename}
```

### Step 4: Verify

1. Check files exist:
   ```bash
   ls -la apps/server/public/shared/assets/sfx/
   ```

2. Test in browser:
   - Start dev server: `npm run dev`
   - Open TV view and play a full game
   - Verify all sound effects trigger appropriately

## Completion Checklist

- [ ] `monopoly.mp3` - Downloaded and working
- [ ] `year-of-plenty.mp3` - Downloaded and working
- [ ] `road-building.mp3` - Downloaded and working
- [ ] `steal-success.mp3` - Downloaded and working
- [ ] `steal-fail.mp3` - Downloaded and working
- [ ] `discard.mp3` - Downloaded and working
- [ ] `collect.mp3` - Downloaded and working
- [ ] `turn-nudge.mp3` - Downloaded and working
- [ ] `event-ended.mp3` - Downloaded and working
- [ ] `segment-start.mp3` - Downloaded and working
- [ ] `dev-buy.mp3` - Downloaded and working

## Notes

- These are lower priority but add polish to the experience
- Some sounds may be harder to find exact matches for
- Acceptable to use similar sounds from:
  - Other Blizzard games
  - Generic fantasy/RPG game sounds
  - Creative Commons sound libraries
- Keep all files small (< 100KB each)
- All sounds should be < 3 seconds duration
