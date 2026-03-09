# Phase 2: Major Moments

Special event sounds that make big gameplay moments feel epic.

## Target Directory

```
apps/server/public/shared/assets/sfx/
```

## Sounds to Find (5 total)

| Filename | Game Event | WoW Sound Description |
|----------|------------|----------------------|
| `dev-card.mp3` | Dev card played (generic) | Magic cast / spell sound |
| `knight.mp3` | Knight card played | Warrior attack / charge |
| `largest-army.mp3` | Largest Army awarded | PVP / battle fanfare |
| `longest-road.mp3` | Longest Road awarded | Achievement gained |
| `event-drawn.mp3` | Party mode event starts | Level up sound |

## Instructions

### Step 1: Search for WoW Sounds

Use web search to find World of Warcraft sound effect resources. Good search terms:
- "World of Warcraft spell sounds"
- "WoW achievement sound effect"
- "WoW level up sound mp3"
- "WoW warrior sounds"

### Step 2: Find Specific Sounds

For each sound, search for the WoW equivalent:

1. **dev-card.mp3** - Search: "WoW spell cast sound", "WoW magic cast effect"
2. **knight.mp3** - Search: "WoW warrior charge sound", "WoW sword swing attack"
3. **largest-army.mp3** - Search: "WoW battleground victory", "WoW PVP fanfare"
4. **longest-road.mp3** - Search: "WoW achievement unlocked sound", "WoW achievement ding"
5. **event-drawn.mp3** - Search: "WoW level up sound", "WoW ding level"

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
   - Open TV view and play a game
   - Test dev card purchases and special awards

## Completion Checklist

- [ ] `dev-card.mp3` - Downloaded and working
- [ ] `knight.mp3` - Downloaded and working
- [ ] `largest-army.mp3` - Downloaded and working
- [ ] `longest-road.mp3` - Downloaded and working
- [ ] `event-drawn.mp3` - Downloaded and working

## Notes

- These sounds should feel impactful and celebratory
- Slightly longer sounds (1-2 seconds) are acceptable for achievements
- If a specific WoW sound can't be found, acceptable alternatives:
  - Hearthstone card/achievement sounds
  - Diablo legendary drop sounds
  - Generic fantasy RPG achievement sounds
