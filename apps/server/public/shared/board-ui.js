// Global, not per render: url(#id) resolves document-wide, and the TV keeps a hidden lobby board
// in the page. A shared id would point the game board at a pattern that never paints.
let nextPatternId = 0;

function resourceFill(resource) {
  switch (resource) {
    case "wood":
      return "rgb(var(--res-wood-rgb, 47, 143, 82))";
    case "brick":
      return "rgb(var(--res-brick-rgb, 184, 75, 59))";
    case "sheep":
      return "rgb(var(--res-sheep-rgb, 111, 207, 122))";
    case "wheat":
      return "rgb(var(--res-wheat-rgb, 214, 184, 75))";
    case "ore":
      return "rgb(var(--res-ore-rgb, 154, 163, 173))";
    case "desert":
      return "rgb(var(--res-desert-rgb, 200, 176, 137))";
    default:
      return "rgba(255,255,255,0.08)";
  }
}

function keyPair(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function toSvgPoint(svg, clientX, clientY) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const inverse = ctm.inverse();
  if (typeof DOMPoint !== "undefined") {
    return new DOMPoint(clientX, clientY).matrixTransform(inverse);
  }
  // Older iOS Safari fallback.
  const p = svg.createSVGPoint();
  p.x = clientX;
  p.y = clientY;
  return p.matrixTransform(inverse);
}

// Largest distance, in CSS pixels, a tap may land from a legal target and still select it.
const TAP_SNAP_PX = 28;

function svgUnitsPerCssPixel(svg) {
  const ctm = svg.getScreenCTM();
  const pxPerUnit = ctm ? Math.hypot(ctm.a, ctm.b) : 0;
  return pxPerUnit > 0 ? 1 / pxPerUnit : 1;
}

function polygonPath(pts) {
  return `M ${pts.map(([px, py]) => `${fmt2(px)} ${fmt2(py)}`).join(" L ")} Z`;
}

function settlementPath(x, y, s) {
  return polygonPath([
    [x - s, y + s * 0.85],
    [x - s, y - s * 0.15],
    [x, y - s * 1.05],
    [x + s, y - s * 0.15],
    [x + s, y + s * 0.85]
  ]);
}

function cityPath(x, y, s) {
  return polygonPath([
    [x - s * 1.3, y + s * 0.9],
    [x - s * 1.3, y - s * 0.35],
    [x - s * 0.6, y - s * 1.05],
    [x + s * 0.1, y - s * 0.35],
    [x + s * 0.1, y - s * 0.05],
    [x + s * 1.3, y - s * 0.05],
    [x + s * 1.3, y + s * 0.9]
  ]);
}

// The shaded side of a piece: the roof plane on the right, drawn over the base colour.
function settlementShadePath(x, y, s) {
  return polygonPath([
    [x, y - s * 1.05],
    [x + s, y - s * 0.15],
    [x + s, y + s * 0.85],
    [x, y + s * 0.85]
  ]);
}

function cityShadePath(x, y, s) {
  return polygonPath([
    [x + s * 0.1, y - s * 0.05],
    [x + s * 1.3, y - s * 0.05],
    [x + s * 1.3, y + s * 0.9],
    [x + s * 0.1, y + s * 0.9]
  ]);
}

// A door on a settlement, or the windows of a city.
function settlementDetailPath(x, y, s) {
  return polygonPath([
    [x - s * 0.24, y + s * 0.85],
    [x - s * 0.24, y + s * 0.22],
    [x + s * 0.24, y + s * 0.22],
    [x + s * 0.24, y + s * 0.85]
  ]);
}

function cityDetailPath(x, y, s) {
  const windowAt = (wx, wy) =>
    polygonPath([
      [wx, wy],
      [wx + s * 0.32, wy],
      [wx + s * 0.32, wy + s * 0.36],
      [wx, wy + s * 0.36]
    ]);
  return [
    windowAt(x - s * 0.76, y - s * 0.1),
    windowAt(x - s * 0.76, y + s * 0.42),
    windowAt(x + s * 0.5, y + s * 0.26)
  ].join(" ");
}

