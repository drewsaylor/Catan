const QR_VERSION = 4;
const QR_ECC_LEVEL = "M";

// Version 4-M parameters.
const QR_MODULE_COUNT = 4 * QR_VERSION + 17; // 33
const QR_TOTAL_CODEWORDS = 100;
const QR_DATA_CODEWORDS = 64;
const QR_BLOCKS = 2;
const QR_DATA_CODEWORDS_PER_BLOCK = QR_DATA_CODEWORDS / QR_BLOCKS; // 32
const QR_ECC_CODEWORDS_PER_BLOCK = (QR_TOTAL_CODEWORDS - QR_DATA_CODEWORDS) / QR_BLOCKS; // 18

const TEXT_ENCODER = new TextEncoder();

// Public API
export function qrSvg(text, { margin = 4, dark = "#000", light = "#fff", label = "QR code" } = {}) {
  const modules = makeQrModules(String(text ?? ""));
  const n = modules.length;
  const quiet = Math.max(0, Math.floor(Number(margin) || 0));
  const dim = n + quiet * 2;
  const path = modulesToPath(modules, { quiet });
  const safeLabel = escapeXml(label);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="${safeLabel}"><rect width="100%" height="100%" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}

export function qrModules(text) {
  return makeQrModules(String(text ?? ""));
}

function makeQrModules(text) {
  const dataBytes = TEXT_ENCODER.encode(text);
  // Byte mode for Version 4 supports up to 62 bytes (accounts for mode + length bits).
  if (dataBytes.length > 62) {
    throw new Error(`QR_DATA_TOO_LONG (${dataBytes.length} bytes)`);
  }

  const dataCodewords = encodeDataCodewords(dataBytes);
  const blocks = chunkIntoBlocks(dataCodewords);
  const allCodewords = interleaveBlocks(blocks);
  const dataBits = codewordsToBits(allCodewords);

  const base = makeBaseMatrix(QR_MODULE_COUNT);

  let best = null;
  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const testModules = clone2d(base.modules);
    placeDataBits(testModules, base.reserved, dataBits, mask);
    placeFormatInfo(testModules, mask);
    const score = scoreMatrix(testModules);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
      best = testModules;
    }
  }

  if (!best) {
    // Should never happen, but fail safe to mask 0.
    best = clone2d(base.modules);
    placeDataBits(best, base.reserved, dataBits, 0);
    placeFormatInfo(best, 0);
    bestMask = 0;
  }

  // Ensure format info uses selected mask (best already has it).
  void bestMask;
  return best;
}

function encodeDataCodewords(bytes) {
  // Byte mode: 0100
  const bits = [];
  pushBits(bits, 0b0100, 4);
  pushBits(bits, bytes.length, 8); // Version 1-9 uses 8 bits for byte length.
  for (const b of bytes) pushBits(bits, b, 8);

  // Terminator (up to 4 zeros).
  const maxBits = QR_DATA_CODEWORDS * 8;
  const remaining = maxBits - bits.length;
  if (remaining > 0) pushBits(bits, 0, Math.min(4, remaining));

  // Pad to byte boundary.
  while (bits.length % 8 !== 0) bits.push(0);

  // Convert to codewords.
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j += 1) v = (v << 1) | bits[i + j];
    codewords.push(v);
  }

  // Pad bytes to full data capacity.
  const pads = [0xec, 0x11];
  let padIdx = 0;
  while (codewords.length < QR_DATA_CODEWORDS) {
    codewords.push(pads[padIdx % pads.length]);
    padIdx += 1;
  }

  return codewords.slice(0, QR_DATA_CODEWORDS);
}

function chunkIntoBlocks(dataCodewords) {
  const blocks = [];
  for (let i = 0; i < QR_BLOCKS; i += 1) {
    const start = i * QR_DATA_CODEWORDS_PER_BLOCK;
    const data = dataCodewords.slice(start, start + QR_DATA_CODEWORDS_PER_BLOCK);
    const ecc = rsCompute(data, QR_ECC_CODEWORDS_PER_BLOCK);
    blocks.push({ data, ecc });
  }
  return blocks;
}

function interleaveBlocks(blocks) {
  const codewords = [];
  const maxDataLen = Math.max(...blocks.map((b) => b.data.length));
  const maxEccLen = Math.max(...blocks.map((b) => b.ecc.length));

  for (let i = 0; i < maxDataLen; i += 1) {
    for (const b of blocks) {
      if (i < b.data.length) codewords.push(b.data[i]);
    }
  }

  for (let i = 0; i < maxEccLen; i += 1) {
    for (const b of blocks) {
      if (i < b.ecc.length) codewords.push(b.ecc[i]);
    }
  }

  return codewords.slice(0, QR_TOTAL_CODEWORDS);
}

