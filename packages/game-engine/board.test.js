/**
 * Board Generation Tests
 *
 * Tests for board generation, vertex/edge connectivity, and port placement.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { generateStandardBoard } from "./board.js";

// Mock preset definition for testing
const mockPresetDef = {
  resources: [
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
  ],
  tokens: [10, 2, 9, 12, 6, 4, 10, 9, 11, null, 3, 8, 8, 3, 4, 5, 5, 6, 11]
};

describe("generateStandardBoard", () => {
  test("generates correct number of hexes", () => {
    const board = generateStandardBoard(mockPresetDef);
    assert.equal(board.hexes.length, 19);
  });

  test("generates correct number of vertices", () => {
    const board = generateStandardBoard(mockPresetDef);
    assert.equal(board.vertices.length, 54);
  });

  test("generates correct number of edges", () => {
    const board = generateStandardBoard(mockPresetDef);
    assert.equal(board.edges.length, 72);
  });

  test("generates correct number of ports", () => {
    const board = generateStandardBoard(mockPresetDef);
    assert.equal(board.ports.length, 9);
  });

  test("throws on resource count mismatch", () => {
    const badPreset = {
      resources: ["wood", "brick"], // Too few
      tokens: mockPresetDef.tokens
    };
    assert.throws(() => generateStandardBoard(badPreset), /resource count mismatch/);
  });

  test("throws on token count mismatch", () => {
    const badPreset = {
      resources: mockPresetDef.resources,
      tokens: [1, 2, 3] // Too few
    };
    assert.throws(() => generateStandardBoard(badPreset), /token count mismatch/);
  });
});

describe("Hex properties", () => {
  test("each hex has required properties", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (const hex of board.hexes) {
      assert.ok(typeof hex.id === "string", "hex should have id");
      assert.ok(typeof hex.q === "number", "hex should have q coordinate");
      assert.ok(typeof hex.r === "number", "hex should have r coordinate");
      assert.ok(typeof hex.center === "object", "hex should have center");
      assert.ok(typeof hex.center.x === "number", "hex center should have x");
      assert.ok(typeof hex.center.y === "number", "hex center should have y");
      assert.ok(hex.resource !== undefined, "hex should have resource");
      assert.ok(Array.isArray(hex.cornerVertexIds), "hex should have cornerVertexIds");
    }
  });

  test("each hex has exactly 6 corner vertices", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (const hex of board.hexes) {
      assert.equal(hex.cornerVertexIds.length, 6, `Hex ${hex.id} should have 6 corners`);
    }
  });

  test("hex IDs are unique", () => {
    const board = generateStandardBoard(mockPresetDef);
    const ids = board.hexes.map((h) => h.id);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, ids.length);
  });

  test("hexes have correct resources from preset", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (let i = 0; i < board.hexes.length; i++) {
      assert.equal(board.hexes[i].resource, mockPresetDef.resources[i]);
    }
  });

  test("hexes have correct tokens from preset", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (let i = 0; i < board.hexes.length; i++) {
      assert.equal(board.hexes[i].token, mockPresetDef.tokens[i]);
    }
  });
});

describe("Vertex properties", () => {
  test("each vertex has required properties", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (const vertex of board.vertices) {
      assert.ok(typeof vertex.id === "string", "vertex should have id");
      assert.ok(typeof vertex.x === "number", "vertex should have x");
      assert.ok(typeof vertex.y === "number", "vertex should have y");
      assert.ok(Array.isArray(vertex.adjacentHexIds), "vertex should have adjacentHexIds");
      assert.ok(Array.isArray(vertex.neighborVertexIds), "vertex should have neighborVertexIds");
      assert.ok(Array.isArray(vertex.edgeIds), "vertex should have edgeIds");
    }
  });

  test("vertex IDs are unique", () => {
    const board = generateStandardBoard(mockPresetDef);
    const ids = board.vertices.map((v) => v.id);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, ids.length);
  });

  test("vertices have 1-3 adjacent hexes", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (const vertex of board.vertices) {
      assert.ok(
        vertex.adjacentHexIds.length >= 1 && vertex.adjacentHexIds.length <= 3,
        `Vertex ${vertex.id} should have 1-3 adjacent hexes, got ${vertex.adjacentHexIds.length}`
      );
    }
  });

  test("vertices have 2-3 neighbor vertices", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (const vertex of board.vertices) {
      assert.ok(
        vertex.neighborVertexIds.length >= 2 && vertex.neighborVertexIds.length <= 3,
        `Vertex ${vertex.id} should have 2-3 neighbors, got ${vertex.neighborVertexIds.length}`
      );
    }
  });

  test("vertices have 2-3 edges", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (const vertex of board.vertices) {
      assert.ok(
        vertex.edgeIds.length >= 2 && vertex.edgeIds.length <= 3,
        `Vertex ${vertex.id} should have 2-3 edges, got ${vertex.edgeIds.length}`
      );
    }
  });

  test("neighbor count matches edge count for each vertex", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (const vertex of board.vertices) {
      assert.equal(
        vertex.neighborVertexIds.length,
        vertex.edgeIds.length,
        `Vertex ${vertex.id} neighbor count should match edge count`
      );
    }
  });
});

describe("Edge properties", () => {
  test("each edge has required properties", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (const edge of board.edges) {
      assert.ok(typeof edge.id === "string", "edge should have id");
      assert.ok(typeof edge.vA === "string", "edge should have vA");
      assert.ok(typeof edge.vB === "string", "edge should have vB");
    }
  });

  test("edge IDs are unique", () => {
    const board = generateStandardBoard(mockPresetDef);
    const ids = board.edges.map((e) => e.id);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, ids.length);
  });

  test("edge vertex references are valid", () => {
    const board = generateStandardBoard(mockPresetDef);
    const vertexIds = new Set(board.vertices.map((v) => v.id));

    for (const edge of board.edges) {
      assert.ok(vertexIds.has(edge.vA), `Edge ${edge.id} references invalid vertex ${edge.vA}`);
      assert.ok(vertexIds.has(edge.vB), `Edge ${edge.id} references invalid vertex ${edge.vB}`);
    }
  });

  test("edges connect different vertices", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (const edge of board.edges) {
      assert.notEqual(edge.vA, edge.vB, `Edge ${edge.id} connects vertex to itself`);
    }
  });

  test("edge vA is lexicographically less than vB", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (const edge of board.edges) {
      assert.ok(edge.vA < edge.vB, `Edge ${edge.id} vertices not in order: ${edge.vA} < ${edge.vB}`);
    }
  });
});

describe("Vertex-Edge consistency", () => {
  test("vertex edge lists reference valid edges", () => {
    const board = generateStandardBoard(mockPresetDef);
    const edgeIds = new Set(board.edges.map((e) => e.id));

    for (const vertex of board.vertices) {
      for (const edgeId of vertex.edgeIds) {
        assert.ok(edgeIds.has(edgeId), `Vertex ${vertex.id} references invalid edge ${edgeId}`);
      }
    }
  });

  test("vertex neighbor lists reference valid vertices", () => {
    const board = generateStandardBoard(mockPresetDef);
    const vertexIds = new Set(board.vertices.map((v) => v.id));

    for (const vertex of board.vertices) {
      for (const neighborId of vertex.neighborVertexIds) {
        assert.ok(vertexIds.has(neighborId), `Vertex ${vertex.id} references invalid neighbor ${neighborId}`);
      }
    }
  });

  test("neighbor relationships are symmetric", () => {
    const board = generateStandardBoard(mockPresetDef);
    const vertexById = new Map(board.vertices.map((v) => [v.id, v]));

    for (const vertex of board.vertices) {
      for (const neighborId of vertex.neighborVertexIds) {
        const neighbor = vertexById.get(neighborId);
        assert.ok(
          neighbor.neighborVertexIds.includes(vertex.id),
          `Neighbor relationship not symmetric: ${vertex.id} -> ${neighborId}`
        );
      }
    }
  });

  test("edges connect vertices that list each other as neighbors", () => {
    const board = generateStandardBoard(mockPresetDef);
    const vertexById = new Map(board.vertices.map((v) => [v.id, v]));

    for (const edge of board.edges) {
      const vA = vertexById.get(edge.vA);
      const vB = vertexById.get(edge.vB);

      assert.ok(
        vA.neighborVertexIds.includes(edge.vB),
        `Edge ${edge.id}: ${edge.vA} should list ${edge.vB} as neighbor`
      );
      assert.ok(
        vB.neighborVertexIds.includes(edge.vA),
        `Edge ${edge.id}: ${edge.vB} should list ${edge.vA} as neighbor`
      );
    }
  });
});

describe("Hex-Vertex consistency", () => {
  test("hex corner vertices reference valid vertices", () => {
    const board = generateStandardBoard(mockPresetDef);
    const vertexIds = new Set(board.vertices.map((v) => v.id));

    for (const hex of board.hexes) {
      for (const vertexId of hex.cornerVertexIds) {
        assert.ok(vertexIds.has(vertexId), `Hex ${hex.id} references invalid vertex ${vertexId}`);
      }
    }
  });

  test("vertices list hexes that list them as corners", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (const hex of board.hexes) {
      const vertexById = new Map(board.vertices.map((v) => [v.id, v]));
      for (const vertexId of hex.cornerVertexIds) {
        const vertex = vertexById.get(vertexId);
        assert.ok(vertex.adjacentHexIds.includes(hex.id), `Vertex ${vertexId} should list hex ${hex.id} as adjacent`);
      }
    }
  });
});

describe("Port properties", () => {
  test("each port has required properties", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (const port of board.ports) {
      assert.ok(typeof port.id === "string", "port should have id");
      assert.ok(typeof port.kind === "string", "port should have kind");
      assert.ok(typeof port.ratio === "number", "port should have ratio");
      assert.ok(typeof port.edgeId === "string", "port should have edgeId");
      assert.ok(Array.isArray(port.vertexIds), "port should have vertexIds");
      assert.equal(port.vertexIds.length, 2, "port should have 2 vertices");
    }
  });

  test("port IDs are unique", () => {
    const board = generateStandardBoard(mockPresetDef);
    const ids = board.ports.map((p) => p.id);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, ids.length);
  });

  test("port kinds have correct ratios", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (const port of board.ports) {
      if (port.kind === "generic") {
        assert.equal(port.ratio, 3, `Generic port should have ratio 3`);
      } else {
        assert.equal(port.ratio, 2, `${port.kind} port should have ratio 2`);
      }
    }
  });

  test("ports reference valid edges", () => {
    const board = generateStandardBoard(mockPresetDef);
    const edgeIds = new Set(board.edges.map((e) => e.id));

    for (const port of board.ports) {
      assert.ok(edgeIds.has(port.edgeId), `Port ${port.id} references invalid edge ${port.edgeId}`);
    }
  });

  test("ports reference valid vertices", () => {
    const board = generateStandardBoard(mockPresetDef);
    const vertexIds = new Set(board.vertices.map((v) => v.id));

    for (const port of board.ports) {
      for (const vertexId of port.vertexIds) {
        assert.ok(vertexIds.has(vertexId), `Port ${port.id} references invalid vertex ${vertexId}`);
      }
    }
  });

  test("port vertices match edge vertices", () => {
    const board = generateStandardBoard(mockPresetDef);
    const edgeById = new Map(board.edges.map((e) => [e.id, e]));

    for (const port of board.ports) {
      const edge = edgeById.get(port.edgeId);
      const edgeVertices = new Set([edge.vA, edge.vB]);
      const portVertices = new Set(port.vertexIds);

      assert.deepEqual(edgeVertices, portVertices, `Port ${port.id} vertices should match edge vertices`);
    }
  });

  test("has correct distribution of port types", () => {
    const board = generateStandardBoard(mockPresetDef);
    const kindCounts = {};

    for (const port of board.ports) {
      kindCounts[port.kind] = (kindCounts[port.kind] || 0) + 1;
    }

    // Standard distribution: 4 generic, 5 specific (1 each of wood, brick, sheep, wheat, ore)
    assert.equal(kindCounts.generic, 4, "Should have 4 generic ports");
    assert.equal(kindCounts.wood, 1, "Should have 1 wood port");
    assert.equal(kindCounts.brick, 1, "Should have 1 brick port");
    assert.equal(kindCounts.sheep, 1, "Should have 1 sheep port");
    assert.equal(kindCounts.wheat, 1, "Should have 1 wheat port");
    assert.equal(kindCounts.ore, 1, "Should have 1 ore port");
  });
});

describe("Board bounds", () => {
  test("bounds are computed", () => {
    const board = generateStandardBoard(mockPresetDef);

    assert.ok(board.bounds, "board should have bounds");
    assert.ok(Number.isFinite(board.bounds.minX), "bounds.minX should be finite");
    assert.ok(Number.isFinite(board.bounds.maxX), "bounds.maxX should be finite");
    assert.ok(Number.isFinite(board.bounds.minY), "bounds.minY should be finite");
    assert.ok(Number.isFinite(board.bounds.maxY), "bounds.maxY should be finite");
  });

  test("bounds contain all vertices", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (const vertex of board.vertices) {
      assert.ok(vertex.x >= board.bounds.minX, `Vertex ${vertex.id} x below minX`);
      assert.ok(vertex.x <= board.bounds.maxX, `Vertex ${vertex.id} x above maxX`);
      assert.ok(vertex.y >= board.bounds.minY, `Vertex ${vertex.id} y below minY`);
      assert.ok(vertex.y <= board.bounds.maxY, `Vertex ${vertex.id} y above maxY`);
    }
  });

  test("bounds are tight", () => {
    const board = generateStandardBoard(mockPresetDef);

    const minX = Math.min(...board.vertices.map((v) => v.x));
    const maxX = Math.max(...board.vertices.map((v) => v.x));
    const minY = Math.min(...board.vertices.map((v) => v.y));
    const maxY = Math.max(...board.vertices.map((v) => v.y));

    assert.equal(board.bounds.minX, minX, "bounds.minX should be tight");
    assert.equal(board.bounds.maxX, maxX, "bounds.maxX should be tight");
    assert.equal(board.bounds.minY, minY, "bounds.minY should be tight");
    assert.equal(board.bounds.maxY, maxY, "bounds.maxY should be tight");
  });
});

describe("edgeByVertexPair lookup", () => {
  test("provides lookup for all edges", () => {
    const board = generateStandardBoard(mockPresetDef);

    assert.ok(board.edgeByVertexPair, "board should have edgeByVertexPair");
    assert.equal(
      Object.keys(board.edgeByVertexPair).length,
      board.edges.length,
      "edgeByVertexPair should have entry for each edge"
    );
  });

  test("lookup returns correct edge ID", () => {
    const board = generateStandardBoard(mockPresetDef);

    for (const edge of board.edges) {
      const key = `${edge.vA}|${edge.vB}`;
      assert.equal(board.edgeByVertexPair[key], edge.id, `Lookup for ${key} should return ${edge.id}`);
    }
  });
});

describe("Board layout metadata", () => {
  test("has correct layout identifier", () => {
    const board = generateStandardBoard(mockPresetDef);
    assert.equal(board.layout, "standard-radius-2");
  });

  test("has correct hex size", () => {
    const board = generateStandardBoard(mockPresetDef);
    assert.equal(board.hexSize, 100);
  });
});
