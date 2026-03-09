# Asset Integration — Phase 4: Resources (P1)

## Goal

Regenerate resource icons with proper transparency for compositing over dark UI backgrounds.

## Non-goals

- No animated icons
- No multiple icon variants (just one per resource)
- No SVG versions (PNG only for now)

## Player-facing outcomes

- Resource icons display cleanly over dark chip backgrounds in phone UI
- No white halos or background artifacts
- Icons are recognizable at small sizes (22px)
- Icons work with colorblind accessibility mode

## Technical plan

### Server

- No changes required

### Engine

- No changes required

### TV

- Resource displays use shared icons
- No code changes needed if paths remain the same

### Phone

- **phone/index.html:206-222**: Already references `/shared/icons/{resource}.png`
- `.resChipIcon` class displays at 22x22px
- No code changes needed if paths remain the same

### Shared

- **Regenerate icons** with updated prompts in generate-assets.js:
  ```javascript
  const ICON_STYLE = `Simple game icon, isolated subject on TRANSPARENT background,
  clean edges suitable for compositing, warm earth tones (browns, tans, amber),
  hand-painted Catan board game style, soft painterly brushwork.
  NO background, NO frame, NO medallion - just the object itself centered.
  Simple, iconic, recognizable at small sizes.`;
  ```
- Output: 512x512 PNG with alpha channel
- Files: wood.png, brick.png, sheep.png, wheat.png, ore.png

### Prompt Examples

| Resource | Prompt |
|----------|--------|
| wood | "stack of cut lumber logs, brown wood grain visible" |
| brick | "stack of red clay bricks, terracotta color" |
| sheep | "fluffy white sheep, friendly pastoral look" |
| wheat | "golden wheat sheaf bundle, amber stalks" |
| ore | "grey rock chunks with metallic veins" |

## APIs & data shape changes

- No API changes
- Existing file paths remain the same

## Acceptance criteria

- [ ] All 5 resource icons have transparent backgrounds
- [ ] Icons display cleanly over dark UI chips
- [ ] Icons are recognizable at 22px display size
- [ ] Icons have clean edges (no fringing)
- [ ] Each resource is visually distinct

## Manual test scenarios

1. Open phone game view → verify resource icons display over chips
2. Inspect icons closely → verify no white/colored background bleeding
3. Check at multiple zoom levels → verify icons remain clear
4. Compare all 5 icons → verify they're distinguishable

## Risk & rollback

- **Risk**: AI may not generate true transparency
- **Risk**: Icons may lose detail when scaled down
- **Rollback**: Keep original icons as backup, restore if needed
