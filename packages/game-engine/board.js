const SQRT3 = Math.sqrt(3);
const HEX_SIZE = 100;

function roundKey(n) {
  return Math.round(n * 1000);
}

function pointKey(x, y) {
  return `${roundKey(x)}:${roundKey(y)}`;
}

function keyPair(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function generateHexCoords(radius = 2) {
  const out = [];
  for (let x = -radius; x <= radius; x += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      const z = -x - y;
      if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= radius) {
        const q = x;
        const r = z;
        out.push({ q, r });
      }
    }
  }
  out.sort((a, b) => a.r - b.r || a.q - b.q);
  return out;
}

function axialToPixel(q, r, size = HEX_SIZE) {
  return {
    x: size * SQRT3 * (q + r / 2),
    y: size * 1.5 * r
  };
}

function hexCornerOffsets(size = HEX_SIZE) {
  // Pointy-top layout.
  const a = (SQRT3 / 2) * size;
  const b = 0.5 * size;
  return [
    { x: 0, y: -size },
    { x: a, y: -b },
    { x: a, y: b },
    { x: 0, y: size },
    { x: -a, y: b },
    { x: -a, y: -b }
  ];
}

export function generateStandardBoard(presetDef) {
  const coords = generateHexCoords(2);
  if (presetDef.resources.length !== coords.length) throw new Error("Preset resource count mismatch");
  if (presetDef.tokens.length !== coords.length) throw new Error("Preset token count mismatch");

  const verticesByKey = new Map();
  const vertices = [];
  const edgesByKey = new Map();
  const edges = [];
  const cornerOffsets = hexCornerOffsets(HEX_SIZE);

  function getOrCreateVertex(pt) {
    const key = pointKey(pt.x, pt.y);
    const existing = verticesByKey.get(key);
    if (existing) return existing;
    const id = `V${vertices.length}`;
    const v = {
      id,
      x: pt.x,
      y: pt.y,
      adjacentHexIds: [],
      neighborVertexIds: [],
      edgeIds: []
    };
    verticesByKey.set(key, v);
    vertices.push(v);
    return v;
  }

  function addEdge(vA, vB) {
    const a = vA.id < vB.id ? vA : vB;
    const b = vA.id < vB.id ? vB : vA;
    const key = `${a.id}|${b.id}`;
    const existing = edgesByKey.get(key);
    if (existing) return existing;
    const id = `E${edges.length}`;
    const e = { id, vA: a.id, vB: b.id };
    edgesByKey.set(key, e);
    edges.push(e);
    return e;
  }

  const hexes = coords.map((c, idx) => {
    const center = axialToPixel(c.q, c.r, HEX_SIZE);
    const corners = cornerOffsets.map((off) => getOrCreateVertex({ x: center.x + off.x, y: center.y + off.y }));
    const hexId = `H${idx}`;

    for (const v of corners) v.adjacentHexIds.push(hexId);

    for (let i = 0; i < corners.length; i += 1) {
      const vA = corners[i];
      const vB = corners[(i + 1) % corners.length];
      addEdge(vA, vB);
    }

    return {
      id: hexId,
      q: c.q,
      r: c.r,
      center,
      resource: presetDef.resources[idx],
      token: presetDef.tokens[idx],
      cornerVertexIds: corners.map((v) => v.id)
    };
  });

  // Build vertex neighbor/edge lists.
  const vertexById = new Map(vertices.map((v) => [v.id, v]));
  for (const e of edges) {
    const vA = vertexById.get(e.vA);
    const vB = vertexById.get(e.vB);
    vA.neighborVertexIds.push(vB.id);
    vB.neighborVertexIds.push(vA.id);
    vA.edgeIds.push(e.id);
    vB.edgeIds.push(e.id);
  }

  // Compute bounds for easier client rendering.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const v of vertices) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }

  const edgeByVertexPair = {};
  for (const [k, e] of edgesByKey.entries()) edgeByVertexPair[k] = e.id;

  // --- Ports ---
  // Base-game style: 9 ports (4 generic 3:1 + 5 specific 2:1).
  // We place them on evenly spaced coastal edges, clockwise by angle.
  const edgeAdjHexIds = new Map();
  for (const hex of hexes) {
    const vs = hex.cornerVertexIds;
    for (let i = 0; i < vs.length; i += 1) {
      const a = vs[i];
      const b = vs[(i + 1) % vs.length];
      const edgeId = edgeByVertexPair[keyPair(a, b)];
      if (!edgeId) continue;
      const list = edgeAdjHexIds.get(edgeId) || [];
      list.push(hex.id);
      edgeAdjHexIds.set(edgeId, list);
    }
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const coastalEdges = [];
  for (const e of edges) {
    const adj = edgeAdjHexIds.get(e.id) || [];
    if (adj.length !== 1) continue;
    const vA = vertexById.get(e.vA);
    const vB = vertexById.get(e.vB);
    const mx = (vA.x + vB.x) / 2;
    const my = (vA.y + vB.y) / 2;
    coastalEdges.push({
      edgeId: e.id,
      vA: e.vA,
      vB: e.vB,
      adjacentHexId: adj[0],
      angle: Math.atan2(my - centerY, mx - centerX)
    });
  }
  coastalEdges.sort((a, b) => a.angle - b.angle || a.edgeId.localeCompare(b.edgeId));

  const PORT_KINDS = ["generic", "wood", "generic", "brick", "generic", "sheep", "generic", "wheat", "ore"];
  const portCount = Math.min(PORT_KINDS.length, coastalEdges.length);
  const step = coastalEdges.length / portCount;
  const ports = [];
  for (let i = 0; i < portCount; i += 1) {
    const idx = Math.floor((i + 0.5) * step);
    const chosen = coastalEdges[idx];
    const kind = PORT_KINDS[i];
    ports.push({
      id: `P${i}`,
      kind,
      ratio: kind === "generic" ? 3 : 2,
      edgeId: chosen.edgeId,
      vertexIds: [chosen.vA, chosen.vB],
      adjacentHexId: chosen.adjacentHexId
    });
  }

  return {
    layout: "standard-radius-2",
    hexSize: HEX_SIZE,
    hexes,
    vertices,
    edges,
    ports,
    edgeByVertexPair,
    bounds: { minX, minY, maxX, maxY }
  };
}
