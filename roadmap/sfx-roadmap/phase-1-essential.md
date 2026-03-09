# Phase 1: Essential Sounds

Core gameplay sounds that fire frequently and define the game feel.

## Target Directory

```
apps/server/public/shared/assets/sfx/
```

## Sounds to Find (9 total)

| Filename | Game Event | WoW Sound Description | Priority |
|----------|------------|----------------------|----------|
| `dice.mp3` | Rolling dice | Dice roll / gambling sound | Critical |
| `turn.mp3` | Turn start notification | Ready check or turn alert | Critical |
| `build.mp3` | Building placed | Blacksmithing / construction | Critical |
| `trade.mp3` | Trade completed | Coin / loot sound | Critical |
| `robber.mp3` | Robber moved | Stealth / sneaky sound | Critical |
| `win.mp3` | Game victory | Quest completed fanfare | Critical |
| `ui-tick.mp3` | UI selection | Button click | High |
| `ui-confirm.mp3` | UI confirmation | Epic loot toast | High |
| `ui-bonk.mp3` | UI error/rejection | Error bonk | High |

## Instructions

### Step 1: Search for WoW Sounds

Use web search to find World of Warcraft sound effect resources. Good search terms:
- "World of Warcraft sound effects download"
- "WoW UI sounds mp3"
- "WoW quest complete sound"
- "wowhead sound files"

### Step 2: Find Specific Sounds

For each sound, search for the WoW equivalent:

1. **dice.mp3** - Search: "WoW gambling dice roll sound", "WoW darkmoon faire dice"
2. **turn.mp3** - Search: "WoW ready check sound", "WoW queue pop sound"
3. **build.mp3** - Search: "WoW blacksmithing sound", "WoW construction build sound"
4. **trade.mp3** - Search: "WoW trade complete sound", "WoW coins gold sound"
5. **robber.mp3** - Search: "WoW stealth sound", "WoW rogue vanish sound"
6. **win.mp3** - Search: "WoW quest complete fanfare", "WoW achievement sound"
7. **ui-tick.mp3** - Search: "WoW button click sound", "WoW UI click"
8. **ui-confirm.mp3** - Search: "WoW epic loot sound", "WoW legendary drop sound"
9. **ui-bonk.mp3** - Search: "WoW error sound", "WoW cant do that sound"

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
   - Verify sounds play on relevant actions

## Completion Checklist

- [ ] `dice.mp3` - Downloaded and working
- [ ] `turn.mp3` - Downloaded and working
- [ ] `build.mp3` - Downloaded and working
- [ ] `trade.mp3` - Downloaded and working
- [ ] `robber.mp3` - Downloaded and working
- [ ] `win.mp3` - Downloaded and working
- [ ] `ui-tick.mp3` - Downloaded and working
- [ ] `ui-confirm.mp3` - Downloaded and working
- [ ] `ui-bonk.mp3` - Downloaded and working

## Notes

- If a specific WoW sound can't be found, acceptable alternatives:
  - Other Blizzard games (Hearthstone, Diablo, Overwatch)
  - Generic fantasy game sounds
- Keep files small (< 100KB each ideally)
- Sounds should be short clips (< 3 seconds)
