import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

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

async function httpJson(baseUrl, p, { method = "GET", body = null } = {}) {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}

test("server: maxPlayers and action idempotency", { timeout: 20000 }, async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "catan-lan-test-"));
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

  const created = await httpJson(baseUrl, "/api/rooms", { method: "POST" });
  assert.equal(created.res.status, 200);
  assert.equal(created.json?.ok, true);
  const roomCode = created.json?.roomCode;
  assert.ok(roomCode);

  const hostJoin = await httpJson(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}/join`, {
    method: "POST",
    body: { playerName: "Host" }
  });
  assert.equal(hostJoin.res.status, 200);
  assert.equal(hostJoin.json?.ok, true);
  const hostId = hostJoin.json?.playerId;
  assert.ok(hostId);

  const setMax = await httpJson(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}/maxPlayers`, {
    method: "POST",
    body: { playerId: hostId, maxPlayers: 3 }
  });
  assert.equal(setMax.res.status, 200);
  assert.equal(setMax.json?.ok, true);

  const p2 = await httpJson(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}/join`, { method: "POST", body: { playerName: "P2" } });
  const p3 = await httpJson(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}/join`, { method: "POST", body: { playerName: "P3" } });
  assert.equal(p2.json?.ok, true);
  assert.equal(p3.json?.ok, true);

  const p4 = await httpJson(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}/join`, { method: "POST", body: { playerName: "P4" } });
  assert.equal(p4.res.status, 403);
  assert.equal(p4.json?.ok, false);
  assert.equal(p4.json?.error?.code, "ROOM_FULL");
  assert.equal(p4.json?.error?.data?.maxPlayers, 3);

  const setRules = await httpJson(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}/houseRules`, {
    method: "POST",
    body: { playerId: hostId, houseRules: { victoryPointsToWin: 6 } }
  });
  assert.equal(setRules.res.status, 200);
  assert.equal(setRules.json?.ok, true);
  assert.equal(setRules.json?.room?.settings?.houseRules?.victoryPointsToWin, 6);

  for (const pid of [hostId, p2.json.playerId, p3.json.playerId]) {
    const ready = await httpJson(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}/ready`, {
      method: "POST",
      body: { playerId: pid, ready: true }
    });
    assert.equal(ready.json?.ok, true);
  }

  const started = await httpJson(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}/start`, { method: "POST", body: { playerId: hostId } });
  assert.equal(started.json?.ok, true);

  const roomGet = await httpJson(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}`, { method: "GET" });
  assert.equal(roomGet.json?.ok, true);
  const game = roomGet.json?.room?.game;
  assert.ok(game);
  assert.equal(game.victoryPointsToWin, 6);
  assert.equal(game.settings?.victoryPointsToWin, 6);
  assert.equal(game.settings?.houseRules?.victoryPointsToWin, 6);
  assert.ok(game.currentPlayerId);
  assert.ok(Array.isArray(game.hints?.legalVertexIds));
  assert.ok(game.hints.legalVertexIds.length > 0);

  const vertexId = [...game.hints.legalVertexIds].sort()[0];
  const actionId = "test-idempotency-1";
  const a1 = await httpJson(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}/action`, {
    method: "POST",
    body: { playerId: game.currentPlayerId, type: "PLACE_SETTLEMENT", vertexId, actionId }
  });
  assert.equal(a1.res.status, 200);
  assert.equal(a1.json?.ok, true);
  const rev1 = a1.json?.room?.revision;
  assert.ok(Number.isFinite(rev1));

  const a2 = await httpJson(baseUrl, `/api/rooms/${encodeURIComponent(roomCode)}/action`, {
    method: "POST",
    body: { playerId: game.currentPlayerId, type: "PLACE_SETTLEMENT", vertexId, actionId }
  });
  assert.equal(a2.res.status, 200);
  assert.equal(a2.json?.ok, true);
  assert.equal(a2.json?.room?.revision, rev1);
});

