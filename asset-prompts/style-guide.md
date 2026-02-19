# Style Guide (for generated assets)

This is the shared art direction for **all** prompts in this folder. Use it to keep the generated set cohesive.

## Two required variants

Every asset should be generated twice:

- **(A) Night UI**: modern dark UI with subtle glow; built for readability on dark cards.
- **(B) Tabletop Daylight**: warm, sunlit tabletop vibe; built for cozy, “board night” energy.

## Color palettes

### Night UI (align with current UI)

Use these as guiding colors (you can shift slightly for taste):

- Background deep navy: `#0b0f1a`
- Background navy: `#121a2b`
- Card glass: `rgba(255,255,255,0.06)` / `rgba(255,255,255,0.10)`
- Text: `rgba(255,255,255,0.92)`
- Muted text: `rgba(255,255,255,0.68)`
- Accent cyan: `#5fd3ff`
- Accent lime: `#c9ff4f`
- Good: `#39d98a`
- Warn: `#ffd166`
- Bad: `#ff5c7a`

### Tabletop Daylight (warm + bright)

Use these as guiding colors:

- Parchment: `#f6f0e4`
- Warm paper: `#efe2cf`
- Light wood: `#dcb78c`
- Dark wood: `#8a5a36`
- Sky/sea accent: `#89c2d9`
- Forest green: `#3a7d44`
- Clay red: `#b84b3b`
- Wheat gold: `#d6b84b`
- Ore gray: `#9aa3ad`
- Sheep green: `#6fcf7a`

## Material language

Pick from these materials, but keep it consistent per asset family:

- carved wood, varnished wood
- parchment, linen paper, deckle-edge paper
- painted ceramic token, enamel pin
- embossed metal badge, bronze coin
- rope, wax seal, stamp ink, chalk

## Icon language (SVG + PNG)

- Friendly vector style with **subtle gradients** and a **dark outline**.
- Strong silhouette; minimal interior clutter.
- Tiny “ground shadow” or inner shadow allowed, but keep it subtle.
- Use a consistent:
  - outline weight (e.g., 2.0–2.6 at 64×64 viewBox)
  - corner radius language (rounded, not sharp)
  - highlight direction (top-left)

SVG constraints:

- Single SVG per file.
- `viewBox="0 0 64 64"`.
- No external fonts; prefer shapes.
- Avoid filters that won’t port well (heavy blurs, feGaussianBlur). Small drop-shadow can be baked into shapes.

## “Avoid” list (must-follow)

- Do **not** use trademarked names (including the original boardgame name) in prompts.
- Do **not** copy recognizable:
  - logos/wordmarks
  - specific card layouts and frame designs from known products
  - exact map/board layouts
  - distinctive typography from any known game
- Do **not** include watermarks, signatures, or model branding.
- Avoid photorealistic faces/people; this game’s UI is abstract/board-focused.

## Consistency rules

- If you generate a set (icons/resources/tokens), keep:
  - the same light source
  - the same outline style
  - the same shadow softness
  - the same saturation range
- Prefer “game UI clarity” over hyper-detail.

