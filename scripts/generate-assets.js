#!/usr/bin/env node

/**
 * AI Asset Generator for Catan LAN game.
 *
 * Generates UI assets using Google's Gemini 2.5 Flash image generation model
 * via LiteLLM Air Proxy Sidecar.
 *
 * Usage: node scripts/generate-assets.js
 *
 * Prerequisites:
 *   - Air Proxy Sidecar running at http://localhost:8888
 *
 * Output:
 *   apps/server/public/shared/icons/*.png      - Icon images (512x512)
 *   apps/server/public/shared/tiles/*.png      - Hex tile textures (512x512)
 *   apps/server/public/shared/backgrounds/*.png - Background images (1920x1080)
 */

import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const sharedDir = path.join(rootDir, "apps", "server", "public", "shared");

const LITELLM_URL = "http://localhost:8888/v1/images/generations";
const MODEL = "gemini-2.5-flash-image";
const RATE_LIMIT_MS = 3000; // 20 req/min = 1 req per 3 seconds
const MAX_RETRIES = 3;

// Icon style - isolated subjects for transparent compositing
const ICON_STYLE = `Simple game icon, isolated subject on TRANSPARENT background,
clean edges suitable for compositing, warm earth tones (browns, tans, amber),
hand-painted Catan board game style, soft painterly brushwork.
NO background, NO frame, NO medallion - just the object itself centered.
Simple, iconic, recognizable at small sizes.`;

// Hex tile style - Catan board game illustrated tiles that fill edge-to-edge
const HEX_TILE_STYLE = `CRITICAL REQUIREMENTS:
- The terrain MUST extend beyond all four edges of the image - imagine you are cropping a larger painting
- ZERO borders, ZERO margins, ZERO empty space, ZERO background visible
- Every single pixel must be filled with terrain - the landscape bleeds off all edges

PERSPECTIVE: Bird's eye view looking straight down from high above, like a map or board game tile
SCALE: Zoomed out far - seeing a wide landscape, not close-up details
ART STYLE: Hand-painted watercolor illustration matching Settlers of Catan board game - warm earthy muted colors, soft brushstrokes, medieval fantasy aesthetic`;

// Category-specific additions
const CATEGORY_ADDITIONS = {
  resource: "", // uses ICON_STYLE
  "dev-card": "", // uses ICON_STYLE
  building: "", // uses ICON_STYLE
  "hex-tile": "", // uses HEX_TILE_STYLE
  "port-dock": "Top-down view, wooden pier/dock structure extending into water, can be rotated.",
  "port-boat": "Side view of small wooden trading boat on water, always oriented upright.",
  special: "", // uses ICON_STYLE
  background: "", // uses BACKGROUND_STYLE_PREFIX
  logo: "" // uses LOGO_STYLE_PREFIX
};

const BACKGROUND_STYLE_PREFIX = `In the style of the original Catan board game: warm earth tones, hand-painted
medieval fantasy aesthetic, soft diffuse lighting, painterly brush textures.
Wide landscape image suitable for a game background.`;

const LOGO_STYLE_PREFIX = `Medieval fantasy style: warm earth tones (browns, tans, amber),
hand-painted aesthetic with soft painterly brushwork.`;

