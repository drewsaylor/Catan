/**
 * Theme Loader - Unified theme manifest + runtime switching
 *
 * Loads theme JSON files and applies:
 * - CSS variables to document root
 * - Exposes world3d params for 3D renderer
 * - Optional texture URLs with quality gating
 *
 * Supports:
 * - High contrast mode override
 * - Colorblind mode palette swap
 * - Theme index fetching from /themes/index.json
 * - Texture preloading with graceful fallback
 */

import { getSettings, onSettingsChange } from "/shared/settings.js";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * @typedef {Object} CssVars
 * @property {string} [--bg0]
 * @property {string} [--bg1]
 * @property {string} [--accent-rgb]
 * @property {string} [--accent2-rgb]
 */

/**
 * @typedef {Object} World3dParams
 * @property {string} waterColor - Hex color for water material
 * @property {string} skyTint - Hex color for sky/background tint
 * @property {number} ambientIntensity - Ambient light intensity (0-1)
 * @property {number} tileRoughness - PBR roughness for tile materials (0-1)
 */

/**
 * @typedef {Object} ThemeTextures
 * @property {string} [waterNormal] - URL to water normal map texture
 */

/**
 * @typedef {Object} ThemeData
 * @property {string} id
 * @property {string} name
 * @property {CssVars} cssVars
 * @property {World3dParams} world3d
 * @property {ThemeTextures} [textures]
 */

/**
 * @typedef {Object} ThemeIndexEntry
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {string} path
 */

/**
 * @typedef {Object} ThemeIndex
 * @property {number} version
 * @property {ThemeIndexEntry[]} themes
 */

/**
 * @callback ThemeChangeCallback
 * @param {ThemeData | null} theme
 * @returns {void}
 */

// ============================================================================
// STATE
// ============================================================================

/** @type {Map<string, ThemeData>} */
const themeCache = new Map();

/** @type {ThemeData | null} */
let currentTheme = null;

/** @type {string | null} */
let currentThemeId = null;

/** @type {Set<ThemeChangeCallback>} */
const changeListeners = new Set();

/** @type {boolean} */
let isLoading = false;

/** @type {ThemeIndex | null} */
let cachedThemeIndex = null;

/** @type {Map<string, HTMLImageElement>} */
const textureCache = new Map();

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default theme values (used as fallback)
 */
const DEFAULT_THEME = {
  id: "aurora",
  name: "Aurora",
  cssVars: {
    "--bg0": "#0b0f1a",
    "--bg1": "#121a2b",
    "--accent-rgb": "95, 211, 255",
    "--accent2-rgb": "201, 255, 79"
  },
  world3d: {
    waterColor: "#1a4a6e",
    skyTint: "#0a1428",
    ambientIntensity: 0.62,
    tileRoughness: 0.85
  },
  textures: {}
};

/**
 * High contrast overrides - ensure text remains readable
 */
const HIGH_CONTRAST_OVERRIDES = {
  "--bg0": "#000000",
  "--bg1": "#0a0a0a",
  "--text": "rgba(255, 255, 255, 1)",
  "--muted": "rgba(255, 255, 255, 0.95)",
  "--faint": "rgba(255, 255, 255, 0.3)",
  "--card": "rgba(255, 255, 255, 0.12)",
  "--card2": "rgba(255, 255, 255, 0.18)"
};

/**
 * Colorblind-friendly resource palette
 * Uses distinct hues that are distinguishable for common types of color blindness
 */
const COLORBLIND_RESOURCE_OVERRIDES = {
  "--res-wood-rgb": "0, 114, 178", // Blue
  "--res-brick-rgb": "213, 94, 0", // Vermillion/Orange
  "--res-sheep-rgb": "204, 121, 167", // Reddish purple
  "--res-wheat-rgb": "240, 228, 66", // Yellow
  "--res-ore-rgb": "170, 170, 170" // Gray
};

// ============================================================================
// THEME INDEX FETCHING
// ============================================================================

/**
 * Fetches the theme index from /themes/index.json
 * Results are cached for the session.
 * @returns {Promise<ThemeIndex | null>}
 */
