/**
 * Board Geometry Tests
 *
 * Tests for board-to-geometry mapping to prevent 3D interaction regressions.
 * These tests run headless (no WebGL required) by validating data structures.
 */

import { test, describe } from "node:test";
import assert from "node:assert";

// === MOCK BOARD DATA ===

/**
 * Creates a mock standard Catan board with classic layout.
 * Classic layout: 19 hexes, 54 vertices, 72 edges.
 */
function createMockStandardBoard() {
  const SQRT3 = Math.sqrt(3);
  const HEX_SIZE = 100;

  function roundKey(n) {
    return Math.round(n * 1000);
  }

  function pointKey(x, y) {
    return `${roundKey(x)}:${roundKey(y)}`;
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

  const coords = generateHexCoords(2);
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

  const resources = [
    "ore",
    "sheep",
    "wheat",
    "brick",
    "wood",
    "sheep",
    "ore",
    "wood",
    "wheat",
    "desert",
    "brick",
    "sheep",
    "wood",
    "wheat",
    "ore",
    "brick",
    "sheep",
    "wood",
    "wheat"
  ];
  const tokens = [10, 2, 9, 12, 6, 4, 10, 9, 11, null, 3, 8, 8, 3, 4, 5, 5, 6, 11];

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
      resource: resources[idx],
      token: tokens[idx],
      cornerVertexIds: corners.map((v) => v.id)
    };
  });

  // Build vertex neighbor/edge lists
  const vertexById = new Map(vertices.map((v) => [v.id, v]));
  for (const e of edges) {
    const vA = vertexById.get(e.vA);
    const vB = vertexById.get(e.vB);
    vA.neighborVertexIds.push(vB.id);
    vB.neighborVertexIds.push(vA.id);
    vA.edgeIds.push(e.id);
    vB.edgeIds.push(e.id);
  }

  // Compute bounds
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

  return {
    layout: "standard-radius-2",
    hexSize: HEX_SIZE,
    hexes,
    vertices,
    edges,
    ports: [],
    bounds: { minX, minY, maxX, maxY }
  };
}

// === GEOMETRY HELPER FUNCTIONS ===

/**
 * Simulates pick mesh creation logic from board-3d.js.
 * Returns counts of pick meshes that would be created.
 */
function simulatePickMeshCreation(board) {
  const vertices = Array.isArray(board.vertices) ? board.vertices : [];
  const edges = Array.isArray(board.edges) ? board.edges : [];
  const hexes = Array.isArray(board.hexes) ? board.hexes : [];

  const verticesById = new Map(vertices.map((v) => [v.id, v]));

  let hexPickCount = 0;
  let edgePickCount = 0;
  let vertexPickCount = 0;

  // Hex pick meshes
  for (const h of hexes) {
    if (!h?.id) continue;
    const cornerIds = Array.isArray(h.cornerVertexIds) ? h.cornerVertexIds : [];
    const pts = cornerIds.map((id) => verticesById.get(id)).filter(Boolean);
    if (pts.length >= 3) {
      hexPickCount++;
    }
  }

  // Edge pick meshes
  for (const e of edges) {
    if (!e?.id) continue;
    const vA = verticesById.get(e.vA);
    const vB = verticesById.get(e.vB);
    if (vA && vB) {
      edgePickCount++;
    }
  }

  // Vertex pick meshes
  for (const v of vertices) {
    if (!v?.id) continue;
    vertexPickCount++;
  }

  return { hexPickCount, edgePickCount, vertexPickCount };
}

/**
 * Validates that all vertex IDs referenced by hexes exist.
 */
function validateVertexReferences(board) {
  const vertices = Array.isArray(board.vertices) ? board.vertices : [];
  const hexes = Array.isArray(board.hexes) ? board.hexes : [];
  const vertexIds = new Set(vertices.map((v) => v.id));

  const errors = [];
  for (const h of hexes) {
    const cornerIds = Array.isArray(h.cornerVertexIds) ? h.cornerVertexIds : [];
    for (const vId of cornerIds) {
      if (!vertexIds.has(vId)) {
        errors.push(`Hex ${h.id} references missing vertex ${vId}`);
      }
    }
  }
  return errors;
}

/**
 * Validates that all edge vertex references exist.
 */