const ASSETS = [
  // Resource Icons (512x512)
  // Optimized for readability at 16px - simple silhouettes, bold shapes, consistent style
  {
    name: "wood",
    prompt: "Stack of 3-4 brown lumber logs in a pile, visible wood grain, bold simple silhouette",
    path: "icons/wood.png",
    size: "512x512",
    category: "resource"
  },
  {
    name: "brick",
    prompt: "Stack of 3-4 red-orange clay bricks, simple terracotta pile, bold simple silhouette",
    path: "icons/brick.png",
    size: "512x512",
    category: "resource"
  },
  {
    name: "sheep",
    prompt: "Fluffy white sheep facing right, simple friendly shape, bold simple silhouette",
    path: "icons/sheep.png",
    size: "512x512",
    category: "resource"
  },
  {
    name: "wheat",
    prompt: "Golden wheat sheaf bundle tied in middle, amber stalks, bold simple silhouette",
    path: "icons/wheat.png",
    size: "512x512",
    category: "resource"
  },
  {
    name: "ore",
    prompt: "3-4 grey-blue rock chunks with metallic silver veins, bold simple silhouette",
    path: "icons/ore.png",
    size: "512x512",
    category: "resource"
  },

  // Dev Card Icons (512x512)
  {
    name: "dev-knight",
    prompt: "armored medieval knight with sword and shield",
    path: "icons/dev-knight.png",
    size: "512x512",
    category: "dev-card"
  },
  {
    name: "dev-road-building",
    prompt: "two dirt roads crossing, construction theme",
    path: "icons/dev-road-building.png",
    size: "512x512",
    category: "dev-card"
  },
  {
    name: "dev-year-of-plenty",
    prompt: "overflowing basket of harvest goods",
    path: "icons/dev-year-of-plenty.png",
    size: "512x512",
    category: "dev-card"
  },
  {
    name: "dev-monopoly",
    prompt: "merchant with balance scales and coins",
    path: "icons/dev-monopoly.png",
    size: "512x512",
    category: "dev-card"
  },
  {
    name: "dev-victory-point",
    prompt: "golden laurel wreath with ribbon",
    path: "icons/dev-victory-point.png",
    size: "512x512",
    category: "dev-card"
  },
  {
    name: "dev-card-back",
    prompt: "Medieval parchment card back with ornate border, question mark or mystery symbol in center, warm brown tones, bold simple silhouette",
    path: "icons/dev-card-back.png",
    size: "512x512",
    category: "dev-card"
  },

  // Building Icons (512x512)
  {
    name: "building-road",
    prompt: "cobblestone path segment, simple road shape",
    path: "icons/building-road.png",
    size: "512x512",
    category: "building"
  },
  {
    name: "building-settlement",
    prompt: "small thatched cottage, cozy home",
    path: "icons/building-settlement.png",
    size: "512x512",
    category: "building"
  },
  {
    name: "building-city",
    prompt: "medieval town with stone towers",
    path: "icons/building-city.png",
    size: "512x512",
    category: "building"
  },

  // Special Icons (512x512) - gold trim
  {
    name: "robber",
    prompt: "hooded bandit figure in dark cloak",
    path: "icons/robber.png",
    size: "512x512",
    category: "special"
  },
  {
    name: "award-longest-road",
    prompt: "winding road emblem, trophy style",
    path: "icons/award-longest-road.png",
    size: "512x512",
    category: "special"
  },
  {
    name: "award-largest-army",
    prompt: "crossed swords emblem, military trophy",
    path: "icons/award-largest-army.png",
    size: "512x512",
    category: "special"
  },

  // Port Dock (512x512) - rotatable structure
  {
    name: "port-dock",
    prompt: "wooden pier/dock structure extending into water",
    path: "icons/port-dock.png",
    size: "512x512",
    category: "port-dock"
  },

  // Port Boats (512x512) - stay upright, positioned near dock
  {
    name: "port-boat-generic",
    prompt: "medieval wooden merchant ship with white sail marked with question mark, warm brown hull",
    path: "icons/port-boat-generic.png",
    size: "512x512",
    category: "port-boat"
  },
  {
    name: "port-boat-wood",
    prompt: "wooden cargo boat overflowing with brown timber logs, logs prominently stacked high, warm brown wood tones",
    path: "icons/port-boat-wood.png",
    size: "512x512",
    category: "port-boat"
  },
  {
    name: "port-boat-brick",
    prompt: "cargo boat heaped with red-orange clay bricks, bricks stacked prominently above deck, terracotta colors",
    path: "icons/port-boat-brick.png",
    size: "512x512",
    category: "port-boat"
  },
  {
    name: "port-boat-sheep",
    prompt: "cargo boat piled high with fluffy white wool bales, wool prominently overflowing, cream white tones",
    path: "icons/port-boat-sheep.png",
    size: "512x512",
    category: "port-boat"
  },
  {
    name: "port-boat-wheat",
    prompt: "cargo boat overflowing with golden wheat sheaves and grain sacks, golden amber harvest colors",
    path: "icons/port-boat-wheat.png",
    size: "512x512",
    category: "port-boat"
  },
  {
    name: "port-boat-ore",
    prompt: "cargo boat loaded with grey-blue ore chunks with metallic veins, rocks piled prominently, slate grey tones",
    path: "icons/port-boat-ore.png",
    size: "512x512",
    category: "port-boat"
  },

  // Hex Tile Variants (512x512) - 5 variants per resource, Catan-style
  // WOOD variants - dense evergreen forests seen from high above
  {
    name: "hex-wood-1",
    prompt: "Seamless forest texture filling entire image. Hundreds of tiny dark green conical evergreen pine tree tops seen from directly above like a satellite image. Trees so small they appear as pointed dots. Dense woodland canopy with no gaps. Small lumber clearing with stacked logs in center. Forest extends beyond all four edges - cropped from larger scene. Dark green, forest green, hunter green colors.",
    path: "tiles/hex-wood-1.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-wood-2",
    prompt: "Seamless conifer forest filling entire image edge to edge. Bird's eye view from very high altitude showing vast expanse of tiny spruce tree tops. Each tree appears as small dark green triangle. Timber camp with log piles visible. No borders, no margins - trees extend past all edges. Deep forest green tones throughout.",
    path: "tiles/hex-wood-2.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-wood-3",
    prompt: "Continuous pine forest canopy filling entire square. Zoomed out bird's eye perspective showing miniature evergreen treetops covering the whole image. Sawmill and creek in center surrounded by dense woodland. Forest bleeds off all four edges. Mix of dark and medium greens.",
    path: "tiles/hex-wood-3.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-wood-4",
    prompt: "Vast Nordic pine forest from directly above filling entire image. Tiny pointed conifer crowns packed densely. Small woodcutter's cottage with lumber stacks. No background visible - only forest from edge to edge. Dark evergreen color palette.",
    path: "tiles/hex-wood-4.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-wood-5",
    prompt: "Dense fir tree forest seamless texture. Aerial view from high altitude showing countless small triangular treetops. Forest clearing with stacked timber. Trees continue past all four edges of image. Rich dark green forest tones.",
    path: "tiles/hex-wood-5.png",
    size: "512x512",
    category: "hex-tile"
  },

  // BRICK variants - terracotta clay hills and quarries
  {
    name: "hex-brick-1",
    prompt: "Seamless terracotta clay landscape filling entire image. Rolling red-brown clay hills and deposits seen from directly above. Small brick kiln with smoke in center. Warm orange, rust, and sienna earth tones. Clay terrain extends past all four edges - no borders.",
    path: "tiles/hex-brick-1.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-brick-2",
    prompt: "Continuous clay quarry terrain filling entire square. Bird's eye view of red-orange clay pits with stacked bricks drying. Warm terracotta earth covering whole image edge to edge. No margins - clay hills bleed off all sides.",
    path: "tiles/hex-brick-2.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-brick-3",
    prompt: "Vast clay deposit landscape from directly above. Rusty red-brown earth with clay mounds and brick furnace. Terracotta terrain fills entire image with no borders. Warm earth tones - rust, sienna, burnt orange.",
    path: "tiles/hex-brick-3.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-brick-4",
    prompt: "Rolling red-brown clay hills and deposits seen from directly above. Stacked bricks drying near clay pit. Warm orange, rust, and sienna earth tones. Terracotta terrain fills entire image with no borders - clay extends past all edges.",
    path: "tiles/hex-brick-4.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-brick-5",
    prompt: "Rolling red-brown clay hills and deposits seen from directly above. Brick kiln with chimney smoke and clay mounds. Warm orange, rust, and sienna earth tones. Terracotta terrain fills entire image with no borders - clay extends past all edges.",
    path: "tiles/hex-brick-5.png",
    size: "512x512",
    category: "hex-tile"
  },

  // SHEEP variants - rolling green pastures with grazing flocks
  {
    name: "hex-sheep-1",
    prompt: "Seamless green pasture filling entire image. Rolling grassy hills seen from directly above with dozens of tiny white sheep dots scattered across meadow. Wooden fences and small shepherd's hut. Lush green grassland extends past all four edges - no borders.",
    path: "tiles/hex-sheep-1.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-sheep-2",
    prompt: "Continuous pastoral meadow filling entire square. Bird's eye view from high altitude showing vast green grass with many small white fluffy sheep grazing. Stone cottage in center. Green hills bleed off all edges - no margins.",
    path: "tiles/hex-sheep-2.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-sheep-3",
    prompt: "Vast sheep pasture from directly above filling entire image. Bright emerald green rolling hills dotted with white wool sheep. Stone walls dividing paddocks. Grassland continues past all four edges. Fresh green color palette.",
    path: "tiles/hex-sheep-3.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-sheep-4",
    prompt: "Seamless green meadow texture with sheep flock. Aerial view of lush grass hills with scattered white sheep and small barn. No borders - pastoral landscape extends beyond all edges. Soft green tones.",
    path: "tiles/hex-sheep-4.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-sheep-5",
    prompt: "Continuous pastoral hillside filling entire image. Bird's eye view of verdant green pasture with tiny white sheep dotting the landscape. Wooden pen visible. Grass extends past all four edges - no background.",
    path: "tiles/hex-sheep-5.png",
    size: "512x512",
    category: "hex-tile"
  },

  // WHEAT variants - golden grain fields
  {
    name: "hex-wheat-1",
    prompt: "Vast harvest-ready wheat field from directly above. Golden amber grain rows with small windmill visible. Yellow farmland fills entire image edge to edge. No background - wheat extends beyond all four sides. Warm golden tones.",
    path: "tiles/hex-wheat-1.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-wheat-2",
    prompt: "Vast harvest-ready wheat field from directly above. Golden amber grain rows with hay bales and wooden cart. Yellow farmland fills entire image edge to edge. No background - wheat extends beyond all four sides. Rich amber tones.",
    path: "tiles/hex-wheat-2.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-wheat-3",
    prompt: "Vast harvest-ready wheat field from directly above. Golden amber grain rows with small farmhouse and barn. Yellow farmland fills entire image edge to edge. No background - wheat extends beyond all four sides.",
    path: "tiles/hex-wheat-3.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-wheat-4",
    prompt: "Vast harvest-ready wheat field from directly above. Golden amber grain rows with threshing floor and grain sacks. Yellow farmland fills entire image edge to edge. No background - wheat extends beyond all four sides. Warm harvest gold.",
    path: "tiles/hex-wheat-4.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-wheat-5",
    prompt: "Vast harvest-ready wheat field from directly above. Golden amber grain rows with small cottage and haystacks. Yellow farmland fills entire image edge to edge. No background - wheat extends beyond all four sides. Rich golden amber.",
    path: "tiles/hex-wheat-5.png",
    size: "512x512",
    category: "hex-tile"
  },

  // ORE variants - grey rocky mountain terrain
  {
    name: "hex-ore-1",
    prompt: "Seamless rocky mountain terrain filling entire image. Grey stone peaks and crags seen from directly above. Mine entrance with ore cart tracks. Rocky grey landscape extends past all four edges - no borders. Slate and charcoal tones.",
    path: "tiles/hex-ore-1.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-ore-2",
    prompt: "Grey stone peaks and crags seen from directly above. Mine entrance with ore cart and pickaxes. Rocky grey landscape extends past all four edges - no borders. Slate and charcoal tones with glinting ore deposits.",
    path: "tiles/hex-ore-2.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-ore-3",
    prompt: "Grey stone peaks and crags seen from directly above. Mining tunnel entrance with ore piles stacked nearby. Rocky grey landscape extends past all four edges - no borders. Slate and charcoal tones throughout.",
    path: "tiles/hex-ore-3.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-ore-4",
    prompt: "Seamless grey mountain texture. Aerial view of rocky peaks with glinting ore deposits and mining carts. Stone landscape continues past all edges - no borders. Slate grey and charcoal tones.",
    path: "tiles/hex-ore-4.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-ore-5",
    prompt: "Grey stone peaks and crags seen from directly above. Rocky quarry with mining carts on tracks and ore chunks. Rocky grey landscape extends past all four edges - no borders. Slate and charcoal tones with metallic veins.",
    path: "tiles/hex-ore-5.png",
    size: "512x512",
    category: "hex-tile"
  },

  // DESERT variants - sandy barren wasteland
  {
    name: "hex-desert-1",
    prompt: "Seamless sandy desert filling entire image. Tan and beige sand dunes with ripple patterns seen from directly above. Sparse dry rocks scattered. Sandy terrain extends past all four edges - no borders. Warm sand colors.",
    path: "tiles/hex-desert-1.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-desert-2",
    prompt: "Continuous desert wasteland texture filling entire square. Bird's eye view of smooth golden sand dunes. Barren arid landscape bleeds off all edges - no margins. Warm tan and ochre tones throughout.",
    path: "tiles/hex-desert-2.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-desert-3",
    prompt: "Vast sandy desert from directly above. Beige dunes with wind-swept patterns and scattered pebbles. Sand fills entire image edge to edge. No background - desert extends beyond all four sides. Light tan palette.",
    path: "tiles/hex-desert-3.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-desert-4",
    prompt: "Seamless arid desert texture. Aerial view of tan sand ripples with cracked dry earth patches. Sandy wasteland continues past all edges - no borders. Warm beige and ochre colors.",
    path: "tiles/hex-desert-4.png",
    size: "512x512",
    category: "hex-tile"
  },
  {
    name: "hex-desert-5",
    prompt: "Continuous barren desert filling entire image. Bird's eye view of light tan dunes with subtle shadow patterns. Sparse dry vegetation. Sand extends past all four edges. Warm sandy brown tones.",
    path: "tiles/hex-desert-5.png",
    size: "512x512",
    category: "hex-tile"
  },

  // Backgrounds (1920x1080, 16:9)
  {
    name: "attract-bg",
    prompt: "Aged parchment map with compass rose, medieval cartography, warm sepia tones, nautical exploration theme",
    path: "backgrounds/attract-bg.png",
    size: "1920x1080",
    category: "background"
  },
  {
    name: "lobby-bg",
    prompt: "Medieval tavern interior at night, warm firelight, wooden beams, cozy gathering place",
    path: "backgrounds/lobby-bg.png",
    size: "1920x1080",
    category: "background"
  },
  {
    name: "game-bg",
    prompt: "Aerial view of Catan island, hexagonal terrain visible, ocean surrounding, golden hour lighting",
    path: "backgrounds/game-bg.png",
    size: "1920x1080",
    category: "background"
  },
  {
    name: "card-bg",
    prompt: "Cream parchment paper texture, subtle aged edges, soft warm lighting",
    path: "backgrounds/card-bg.png",
    size: "512x512",
    category: "background"
  },

  // Logo
  {
    name: "logo",
    prompt: "Wooden tavern sign, shield-shaped board with CATAN carved and painted in gold letters, LAN Edition on a red ribbon banner below, warm wood grain texture, isolated on plain background",
    path: "icons/logo.png",
    size: "512x512",
    category: "logo"
  },
  {
    name: "logo-wide",
    prompt: "Horizontal wooden tavern sign banner, CATAN LAN carved in gold medieval letters, warm brown wood grain, iron corner brackets, isolated on plain background",
    path: "icons/logo-wide.png",
    size: "1024x256",
    category: "logo"
  }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeBackground(filePath) {
  // Use a temp file because rembg truncates output before reading input
  const tempPath = filePath.replace(".png", "-nobg.png");
  // Use full path to rembg (installed via pipx)
  const rembgPath = `${process.env.HOME}/.local/bin/rembg`;
  await execAsync(`"${rembgPath}" i "${filePath}" "${tempPath}"`);
  await execAsync(`mv "${tempPath}" "${filePath}"`);
}

function needsTransparency(category) {
  const transparentCategories = [
    "resource",
    "dev-card",
    "building",
    "special",
    "port-dock",
    "port-boat",
    "logo"
  ];
  return transparentCategories.includes(category);
}

function buildPrompt(asset) {
  const { category, prompt } = asset;

  // Backgrounds use their own style
  if (category === "background") {
    return `${BACKGROUND_STYLE_PREFIX} ${prompt}`;
  }

  // Logo uses its own style
  if (category === "logo") {
    return `${LOGO_STYLE_PREFIX} ${prompt}`;
  }

  // Hex tiles use terrain texture style
  if (category === "hex-tile") {
    return `${HEX_TILE_STYLE} ${prompt}`;
  }

  // Port assets use specific non-medallion styles
  if (category === "port-dock" || category === "port-boat") {
    const addition = CATEGORY_ADDITIONS[category] || "";
    return `In the style of original Catan board game: warm earth tones (browns, tans, amber, cream),
hand-painted medieval aesthetic, soft painterly brushwork, gentle lighting.
TRANSPARENT background, isolated subject with clean edges.
${addition} ${prompt}`;
  }

  // All other icons use the isolated icon style for transparency
  return `${ICON_STYLE} ${prompt}`;
}

async function generateImage(asset) {
  const fullPrompt = buildPrompt(asset);

  const response = await fetch(LITELLM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt: fullPrompt,
      n: 1,
      size: asset.size
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

async function saveImage(base64Data, outputPath) {
  const fullPath = path.join(sharedDir, outputPath);
  const dir = path.dirname(fullPath);

  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(base64Data, "base64");
  await writeFile(fullPath, buffer);

  return fullPath;
}

async function processAsset(asset, index, total) {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] (${index + 1}/${total}) Generating: ${asset.name}`);

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await generateImage(asset);

      if (!result.data || !result.data[0]) {
        throw new Error("No image data in response");
      }

      const imageData = result.data[0].b64_json;
      if (!imageData) {
        throw new Error("No base64 image data in response");
      }

      const savedPath = await saveImage(imageData, asset.path);
      console.log(`  Saved: ${savedPath}`);

      if (needsTransparency(asset.category)) {
        console.log(`  Removing background...`);
        await removeBackground(savedPath);
      }

      return { success: true, asset, path: savedPath };
    } catch (err) {
      lastError = err;
      console.log(`  Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);

      if (attempt < MAX_RETRIES) {
        const backoffMs = RATE_LIMIT_MS * Math.pow(2, attempt - 1);
        console.log(`  Retrying in ${backoffMs / 1000}s...`);
        await sleep(backoffMs);
      }
    }
  }

  console.log(`  FAILED: ${asset.name} - ${lastError.message}`);
  return { success: false, asset, error: lastError.message };
}