function codewordsToBits(codewords) {
  const bits = [];
  for (const cw of codewords) {
    for (let i = 7; i >= 0; i -= 1) bits.push((cw >> i) & 1);
  }
  return bits;
}

function makeBaseMatrix(n) {
  const modules = Array.from({ length: n }, () => Array(n).fill(false));
  const reserved = Array.from({ length: n }, () => Array(n).fill(false));

  const set = (x, y, dark, lock = true) => {
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    modules[y][x] = !!dark;
    if (lock) reserved[y][x] = true;
  };

  const placeFinder = (x, y) => {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;

        const inPattern = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        if (!inPattern) {
          set(xx, yy, false, true); // Separator
          continue;
        }

        const isBorder = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const isCenter = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        set(xx, yy, isBorder || isCenter, true);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(n - 7, 0);
  placeFinder(0, n - 7);

  // Timing patterns.
  for (let x = 8; x < n - 8; x += 1) set(x, 6, x % 2 === 0, true);
  for (let y = 8; y < n - 8; y += 1) set(6, y, y % 2 === 0, true);

  // Alignment patterns (Version 4: only at (26, 26)).
  placeAlignmentPattern(set, reserved, n, 26, 26);

  // Dark module.
  set(8, n - 8, true, true);

  // Reserve format information bits.
  const fmt = formatInfoCoords(n);
  for (const [x, y] of [...fmt.primary, ...fmt.secondary]) reserved[y][x] = true;

  return { modules, reserved };
}

function placeAlignmentPattern(set, reserved, n, cx, cy) {
  if (reserved[cy]?.[cx]) return;
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const dark = dist === 2 || (dx === 0 && dy === 0);
      set(x, y, dark, true);
    }
  }
}

function placeDataBits(modules, reserved, bits, mask) {
  const n = modules.length;
  let bitIndex = 0;
  let dir = -1; // Up first.

  for (let x = n - 1; x > 0; x -= 2) {
    if (x === 6) x -= 1; // Skip timing column.

    let y = dir === -1 ? n - 1 : 0;
    for (; dir === -1 ? y >= 0 : y < n; y += dir) {
      for (let dx = 0; dx < 2; dx += 1) {
        const xx = x - dx;
        if (reserved[y][xx]) continue;

        const bit = bitIndex < bits.length ? bits[bitIndex] : 0;
        bitIndex += 1;

        const masked = bit ^ (maskBit(mask, xx, y) ? 1 : 0);
        modules[y][xx] = masked === 1;
      }
    }

    dir *= -1;
  }
}

function maskBit(mask, x, y) {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function placeFormatInfo(modules, mask) {
  const n = modules.length;
  const bits = formatBits(QR_ECC_LEVEL, mask);
  const coords = formatInfoCoords(n);
  for (let i = 0; i < 15; i += 1) {
    const bit = (bits >> (14 - i)) & 1;
    const [x1, y1] = coords.primary[i];
    const [x2, y2] = coords.secondary[i];
    modules[y1][x1] = bit === 1;
    modules[y2][x2] = bit === 1;
  }
}

function formatInfoCoords(n) {
  const primary = [];
  // Top-left.
  for (let x = 0; x <= 5; x += 1) primary.push([x, 8]);
  primary.push([7, 8]);
  primary.push([8, 8]);
  primary.push([8, 7]);
  for (let y = 5; y >= 0; y -= 1) primary.push([8, y]);

  // Top-right + bottom-left.
  const secondary = [];
  for (let x = n - 1; x >= n - 8; x -= 1) secondary.push([x, 8]);
  for (let y = n - 7; y <= n - 1; y += 1) secondary.push([8, y]);

  return { primary, secondary };
}

function formatBits(eccLevel, mask) {
  const ecc = eccLevel === "M" ? 0b00 : 0b00;
  const data = (ecc << 3) | (mask & 0b111);
  let bits = data << 10;
  bits |= bchRemainder(bits, 0x537);
  bits ^= 0x5412;
  return bits & 0x7fff;
}

function bchRemainder(value, poly) {
  let v = value;
  const polyDegree = msbIndex(poly);
  while (msbIndex(v) >= polyDegree) {
    v ^= poly << (msbIndex(v) - polyDegree);
  }
  return v;
}

function msbIndex(n) {
  let v = n >>> 0;
  let idx = -1;
  while (v) {
    idx += 1;
    v >>>= 1;
  }
  return idx;
}

function scoreMatrix(modules) {
  const n = modules.length;
  let score = 0;

  // Rule 1: rows/cols with runs.
  for (let y = 0; y < n; y += 1) score += scoreRuns(modules[y]);
  for (let x = 0; x < n; x += 1) {
    const col = [];
    for (let y = 0; y < n; y += 1) col.push(modules[y][x]);
    score += scoreRuns(col);
  }

  // Rule 2: 2x2 blocks.
  for (let y = 0; y < n - 1; y += 1) {
    for (let x = 0; x < n - 1; x += 1) {
      const c = modules[y][x];
      if (modules[y][x + 1] === c && modules[y + 1][x] === c && modules[y + 1][x + 1] === c) score += 3;
    }
  }

  // Rule 3: finder-like patterns in rows/cols.
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];

  for (let y = 0; y < n; y += 1) score += scoreFinderPatterns(modules[y], pat1, pat2);
  for (let x = 0; x < n; x += 1) {
    const col = [];
    for (let y = 0; y < n; y += 1) col.push(modules[y][x]);
    score += scoreFinderPatterns(col, pat1, pat2);
  }

  // Rule 4: balance.
  let dark = 0;
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) if (modules[y][x]) dark += 1;
  }
  const total = n * n;
  const percent = (dark * 100) / total;
  const k = Math.floor(Math.abs(percent - 50) / 5);
  score += k * 10;

  return score;
}