export async function fetchThemeIndex() {
  if (cachedThemeIndex) return cachedThemeIndex;

  try {
    const response = await fetch("/themes/index.json");
    if (!response.ok) {
      console.warn(`[theme-loader] Failed to fetch theme index: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!isValidThemeIndex(data)) {
      console.warn("[theme-loader] Invalid theme index data");
      return null;
    }

    cachedThemeIndex = data;
    return cachedThemeIndex;
  } catch (err) {
    console.warn("[theme-loader] Error fetching theme index:", err);
    return null;
  }
}

/**
 * Validates theme index structure
 * @param {any} data
 * @returns {data is ThemeIndex}
 */
function isValidThemeIndex(data) {
  if (!data || typeof data !== "object") return false;
  if (typeof data.version !== "number") return false;
  if (!Array.isArray(data.themes)) return false;
  return data.themes.every(
    (t) =>
      t && typeof t === "object" && typeof t.id === "string" && typeof t.name === "string" && typeof t.path === "string"
  );
}

/**
 * Returns available themes from the index (or empty array if not fetched)
 * @returns {ThemeIndexEntry[]}
 */
export function getAvailableThemes() {
  return cachedThemeIndex?.themes || [];
}

/**
 * Clears the cached theme index (useful for refresh)
 */
export function clearThemeIndexCache() {
  cachedThemeIndex = null;
}

// ============================================================================
// THEME FETCHING
// ============================================================================

/**
 * Fetches and parses a theme JSON file
 * @param {string} themeId
 * @returns {Promise<ThemeData | null>}
 */
async function fetchTheme(themeId) {
  if (!themeId || typeof themeId !== "string") return null;

  const cached = themeCache.get(themeId);
  if (cached) return cached;

  try {
    const response = await fetch(`/themes/${encodeURIComponent(themeId)}/theme.json`);
    if (!response.ok) {
      console.warn(`[theme-loader] Failed to fetch theme "${themeId}": ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!isValidTheme(data)) {
      console.warn(`[theme-loader] Invalid theme data for "${themeId}"`);
      return null;
    }

    // Normalize textures field
    if (!data.textures || typeof data.textures !== "object") {
      data.textures = {};
    }

    themeCache.set(themeId, data);
    return data;
  } catch (err) {
    console.warn(`[theme-loader] Error loading theme "${themeId}":`, err);
    return null;
  }
}

/**
 * Validates theme data structure
 * @param {any} data
 * @returns {data is ThemeData}
 */
function isValidTheme(data) {
  if (!data || typeof data !== "object") return false;
  if (typeof data.id !== "string" || !data.id) return false;
  if (typeof data.name !== "string" || !data.name) return false;
  if (!data.cssVars || typeof data.cssVars !== "object") return false;
  if (!data.world3d || typeof data.world3d !== "object") return false;
  return true;
}

// ============================================================================
// TEXTURE LOADING
// ============================================================================

/**
 * Determines if textures should be loaded based on quality settings
 * Quality gating: skip textures on low quality to save bandwidth/memory
 * @returns {boolean}
 */
export function shouldLoadTextures() {
  const settings = getSettings();
  // Skip textures in low power mode
  if (settings?.lowPowerMode) return false;
  // Skip textures if renderer quality is explicitly set to low
  if (settings?.rendererQuality === "low") return false;
  return true;
}

/**
 * Preloads a texture URL and caches the result
 * Returns null on failure (graceful fallback)
 * @param {string} url
 * @returns {Promise<HTMLImageElement | null>}
 */
export async function preloadTexture(url) {
  if (!url || typeof url !== "string") return null;

  const cached = textureCache.get(url);
  if (cached) return cached;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      textureCache.set(url, img);
      resolve(img);
    };

    img.onerror = () => {
      console.warn(`[theme-loader] Failed to load texture: ${url}`);
      resolve(null); // Graceful fallback
    };

    img.src = url;
  });
}

/**
 * Preloads all textures for a theme (if quality allows)
 * @param {ThemeData} theme
 * @returns {Promise<void>}
 */
async function preloadThemeTextures(theme) {
  if (!theme?.textures || !shouldLoadTextures()) return;

  const urls = Object.values(theme.textures).filter((url) => typeof url === "string" && url);

  await Promise.all(urls.map((url) => preloadTexture(url)));
}

/**
 * Gets a preloaded texture by URL
 * @param {string} url
 * @returns {HTMLImageElement | null}
 */
export function getPreloadedTexture(url) {
  return textureCache.get(url) || null;
}

/**
 * Gets theme textures with loaded images (for 3D renderer)
 * Returns null for missing or failed textures (graceful fallback)
 * @returns {{ waterNormal: HTMLImageElement | null } | null}
 */
export function getThemeTextures() {
  if (!currentTheme?.textures) return null;
  if (!shouldLoadTextures()) return null;

  const textures = currentTheme.textures;
  return {
    waterNormal: textures.waterNormal ? getPreloadedTexture(textures.waterNormal) : null
  };
}

/**
 * Clears the texture cache
 */
export function clearTextureCache() {
  textureCache.clear();
}

// ============================================================================
// CSS VARIABLE APPLICATION
// ============================================================================

/**
 * Converts a hex color to RGB string (e.g., "#0b0f1a" -> "11, 15, 26")
 * @param {string} hex
 * @returns {string | null}
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

/**
 * Applies CSS variables to document root
 * @param {CssVars} cssVars
 */
