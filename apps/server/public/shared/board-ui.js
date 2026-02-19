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
  const pad = hexSize * 0.9;
  const bounds = board.bounds || { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const vbX = Number(bounds.minX) - pad;
  const vbY = Number(bounds.minY) - pad;
  const vbW = Number(bounds.maxX) - Number(bounds.minX) + pad * 2;
  const vbH = Number(bounds.maxY) - Number(bounds.minY) + pad * 2;

  const root = document.createElement("div");
  root.className = "board";

  const svg = svgEl("svg");
  setSvgAttrs(svg, {
    viewBox: `${fmt2(vbX)} ${fmt2(vbY)} ${fmt2(vbW)} ${fmt2(vbH)}`,
    role: "img",
    "aria-label": "Catan board"
  });

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

  svg.appendChild(hexLayer);
  svg.appendChild(portLayer);
  svg.appendChild(edgeLayer);
  svg.appendChild(settlementLayer);
  svg.appendChild(vertexLayer);
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

  const portAbbr = (kind) => {
    switch (kind) {
      case "wood":
        return "Wd";
      case "brick":
        return "Br";
      case "sheep":
        return "Sh";
      case "wheat":
        return "Wh";
      case "ore":
        return "Or";
      default:
        return "";
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
    setSvgAttrs(poly, { points: pts, fill: resourceFill(h.resource) });
    group.appendChild(poly);

    const hintPoly = svgEl("polygon");
    hintPoly.setAttribute("class", "hex-hint");
    hintPoly.setAttribute("points", pts);
    hintPoly.style.display = "none";
    group.appendChild(hintPoly);

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

    const robberCircle = svgEl("circle");
    setSvgAttrs(robberCircle, {
      cx: fmt2(Number(h.center?.x)),
      cy: fmt2(Number(h.center?.y) - hexSize * 0.22),
      r: fmt2(hexSize * 0.12)
    });
    robberGroup.appendChild(robberCircle);
    group.appendChild(robberGroup);

    hexLayer.appendChild(group);
    hexEls.set(h.id, { group, hintPoly, robberGroup });
  }

  const ports = Array.isArray(board.ports) ? board.ports : [];
  for (const p of ports) {
    const vertexIds = Array.isArray(p?.vertexIds) ? p.vertexIds : [];
    const vA = verticesById.get(vertexIds[0]);
    const vB = verticesById.get(vertexIds[1]);
    if (!vA || !vB) continue;

    const mx = (vA.x + vB.x) / 2;
    const my = (vA.y + vB.y) / 2;
    const cx = (Number(bounds.minX) + Number(bounds.maxX)) / 2;
    const cy = (Number(bounds.minY) + Number(bounds.maxY)) / 2;
    let dx = mx - cx;
    let dy = my - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const offset = hexSize * 0.42;
    const px = mx + dx * offset;
    const py = my + dy * offset;

    const kind = p.kind === "generic" ? "generic" : String(p.kind || "");
    const ratioText = kind === "generic" ? "3:1" : "2:1";
    const fill = kind === "generic" ? "rgba(10, 16, 30, 0.82)" : resourceFill(kind);
    const sub = kind === "generic" ? "" : portAbbr(kind);
    const title = kind === "generic" ? "3:1 port" : `2:1 ${kind} port`;
    const pr = hexSize * 0.12;

    const group = svgEl("g");
    group.setAttribute("class", "port");
    group.style.pointerEvents = "none";

    const titleEl = svgEl("title");
    titleEl.textContent = title;
    group.appendChild(titleEl);

    const stem = svgEl("line");
    stem.setAttribute("class", "port-stem");
    setSvgAttrs(stem, { x1: fmt2(mx), y1: fmt2(my), x2: fmt2(px), y2: fmt2(py) });
    group.appendChild(stem);

    const circle = svgEl("circle");
    circle.setAttribute("class", "port-circle");
    setSvgAttrs(circle, { cx: fmt2(px), cy: fmt2(py), r: fmt2(pr), fill });
    group.appendChild(circle);

    const text = svgEl("text");
    text.setAttribute("class", "port-text");
    text.setAttribute("text-anchor", "middle");
    if (kind === "generic") {
      setSvgAttrs(text, { x: fmt2(px), y: fmt2(py + hexSize * 0.05) });
      text.textContent = ratioText;
      group.appendChild(text);
    } else {
      setSvgAttrs(text, { x: fmt2(px), y: fmt2(py - hexSize * 0.02) });
      text.textContent = ratioText;
      group.appendChild(text);

      const subEl = svgEl("text");
      subEl.setAttribute("class", "port-sub");
      subEl.setAttribute("text-anchor", "middle");
      setSvgAttrs(subEl, { x: fmt2(px), y: fmt2(py + hexSize * 0.11) });
      subEl.textContent = sub;
      group.appendChild(subEl);
    }

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

    const road = svgEl("line");
    road.setAttribute("class", "road");
    setSvgAttrs(road, { x1: fmt2(vA.x), y1: fmt2(vA.y), x2: fmt2(vB.x), y2: fmt2(vB.y) });
    road.style.display = "none";
    group.appendChild(road);

    edgeLayer.appendChild(group);
    edgeEls.set(e.id, { group, hint, road });
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

    const fillCircle = svgEl("circle");
    setSvgAttrs(fillCircle, { cx: fmt2(v.x), cy: fmt2(v.y), r: fmt2(hexSize * 0.1), fill: "white" });
    group.appendChild(fillCircle);

    const outlineCircle = svgEl("circle");
    setSvgAttrs(outlineCircle, {
      cx: fmt2(v.x),
      cy: fmt2(v.y),
      r: fmt2(hexSize * 0.1),
      fill: "none",
      stroke: "rgba(0,0,0,0.30)",
      "stroke-width": "3",
      "vector-effect": "non-scaling-stroke"
    });
    group.appendChild(outlineCircle);

    const ringCircle = svgEl("circle");
    setSvgAttrs(ringCircle, { cx: fmt2(v.x), cy: fmt2(v.y), r: fmt2(hexSize * 0.07), fill: "rgba(255,255,255,0.18)" });
    ringCircle.style.display = "none";
    group.appendChild(ringCircle);

    settlementLayer.appendChild(group);
    settlementEls.set(v.id, { group, fillCircle, outlineCircle, ringCircle });
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

  function handleClick(ev) {
    const target = ev.target;
    if (!(target instanceof Element)) return;

    const vertexEl = target.closest("[data-vertex-id]");
    if (vertexEl) {
      const vertexId = vertexEl.getAttribute("data-vertex-id");
      if (state.onVertexClick && state.selectableVertexSet.has(vertexId)) {
        state.onVertexClick(vertexId);
        return;
      }
      if (state.canCaptureVertices && state.onIllegalClick && vertexId && !state.selectableVertexSet.has(vertexId)) {
        state.onIllegalClick({ kind: "vertex", id: vertexId });
        return;
      }
    }

    const edgeEl = target.closest("[data-edge-id]");
    if (edgeEl) {
      const edgeId = edgeEl.getAttribute("data-edge-id");
      if (state.onEdgeClick && state.selectableEdgeSet.has(edgeId)) {
        state.onEdgeClick(edgeId);
        return;
      }
      if (state.canCaptureEdges && state.onIllegalClick && edgeId && !state.selectableEdgeSet.has(edgeId)) {
        state.onIllegalClick({ kind: "edge", id: edgeId });
        return;
      }
    }

    const hexEl = target.closest("[data-hex-id]");
    if (hexEl) {
      const hexId = hexEl.getAttribute("data-hex-id");
      if (state.onHexClick && state.selectableHexSet.has(hexId)) {
        state.onHexClick(hexId);
        return;
      }
      if (state.canCaptureHexes && state.onIllegalClick && hexId && !state.selectableHexSet.has(hexId)) {
        state.onIllegalClick({ kind: "hex", id: hexId });
        return;
      }
    }

    // Touch UX fallback: if a fat edge hitbox grabs the tap, snap to the nearest selectable vertex/edge.
    const pt = toSvgPoint(svg, ev.clientX, ev.clientY);
    if (!pt) return;

    if (state.onVertexClick && state.selectableVertexSet.size) {
      let bestId = null;
      let bestD2 = Infinity;
      for (const v of vertices) {
        if (!state.selectableVertexSet.has(v.id)) continue;
        const dx = v.x - pt.x;
        const dy = v.y - pt.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestId = v.id;
        }
      }
      const threshold = hexSize * 0.22;
      if (bestId && bestD2 <= threshold * threshold) state.onVertexClick(bestId);
      return;
    }

    if (state.onEdgeClick && state.selectableEdgeSet.size) {
      let bestId = null;
      let bestD2 = Infinity;
      for (const e of edges) {
        if (!state.selectableEdgeSet.has(e.id)) continue;
        const vA = verticesById.get(e.vA);
        const vB = verticesById.get(e.vB);
        if (!vA || !vB) continue;
        const d2 = pointToSegmentDistanceSquared(pt.x, pt.y, vA.x, vA.y, vB.x, vB.y);
        if (d2 < bestD2) {
          bestD2 = d2;
          bestId = e.id;
        }
      }
      const threshold = hexSize * 0.2;
      if (bestId && bestD2 <= threshold * threshold) state.onEdgeClick(bestId);
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
      onIllegalClick = null
    } = options || {};

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
    const settlements = structures?.settlements && typeof structures.settlements === "object" ? structures.settlements : {};

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
        el.road.setAttribute("stroke", String(builtColor));
        el.road.classList.toggle("placed", placedEdgeSet.has(e.id));
      } else {
        el.road.style.display = "none";
        el.road.classList.remove("placed");
      }
    }

    const settlementR = hexSize * 0.1;
    const cityR = hexSize * 0.14;
    const cityRingR = hexSize * 0.07;

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
      const r = isCity ? cityR : settlementR;

      sEl.group.style.display = "";
      sEl.fillCircle.setAttribute("fill", String(color));
      sEl.fillCircle.setAttribute("r", fmt2(r));
      sEl.outlineCircle.setAttribute("r", fmt2(r));
      sEl.ringCircle.style.display = isCity ? "" : "none";
      sEl.ringCircle.setAttribute("r", fmt2(cityRingR));
      sEl.group.classList.toggle("placed", placedVertexSet.has(v.id));
    }
  }

  function destroy() {
    root.removeEventListener("click", handleClick);
    if (root.parentNode === container) container.removeChild(root);
  }

  return { update, destroy };
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
    onIllegalClick = null
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
    onIllegalClick
  });
}

export function edgeIdBetween(board, vA, vB) {
  return board.edgeByVertexPair?.[keyPair(vA, vB)] || null;
}