function validateEdgeReferences(board) {
  const vertices = Array.isArray(board.vertices) ? board.vertices : [];
  const edges = Array.isArray(board.edges) ? board.edges : [];
  const vertexIds = new Set(vertices.map((v) => v.id));

  const errors = [];
  for (const e of edges) {
    if (!vertexIds.has(e.vA)) {
      errors.push(`Edge ${e.id} references missing vertex ${e.vA}`);
    }
    if (!vertexIds.has(e.vB)) {
      errors.push(`Edge ${e.id} references missing vertex ${e.vB}`);
    }
  }
  return errors;
}

// === TESTS ===

describe("Board-to-Geometry Mapping", () => {
  test("standard board has correct element counts (19 hexes, 54 vertices, 72 edges)", () => {
    const board = createMockStandardBoard();

    assert.strictEqual(board.hexes.length, 19, "Should have 19 hexes");
    assert.strictEqual(board.vertices.length, 54, "Should have 54 vertices");
    assert.strictEqual(board.edges.length, 72, "Should have 72 edges");
  });

  test("all hex corner vertex references are valid", () => {
    const board = createMockStandardBoard();
    const errors = validateVertexReferences(board);

    assert.strictEqual(errors.length, 0, `Vertex reference errors: ${errors.join(", ")}`);
  });

  test("all edge vertex references are valid", () => {
    const board = createMockStandardBoard();
    const errors = validateEdgeReferences(board);

    assert.strictEqual(errors.length, 0, `Edge reference errors: ${errors.join(", ")}`);
  });

  test("each hex has exactly 6 corner vertices", () => {
    const board = createMockStandardBoard();

    for (const hex of board.hexes) {
      assert.strictEqual(
        hex.cornerVertexIds.length,
        6,
        `Hex ${hex.id} should have 6 corners, got ${hex.cornerVertexIds.length}`
      );
    }
  });

  test("board bounds are computed correctly", () => {
    const board = createMockStandardBoard();

    assert.ok(Number.isFinite(board.bounds.minX), "bounds.minX should be finite");
    assert.ok(Number.isFinite(board.bounds.maxX), "bounds.maxX should be finite");
    assert.ok(Number.isFinite(board.bounds.minY), "bounds.minY should be finite");
    assert.ok(Number.isFinite(board.bounds.maxY), "bounds.maxY should be finite");
    assert.ok(board.bounds.maxX > board.bounds.minX, "maxX should be greater than minX");
    assert.ok(board.bounds.maxY > board.bounds.minY, "maxY should be greater than minY");
  });
});

describe("Edge/Vertex Pick Mesh Placement", () => {
  test("pick meshes are created for each hex", () => {
    const board = createMockStandardBoard();
    const counts = simulatePickMeshCreation(board);

    assert.strictEqual(counts.hexPickCount, 19, "Should create 19 hex pick meshes");
  });

  test("pick meshes are created for each edge", () => {
    const board = createMockStandardBoard();
    const counts = simulatePickMeshCreation(board);

    assert.strictEqual(counts.edgePickCount, 72, "Should create 72 edge pick meshes");
  });

  test("pick meshes are created for each vertex", () => {
    const board = createMockStandardBoard();
    const counts = simulatePickMeshCreation(board);

    assert.strictEqual(counts.vertexPickCount, 54, "Should create 54 vertex pick meshes");
  });

  test("pick mesh counts match board data counts", () => {
    const board = createMockStandardBoard();
    const counts = simulatePickMeshCreation(board);

    assert.strictEqual(counts.hexPickCount, board.hexes.length, "Hex pick count should match hex count");
    assert.strictEqual(counts.edgePickCount, board.edges.length, "Edge pick count should match edge count");
    assert.strictEqual(counts.vertexPickCount, board.vertices.length, "Vertex pick count should match vertex count");
  });

  test("handles malformed board data gracefully", () => {
    const malformedBoard = {
      hexes: [{ id: "H0", cornerVertexIds: ["V0", "V1", "MISSING"] }],
      vertices: [
        { id: "V0", x: 0, y: 0 },
        { id: "V1", x: 10, y: 0 }
      ],
      edges: [{ id: "E0", vA: "V0", vB: "V1" }]
    };

    // Should not throw, just return reduced counts
    const counts = simulatePickMeshCreation(malformedBoard);
    assert.strictEqual(counts.hexPickCount, 0, "Malformed hex should not create pick mesh");
    assert.strictEqual(counts.edgePickCount, 1, "Valid edge should create pick mesh");
    assert.strictEqual(counts.vertexPickCount, 2, "Valid vertices should create pick meshes");
  });
});

