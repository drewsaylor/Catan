# Performance & Feel — Phase 2: Memory & Load Time (P0)

## Goal
Reduce initial load time and memory usage through lazy loading, bundle optimization, and image compression.

## Non-goals
- No 3D-specific optimizations (Phase 3).
- No server-side rendering.
- No CDN or external hosting changes.

## Player-facing outcomes
- Game loads faster on initial visit.
- Less memory pressure on phones during gameplay.
- No visible loading spinners for common interactions.

## Technical plan
### Server
- Implement asset preloading hints (Link headers or `<link rel="preload">`).
- Enable gzip/brotli compression for static assets if not already.
- Consider HTTP/2 server push for critical assets.

### Engine
- No changes required.

### TV
- Lazy load non-critical assets (settings UI, help content).
- Preload critical assets during splash screen.

### Phone
- Same as TV: lazy load non-critical, preload critical.
- Implement intersection observer for off-screen asset loading.

### Shared
- Create an asset loading manager:
  - `preloadAssets(assetList)` — load critical assets early
  - `lazyLoadAsset(assetPath)` — load on demand
  - Cache loaded assets to avoid re-fetching
- Implement image compression pipeline:
  - Convert PNGs to WebP where supported.
  - Generate multiple resolutions for responsive loading.
- Audit bundle size; identify and remove unused dependencies.

## APIs & data shape changes
- No API changes.
- New shared asset loading module.

## Acceptance criteria
- Initial load time reduced by 30%+ (measure before/after).
- Bundle size reduced (identify specific KB savings).
- Images served in WebP where browser supports.
- No regression in visual quality.
- Memory usage stable during 60-minute session.

## Manual test scenarios
1) Clear cache → load game → measure time to interactive.
2) Play full game → monitor memory usage (no unbounded growth).
3) Load on slow network (throttle to 3G) → verify graceful loading.
4) Verify WebP images load on Chrome, fallback PNG on Safari if needed.

## Risk & rollback
- Risk: Lazy loading may cause visible pop-in.
- Risk: WebP conversion may lose quality.
- Rollback: Disable lazy loading for affected assets; revert to PNG.