function applyCssVars(cssVars) {
  const root = document?.documentElement;
  if (!root) return;

  for (const [key, value] of Object.entries(cssVars)) {
    if (typeof value === "string" && key.startsWith("--")) {
      root.style.setProperty(key, value);

      // Derive RGB versions for bg0 and bg1 (used for rgba() in CSS)
      if (key === "--bg0" || key === "--bg1") {
        const rgb = hexToRgb(value);
        if (rgb) {
          root.style.setProperty(`${key}-rgb`, rgb);
        }
      }
    }
  }
}

/**
 * Removes CSS variables from document root
 * @param {CssVars} cssVars
 */
function removeCssVars(cssVars) {
  const root = document?.documentElement;
  if (!root) return;

  for (const key of Object.keys(cssVars)) {
    if (key.startsWith("--")) {
      root.style.removeProperty(key);
    }
  }
}

/**
 * Applies accessibility overrides based on settings
 */
function applyAccessibilityOverrides() {
  const settings = getSettings();
  const root = document?.documentElement;
  if (!root) return;

  // High contrast mode
  if (settings?.highContrast) {
    for (const [key, value] of Object.entries(HIGH_CONTRAST_OVERRIDES)) {
      root.style.setProperty(key, value);
    }
  }

  // Colorblind mode - swap resource palette
  if (settings?.colorblind) {
    for (const [key, value] of Object.entries(COLORBLIND_RESOURCE_OVERRIDES)) {
      root.style.setProperty(key, value);
    }
  }
}

// ============================================================================
// CHANGE NOTIFICATION
// ============================================================================

/**
 * Notifies all registered change listeners
 */
function notifyListeners() {
  for (const fn of changeListeners) {
    try {
      fn(currentTheme);
    } catch (err) {
      console.warn("[theme-loader] Listener error:", err);
    }
  }
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Loads and applies a theme by ID
 * @param {string} themeId
 * @returns {Promise<ThemeData | null>}
 */
export async function loadTheme(themeId) {
  if (isLoading) {
    // Debounce rapid calls
    return currentTheme;
  }

  // Skip if already loaded
  if (themeId === currentThemeId && currentTheme) {
    return currentTheme;
  }

  isLoading = true;

  try {
    // Remove previous theme's CSS vars
    if (currentTheme?.cssVars) {
      removeCssVars(currentTheme.cssVars);
    }

    let theme = await fetchTheme(themeId);

    // Fall back to default if theme not found
    if (!theme) {
      console.warn(`[theme-loader] Theme "${themeId}" not found, using default`);
      theme = DEFAULT_THEME;
    }

    currentTheme = theme;
    currentThemeId = themeId;

    // Apply CSS variables
    applyCssVars(theme.cssVars);

    // Apply accessibility overrides
    applyAccessibilityOverrides();

    // Update data-theme attribute
    const root = document?.documentElement;
    if (root) {
      root.setAttribute("data-theme", theme.id);
    }

    // Preload textures (async, non-blocking)
    preloadThemeTextures(theme).catch((err) => {
      console.warn("[theme-loader] Texture preload error:", err);
    });

    // Notify listeners
    notifyListeners();

    return theme;
  } finally {
    isLoading = false;
  }
}

/**
 * Returns the currently loaded theme data
 * @returns {ThemeData | null}
 */
export function getLoadedTheme() {
  return currentTheme;
}

/**
 * Returns the current theme ID
 * @returns {string | null}
 */
export function getLoadedThemeId() {
  return currentThemeId;
}

/**
 * Returns the world3d params for the current theme
 * @returns {World3dParams | null}
 */
export function getWorld3dParams() {
  return currentTheme?.world3d || null;
}

/**
 * Registers a callback for theme changes
 * @param {ThemeChangeCallback} callback
 * @returns {() => void} Unsubscribe function
 */
export function onThemeChange(callback) {
  if (typeof callback !== "function") return () => {};
  changeListeners.add(callback);
  return () => changeListeners.delete(callback);
}

/**
 * Preloads multiple themes into cache
 * @param {string[]} themeIds
 * @returns {Promise<void>}
 */
export async function preloadThemes(themeIds) {
  const validIds = Array.isArray(themeIds) ? themeIds.filter((id) => typeof id === "string" && id) : [];

  await Promise.all(validIds.map((id) => fetchTheme(id)));
}

/**
 * Clears the theme cache
 */
export function clearThemeCache() {
  themeCache.clear();
}

// ============================================================================
// SETTINGS CHANGE LISTENER
// ============================================================================

// Re-apply accessibility overrides when settings change
onSettingsChange(() => {
  if (currentTheme) {
    applyAccessibilityOverrides();
  }
});