// Stable per-hex hash, so a tile keeps its art across reloads and on every screen.
function hashString(value) {
  let hash = 2166136261;
  for (const ch of String(value)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pointToSegmentDistanceSquared(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLen2 = abx * abx + aby * aby;
  if (abLen2 <= 0.000001) return apx * apx + apy * apy;
  let t = (apx * abx + apy * aby) / abLen2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

function fmt2(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

function svgEl(tag) {
  return document.createElementNS(SVG_NS, tag);
}

function setSvgAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    el.setAttribute(k, String(v));
  }
}

function stableBoardKey(board) {
  const b = board && typeof board === "object" ? board : null;
  if (!b) return "board:none";
  const layout = String(b.layout || "");
  const size = fmt2(b.hexSize);
  const bounds = b.bounds && typeof b.bounds === "object" ? b.bounds : {};
  const boundsKey = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].map((v) => fmt2(v)).join(",");
  const hexKey = Array.isArray(b.hexes)
    ? b.hexes.map((h) => `${String(h?.id || "")}:${String(h?.resource || "")}:${String(h?.token ?? "")}`).join(",")
    : "";
  const portKey = Array.isArray(b.ports)
    ? b.ports.map((p) => `${String(p?.id || "")}:${String(p?.kind || "")}:${String(p?.edgeId || "")}`).join(",")
    : "";
  const vCount = Array.isArray(b.vertices) ? b.vertices.length : 0;
  const eCount = Array.isArray(b.edges) ? b.edges.length : 0;
  const hCount = Array.isArray(b.hexes) ? b.hexes.length : 0;
  return `layout:${layout}|size:${size}|bounds:${boundsKey}|counts:${vCount}:${eCount}:${hCount}|hex:${hexKey}|ports:${portKey}`;
}

export function createBoardView(container, board) {
  if (!container) throw new Error("createBoardView: missing container");
  if (!board) throw new Error("createBoardView: missing board");

  const vertices = Array.isArray(board.vertices) ? board.vertices : [];
  const edges = Array.isArray(board.edges) ? board.edges : [];
  const hexes = Array.isArray(board.hexes) ? board.hexes : [];

  const verticesById = new Map(vertices.map((v) => [v.id, v]));

  const hexSize = Number(board.hexSize) || 0;
  const bounds = board.bounds || { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const boardCx = (Number(bounds.minX) + Number(bounds.maxX)) / 2;
  const boardCy = (Number(bounds.minY) + Number(bounds.maxY)) / 2;
  const portOffset = hexSize * 0.62;
  const boatSize = hexSize * 0.66;

  // Where a port's boat sits: straight out from the vertex farthest from the centre.
  function portPlacement(port) {
    const vertexIds = Array.isArray(port?.vertexIds) ? port.vertexIds : [];
    const vA = verticesById.get(vertexIds[0]);
    const vB = verticesById.get(vertexIds[1]);
    if (!vA || !vB) return null;
    const distA = Math.hypot(vA.x - boardCx, vA.y - boardCy);
    const distB = Math.hypot(vB.x - boardCx, vB.y - boardCy);
    const anchor = distA >= distB ? vA : vB;
    const len = Math.hypot(anchor.x - boardCx, anchor.y - boardCy) || 1;
    const px = anchor.x + ((anchor.x - boardCx) / len) * portOffset;
    const py = anchor.y + ((anchor.y - boardCy) / len) * portOffset;
    return { vA, vB, px, py };
  }

  const portPlacements = (Array.isArray(board.ports) ? board.ports : []).map(portPlacement).filter(Boolean);
  const portReach = boatSize * 0.62;
  const coastPad = hexSize * 0.3;
  const vbX = Math.min(Number(bounds.minX) - coastPad, ...portPlacements.map((p) => p.px - portReach));
  const vbY = Math.min(Number(bounds.minY) - coastPad, ...portPlacements.map((p) => p.py - portReach));
  const vbMaxX = Math.max(Number(bounds.maxX) + coastPad, ...portPlacements.map((p) => p.px + portReach));
  const vbMaxY = Math.max(Number(bounds.maxY) + coastPad, ...portPlacements.map((p) => p.py + portReach));
  const vbW = vbMaxX - vbX;
  const vbH = vbMaxY - vbY;

  const root = document.createElement("div");
  root.className = "board";

  const svg = svgEl("svg");
  setSvgAttrs(svg, {
    viewBox: `${fmt2(vbX)} ${fmt2(vbY)} ${fmt2(vbW)} ${fmt2(vbH)}`,
    role: "img",
    "aria-label": "Catan board"
  });

  // Create defs for hex tile patterns
  const defs = svgEl("defs");
  svg.appendChild(defs);

  const createdPatterns = new Set();
  const VARIANT_COUNT = 5;

  // Create a hex tile pattern for a specific hex (each hex gets unique pattern)
  function createHexPattern(resource, hexId) {
    const variant = resource === "desert" ? 5 : (hashString(hexId) % VARIANT_COUNT) + 1;
    const patternId = `hex-pattern-${resource}-${nextPatternId++}`;

    const pattern = svgEl("pattern");
    setSvgAttrs(pattern, {
      id: patternId,
      patternUnits: "objectBoundingBox",
      patternContentUnits: "objectBoundingBox",
      width: "1",
      height: "1"
    });

    const image = svgEl("image");
    setSvgAttrs(image, {
      href: `/shared/tiles/hex-${resource}-${variant}.png`,
      x: "0",
      y: "0",
      width: "1",
      height: "1",
      preserveAspectRatio: "none"
    });

    pattern.appendChild(image);
    defs.appendChild(pattern);
    createdPatterns.add(patternId);

    return { fill: `url(#${patternId})`, imageEl: image };
  }

  // Shallows and a sand shore under the tiles, so the board reads as one island.
  const coastLayer = svgEl("g");
  coastLayer.setAttribute("class", "coast-layer");
  coastLayer.setAttribute("aria-hidden", "true");
  const hexCorners = (h, scale) =>
    (h.cornerVertexIds || [])
      .map((id) => verticesById.get(id))
      .filter(Boolean)
      .map((v) => {
        const cx = Number(h.center?.x);
        const cy = Number(h.center?.y);
        return `${fmt2(cx + (v.x - cx) * scale)},${fmt2(cy + (v.y - cy) * scale)}`;
      })
      .join(" ");
  for (const [className, scale] of [
    ["coast-shallows", 1.26],
    ["coast-sand", 1.1]
  ]) {
    const ring = svgEl("g");
    ring.setAttribute("class", className);
    for (const h of hexes) {
      const poly = svgEl("polygon");
      poly.setAttribute("points", hexCorners(h, scale));
      ring.appendChild(poly);
    }
    coastLayer.appendChild(ring);
  }

  const hexLayer = svgEl("g");
  hexLayer.setAttribute("class", "hex-layer");
  const portLayer = svgEl("g");
  portLayer.setAttribute("class", "port-layer");
  const edgeLayer = svgEl("g");
  edgeLayer.setAttribute("class", "edge-layer");
  const settlementLayer = svgEl("g");
  settlementLayer.setAttribute("class", "settlement-layer");
  settlementLayer.style.pointerEvents = "none";
  const vertexLayer = svgEl("g");
  vertexLayer.setAttribute("class", "vertex-layer");

  svg.appendChild(coastLayer);
  svg.appendChild(portLayer);
  svg.appendChild(hexLayer);
  svg.appendChild(edgeLayer);
  svg.appendChild(settlementLayer);
  svg.appendChild(vertexLayer);
  const selectionLayer = svgEl("g");
  selectionLayer.setAttribute("class", "selection-layer");
  selectionLayer.style.pointerEvents = "none";
  svg.appendChild(selectionLayer);
  root.appendChild(svg);

  container.innerHTML = "";
  container.appendChild(root);

  const tokenPipCount = (token) => {
    switch (Number(token)) {
      case 2:
      case 12:
        return 1;
      case 3:
      case 11:
        return 2;
      case 4:
      case 10:
        return 3;
      case 5:
      case 9:
        return 4;
      case 6:
      case 8:
        return 5;
      default:
        return 0;
    }
  };

  const hexEls = new Map();
  for (const h of hexes) {
    if (!h?.id) continue;
    const pts = (h.cornerVertexIds || [])
      .map((id) => {
        const v = verticesById.get(id);
        return v ? `${fmt2(v.x)},${fmt2(v.y)}` : "";
      })
      .filter(Boolean)
      .join(" ");

    const group = svgEl("g");
    group.setAttribute("class", "hex");
    group.setAttribute("data-hex-id", String(h.id));

    const poly = svgEl("polygon");
    // Use pattern fill for textured hexes, with solid color as fallback stored in data attribute
    const resource = h.resource || "desert";
    const { fill: patternFill, imageEl } = createHexPattern(resource, h.id);
    const fallbackFill = resourceFill(h.resource);
    setSvgAttrs(poly, {
      points: pts,
      fill: patternFill,
      "data-fallback-fill": fallbackFill
    });

    // Fall back to solid color if pattern image fails to load
    imageEl.addEventListener("error", () => {
      poly.setAttribute("fill", fallbackFill);
    });

    group.appendChild(poly);

    const hintPoly = svgEl("polygon");
    hintPoly.setAttribute("class", "hex-hint");
    hintPoly.setAttribute("points", pts);
    hintPoly.style.display = "none";
    group.appendChild(hintPoly);

    const rolledPoly = svgEl("polygon");
    rolledPoly.setAttribute("class", "hex-rolled");
    rolledPoly.setAttribute("points", pts);
    group.appendChild(rolledPoly);

    if (h.token != null) {
      const tokenNumber = Number(h.token);
      const isHot = tokenNumber === 6 || tokenNumber === 8;
      const isWide = tokenNumber >= 10;
      const tokenResource = String(h.resource || "");
      const resClass = ["wood", "brick", "sheep", "wheat", "ore"].includes(tokenResource) ? `res-${tokenResource}` : "";

      const tokenGroup = svgEl("g");
      tokenGroup.classList.add("token");
      if (resClass) tokenGroup.classList.add(resClass);
      if (isHot) tokenGroup.classList.add("hot");
      if (isWide) tokenGroup.classList.add("wide");
      tokenGroup.setAttribute("aria-hidden", "true");

      const r = hexSize * 0.255;
      const textY = Number(h.center?.y) - hexSize * 0.05;
      const fontSize = hexSize * (isWide ? 0.32 : 0.36);
      const cx = Number(h.center?.x);
      const cy = Number(h.center?.y);

      const bg = svgEl("circle");
      bg.setAttribute("class", "token-bg");
      setSvgAttrs(bg, { cx: fmt2(cx), cy: fmt2(cy), r: fmt2(r) });
      tokenGroup.appendChild(bg);

      const text = svgEl("text");
      text.setAttribute("class", "token-number");
      setSvgAttrs(text, {
        x: fmt2(cx),
        y: fmt2(textY),
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": fmt2(fontSize)
      });
      text.textContent = String(tokenNumber);
      tokenGroup.appendChild(text);

      const pips = tokenPipCount(tokenNumber);
      if (pips) {
        const pipGroup = svgEl("g");
        pipGroup.setAttribute("class", "token-pips");
        const pipR = hexSize * 0.019;
        const pipGap = hexSize * 0.05;
        const pipY = Number(h.center?.y) + hexSize * 0.165;
        const pipStartX = Number(h.center?.x) - ((pips - 1) * pipGap) / 2;
        for (let i = 0; i < pips; i += 1) {
          const c = svgEl("circle");
          c.setAttribute("class", "token-pip");
          setSvgAttrs(c, { cx: fmt2(pipStartX + i * pipGap), cy: fmt2(pipY), r: fmt2(pipR) });
          pipGroup.appendChild(c);
        }
        tokenGroup.appendChild(pipGroup);
      }

      group.appendChild(tokenGroup);
    }

    const robberGroup = svgEl("g");
    robberGroup.setAttribute("class", "robber");
    robberGroup.style.display = "none";

    // Add hex highlight border (red glow effect)
    const highlightPoly = svgEl("polygon");
    highlightPoly.setAttribute("class", "robber-highlight");
    highlightPoly.setAttribute("points", pts);
    robberGroup.appendChild(highlightPoly);

    // Add robber icon image
    const robberIcon = svgEl("image");
    const iconSize = hexSize * 0.9;
    robberIcon.setAttribute("class", "robber-icon");
    setSvgAttrs(robberIcon, {
      href: "/shared/icons/robber.png",
      x: fmt2(Number(h.center?.x) - iconSize / 2),
      y: fmt2(Number(h.center?.y) - iconSize / 2),
      width: fmt2(iconSize),
      height: fmt2(iconSize),
      preserveAspectRatio: "xMidYMid meet"
    });
    robberGroup.appendChild(robberIcon);
    group.appendChild(robberGroup);

    hexLayer.appendChild(group);
    hexEls.set(h.id, { group, hintPoly, robberGroup });
  }

  const ports = Array.isArray(board.ports) ? board.ports : [];
  for (const p of ports) {
    const placement = portPlacement(p);
    if (!placement) continue;
    const { vA, vB, px, py } = placement;

    const kind = p.kind === "generic" ? "generic" : String(p.kind || "");
    const ratioText = kind === "generic" ? "3:1" : "2:1";
    const title = kind === "generic" ? "3:1 port" : `2:1 ${kind} port`;

    const group = svgEl("g");
    group.setAttribute("class", "port");
    group.style.pointerEvents = "none";

    const titleEl = svgEl("title");
    titleEl.textContent = title;
    group.appendChild(titleEl);

    // A pier from each of the port's two vertices shows exactly where it can be used.
    for (const vertex of [vA, vB]) {
      const stem = svgEl("line");
      stem.setAttribute("class", "port-stem");
      setSvgAttrs(stem, { x1: fmt2(vertex.x), y1: fmt2(vertex.y), x2: fmt2(px), y2: fmt2(py) });
      group.appendChild(stem);
    }

    // Add boat icon image
    const boatImg = svgEl("image");
    boatImg.setAttribute("class", "port-boat");
    setSvgAttrs(boatImg, {
      href: `/shared/icons/port-boat-${kind}.png`,
      x: fmt2(px - boatSize / 2),
      y: fmt2(py - boatSize / 2),
      width: fmt2(boatSize),
      height: fmt2(boatSize),
      preserveAspectRatio: "xMidYMid meet"
    });
    group.appendChild(boatImg);

    // Ratio plaque, sized to the hex so it stays readable from the couch.
    const plaqueW = hexSize * 0.46;
    const plaqueH = hexSize * 0.24;
    const plaqueY = py + boatSize * 0.3;
    const plaque = svgEl("rect");
    plaque.setAttribute("class", "port-plaque");
    setSvgAttrs(plaque, {
      x: fmt2(px - plaqueW / 2),
      y: fmt2(plaqueY),
      width: fmt2(plaqueW),
      height: fmt2(plaqueH),
      rx: fmt2(plaqueH / 2)
    });
    group.appendChild(plaque);

    const text = svgEl("text");
    text.setAttribute("class", "port-ratio");
    setSvgAttrs(text, {
      x: fmt2(px),
      y: fmt2(plaqueY + plaqueH / 2),
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "font-size": fmt2(hexSize * 0.17)
    });
    text.textContent = ratioText;
    group.appendChild(text);

    portLayer.appendChild(group);
  }

  const edgeEls = new Map();
  for (const e of edges) {
    if (!e?.id) continue;
    const vA = verticesById.get(e.vA);
    const vB = verticesById.get(e.vB);
    if (!vA || !vB) continue;

    const group = svgEl("g");
    group.setAttribute("class", "edge");
    group.setAttribute("data-edge-id", String(e.id));
    group.style.pointerEvents = "none";

    const hit = svgEl("line");
    hit.setAttribute("class", "edge-hit");
    setSvgAttrs(hit, { x1: fmt2(vA.x), y1: fmt2(vA.y), x2: fmt2(vB.x), y2: fmt2(vB.y) });
    group.appendChild(hit);

    const line = svgEl("line");
    line.setAttribute("class", "edge-line");
    setSvgAttrs(line, { x1: fmt2(vA.x), y1: fmt2(vA.y), x2: fmt2(vB.x), y2: fmt2(vB.y) });
    group.appendChild(line);

    const hint = svgEl("line");
    hint.setAttribute("class", "edge-hint");
    setSvgAttrs(hint, { x1: fmt2(vA.x), y1: fmt2(vA.y), x2: fmt2(vB.x), y2: fmt2(vB.y) });
    hint.style.display = "none";
    group.appendChild(hint);

    // Inset from the corners so roads meet settlements cleanly, with a dark casing for contrast on any tile.
    const roadCoords = {
      x1: fmt2(vA.x + (vB.x - vA.x) * 0.07),
      y1: fmt2(vA.y + (vB.y - vA.y) * 0.07),
      x2: fmt2(vB.x - (vB.x - vA.x) * 0.07),
      y2: fmt2(vB.y - (vB.y - vA.y) * 0.07)
    };
    const road = svgEl("g");
    road.setAttribute("class", "road");
    const casing = svgEl("line");
    casing.setAttribute("class", "road-casing");
    setSvgAttrs(casing, roadCoords);
    const roadFill = svgEl("line");
    roadFill.setAttribute("class", "road-fill");
    setSvgAttrs(roadFill, roadCoords);
    const roadShine = svgEl("line");
    roadShine.setAttribute("class", "road-shine");
    setSvgAttrs(roadShine, roadCoords);
    road.append(casing, roadFill, roadShine);
    road.style.display = "none";
    group.appendChild(road);

    edgeLayer.appendChild(group);
    edgeEls.set(e.id, { group, hint, road, roadFill });
  }

  const vertexEls = new Map();
  for (const v of vertices) {
    if (!v?.id) continue;

    const group = svgEl("g");
    group.setAttribute("class", "vertex");
    group.setAttribute("data-vertex-id", String(v.id));
    group.style.pointerEvents = "none";

    const hit = svgEl("circle");
    hit.setAttribute("class", "vertex-hit");
    setSvgAttrs(hit, { cx: fmt2(v.x), cy: fmt2(v.y), r: fmt2(hexSize * 0.16), fill: "transparent" });
    hit.style.display = "none";
    group.appendChild(hit);

    const dot = svgEl("circle");
    dot.setAttribute("class", "vertex-dot");
    setSvgAttrs(dot, { cx: fmt2(v.x), cy: fmt2(v.y), r: fmt2(hexSize * 0.04) });
    group.appendChild(dot);

    const hint = svgEl("circle");
    hint.setAttribute("class", "vertex-hint");
    setSvgAttrs(hint, { cx: fmt2(v.x), cy: fmt2(v.y), r: fmt2(hexSize * 0.14) });
    hint.style.display = "none";
    group.appendChild(hint);

    vertexLayer.appendChild(group);
    vertexEls.set(v.id, { group, hit, hint });
  }

  const settlementEls = new Map();
  for (const v of vertices) {
    if (!v?.id) continue;
    const group = svgEl("g");
    group.setAttribute("class", "settlement");
    group.style.display = "none";

    const fillPath = svgEl("path");
    setSvgAttrs(fillPath, { fill: "white" });
    group.appendChild(fillPath);

    const shadePath = svgEl("path");
    shadePath.setAttribute("class", "piece-shade");
    group.appendChild(shadePath);

    const detailPath = svgEl("path");
    detailPath.setAttribute("class", "piece-detail");
    group.appendChild(detailPath);

    const outlinePath = svgEl("path");
    outlinePath.setAttribute("class", "piece-outline");
    group.appendChild(outlinePath);

    settlementLayer.appendChild(group);
    settlementEls.set(v.id, { group, fillPath, shadePath, detailPath, outlinePath });
  }

  const state = {
    selectableVertexSet: new Set(),
    selectableEdgeSet: new Set(),
    selectableHexSet: new Set(),
    canCaptureVertices: false,
    canCaptureEdges: false,
    canCaptureHexes: false,
    onVertexClick: null,
    onEdgeClick: null,
    onHexClick: null,
    onIllegalClick: null
  };

  function nearestSelectableVertex(pt, maxDistance) {
    let bestId = null;
    let bestD2 = maxDistance * maxDistance;
    for (const v of vertices) {
      if (!state.selectableVertexSet.has(v.id)) continue;
      const d2 = (v.x - pt.x) ** 2 + (v.y - pt.y) ** 2;
      if (d2 <= bestD2) {
        bestD2 = d2;
        bestId = v.id;
      }
    }
    return bestId;
  }

  function nearestSelectableEdge(pt, maxDistance) {
    let bestId = null;
    let bestD2 = maxDistance * maxDistance;
    for (const e of edges) {
      if (!state.selectableEdgeSet.has(e.id)) continue;
      const vA = verticesById.get(e.vA);
      const vB = verticesById.get(e.vB);
      if (!vA || !vB) continue;
      const d2 = pointToSegmentDistanceSquared(pt.x, pt.y, vA.x, vA.y, vB.x, vB.y);
      if (d2 <= bestD2) {
        bestD2 = d2;
        bestId = e.id;
      }
    }
    return bestId;
  }

  // The hex under the tap, so a tap on a number token or a road still counts as that hex.
  function hexAtPoint(pt) {
    let bestId = null;
    let bestD2 = hexSize * hexSize;
    for (const h of hexes) {
      const d2 = (Number(h.center?.x) - pt.x) ** 2 + (Number(h.center?.y) - pt.y) ** 2;
      if (d2 <= bestD2) {
        bestD2 = d2;
        bestId = h.id;
      }
    }
    return bestId;
  }

  function handleClick(ev) {
    const pt = toSvgPoint(svg, ev.clientX, ev.clientY);
    if (pt) {
      const maxDistance = TAP_SNAP_PX * svgUnitsPerCssPixel(svg);

      if (state.onVertexClick && state.selectableVertexSet.size) {
        const vertexId = nearestSelectableVertex(pt, maxDistance);
        if (vertexId) {
          state.onVertexClick(vertexId);
          return;
        }
      }

      if (state.onEdgeClick && state.selectableEdgeSet.size) {
        const edgeId = nearestSelectableEdge(pt, maxDistance);
        if (edgeId) {
          state.onEdgeClick(edgeId);
          return;
        }
      }

      if (state.onHexClick && state.selectableHexSet.size) {
        const hexId = hexAtPoint(pt);
        if (hexId && state.selectableHexSet.has(hexId)) {
          state.onHexClick(hexId);
          return;
        }
        if (hexId && state.canCaptureHexes && state.onIllegalClick) {
          state.onIllegalClick({ kind: "hex", id: hexId });
          return;
        }
      }
    }

    const target = ev.target;
    if (!(target instanceof Element) || !state.onIllegalClick) return;

    const vertexId = target.closest("[data-vertex-id]")?.getAttribute("data-vertex-id");
    if (vertexId && state.canCaptureVertices) {
      state.onIllegalClick({ kind: "vertex", id: vertexId });
      return;
    }

    const edgeId = target.closest("[data-edge-id]")?.getAttribute("data-edge-id");
    if (edgeId && state.canCaptureEdges) state.onIllegalClick({ kind: "edge", id: edgeId });
  }

  function renderSelection(selected) {
    selectionLayer.replaceChildren();
    const kind = selected?.kind;
    const color = String(selected?.color || "white");

    if (kind === "vertex" || kind === "city") {
      const v = verticesById.get(selected.id);
      if (!v) return;
      const ring = svgEl("circle");
      ring.setAttribute("class", "selection-ring");
      setSvgAttrs(ring, { cx: fmt2(v.x), cy: fmt2(v.y), r: fmt2(hexSize * 0.34) });
      selectionLayer.appendChild(ring);

      const piece = svgEl("path");
      piece.setAttribute("class", "selection-piece");
      const shape = kind === "city" ? cityPath(v.x, v.y, hexSize * 0.23) : settlementPath(v.x, v.y, hexSize * 0.2);
      setSvgAttrs(piece, { d: shape, fill: color });
      selectionLayer.appendChild(piece);
      return;
    }

    if (kind === "edge") {
      const e = edges.find((edge) => edge.id === selected.id);
      const vA = e ? verticesById.get(e.vA) : null;
      const vB = e ? verticesById.get(e.vB) : null;
      if (!vA || !vB) return;
      const coords = { x1: fmt2(vA.x), y1: fmt2(vA.y), x2: fmt2(vB.x), y2: fmt2(vB.y) };
      const halo = svgEl("line");
      halo.setAttribute("class", "selection-edge-halo");
      setSvgAttrs(halo, coords);
      selectionLayer.appendChild(halo);
      const line = svgEl("line");
      line.setAttribute("class", "selection-edge");
      setSvgAttrs(line, { ...coords, stroke: color });
      selectionLayer.appendChild(line);
      return;
    }

    if (kind === "hex") {
      const h = hexes.find((hex) => hex.id === selected.id);
      if (!h) return;
      const ring = svgEl("circle");
      ring.setAttribute("class", "selection-ring");
      setSvgAttrs(ring, { cx: fmt2(Number(h.center?.x)), cy: fmt2(Number(h.center?.y)), r: fmt2(hexSize * 0.72) });
      selectionLayer.appendChild(ring);
    }
  }

  root.addEventListener("click", handleClick);

  function update(options) {
    const {
      players = [],
      structures = { settlements: {}, roads: {} },
      placedVertexIds = [],
      placedEdgeIds = [],
      selectableVertexIds = [],
      selectableEdgeIds = [],
      selectableHexIds = [],
      robberHexId = null,
      highlightMode = "",
      captureAllVertices = false,
      captureAllEdges = false,
      captureAllHexes = false,
      onVertexClick = null,
      onEdgeClick = null,
      onHexClick = null,
      onIllegalClick = null,
      selected = null
    } = options || {};

    renderSelection(selected);

    if (highlightMode) root.dataset.highlight = String(highlightMode);
    else root.removeAttribute("data-highlight");

    const canCaptureVertices = !!onIllegalClick && !!captureAllVertices;
    const canCaptureEdges = !!onIllegalClick && !!captureAllEdges;
    const canCaptureHexes = !!onIllegalClick && !!captureAllHexes;

    state.selectableVertexSet = new Set(selectableVertexIds);
    state.selectableEdgeSet = new Set(selectableEdgeIds);
    state.selectableHexSet = new Set(selectableHexIds);
    state.canCaptureVertices = canCaptureVertices;
    state.canCaptureEdges = canCaptureEdges;
    state.canCaptureHexes = canCaptureHexes;
    state.onVertexClick = onVertexClick;
    state.onEdgeClick = onEdgeClick;
    state.onHexClick = onHexClick;
    state.onIllegalClick = onIllegalClick;

    const placedVertexSet = new Set(placedVertexIds);
    const placedEdgeSet = new Set(placedEdgeIds);

    const playerColorById = new Map((players || []).map((p) => [p.playerId, p.color]));
    const roads = structures?.roads && typeof structures.roads === "object" ? structures.roads : {};
    const settlements =
      structures?.settlements && typeof structures.settlements === "object" ? structures.settlements : {};

    for (const h of hexes) {
      const el = hexEls.get(h.id);
      if (!el) continue;
      const selectable = state.selectableHexSet.has(h.id);
      el.group.classList.toggle("selectable", selectable);
      el.hintPoly.style.display = selectable ? "" : "none";

      const showRobber = robberHexId && robberHexId === h.id;
      el.robberGroup.style.display = showRobber ? "" : "none";
    }

    for (const e of edges) {
      const el = edgeEls.get(e.id);
      if (!el) continue;
      const isSelectable = state.selectableEdgeSet.has(e.id);
      const interactive = isSelectable && !!state.onEdgeClick;
      el.group.classList.toggle("selectable", interactive);
      el.group.style.pointerEvents = interactive || canCaptureEdges ? "auto" : "none";
      el.hint.style.display = isSelectable ? "" : "none";

      const built = roads?.[e.id] || null;
      const builtColor = built ? playerColorById.get(built.playerId) || "white" : null;
      if (builtColor) {
        el.road.style.display = "";
        el.roadFill.setAttribute("stroke", String(builtColor));
        el.road.classList.toggle("placed", placedEdgeSet.has(e.id));
      } else {
        el.road.style.display = "none";
        el.road.classList.remove("placed");
      }
    }

    const settlementSize = hexSize * 0.2;
    const citySize = hexSize * 0.23;

    for (const v of vertices) {
      const vEl = vertexEls.get(v.id);
      if (!vEl) continue;
      const isSelectable = state.selectableVertexSet.has(v.id);
      const hasSettlement = !!settlements?.[v.id];
      vEl.group.classList.toggle("selectable", isSelectable);
      vEl.group.classList.toggle("occupied", hasSettlement);
      const interactive = isSelectable && !!state.onVertexClick;
      vEl.group.style.pointerEvents = interactive || canCaptureVertices ? "auto" : "none";
      vEl.hit.style.display = interactive || canCaptureVertices ? "" : "none";
      vEl.hint.style.display = isSelectable ? "" : "none";

      const sEl = settlementEls.get(v.id);
      if (!sEl) continue;
      const s = settlements?.[v.id] || null;
      if (!s) {
        sEl.group.style.display = "none";
        sEl.group.classList.remove("placed");
        continue;
      }
      const color = playerColorById.get(s.playerId) || "white";
      const isCity = s.kind === "city";
      const shape = isCity ? cityPath(v.x, v.y, citySize) : settlementPath(v.x, v.y, settlementSize);

      sEl.group.style.display = "";
      sEl.fillPath.setAttribute("fill", String(color));
      sEl.fillPath.setAttribute("d", shape);
      sEl.outlinePath.setAttribute("d", shape);
      sEl.shadePath.setAttribute(
        "d",
        isCity ? cityShadePath(v.x, v.y, citySize) : settlementShadePath(v.x, v.y, settlementSize)
      );
      sEl.detailPath.setAttribute(
        "d",
        isCity ? cityDetailPath(v.x, v.y, citySize) : settlementDetailPath(v.x, v.y, settlementSize)
      );
      sEl.group.classList.toggle("placed", placedVertexSet.has(v.id));
    }
  }

  function destroy() {
    root.removeEventListener("click", handleClick);
    if (root.parentNode === container) container.removeChild(root);
  }

  // Light up every tile carrying the rolled number, except the one the robber is on.
  function flashRolledHexes(token, { robberHexId = null, durationMs = 2600 } = {}) {
    for (const h of hexes) {
      if (Number(h.token) !== Number(token) || h.id === robberHexId) continue;
      const group = hexEls.get(h.id)?.group;
      if (!group) continue;
      group.classList.remove("rolled");
      void group.getBoundingClientRect();
      group.classList.add("rolled");
      setTimeout(() => group.classList.remove("rolled"), durationMs);
    }
  }

  return { update, destroy, renderSelection, flashRolledHexes };
}

const viewByContainer = new WeakMap();

export function renderBoard(container, board, options) {
  const {
    players = [],
    structures = { settlements: {}, roads: {} },
    placedVertexIds = [],
    placedEdgeIds = [],
    selectableVertexIds = [],
    selectableEdgeIds = [],
    selectableHexIds = [],
    robberHexId = null,
    highlightMode = "",
    captureAllVertices = false,
    captureAllEdges = false,
    captureAllHexes = false,
    onVertexClick = null,
    onEdgeClick = null,
    onHexClick = null,
    onIllegalClick = null,
    selected = null
  } = options || {};

  if (!board) {
    const existing = viewByContainer.get(container);
    if (existing?.view) existing.view.destroy();
    viewByContainer.delete(container);
    container.innerHTML = `<div class="muted">No board yet.</div>`;
    return;
  }

  const nextKey = stableBoardKey(board);
  const existing = viewByContainer.get(container);
  if (!existing || existing.boardKey !== nextKey) {
    if (existing?.view) existing.view.destroy();
    const view = createBoardView(container, board);
    viewByContainer.set(container, { boardKey: nextKey, view });
  }

  const view = viewByContainer.get(container)?.view;
  view?.update({
    players,
    structures,
    placedVertexIds,
    placedEdgeIds,
    selectableVertexIds,
    selectableEdgeIds,
    selectableHexIds,
    robberHexId,
    highlightMode,
    captureAllVertices,
    captureAllEdges,
    captureAllHexes,
    onVertexClick,
    onEdgeClick,
    onHexClick,
    onIllegalClick,
    selected
  });
}

// Updates only the "you picked this spot" marker, so a tap gets instant feedback without a full redraw.
export function setBoardSelection(container, selected) {
  viewByContainer.get(container)?.view?.renderSelection(selected);
}

// Pulses the tiles carrying a just-rolled number.
export function flashRolledHexes(container, token, options) {
  viewByContainer.get(container)?.view?.flashRolledHexes(token, options);
}

export function edgeIdBetween(board, vA, vB) {
  return board.edgeByVertexPair?.[keyPair(vA, vB)] || null;
}
