# Prompt Templates

Reusable copy/paste templates. Replace `{SUBJECT}`, `{COMPOSITION}`, and `{STYLE_NOTES}`.

## TEMPLATE_BG

```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: {WIDTH}x{HEIGHT} {FORMAT} (no alpha unless stated).

{SUBJECT}
{COMPOSITION}
Style notes: {STYLE_NOTES}
```

## TEMPLATE_ICON_PNG

```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 512x512 transparent PNG.

Design a single centered icon: {SUBJECT}.
Composition: {COMPOSITION}
Style notes: {STYLE_NOTES}
```

## TEMPLATE_ICON_SVG

```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: Two separate SVGs (Variant A then Variant B), each with viewBox="0 0 64 64".
Constraints: no external fonts, no external references, no raster images. Simple gradients ok.
Return only raw SVG code (no Markdown, no backticks).

Icon subject: {SUBJECT}
Composition: {COMPOSITION}
Style notes: {STYLE_NOTES}
```

## TEMPLATE_TILEABLE_TEXTURE

```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 1024x1024 seamless/tileable PNG (no visible seams).

Texture subject: {SUBJECT}
Style notes: {STYLE_NOTES}
```

## TEMPLATE_HEX_TILE

```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 1024x1024 transparent PNG.

Create a centered hex tile illustration for: {SUBJECT}
Composition: hex centered, clean edges, subtle rim/bevel; no background outside the hex (transparent).
Style notes: {STYLE_NOTES}
```

## TEMPLATE_TOKEN

```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 512x512 transparent PNG.

Create a round token/coin for: {SUBJECT}
Composition: centered circle token, subtle rim, gentle shadow, readable at 128px and 32px.
Style notes: {STYLE_NOTES}
```

## TEMPLATE_CARD_BACK

```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 1500x2100 PNG (standard playing card ratio), no alpha.

Design a card back pattern: {SUBJECT}
Composition: centered emblem + border frame + repeating subtle pattern; no trademarked motifs.
Style notes: {STYLE_NOTES}
```

## TEMPLATE_CARD_FRONT_ICON

```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 1024x1024 transparent PNG.

Create a centered emblem/icon for a card front: {SUBJECT}
Composition: bold silhouette, minimal detail, looks good as a foil stamp or ink print.
Style notes: {STYLE_NOTES}
```