test("server: API error codes for invalid requests", { timeout: 20000 }, async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "catan-lan-test-errors-"));
  t.after(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  const child = spawn("node", ["apps/server/server.js"], {
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", DATA_DIR: dataDir, LOG_LEVEL: "info" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  t.after(async () => {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), new Promise((r) => setTimeout(r, 3000))]);
  });

  const listenLine = await waitForLine(child.stdout, (line) => line.includes("listening on http://"));
  const listenUrlMatch = listenLine.match(/listening on (http:\/\/\S+)/);
  assert.ok(listenUrlMatch);
  const baseUrl = listenUrlMatch[1];

  // Test 404 for non-existent room
  const notFound = await httpJson(baseUrl, "/api/rooms/NONEXISTENT", { method: "GET" });
  assert.equal(notFound.res.status, 404);

  // Create a room for further tests
  const created = await httpJson(baseUrl, "/api/rooms", { method: "POST" });
  assert.equal(created.json?.ok, true);
  const roomCode = created.json?.roomCode;

  // Test MISSING_PLAYER_NAME error
  const noName = await httpJson(baseUrl, `/api/rooms/${roomCode}/join`, {
    method: "POST",
    body: {}
  });
  assert.equal(noName.res.status, 400);
  assert.equal(noName.json?.ok, false);
  assert.equal(noName.json?.error?.code, "MISSING_PLAYER_NAME");

  // Join the room
  const join = await httpJson(baseUrl, `/api/rooms/${roomCode}/join`, {
    method: "POST",
    body: { playerName: "TestPlayer" }
  });
  assert.equal(join.json?.ok, true);
  const playerId = join.json?.playerId;

  // Test BAD_PLAYER_ID error (invalid player ID format/not found)
  const badPlayer = await httpJson(baseUrl, `/api/rooms/${roomCode}/ready`, {
    method: "POST",
    body: { playerId: "FAKE_PLAYER_ID", ready: true }
  });
  assert.equal(badPlayer.res.status, 400);
  assert.equal(badPlayer.json?.error?.code, "BAD_PLAYER_ID");

  // Test ONLY_HOST error (non-host trying host action)
  const p2 = await httpJson(baseUrl, `/api/rooms/${roomCode}/join`, {
    method: "POST",
    body: { playerName: "Player2" }
  });
  const nonHostMaxPlayers = await httpJson(baseUrl, `/api/rooms/${roomCode}/maxPlayers`, {
    method: "POST",
    body: { playerId: p2.json?.playerId, maxPlayers: 4 }
  });
  assert.equal(nonHostMaxPlayers.res.status, 403);
  assert.equal(nonHostMaxPlayers.json?.error?.code, "ONLY_HOST");

  // Test CANT_START_ROOM (not enough players ready)
  const cantStart = await httpJson(baseUrl, `/api/rooms/${roomCode}/start`, {
    method: "POST",
    body: { playerId }
  });
  assert.equal(cantStart.res.status, 403);
  assert.equal(cantStart.json?.error?.code, "CANT_START_ROOM");
});