function scoreRuns(list) {
  let score = 0;
  let runColor = list[0];
  let runLen = 1;
  for (let i = 1; i < list.length; i += 1) {
    if (list[i] === runColor) {
      runLen += 1;
      continue;
    }
    if (runLen >= 5) score += 3 + (runLen - 5);
    runColor = list[i];
    runLen = 1;
  }
  if (runLen >= 5) score += 3 + (runLen - 5);
  return score;
}

function scoreFinderPatterns(list, pat1, pat2) {
  let score = 0;
  for (let i = 0; i <= list.length - pat1.length; i += 1) {
    let m1 = true;
    let m2 = true;
    for (let j = 0; j < pat1.length; j += 1) {
      if (list[i + j] !== pat1[j]) m1 = false;
      if (list[i + j] !== pat2[j]) m2 = false;
      if (!m1 && !m2) break;
    }
    if (m1 || m2) score += 40;
  }
  return score;
}

function modulesToPath(modules, { quiet }) {
  const n = modules.length;
  const q = quiet;
  let d = "";
  for (let y = 0; y < n; y += 1) {
    let runStart = -1;
    for (let x = 0; x <= n; x += 1) {
      const dark = x < n ? modules[y][x] : false;
      if (dark) {
        if (runStart === -1) runStart = x;
        continue;
      }
      if (runStart !== -1) {
        const w = x - runStart;
        const xx = runStart + q;
        const yy = y + q;
        d += `M${xx} ${yy}h${w}v1h-${w}z`;
        runStart = -1;
      }
    }
  }
  return d;
}

function pushBits(out, value, count) {
  for (let i = count - 1; i >= 0; i -= 1) out.push((value >> i) & 1);
}

function escapeXml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function clone2d(grid) {
  return grid.map((row) => row.slice());
}

// --- Reed-Solomon (GF(256)) ---
const GF_EXP = new Array(512);
const GF_LOG = new Array(256);
let gfInit = false;

function initGf() {
  if (gfInit) return;
  gfInit = true;
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  initGf();
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function polyMultiply(p, q) {
  const out = new Array(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i += 1) {
    for (let j = 0; j < q.length; j += 1) {
      out[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return out;
}

const generatorCache = new Map();

function rsGeneratorPoly(degree) {
  if (generatorCache.has(degree)) return generatorCache.get(degree);
  initGf();
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    poly = polyMultiply(poly, [1, GF_EXP[i]]);
  }
  generatorCache.set(degree, poly);
  return poly;
}

function rsCompute(data, eccCount) {
  const gen = rsGeneratorPoly(eccCount);
  const ecc = new Array(eccCount).fill(0);

  for (const byte of data) {
    const factor = byte ^ ecc[0];
    ecc.shift();
    ecc.push(0);
    for (let j = 0; j < eccCount; j += 1) {
      ecc[j] ^= gfMul(gen[j + 1], factor);
    }
  }

  return ecc;
}
