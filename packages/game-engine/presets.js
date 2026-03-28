export const PRESET_META = [
  { id: "classic-balanced", name: "Classic Balanced" },
  { id: "trade-heavy", name: "Trade Heavy" },
  { id: "sheep-wheat-boom", name: "Sheep/Wheat Boom" },
  { id: "high-ore", name: "High Ore" },
  { id: "high-brick-wood", name: "Brick/Wood Rush" },
  { id: "random-balanced", name: "Random (Balanced-ish)" },
  { id: "classic-balanced-expanded", name: "Classic Balanced (Expanded)" },
  { id: "trade-heavy-expanded", name: "Trade Heavy (Expanded)" },
  { id: "sheep-wheat-boom-expanded", name: "Sheep/Wheat Boom (Expanded)" },
  { id: "high-ore-expanded", name: "High Ore (Expanded)" },
  { id: "high-brick-wood-expanded", name: "Brick/Wood Rush (Expanded)" }
];

export function buildRadiusData(radius) {
  const coords = [];
  for (let x = -radius; x <= radius; x += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      const z = -x - y;
      if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= radius) {
        coords.push({ q: x, r: z });
      }
    }
  }
  coords.sort((a, b) => a.r - b.r || a.q - b.q);

  const HEX_NEIGHBOR_DELTAS = [
    { dq: 1, dr: 0 },
    { dq: -1, dr: 0 },
    { dq: 0, dr: 1 },
    { dq: 0, dr: -1 },
    { dq: 1, dr: -1 },
    { dq: -1, dr: 1 }
  ];

  const indexByCoord = new Map(coords.map((c, idx) => [`${c.q},${c.r}`, idx]));

  const neighborIndices = coords.map((c) => {
    const list = [];
    for (const d of HEX_NEIGHBOR_DELTAS) {
      const n = indexByCoord.get(`${c.q + d.dq},${c.r + d.dr}`);
      if (n != null) list.push(n);
    }
    list.sort((a, b) => a - b);
    return list;
  });

  function cubeDistFromCenter({ q, r }) {
    const x = q,
      z = r,
      y = -x - z;
    return Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
  }

  function isCornerHex(idx) {
    const c = coords[idx];
    if (!c) return false;
    if (cubeDistFromCenter(c) !== radius) return false;
    return c.q === 0 || c.r === 0 || c.q + c.r === 0;
  }

  return { coords, indexByCoord, neighborIndices, isCornerHex, cubeDistFromCenter, hexCount: coords.length };
}

const RADIUS_2_DATA = buildRadiusData(2);

const STANDARD_RESOURCE_BAG = [
  ...Array(4).fill("wood"),
  ...Array(3).fill("brick"),
  ...Array(4).fill("sheep"),
  ...Array(4).fill("wheat"),
  ...Array(3).fill("ore")
]; // 18 land tiles + 1 desert = 19 total

const STANDARD_TOKEN_BAG = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

const EXPANDED_RESOURCE_BAG = [
  ...Array(8).fill("wood"),
  ...Array(7).fill("brick"),
  ...Array(8).fill("sheep"),
  ...Array(8).fill("wheat"),
  ...Array(4).fill("ore")
]; // 35 land tiles + 2 deserts = 37 total

const EXPANDED_TOKEN_BAG = [
  2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 3, 4, 5, 9, 10, 11, 12
];

function withDesertAtCenter(resources, tokens, expectedCount = 19) {
  // The board generator sorts hex coords such that the center hex is index 9 (radius 2).
  const desertIndex = 9;
  const r = [...resources];
  const t = [...tokens];
  if (r.length !== expectedCount) throw new Error(`resources must be length ${expectedCount}`);
  if (t.length !== expectedCount) throw new Error(`tokens must be length ${expectedCount}`);
  if (r[desertIndex] !== "desert") throw new Error("center hex must be desert");
  if (t[desertIndex] !== null) throw new Error("center token must be null");
  return { resources: r, tokens: t, desertIndex };
}

