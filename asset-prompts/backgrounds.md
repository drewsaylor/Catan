# Backgrounds & Patterns

All prompts here output backgrounds/patterns that can sit behind the TV/phone UI without hurting readability.

## Backgrounds

### bg-tv-main — TV main background

Use: TV (`/tv`)

Output: 3840×2160 JPG (or PNG), no alpha.

Prompt (PNG):
```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 3840x2160 JPG (no alpha).

Create a calm, premium background for a living-room TV game UI.
Composition:
- Large calm area across the top for a header bar (low contrast, minimal detail).
- Subtle vignette around edges; center slightly brighter.
- Very subtle hex-grid suggestion in the midground (barely visible).
- No characters, no busy scenery, no sharp high-contrast lines.

Variant A (Night UI): deep navy gradient with faint cyan/lime glow accents, glassy atmosphere.
Variant B (Tabletop Daylight): warm parchment-to-sky gradient, faint wood table edge suggestion, sunlit softness.
```

### bg-phone-main — Phone main background

Use: Phone (`/phone`)

Output: 1440×2560 JPG (or PNG), no alpha.

Prompt (PNG):
```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 1440x2560 JPG (no alpha).

Create a calm portrait background for a mobile game controller UI.
Composition:
- Soft gradient base + subtle texture.
- Keep the central area calm for card panels and text.
- Avoid busy corners; avoid high contrast.

Variant A (Night UI): deep navy with faint cyan/lime glow and tiny dust/noise texture.
Variant B (Tabletop Daylight): warm parchment + light wood grain hint, sunlit and cozy.
```

### bg-connection-overlay — Reconnecting / rejoining overlay backdrop

Use: TV + Phone connection overlay

Output: 3840×2160 JPG (and optionally 1440×2560 JPG), no alpha.

Prompt (PNG):
```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 3840x2160 JPG (no alpha).

Create a soft, reassuring overlay background used during reconnecting.
Composition:
- Smooth gradient + mild blur bokeh shapes.
- No sharp edges; no busy patterns.
- Center slightly brighter for a modal card.

Variant A (Night UI): deep navy + soft cyan glow bokeh.
Variant B (Tabletop Daylight): warm paper + gentle sunlight bokeh.
```

### bg-end-screen — Victory / rematch backdrop

Use: TV end screen / celebration card

Output: 3840×2160 JPG, no alpha.

Prompt (PNG):
```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 3840x2160 JPG (no alpha).

Create a subtle celebration background for a win/rematch screen.
Composition:
- Calm center for a large card.
- Light confetti hints at the edges only; keep it tasteful and sparse.
- Soft vignette.

Variant A (Night UI): dark navy with subtle neon confetti specks (cyan/lime/gold).
Variant B (Tabletop Daylight): warm sunlit paper with sparse pastel confetti.
```

## Patterns & textures (tileable)

### pattern-hex-grid-subtle — Transparent hex grid overlay

Use: Optional overlay layer above backgrounds

Output: 1024×1024 seamless transparent PNG.

Prompt (PNG):
```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 1024x1024 seamless/tileable transparent PNG.

Create a very subtle hex grid overlay pattern.
Composition:
- Thin hex lines, slightly imperfect/hand-inked feel.
- Low opacity, designed to be used on top of a background.

Variant A (Night UI): lines in faint cool white/cyan, extremely subtle.
Variant B (Tabletop Daylight): lines in faint warm gray/brown, extremely subtle.
```

### pattern-parchment-noise — Subtle parchment noise

Use: Texture for cards/backgrounds

Output: 1024×1024 seamless PNG (no alpha).

Prompt (PNG):
```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 1024x1024 seamless/tileable PNG (no visible seams).

Create a subtle paper/parchment noise texture (very low contrast).
Variant A (Night UI): darker paper fibers and noise suitable for dark UI.
Variant B (Tabletop Daylight): warm parchment fibers and noise.
```

### pattern-wood-grain-dark — Dark wood grain

Use: Optional background material

Output: 1024×1024 seamless PNG (no alpha).

Prompt (PNG):
```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 1024x1024 seamless/tileable PNG (no visible seams).

Create a seamless dark wood grain texture with subtle varnish sheen.
Variant A (Night UI): deep walnut/espresso wood.
Variant B (Tabletop Daylight): warm medium walnut wood.
```

### pattern-wood-grain-light — Light wood grain

Use: Optional tabletop/day mode material

Output: 1024×1024 seamless PNG (no alpha).

Prompt (PNG):
```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 1024x1024 seamless/tileable PNG (no visible seams).

Create a seamless light wood grain texture with gentle variation and clean pores.
Variant A (Night UI): cool-toned light wood, subdued.
Variant B (Tabletop Daylight): warm maple/oak wood, sunlit.
```

### pattern-confetti-shapes — Tiny confetti pattern (optional)

Use: Optional celebration UI accents

Output: 1024×1024 seamless transparent PNG.

Prompt (PNG):
```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 1024x1024 seamless/tileable transparent PNG.

Create a sparse confetti pattern with tiny shapes (dots, ribbons, triangles).
Composition:
- Very sparse density (mostly empty space).
- Shapes are small, rounded, friendly.

Variant A (Night UI): cyan/lime/gold confetti on transparent background.
Variant B (Tabletop Daylight): soft pastel confetti on transparent background.
```

### bg-board-frame-texture — Subtle board frame texture

Use: Behind the board SVG (as a non-distracting material)

Output: 1024×1024 seamless PNG (no alpha).

Prompt (PNG):
```text
Make two variants: (A) Night UI and (B) Tabletop Daylight.
Must be original; do not copy any existing board game’s trademarked logos/characters/layouts.
No watermarks, signatures, or model marks.
No text unless explicitly requested.
Keep shapes readable at small sizes; strong silhouette; minimal clutter.

Output: 1024x1024 seamless/tileable PNG (no visible seams).

Create a subtle felt/linen texture suitable as a board mount background.
Composition:
- Very low contrast; no obvious repeating motifs.
- Slight fiber texture; smooth and premium.

Variant A (Night UI): deep navy felt.
Variant B (Tabletop Daylight): warm beige felt.
```

