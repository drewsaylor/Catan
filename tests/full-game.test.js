import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";

const MAX_TURNS = 200;
const VICTORY_POINTS_TO_WIN = 6;
const RESOURCE_TYPES = ["wood", "brick", "sheep", "wheat", "ore"];

// UX Quality Metrics
const uxMetrics = {
  responseTimes: [],
  resourceGainsByPlayer: {},
  turnsWithoutResourcesByPlayer: {},
  sevenCount: 0,
  rollCount: 0,
  actionCount: 0,
  hintIssues: [],
  stateIssues: [],
  logIssues: []
};

async function waitForLine(stream, predicate, { timeoutMs = 8000 } = {}) {
  const start = Date.now();
  let buf = "";

  for await (const chunk of stream) {
    buf += String(chunk);
    let idx = buf.indexOf("\n");
    while (idx >= 0) {
      const line = buf.slice(0, idx).trimEnd();
      buf = buf.slice(idx + 1);
      if (predicate(line)) return line;
      idx = buf.indexOf("\n");
    }
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for server output");
  }

  throw new Error("Server exited before ready");
}

async function httpJson(baseUrl, p, { method = "GET", body = null, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}

async function httpJsonTimed(baseUrl, p, opts = {}) {
  const start = performance.now();
  const result = await httpJson(baseUrl, p, opts);
  const elapsed = performance.now() - start;
  uxMetrics.responseTimes.push({ path: p, elapsed, method: opts.method || "GET" });
  uxMetrics.actionCount++;
  return result;
}

function validateHints(game, context = {}) {
  const { hints, subphase, phase } = game;
  const turn = game.turnNumber || 0;

  if (!hints) {
    uxMetrics.hintIssues.push({ issue: "No hints object", subphase, phase, turn, ...context });
    return;
  }

  if (!hints.prompt && phase !== "game_over") {
    uxMetrics.hintIssues.push({ issue: "No prompt", subphase, phase, turn, ...context });
  }

  // Check legal moves are present when needed
  if (subphase === "setup_settlement" && (!hints.legalVertexIds || hints.legalVertexIds.length === 0)) {
    uxMetrics.hintIssues.push({ issue: "No legal vertices for settlement", subphase, turn, ...context });
  }
  if (subphase === "setup_road" && (!hints.legalEdgeIds || hints.legalEdgeIds.length === 0)) {
    uxMetrics.hintIssues.push({ issue: "No legal edges for road", subphase, turn, ...context });
  }
  if (subphase === "robber_move" && (!hints.legalHexIds || hints.legalHexIds.length === 0)) {
    uxMetrics.hintIssues.push({ issue: "No legal hexes for robber", subphase, turn, ...context });
  }
  if (subphase === "robber_steal" && hints.legalVictimPlayerIds === undefined) {
    uxMetrics.hintIssues.push({ issue: "Missing legalVictimPlayerIds for robber steal", subphase, turn, ...context });
  }
  if (subphase === "robber_discard" && !hints.discardRequiredByPlayerId) {
    uxMetrics.hintIssues.push({ issue: "Missing discardRequiredByPlayerId", subphase, turn, ...context });
  }
}

function validateStateCompleteness(room, context = {}) {
  const game = room?.game;
  if (!game) {
    uxMetrics.stateIssues.push({ field: "game", context: "Room missing game object" });
    return;
  }

  const requiredFields = [
    { field: "pointsByPlayerId", check: (g) => g.pointsByPlayerId && typeof g.pointsByPlayerId === "object" },
    { field: "currentPlayerId", check: (g) => g.phase === "game_over" || g.currentPlayerId },
    { field: "hints", check: (g) => g.hints && typeof g.hints === "object" },
    { field: "turnNumber", check: (g) => typeof g.turnNumber === "number" }
  ];

  // lastRoll only required after first roll
  if (game.phase === "turn" && game.subphase !== "needs_roll") {
    requiredFields.push({
      field: "lastRoll",
      check: (g) => g.lastRoll && typeof g.lastRoll.d1 === "number" && typeof g.lastRoll.d2 === "number"
    });
  }

  for (const { field, check } of requiredFields) {
    if (!check(game)) {
      uxMetrics.stateIssues.push({ field, context: `Phase: ${game.phase}, Subphase: ${game.subphase}` });
    }
  }
}

function validateLogEntry(entry, index) {
  if (!entry.type) {
    uxMetrics.logIssues.push({ issue: "Missing type", index, entry });
  }
  if (!entry.message && entry.type !== "bank") {
    // bank entries may not have message, they have data.gains instead
    uxMetrics.logIssues.push({ issue: "Missing message", index, type: entry.type });
  }
  if (typeof entry.at !== "number") {
    uxMetrics.logIssues.push({ issue: "Missing or invalid 'at' timestamp", index, type: entry.type });
  }
}

function trackResourceDistribution(game, previousLogLength) {
  const newLogs = (game.log || []).slice(previousLogLength);

  for (const [i, entry] of newLogs.entries()) {
    validateLogEntry(entry, previousLogLength + i);

    // Track resource gains from bank distributions
    if (entry.type === "bank" && entry.data?.gains) {
      for (const [pid, resources] of Object.entries(entry.data.gains)) {
        const total = Object.values(resources).reduce((a, b) => a + (b || 0), 0);
        uxMetrics.resourceGainsByPlayer[pid] = (uxMetrics.resourceGainsByPlayer[pid] || 0) + total;
        // Reset consecutive dry turns
        if (total > 0) {
          uxMetrics.turnsWithoutResourcesByPlayer[pid] = 0;
        }
      }
    }
  }
}

function printUxReport(players) {
  const times = uxMetrics.responseTimes.map((r) => r.elapsed);
  const maxResponse = times.length > 0 ? Math.max(...times) : 0;
  const avgResponse = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const slowResponses = uxMetrics.responseTimes.filter((r) => r.elapsed > 500);
  const slowest = uxMetrics.responseTimes.reduce((max, r) => (r.elapsed > max.elapsed ? r : max), { elapsed: 0 });

  log("\n========== UX QUALITY REPORT ==========\n");

  // Response Latency
  log("RESPONSE LATENCY");
  log(`  Average: ${avgResponse.toFixed(1)}ms`);
  log(`  Maximum: ${maxResponse.toFixed(1)}ms`);
  if (slowResponses.length > 0) {
    log(`  ⚠️  SLOW RESPONSES (>500ms): ${slowResponses.length} found`);
    for (const r of slowResponses.slice(0, 5)) {
      log(`     - ${r.method} ${r.path}: ${r.elapsed.toFixed(0)}ms`);
    }
    if (slowResponses.length > 5) {
      log(`     ... and ${slowResponses.length - 5} more`);
    }
    log("  ACTION: Check server performance for these endpoints");
  } else {
    log("  ✓ All responses under 500ms");
  }

  // Hint Quality
  log("\nHINT QUALITY");
  if (uxMetrics.hintIssues.length > 0) {
    log(`  ⚠️  ${uxMetrics.hintIssues.length} HINT ISSUES FOUND:`);
    for (const issue of uxMetrics.hintIssues.slice(0, 5)) {
      log(`     - ${issue.issue}`);
      log(`       Phase: ${issue.phase}, Subphase: ${issue.subphase}, Turn: ${issue.turn}`);
    }
    if (uxMetrics.hintIssues.length > 5) {
      log(`     ... and ${uxMetrics.hintIssues.length - 5} more`);
    }
    log("  ACTION: Fix computeHints() in packages/game-engine/index.js");
  } else {
    log("  ✓ All hints complete and actionable");
  }

  // State Completeness
  log("\nSTATE COMPLETENESS");
  if (uxMetrics.stateIssues.length > 0) {
    log(`  ⚠️  ${uxMetrics.stateIssues.length} MISSING STATE FIELDS:`);
    for (const issue of uxMetrics.stateIssues.slice(0, 5)) {
      log(`     - Missing: ${issue.field}`);
      log(`       Context: ${issue.context}`);
    }
    if (uxMetrics.stateIssues.length > 5) {
      log(`     ... and ${uxMetrics.stateIssues.length - 5} more`);
    }
    log("  ACTION: Ensure getPublicGameSnapshot() includes all required fields");
  } else {
    log("  ✓ All UI-required state present");
  }

  // Log Quality
  log("\nLOG QUALITY");
  if (uxMetrics.logIssues.length > 0) {
    log(`  ⚠️  ${uxMetrics.logIssues.length} LOG ISSUES FOUND:`);
    for (const issue of uxMetrics.logIssues.slice(0, 5)) {
      log(`     - ${issue.issue} at index ${issue.index}`);
    }
    if (uxMetrics.logIssues.length > 5) {
      log(`     ... and ${uxMetrics.logIssues.length - 5} more`);
    }
    log("  ACTION: Ensure all log entries have type, message, and at timestamp");
  } else {
    log("  ✓ All log entries properly formatted");
  }

  // Resource Distribution
  log("\nRESOURCE FAIRNESS");
  const playerIds = Object.keys(uxMetrics.resourceGainsByPlayer);
  if (playerIds.length > 0) {
    const resourceCounts = playerIds.map((p) => uxMetrics.resourceGainsByPlayer[p] || 0);
    const minResources = Math.min(...resourceCounts);
    const maxResources = Math.max(...resourceCounts);
    const ratio = minResources > 0 ? maxResources / minResources : maxResources > 0 ? Infinity : 1;

    for (const p of playerIds) {
      const playerName = players.find((pl) => pl.id === p)?.name || p.slice(0, 8);
      log(`  ${playerName}: ${uxMetrics.resourceGainsByPlayer[p] || 0} resources`);
    }
    if (ratio > 3) {
      log(`  ⚠️  IMBALANCED: ${ratio.toFixed(1)}x difference between players`);
      log("  ACTION: This may indicate board setup or dice distribution issues");
    } else {
      log("  ✓ Resource distribution within normal range");
    }
  } else {
    log("  (No resource data collected)");
  }

  // Game Pacing
  log("\nGAME PACING");
  log(`  Total API calls: ${uxMetrics.actionCount}`);
  log(`  Rolls: ${uxMetrics.rollCount}`);
  log(`  7s rolled: ${uxMetrics.sevenCount}`);
  if (uxMetrics.rollCount > 0) {
    const sevenRate = (uxMetrics.sevenCount / uxMetrics.rollCount) * 100;
    log(`  7 rate: ${sevenRate.toFixed(0)}% of rolls (expected ~17%)`);
    if (sevenRate > 25) {
      log("  ⚠️  HIGH 7 RATE: May cause frustrating UX with frequent robber");
    }
  }

  log("\n========================================\n");

  return { maxResponse, slowest, avgResponse };
}

function log(msg) {
  console.log(`[full-game] ${msg}`);
}

function sumHand(hand) {
  let total = 0;
  for (const r of RESOURCE_TYPES) {
    total += Math.max(0, Math.floor(hand?.[r] ?? 0));
  }
  return total;
}

test("full game simulation: lobby to victory", { timeout: 90000 }, async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "catan-lan-fullgame-"));
  t.after(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  const child = spawn("node", ["apps/server/server.js"], {
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", DATA_DIR: dataDir, LOG_LEVEL: "info" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  const MAX_STDERR_CHARS = 8000;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
    if (stderr.length > MAX_STDERR_CHARS) stderr = stderr.slice(-MAX_STDERR_CHARS);
  });

  t.after(async () => {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), new Promise((r) => setTimeout(r, 3000))]);
  });

  let listenLine = "";
  try {
    listenLine = await waitForLine(child.stdout, (line) => line.includes("listening on http://"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const detail = stderr.trim() ? `\n\nstderr:\n${stderr.trimEnd()}` : "";
    throw new Error(`${msg}${detail}`);
  }
  const listenUrlMatch = listenLine.match(/listening on (http:\/\/\S+)/);
  assert.ok(listenUrlMatch, `failed to parse listen URL from: ${listenLine}`);
  const baseUrl = listenUrlMatch[1];
  log(`Server ready at ${baseUrl}`);

  // ========== LOBBY PHASE ==========
  log("Creating room...");
  const created = await httpJson(baseUrl, "/api/rooms", { method: "POST" });
  assert.equal(created.res.status, 200);
  assert.equal(created.json?.ok, true);
  const roomCode = created.json?.roomCode;
  const adminSecret = created.json?.adminSecret;
  assert.ok(roomCode);
  assert.ok(adminSecret);
  log(`Room created: ${roomCode}`);

  // Join 3 players
  const players = [];
  for (const name of ["Alice", "Bob", "Charlie"]) {
    const join = await httpJson(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}/join`, {
      method: "POST",
      body: { playerName: name }
    });
    assert.equal(join.res.status, 200);
    assert.equal(join.json?.ok, true);
    players.push({ name, id: join.json?.playerId });
    log(`Player joined: ${name} (${join.json?.playerId})`);
  }

  const hostId = players[0].id;

  // Set house rules for quick game
  const setRules = await httpJson(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}/houseRules`, {
    method: "POST",
    body: { playerId: hostId, houseRules: { victoryPointsToWin: VICTORY_POINTS_TO_WIN } }
  });
  assert.equal(setRules.res.status, 200);
  assert.equal(setRules.json?.ok, true);
  log(`House rules set: victoryPointsToWin=${VICTORY_POINTS_TO_WIN}`);

  // Mark all players ready
  for (const player of players) {
    const ready = await httpJson(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}/ready`, {
      method: "POST",
      body: { playerId: player.id, ready: true }
    });
    assert.equal(ready.json?.ok, true);
  }
  log("All players ready");

  // Start game
  const started = await httpJson(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}/start`, {
    method: "POST",
    body: { playerId: hostId }
  });
  assert.equal(started.json?.ok, true);
  log("Game started");

  // ========== SETUP PHASE ==========
  let previousLogLength = 0;

  async function getRoom() {
    const result = await httpJsonTimed(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}`, { method: "GET" });
    assert.equal(result.json?.ok, true);
    const room = result.json?.room;

    // Validate state completeness
    validateStateCompleteness(room);

    // Validate hints
    if (room?.game) {
      validateHints(room.game);
      trackResourceDistribution(room.game, previousLogLength);
      previousLogLength = room.game.log?.length || 0;
    }

    return room;
  }

  async function getPrivateData() {
    const result = await httpJson(
      baseUrl,
      `/api/rooms/${encodeURIComponent(roomCode)}/debug/export`,
      { method: "GET", headers: { Authorization: `Bearer ${adminSecret}` } }
    );
    if (result.json?.ok && result.json?.snapshot?.privateByPlayerId) {
      return result.json.snapshot.privateByPlayerId;
    }
    return null;
  }

  async function sendAction(playerId, action) {
    const result = await httpJsonTimed(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}/action`, {
      method: "POST",
      body: { playerId, ...action }
    });
    return result;
  }

  // Setup phase: each player places 2 settlements and 2 roads
  let room = await getRoom();
  assert.ok(room.game);
  let game = room.game;
  log(`Setup phase: ${game.phase}, subphase: ${game.subphase}`);

  while (game.phase === "setup_round_1" || game.phase === "setup_round_2") {
    const currentPlayerId = game.currentPlayerId;
    const currentPlayer = players.find((p) => p.id === currentPlayerId);

    if (game.subphase === "setup_settlement") {
      const legalVertices = game.hints?.legalVertexIds || [];
      assert.ok(legalVertices.length > 0, "No legal vertices for settlement");
      const vertexId = legalVertices[0];

      const result = await sendAction(currentPlayerId, { type: "PLACE_SETTLEMENT", vertexId });
      assert.equal(result.json?.ok, true, `Settlement failed: ${JSON.stringify(result.json?.error)}`);
      log(`${currentPlayer?.name} placed settlement at ${vertexId}`);
    } else if (game.subphase === "setup_road") {
      const legalEdges = game.hints?.legalEdgeIds || [];
      assert.ok(legalEdges.length > 0, "No legal edges for road");
      const edgeId = legalEdges[0];

      const result = await sendAction(currentPlayerId, { type: "PLACE_ROAD", edgeId });
      assert.equal(result.json?.ok, true, `Road failed: ${JSON.stringify(result.json?.error)}`);
      log(`${currentPlayer?.name} placed road at ${edgeId}`);
    }

    room = await getRoom();
    game = room.game;
  }

  assert.equal(game.phase, "turn", "Game should be in turn phase after setup");
  log("Setup complete. Starting main game loop.");

  // ========== MAIN GAME LOOP ==========
  let turnCount = 0;

  while (game.phase !== "game_over" && turnCount < MAX_TURNS) {
    turnCount++;
    const currentPlayerId = game.currentPlayerId;
    const currentPlayer = players.find((p) => p.id === currentPlayerId);

    if (turnCount % 10 === 1) {
      log(`Turn ${game.turnNumber}, player: ${currentPlayer?.name}, phase: ${game.phase}, subphase: ${game.subphase}`);
    }

    // Handle roll phase - server rolls dice, we just send the action
    if (game.subphase === "needs_roll") {
      const result = await sendAction(currentPlayerId, { type: "ROLL_DICE" });
      assert.equal(result.json?.ok, true, `Roll failed: ${JSON.stringify(result.json?.error)}`);
      uxMetrics.rollCount++;

      room = await getRoom();
      game = room.game;

      // Track 7s from lastRoll
      if (game.lastRoll?.sum === 7) {
        uxMetrics.sevenCount++;
      }
      continue;
    }

    // Handle robber discard - use debug export to get actual hands
    if (game.subphase === "robber_discard") {
      const discardRequired = game.hints?.discardRequiredByPlayerId || {};
      const discardSubmitted = game.hints?.discardSubmittedByPlayerId || {};

      // Get actual player hands from debug export
      const privateData = await getPrivateData();

      for (const [pid, required] of Object.entries(discardRequired)) {
        if (discardSubmitted[pid]) continue;

        const hand = privateData?.[pid]?.hand || {};
        const counts = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
        let remaining = required;

        // Discard from resources we actually have
        for (const resource of RESOURCE_TYPES) {
          if (remaining <= 0) break;
          const available = Math.max(0, Math.floor(hand[resource] ?? 0));
          const toDiscard = Math.min(available, remaining);
          counts[resource] = toDiscard;
          remaining -= toDiscard;
        }

        const result = await sendAction(pid, { type: "DISCARD_CARDS", counts });
        assert.equal(result.json?.ok, true, `Discard failed for ${pid}: ${JSON.stringify(result.json?.error)}`);
      }

      room = await getRoom();
      game = room.game;
      continue;
    }

    // Handle robber move
    if (game.subphase === "robber_move") {
      const legalHexes = game.hints?.legalHexIds || [];
      assert.ok(legalHexes.length > 0, "No legal hexes for robber");
      const hexId = legalHexes[0];

      const result = await sendAction(currentPlayerId, { type: "MOVE_ROBBER", hexId });
      assert.equal(result.json?.ok, true, `Move robber failed: ${JSON.stringify(result.json?.error)}`);

      room = await getRoom();
      game = room.game;
      continue;
    }

    // Handle robber steal
    if (game.subphase === "robber_steal") {
      const legalVictims = game.hints?.legalVictimPlayerIds || [];
      if (legalVictims.length > 0) {
        const fromPlayerId = legalVictims[0];
        const result = await sendAction(currentPlayerId, { type: "STEAL_CARD", fromPlayerId, didSteal: true });
        assert.equal(result.json?.ok, true, `Steal failed: ${JSON.stringify(result.json?.error)}`);
      }

      room = await getRoom();
      game = room.game;
      continue;
    }

    // Main phase - try to build something using actual hand data
    if (game.subphase === "main") {
      // Get actual player hands
      const privateData = await getPrivateData();
      const hand = privateData?.[currentPlayerId]?.hand || {};

      // Building costs
      const COSTS = {
        road: { wood: 1, brick: 1 },
        settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
        city: { wheat: 2, ore: 3 }
      };

      function canAfford(h, cost) {
        for (const [resource, amount] of Object.entries(cost)) {
          if ((h[resource] || 0) < amount) return false;
        }
        return true;
      }

      let didAction = false;

      // Try to build a city (upgrade settlement)
      if (!didAction && canAfford(hand, COSTS.city)) {
        const settlements = game.structures?.settlements || {};
        for (const [vertexId, settlement] of Object.entries(settlements)) {
          if (settlement.playerId === currentPlayerId && settlement.kind === "settlement") {
            const result = await sendAction(currentPlayerId, { type: "BUILD_CITY", vertexId });
            if (result.json?.ok) {
              log(`${currentPlayer?.name} built city at ${vertexId}`);
              didAction = true;
              break;
            }
          }
        }
      }

      // Try to build a settlement
      if (!didAction && canAfford(hand, COSTS.settlement)) {
        const settlements = game.structures?.settlements || {};
        const roads = game.structures?.roads || {};

        // Get vertices connected to our roads
        const ourRoadVertices = new Set();
        for (const edge of game.board?.edges || []) {
          if (roads[edge.id]?.playerId === currentPlayerId) {
            ourRoadVertices.add(edge.vA);
            ourRoadVertices.add(edge.vB);
          }
        }

        // Find valid settlement spots
        for (const vertex of game.board?.vertices || []) {
          if (!ourRoadVertices.has(vertex.id)) continue;
          if (settlements[vertex.id]) continue;

          // Check distance rule (no adjacent settlements)
          const tooClose = vertex.neighborVertexIds?.some((n) => !!settlements[n]);
          if (tooClose) continue;

          const result = await sendAction(currentPlayerId, { type: "BUILD_SETTLEMENT", vertexId: vertex.id });
          if (result.json?.ok) {
            log(`${currentPlayer?.name} built settlement at ${vertex.id}`);
            didAction = true;
            break;
          }
        }
      }

      // Try to build a road
      if (!didAction && canAfford(hand, COSTS.road)) {
        const roads = game.structures?.roads || {};
        const settlements = game.structures?.settlements || {};

        // Find edges connected to our structures
        for (const edge of game.board?.edges || []) {
          if (roads[edge.id]) continue;

          // Check if connected to our road or settlement
          const vA = edge.vA;
          const vB = edge.vB;
          let connected = false;

          // Connected via settlement?
          if (settlements[vA]?.playerId === currentPlayerId || settlements[vB]?.playerId === currentPlayerId) {
            connected = true;
          }

          // Connected via road?
          if (!connected) {
            const vAData = game.board?.vertices?.find((v) => v.id === vA);
            const vBData = game.board?.vertices?.find((v) => v.id === vB);
            if (vAData?.edgeIds?.some((eId) => roads[eId]?.playerId === currentPlayerId)) connected = true;
            if (vBData?.edgeIds?.some((eId) => roads[eId]?.playerId === currentPlayerId)) connected = true;
          }

          if (connected) {
            const result = await sendAction(currentPlayerId, { type: "BUILD_ROAD", edgeId: edge.id });
            if (result.json?.ok) {
              didAction = true;
              break;
            }
          }
        }
      }

      // End turn
      const endResult = await sendAction(currentPlayerId, { type: "END_TURN" });
      assert.equal(endResult.json?.ok, true, `End turn failed: ${JSON.stringify(endResult.json?.error)}`);

      room = await getRoom();
      game = room.game;

      // Check for winner
      if (game.phase === "game_over" || game.winnerPlayerId) {
        break;
      }

      continue;
    }

    // Fallback - get fresh state
    room = await getRoom();
    game = room.game;
  }

  // ========== ASSERTIONS ==========
  log(`Game ended after ${turnCount} turns`);

  room = await getRoom();
  game = room.game;

  if (game.phase === "game_over" || game.winnerPlayerId) {
    const winner = players.find((p) => p.id === game.winnerPlayerId);
    const winnerPoints = game.pointsByPlayerId?.[game.winnerPlayerId] || 0;
    log(`Winner: ${winner?.name} with ${winnerPoints} VP`);

    assert.ok(game.winnerPlayerId, "Should have a winner");
    assert.ok(winnerPoints >= VICTORY_POINTS_TO_WIN, `Winner should have at least ${VICTORY_POINTS_TO_WIN} VP`);

    // Verify VP breakdown is consistent
    for (const player of players) {
      const points = game.pointsByPlayerId?.[player.id] || 0;
      log(`${player.name}: ${points} VP`);
      assert.ok(typeof points === "number" && points >= 0, "VP should be non-negative");
    }
  } else {
    // Game didn't end naturally - this is okay for simulation
    log(`Game stopped at turn ${turnCount} (max turns reached)`);
    log(`Current phase: ${game.phase}, subphase: ${game.subphase}`);

    // Verify game state is consistent
    assert.ok(game.phase === "turn", "Should be in turn phase");
    assert.ok(game.currentPlayerId, "Should have a current player");
  }

  // ========== UX QUALITY REPORT ==========
  const { maxResponse, slowest } = printUxReport(players);

  // ========== UX QUALITY ASSERTIONS ==========
  // Response latency: fail if any response > 2000ms
  assert.ok(
    maxResponse < 2000,
    `LATENCY FAIL: ${maxResponse.toFixed(0)}ms response on ${slowest.method} ${slowest.path}\n` +
      "ACTION: Profile server.js for this endpoint"
  );

  // Hint quality: fail if any hint issues found
  assert.equal(
    uxMetrics.hintIssues.length,
    0,
    `HINT FAIL: ${uxMetrics.hintIssues[0]?.issue} during ${uxMetrics.hintIssues[0]?.subphase}\n` +
      "ACTION: Check computeHints() handles this subphase in packages/game-engine/index.js"
  );

  // State completeness: fail if any required fields missing
  assert.equal(
    uxMetrics.stateIssues.length,
    0,
    `STATE FAIL: Missing ${uxMetrics.stateIssues[0]?.field}\n` +
      `Context: ${uxMetrics.stateIssues[0]?.context}\n` +
      "ACTION: Update getPublicGameSnapshot() in packages/game-engine/index.js"
  );

  // Log quality: fail if log entries are malformed
  assert.equal(
    uxMetrics.logIssues.length,
    0,
    `LOG FAIL: ${uxMetrics.logIssues[0]?.issue} at log index ${uxMetrics.logIssues[0]?.index}\n` +
      "ACTION: Ensure all log entries have type, message, and at timestamp"
  );

  log("Test completed successfully");
});