function withExpandedDeserts(resources, tokens, desertIndices) {
  const r = [...resources];
  const t = [...tokens];
  if (r.length !== 37) throw new Error("resources must be length 37");
  if (t.length !== 37) throw new Error("tokens must be length 37");
  for (const di of desertIndices) {
    if (r[di] !== "desert") throw new Error(`index ${di} must be desert`);
    if (t[di] !== null) throw new Error(`token at desert index ${di} must be null`);
  }
  const desertCount = r.filter((v) => v === "desert").length;
  if (desertCount !== desertIndices.length) {
    throw new Error(`expected ${desertIndices.length} deserts, found ${desertCount}`);
  }
  return { resources: r, tokens: t, desertIndices };
}

function hashSeedToUint32(seed) {
  const str = String(seed ?? "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seedUint32) {
  let a = seedUint32 >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSeededRng(seed) {
  return mulberry32(hashSeedToUint32(seed));
}

function randInt(rng, maxExclusive) {
  const max = Math.max(0, Math.floor(maxExclusive));
  if (max <= 0) return 0;
  return Math.floor(rng() * max);
}

function shuffleWithRng(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randInt(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function chooseDesertIndices(rng, radiusData, count) {
  const { coords, isCornerHex, cubeDistFromCenter } = radiusData;
  const chosen = [];

  for (let d = 0; d < count; d += 1) {
    const candidates = coords
      .map((c, idx) => ({ c, idx }))
      .filter(({ idx }) => !isCornerHex(idx) && !chosen.includes(idx));
    const weights = candidates.map(({ c }) => {
      const dist = cubeDistFromCenter(c);
      if (dist === 0) return 3;
      if (dist === 1) return 2;
      return 1;
    });
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (total <= 0) {
      chosen.push(coords.findIndex((c) => c.q === 0 && c.r === 0));
      continue;
    }
    let roll = rng() * total;
    for (let i = 0; i < candidates.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) {
        chosen.push(candidates[i].idx);
        break;
      }
    }
    if (chosen.length <= d) {
      chosen.push(candidates[candidates.length - 1].idx);
    }
  }

  return chosen;
}

function tokenHasHotNumber(token) {
  return token === 6 || token === 8;
}

function tryAssignTokens({ rng, desertIndices, hexCount, neighborIndices, tokenBag }) {
  const tokens = Array(hexCount).fill(null);
  const desertSet = new Set(desertIndices);

  const indices = [];
  for (let i = 0; i < hexCount; i += 1) {
    if (desertSet.has(i)) continue;
    indices.push(i);
  }

  const hot = shuffleWithRng(
    tokenBag.filter((t) => tokenHasHotNumber(t)),
    rng
  );
  const rest = shuffleWithRng(
    tokenBag.filter((t) => !tokenHasHotNumber(t)),
    rng
  );
  const ordered = [...hot, ...rest];

  function canPlaceTokenAtIndex(token, idx) {
    if (!tokenHasHotNumber(token)) return true;
    const neighbors = neighborIndices[idx] || [];
    for (const n of neighbors) {
      const placed = tokens[n];
      if (tokenHasHotNumber(placed)) return false;
    }
    return true;
  }

  function backtrack(pos, remainingIndices) {
    if (pos >= ordered.length) return true;
    const token = ordered[pos];

    const viable = [];
    for (const idx of remainingIndices) {
      if (canPlaceTokenAtIndex(token, idx)) viable.push(idx);
    }
    if (viable.length === 0) return false;
    const shuffled = shuffleWithRng(viable, rng);

    for (const idx of shuffled) {
      tokens[idx] = token;
      const nextRemaining = remainingIndices.filter((v) => v !== idx);
      if (backtrack(pos + 1, nextRemaining)) return true;
      tokens[idx] = null;
    }

    return false;
  }

  const ok = backtrack(0, indices);
  return ok ? tokens : null;
}

function generateRandomBalancedPreset({ seed, radius = 2 }) {
  const normalizedSeed = String(seed ?? "").trim();
  if (!normalizedSeed) throw new Error("seed is required for random-balanced preset");
  const rng = makeSeededRng(normalizedSeed);

  const radiusData = radius >= 3 ? buildRadiusData(radius) : RADIUS_2_DATA;
  const { hexCount, neighborIndices } = radiusData;
  const desertCount = radius >= 3 ? 2 : 1;
  const resourceBag = radius >= 3 ? EXPANDED_RESOURCE_BAG : STANDARD_RESOURCE_BAG;
  const tokenBag = radius >= 3 ? EXPANDED_TOKEN_BAG : STANDARD_TOKEN_BAG;

  const desertIndices = chooseDesertIndices(rng, radiusData, desertCount);
  const desertSet = new Set(desertIndices);

  const resources = Array(hexCount).fill(null);
  for (const di of desertIndices) {
    resources[di] = "desert";
  }
  const shuffledResources = shuffleWithRng(resourceBag, rng);
  let ri = 0;
  for (let i = 0; i < hexCount; i += 1) {
    if (desertSet.has(i)) continue;
    resources[i] = shuffledResources[ri];
    ri += 1;
  }

  let tokens = null;
  for (let attempt = 0; attempt < 220; attempt += 1) {
    tokens = tryAssignTokens({ rng, desertIndices, hexCount, neighborIndices, tokenBag });
    if (tokens) break;
  }
  if (!tokens) throw new Error("failed to generate random-balanced tokens");

  return { resources, tokens, desertIndices, seed: normalizedSeed };
}

export function getPresetDefinition(presetId, { seed = null, radius = 2 } = {}) {
  const meta = PRESET_META.find((p) => p.id === presetId) ?? PRESET_META[0];

  // Index order corresponds to sorted cube-radius-2 coords (see board generator).
  if (meta.id === "classic-balanced") {
    const resources = [
      "wood",
      "brick",
      "sheep",
      "wheat",
      "ore",
      "wood",
      "brick",
      "sheep",
      "wheat",
      "desert",
      "ore",
      "wood",
      "brick",
      "sheep",
      "wheat",
      "ore",
      "wood",
      "sheep",
      "wheat"
    ];
    const tokens = [5, 2, 6, 3, 8, 10, 9, 12, 11, null, 4, 8, 10, 9, 4, 5, 6, 3, 11];
    return { ...meta, ...withDesertAtCenter(resources, tokens) };
  }

  if (meta.id === "trade-heavy") {
    const resources = [
      "wood",
      "brick",
      "sheep",
      "wheat",
      "ore",
      "wood",
      "brick",
      "ore",
      "wheat",
      "desert",
      "ore",
      "wood",
      "brick",
      "sheep",
      "wheat",
      "wood",
      "wheat",
      "sheep",
      "sheep"
    ];
    const tokens = [5, 2, 6, 3, 8, 10, 9, 12, 11, null, 4, 8, 10, 9, 4, 5, 6, 3, 11];
    return { ...meta, ...withDesertAtCenter(resources, tokens) };
  }

  if (meta.id === "sheep-wheat-boom") {
    const resources = [
      "wood",
      "ore",
      "sheep",
      "brick",
      "wheat",
      "sheep",
      "sheep",
      "ore",
      "wood",
      "desert",
      "ore",
      "wheat",
      "sheep",
      "wheat",
      "brick",
      "wood",
      "wheat",
      "brick",
      "wood"
    ];
    const tokens = [5, 2, 6, 3, 8, 10, 9, 12, 11, null, 4, 8, 10, 9, 4, 5, 6, 3, 11];
    return { ...meta, ...withDesertAtCenter(resources, tokens) };
  }

  if (meta.id === "high-ore") {
    const resources = [
      "wheat",
      "ore",
      "wheat",
      "sheep",
      "ore",
      "ore",
      "sheep",
      "wood",
      "brick",
      "desert",
      "wood",
      "brick",
      "wood",
      "brick",
      "sheep",
      "wheat",
      "wood",
      "sheep",
      "wheat"
    ];
    const tokens = [5, 2, 6, 3, 8, 10, 9, 12, 11, null, 4, 8, 10, 9, 4, 5, 6, 3, 11];
    return { ...meta, ...withDesertAtCenter(resources, tokens) };
  }

  if (meta.id === "high-brick-wood") {
    const resources = [
      "brick",
      "wood",
      "brick",
      "wood",
      "wood",
      "brick",
      "wood",
      "wheat",
      "ore",
      "desert",
      "ore",
      "wheat",
      "sheep",
      "wheat",
      "sheep",
      "wheat",
      "sheep",
      "sheep",
      "ore"
    ];
    const tokens = [5, 2, 6, 3, 8, 10, 9, 12, 11, null, 4, 8, 10, 9, 4, 5, 6, 3, 11];
    return { ...meta, ...withDesertAtCenter(resources, tokens) };
  }

  // --- Expanded presets (radius 3, 37 hexes, 2 deserts) ---

  if (meta.id === "classic-balanced-expanded") {
    // Even spread of resources across the board.
    // Deserts at center (18) and inner ring (30).
    const resources = [
      "wheat",
      "wood",
      "ore",
      "brick",
      "sheep",
      "wood",
      "wheat",
      "brick",
      "sheep",
      "ore",
      "wheat",
      "sheep",
      "wood",
      "brick",
      "wood",
      "sheep",
      "wheat",
      "wood",
      "desert",
      "sheep",
      "ore",
      "wheat",
      "brick",
      "wood",
      "wheat",
      "sheep",
      "brick",
      "wood",
      "sheep",
      "wheat",
      "desert",
      "brick",
      "ore",
      "wood",
      "sheep",
      "wheat",
      "brick"
    ];
    const tokens = [
      6,
      10,
      6,
      12,
      9,
      3,
      4,
      5,
      6,
      8,
      10,
      8,
      3,
      12,
      9,
      5,
      11,
      2,
      null,
      10,
      4,
      3,
      8,
      9,
      11,
      2,
      10,
      5,
      3,
      4,
      null,
      9,
      11,
      5,
      11,
      4,
      12
    ];
    return { ...meta, ...withExpandedDeserts(resources, tokens, [18, 30]) };
  }

  if (meta.id === "trade-heavy-expanded") {
    // Resource variety spread across the board for diverse trading.
    // Deserts at inner ring (10, 26).
    const resources = [
      "wood",
      "ore",
      "wheat",
      "sheep",
      "brick",
      "wheat",
      "ore",
      "wood",
      "brick",
      "sheep",
      "desert",
      "wheat",
      "sheep",
      "wood",
      "wheat",
      "ore",
      "wood",
      "brick",
      "sheep",
      "wheat",
      "wood",
      "ore",
      "sheep",
      "brick",
      "wood",
      "wheat",
      "desert",
      "sheep",
      "brick",
      "wheat",
      "brick",
      "sheep",
      "wheat",
      "wood",
      "brick",
      "sheep",
      "wood"
    ];
    const tokens = [
      6,
      9,
      6,
      11,
      4,
      5,
      10,
      3,
      6,
      8,
      null,
      9,
      4,
      11,
      8,
      5,
      10,
      3,
      12,
      2,
      8,
      9,
      4,
      11,
      5,
      10,
      null,
      3,
      12,
      2,
      9,
      10,
      5,
      12,
      3,
      11,
      4
    ];
    return { ...meta, ...withExpandedDeserts(resources, tokens, [10, 26]) };
  }

  if (meta.id === "sheep-wheat-boom-expanded") {
    // Sheep and wheat clustered in prime positions.
    // Deserts at ring-2 positions (5, 31).
    const resources = [
      "sheep",
      "wheat",
      "sheep",
      "wheat",
      "wood",
      "desert",
      "wheat",
      "sheep",
      "brick",
      "ore",
      "wheat",
      "sheep",
      "wood",
      "brick",
      "sheep",
      "wheat",
      "wood",
      "brick",
      "wheat",
      "sheep",
      "ore",
      "wood",
      "wheat",
      "sheep",
      "brick",
      "wood",
      "sheep",
      "ore",
      "brick",
      "wood",
      "wood",
      "desert",
      "brick",
      "ore",
      "wood",
      "wheat",
      "brick"
    ];
    const tokens = [
      6,
      12,
      6,
      10,
      11,
      null,
      5,
      4,
      6,
      8,
      12,
      8,
      5,
      10,
      3,
      4,
      11,
      3,
      9,
      2,
      12,
      5,
      10,
      4,
      11,
      3,
      9,
      10,
      11,
      4,
      3,
      null,
      5,
      8,
      2,
      9,
      9
    ];
    return { ...meta, ...withExpandedDeserts(resources, tokens, [5, 31]) };
  }

  if (meta.id === "high-ore-expanded") {
    // Ore tiles clustered near center with strong number tokens.
    // Deserts at ring-1 positions flanking center (16, 20).
    const resources = [
      "ore",
      "wheat",
      "wood",
      "sheep",
      "brick",
      "wood",
      "wheat",
      "ore",
      "sheep",
      "wood",
      "sheep",
      "ore",
      "wheat",
      "brick",
      "wood",
      "sheep",
      "desert",
      "wheat",
      "ore",
      "brick",
      "desert",
      "wheat",
      "wheat",
      "sheep",
      "brick",
      "wheat",
      "sheep",
      "brick",
      "wood",
      "wood",
      "sheep",
      "brick",
      "wood",
      "sheep",
      "wheat",
      "wood",
      "brick"
    ];
    const tokens = [
      8,
      3,
      6,
      5,
      9,
      4,
      10,
      6,
      12,
      8,
      3,
      8,
      5,
      9,
      4,
      10,
      null,
      12,
      6,
      11,
      null,
      2,
      3,
      5,
      9,
      4,
      10,
      11,
      11,
      2,
      3,
      5,
      9,
      4,
      10,
      12,
      11
    ];
    return { ...meta, ...withExpandedDeserts(resources, tokens, [16, 20]) };
  }

  if (meta.id === "high-brick-wood-expanded") {
    // Brick and wood concentrated in the top half of the board.
    // Deserts at (12, 24) splitting the board.
    const resources = [
      "brick",
      "wood",
      "brick",
      "wood",
      "wood",
      "brick",
      "wood",
      "brick",
      "wood",
      "sheep",
      "wheat",
      "ore",
      "desert",
      "wheat",
      "brick",
      "sheep",
      "wood",
      "wheat",
      "ore",
      "brick",
      "sheep",
      "wheat",
      "ore",
      "sheep",
      "desert",
      "wood",
      "wheat",
      "sheep",
      "wheat",
      "sheep",
      "ore",
      "wheat",
      "sheep",
      "wheat",
      "brick",
      "wood",
      "sheep"
    ];
    const tokens = [
      6,
      11,
      6,
      10,
      4,
      3,
      9,
      5,
      6,
      8,
      11,
      8,
      null,
      4,
      10,
      3,
      9,
      5,
      8,
      12,
      2,
      10,
      3,
      12,
      null,
      9,
      5,
      11,
      4,
      10,
      3,
      9,
      5,
      12,
      2,
      11,
      4
    ];
    return { ...meta, ...withExpandedDeserts(resources, tokens, [12, 24]) };
  }

  if (meta.id === "random-balanced") {
    return { ...meta, ...generateRandomBalancedPreset({ seed, radius }) };
  }

  // Fallback to classic.
  return getPresetDefinition("classic-balanced");
}
