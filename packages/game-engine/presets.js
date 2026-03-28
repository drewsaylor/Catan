export const PRESET_META = [
  { id: "classic-balanced", name: "Classic Balanced" },
  { id: "trade-heavy", name: "Trade Heavy" },
  { id: "sheep-wheat-boom", name: "Sheep/Wheat Boom" },
  { id: "high-ore", name: "High Ore" },
  { id: "high-brick-wood", name: "Brick/Wood Rush" },
  { id: "random-balanced", name: "Random (Balanced-ish)" }
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
    { dq: 1, dr: 0 }, { dq: -1, dr: 0 },
    { dq: 0, dr: 1 }, { dq: 0, dr: -1 },
    { dq: 1, dr: -1 }, { dq: -1, dr: 1 }
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
    const x = q, z = r, y = -x - z;
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
  2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8,
  9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12,
  3, 4, 5, 9, 10, 11, 12
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
      chosen.push(coords.findIndex(c => c.q === 0 && c.r === 0));
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

  if (meta.id === "random-balanced") {
    return { ...meta, ...generateRandomBalancedPreset({ seed, radius }) };
  }

  // Fallback to classic.
  return getPresetDefinition("classic-balanced");
}