describe("Theme Manifest Validation (Stub)", () => {
  test("theme schema validation placeholder", () => {
    // This is a stub for future theme validation.
    // When themes are implemented, this should validate:
    // - Required fields present (name, version, assets)
    // - Asset paths are valid
    // - Color values are valid hex/rgb

    const mockThemeManifest = {
      name: "default",
      version: "1.0.0",
      assets: {
        hexTextures: {},
        structureModels: {}
      }
    };

    assert.ok(mockThemeManifest.name, "Theme should have a name");
    assert.ok(mockThemeManifest.version, "Theme should have a version");
    assert.ok(mockThemeManifest.assets, "Theme should have assets");
  });

  test("theme manifest structure check placeholder", () => {
    // Placeholder for validating theme manifest structure
    const validateThemeManifest = (manifest) => {
      const errors = [];
      if (!manifest || typeof manifest !== "object") {
        errors.push("Manifest must be an object");
        return errors;
      }
      if (typeof manifest.name !== "string" || !manifest.name) {
        errors.push("Manifest must have a name string");
      }
      if (typeof manifest.version !== "string" || !manifest.version) {
        errors.push("Manifest must have a version string");
      }
      return errors;
    };

    const validManifest = { name: "test", version: "1.0" };
    const invalidManifest = { name: "" };

    assert.strictEqual(validateThemeManifest(validManifest).length, 0);
    assert.ok(validateThemeManifest(invalidManifest).length > 0);
    assert.ok(validateThemeManifest(null).length > 0);
  });
});

describe("Selectable ID Validation", () => {
  test("validates selectable vertex IDs exist in board", () => {
    const board = createMockStandardBoard();
    const vertexIds = new Set(board.vertices.map((v) => v.id));

    const validateSelectableVertices = (selectableIds, boardVertexIds) => {
      const invalid = [];
      for (const id of selectableIds) {
        if (!boardVertexIds.has(id)) {
          invalid.push(id);
        }
      }
      return invalid;
    };

    // Valid IDs
    const validIds = ["V0", "V1", "V2"];
    assert.strictEqual(validateSelectableVertices(validIds, vertexIds).length, 0);

    // Invalid IDs
    const invalidIds = ["V0", "V999", "FAKE"];
    const invalid = validateSelectableVertices(invalidIds, vertexIds);
    assert.strictEqual(invalid.length, 2);
    assert.ok(invalid.includes("V999"));
    assert.ok(invalid.includes("FAKE"));
  });

  test("validates selectable edge IDs exist in board", () => {
    const board = createMockStandardBoard();
    const edgeIds = new Set(board.edges.map((e) => e.id));

    const validateSelectableEdges = (selectableIds, boardEdgeIds) => {
      const invalid = [];
      for (const id of selectableIds) {
        if (!boardEdgeIds.has(id)) {
          invalid.push(id);
        }
      }
      return invalid;
    };

    // Valid IDs
    const validIds = ["E0", "E1", "E2"];
    assert.strictEqual(validateSelectableEdges(validIds, edgeIds).length, 0);

    // Invalid IDs
    const invalidIds = ["E0", "E999"];
    const invalid = validateSelectableEdges(invalidIds, edgeIds);
    assert.strictEqual(invalid.length, 1);
    assert.ok(invalid.includes("E999"));
  });

  test("validates selectable hex IDs exist in board", () => {
    const board = createMockStandardBoard();
    const hexIds = new Set(board.hexes.map((h) => h.id));

    const validateSelectableHexes = (selectableIds, boardHexIds) => {
      const invalid = [];
      for (const id of selectableIds) {
        if (!boardHexIds.has(id)) {
          invalid.push(id);
        }
      }
      return invalid;
    };

    // Valid IDs
    const validIds = ["H0", "H1", "H18"];
    assert.strictEqual(validateSelectableHexes(validIds, hexIds).length, 0);

    // Invalid IDs
    const invalidIds = ["H0", "H99"];
    const invalid = validateSelectableHexes(invalidIds, hexIds);
    assert.strictEqual(invalid.length, 1);
    assert.ok(invalid.includes("H99"));
  });
});