test("server: room state persistence across GET requests", { timeout: 20000 }, async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "catan-lan-test-persist-"));
  t.after(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  const child = spawn("node", ["apps/server/server.js"], {
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", DATA_DIR: dataDir, LOG_LEVEL: "info" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  t.after(async () => {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), new Promise((r) => setTimeout(r, 3000))]);
  });

  const listenLine = await waitForLine(child.stdout, (line) => line.includes("listening on http://"));
  const listenUrlMatch = listenLine.match(/listening on (http:\/\/\S+)/);
  const baseUrl = listenUrlMatch[1];

  // Create room and join players
  const created = await httpJson(baseUrl, "/api/rooms", { method: "POST" });
  const roomCode = created.json?.roomCode;

  const join1 = await httpJson(baseUrl, `/api/rooms/${roomCode}/join`, {
    method: "POST",
    body: { playerName: "Alice" }
  });
  const join2 = await httpJson(baseUrl, `/api/rooms/${roomCode}/join`, {
    method: "POST",
    body: { playerName: "Bob" }
  });
  const join3 = await httpJson(baseUrl, `/api/rooms/${roomCode}/join`, {
    method: "POST",
    body: { playerName: "Charlie" }
  });

  // Set all ready
  for (const pid of [join1.json?.playerId, join2.json?.playerId, join3.json?.playerId]) {
    await httpJson(baseUrl, `/api/rooms/${roomCode}/ready`, {
      method: "POST",
      body: { playerId: pid, ready: true }
    });
  }

  // Check room state via GET
  const roomState1 = await httpJson(baseUrl, `/api/rooms/${roomCode}`);
  assert.equal(roomState1.json?.room?.players?.length, 3);
  assert.ok(roomState1.json?.room?.players?.every((p) => p.ready));

  // Multiple GET requests return consistent state
  const roomState2 = await httpJson(baseUrl, `/api/rooms/${roomCode}`);
  assert.deepEqual(roomState1.json?.room?.players, roomState2.json?.room?.players);

  // Start game and verify state persists
  await httpJson(baseUrl, `/api/rooms/${roomCode}/start`, {
    method: "POST",
    body: { playerId: join1.json?.playerId }
  });

  const gameState = await httpJson(baseUrl, `/api/rooms/${roomCode}`);
  assert.equal(gameState.json?.room?.status, "in_game");
  assert.ok(gameState.json?.room?.game);
  assert.ok(gameState.json?.room?.game?.currentPlayerId);
});

test("server: house rules validation", { timeout: 20000 }, async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "catan-lan-test-rules-"));
  t.after(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  const child = spawn("node", ["apps/server/server.js"], {
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", DATA_DIR: dataDir, LOG_LEVEL: "info" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  t.after(async () => {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), new Promise((r) => setTimeout(r, 3000))]);
  });

  const listenLine = await waitForLine(child.stdout, (line) => line.includes("listening on http://"));
  const listenUrlMatch = listenLine.match(/listening on (http:\/\/\S+)/);
  const baseUrl = listenUrlMatch[1];

  const created = await httpJson(baseUrl, "/api/rooms", { method: "POST" });
  const roomCode = created.json?.roomCode;

  const join = await httpJson(baseUrl, `/api/rooms/${roomCode}/join`, {
    method: "POST",
    body: { playerName: "Host" }
  });
  const hostId = join.json?.playerId;

  // Test valid VP range (6-15)
  const validVP = await httpJson(baseUrl, `/api/rooms/${roomCode}/houseRules`, {
    method: "POST",
    body: { playerId: hostId, houseRules: { victoryPointsToWin: 8 } }
  });
  assert.equal(validVP.json?.ok, true);
  assert.equal(validVP.json?.room?.settings?.houseRules?.victoryPointsToWin, 8);

  // Test minimum VP (6)
  const minVP = await httpJson(baseUrl, `/api/rooms/${roomCode}/houseRules`, {
    method: "POST",
    body: { playerId: hostId, houseRules: { victoryPointsToWin: 6 } }
  });
  assert.equal(minVP.json?.ok, true);

  // Test maximum VP (15)
  const maxVP = await httpJson(baseUrl, `/api/rooms/${roomCode}/houseRules`, {
    method: "POST",
    body: { playerId: hostId, houseRules: { victoryPointsToWin: 15 } }
  });
  assert.equal(maxVP.json?.ok, true);

  // Test below minimum VP (should fail)
  const tooLowVP = await httpJson(baseUrl, `/api/rooms/${roomCode}/houseRules`, {
    method: "POST",
    body: { playerId: hostId, houseRules: { victoryPointsToWin: 5 } }
  });
  assert.equal(tooLowVP.json?.ok, false);
  assert.equal(tooLowVP.json?.error?.code, "BAD_VICTORY_POINTS_TO_WIN");

  // Test above maximum VP (should fail)
  const tooHighVP = await httpJson(baseUrl, `/api/rooms/${roomCode}/houseRules`, {
    method: "POST",
    body: { playerId: hostId, houseRules: { victoryPointsToWin: 16 } }
  });
  assert.equal(tooHighVP.json?.ok, false);
  assert.equal(tooHighVP.json?.error?.code, "BAD_VICTORY_POINTS_TO_WIN");
});