function parseCategories() {
  const arg = process.argv.find((a) => a.startsWith("--categories="));
  if (!arg) return null;
  return arg.split("=")[1].split(",").map((c) => c.trim());
}

function parseNames() {
  const arg = process.argv.find((a) => a.startsWith("--names="));
  if (!arg) return null;
  return arg.split("=")[1].split(",").map((n) => n.trim());
}

async function main() {
  const startTime = Date.now();
  const categoryFilter = parseCategories();
  const nameFilter = parseNames();

  // Filter assets by category (exclude logos by default since Phase 1 is done)
  let assetsToGenerate = ASSETS.filter((a) => a.category !== "logo");

  if (categoryFilter) {
    assetsToGenerate = assetsToGenerate.filter((a) =>
      categoryFilter.includes(a.category)
    );
  }

  // Filter by specific asset names if provided
  if (nameFilter) {
    assetsToGenerate = assetsToGenerate.filter((a) =>
      nameFilter.includes(a.name)
    );
  }

  console.log("Catan LAN Asset Generator");
  console.log("=========================\n");
  console.log(`Model: ${MODEL}`);
  console.log(`Endpoint: ${LITELLM_URL}`);
  if (categoryFilter) {
    console.log(`Categories: ${categoryFilter.join(", ")}`);
  }
  if (nameFilter) {
    console.log(`Names: ${nameFilter.join(", ")}`);
  }
  console.log(`Assets to generate: ${assetsToGenerate.length}`);
  console.log(`Rate limit: ${RATE_LIMIT_MS}ms between requests\n`);

  if (assetsToGenerate.length === 0) {
    console.log("No assets to generate. Check --categories filter.");
    process.exit(0);
  }

  const results = {
    success: [],
    failed: []
  };

  for (let i = 0; i < assetsToGenerate.length; i++) {
    const asset = assetsToGenerate[i];
    const result = await processAsset(asset, i, assetsToGenerate.length);

    if (result.success) {
      results.success.push(result);
    } else {
      results.failed.push(result);
    }

    // Rate limit between requests (skip after last)
    if (i < assetsToGenerate.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n=========================");
  console.log("Generation Summary");
  console.log("=========================");
  console.log(`Time: ${elapsed}s`);
  console.log(`Success: ${results.success.length}/${assetsToGenerate.length}`);
  console.log(`Failed: ${results.failed.length}/${assetsToGenerate.length}`);

  if (results.failed.length > 0) {
    console.log("\nFailed assets:");
    for (const fail of results.failed) {
      console.log(`  - ${fail.asset.name}: ${fail.error}`);
    }
  }

  if (results.success.length > 0) {
    console.log("\nGenerated files:");
    const byCategory = {};
    for (const success of results.success) {
      const cat = success.asset.category;
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(success.asset.name);
    }
    for (const [category, names] of Object.entries(byCategory)) {
      console.log(`  ${category}: ${names.join(", ")}`);
    }
  }

  console.log("\nDone!");
  process.exit(results.failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
