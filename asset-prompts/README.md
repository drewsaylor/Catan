# Asset Prompts Pack

Copy/paste-ready prompts to generate original image assets for this repo’s **hex‑tile resource boardgame** UI (TV + phones). Prompts are designed to keep the “classic tabletop” vibe while staying **original** (no trademarked names, logos, or copied layouts).

## How to use

1) Pick an asset from the lists below.
2) Copy the **Prompt** block into Gemini/ChatGPT (or your image tool of choice).
3) Generate **two variants** every time:
   - **(A) Night UI** (matches the current dark UI)
   - **(B) Tabletop Daylight** (warm, sunlit tabletop look)
4) Export using the **Output** spec for that asset (size/format/transparency).
5) Name the exported file using the **asset id** (example: `icon-settings.svg`, `bg-tv-main.jpg`).

## Pick-the-best checklist

- **Legible at 24px:** shrink the image to 24×24 (or view at 5% zoom) and confirm the silhouette still reads.
- **Works on dark cards:** check contrast against a dark UI card (near-black with slight transparency).
- **No busy backgrounds behind text:** backgrounds must keep large calm regions so UI text stays readable.
- **Consistent family look:** outlines, shadows, and gradients should match across the set.
- **Original:** no recognizable copied logos, characters, map layouts, or typography.

## Where these assets would plug in later (FYI)

- UI currently uses emoji buttons for Host/Settings/Help in:
  - `apps/server/public/tv/index.html`
  - `apps/server/public/phone/index.html`
- Resource chips currently use raster icons in:
  - `apps/server/public/shared/icons/`

This pack does **not** wire assets into the UI; it only provides prompts.

## Files

- `style-guide.md` — palettes + materials + do/don’t rules
- `prompt-template.md` — reusable templates for fast prompt authoring
- `backgrounds.md` — TV/phone backgrounds + overlays + patterns
- `ui-icons.md` — generic UI icon set (SVG + PNG prompts)
- `resource-icons.md` — resource icon set (SVG + PNG prompts)
- `board-assets.md` — hex tiles, textures, tokens, ports, robber
- `structures-and-badges.md` — build pieces + achievements/badges
- `dev-cards.md` — dev card back + dev card icons
- `stickers-emotes.md` — reactions/stickers (TV + phone)
- `marketing.md` — wordmark/brand mark/app icon/OG image prompts

