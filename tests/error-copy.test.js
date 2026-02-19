/**
 * Error Copy Tests
 *
 * Tests for error message humanization and error code extraction.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { errorCode, humanizeErrorMessage } from "../apps/server/public/shared/error-copy.js";

describe("errorCode", () => {
  test("returns empty string for null/undefined", () => {
    assert.equal(errorCode(null), "");
    assert.equal(errorCode(undefined), "");
  });

  test("returns empty string for empty string", () => {
    assert.equal(errorCode(""), "");
    assert.equal(errorCode("   "), "");
  });

  test("returns trimmed string for string input", () => {
    assert.equal(errorCode("NOT_YOUR_TURN"), "NOT_YOUR_TURN");
    assert.equal(errorCode("  NOT_YOUR_TURN  "), "NOT_YOUR_TURN");
  });

  test("extracts code from error object with code property", () => {
    assert.equal(errorCode({ code: "NOT_YOUR_TURN" }), "NOT_YOUR_TURN");
    assert.equal(errorCode({ code: "  ROOM_FULL  " }), "ROOM_FULL");
  });

  test("falls back to message property when code is empty", () => {
    assert.equal(errorCode({ message: "Something went wrong" }), "Something went wrong");
    assert.equal(errorCode({ code: "", message: "Fallback" }), "Fallback");
    assert.equal(errorCode({ code: "   ", message: "Fallback" }), "Fallback");
  });

  test("prefers code over message", () => {
    assert.equal(errorCode({ code: "ERROR_CODE", message: "Error message" }), "ERROR_CODE");
  });

  test("returns empty string for object with no code or message", () => {
    assert.equal(errorCode({}), "");
    assert.equal(errorCode({ foo: "bar" }), "");
  });

  test("returns empty string for non-object non-string", () => {
    assert.equal(errorCode(123), "");
    assert.equal(errorCode(true), "");
    assert.equal(errorCode([]), "");
  });
});

describe("humanizeErrorMessage", () => {
  test("returns generic message for null/undefined", () => {
    assert.equal(humanizeErrorMessage(null), "Something went wrong.");
    assert.equal(humanizeErrorMessage(undefined), "Something went wrong.");
  });

  test("returns generic message for empty string", () => {
    assert.equal(humanizeErrorMessage(""), "Something went wrong.");
  });

  // HTTP status code handling
  test("handles HTTP 404", () => {
    assert.equal(humanizeErrorMessage("HTTP 404"), "Room not found. Check the code on the TV.");
    assert.equal(humanizeErrorMessage("HTTP_404"), "Room not found. Check the code on the TV.");
  });

  test("handles HTTP 429", () => {
    assert.equal(humanizeErrorMessage("HTTP 429"), "Too many requests. Try again.");
    assert.equal(humanizeErrorMessage("HTTP_429"), "Too many requests. Try again.");
  });

  test("handles HTTP 413", () => {
    assert.equal(humanizeErrorMessage("HTTP 413"), "That request was too big. Try again.");
    assert.equal(humanizeErrorMessage("HTTP_413"), "That request was too big. Try again.");
  });

  test("handles HTTP 5xx errors", () => {
    assert.equal(humanizeErrorMessage("HTTP 500"), "Server error. Try again.");
    assert.equal(humanizeErrorMessage("HTTP 503"), "Server error. Try again.");
  });

  test("handles unknown HTTP errors as connection error", () => {
    assert.equal(humanizeErrorMessage("HTTP 400"), "Connection error.");
    assert.equal(humanizeErrorMessage("HTTP_418"), "Connection error.");
  });

  // Known error codes
  test("humanizes NOT_YOUR_TURN", () => {
    assert.equal(humanizeErrorMessage("NOT_YOUR_TURN"), "Not your turn.");
  });

  test("humanizes NOT_ENOUGH_RESOURCES", () => {
    assert.equal(humanizeErrorMessage("NOT_ENOUGH_RESOURCES"), "Not enough resources.");
  });

  test("humanizes ILLEGAL_PLACEMENT", () => {
    const result = humanizeErrorMessage("ILLEGAL_PLACEMENT");
    assert.ok(result.includes("placement") && result.includes("legal"));
  });

  test("humanizes BAD_TRADE", () => {
    const result = humanizeErrorMessage("BAD_TRADE");
    assert.ok(result.includes("trade") && result.includes("work"));
  });

  test("humanizes DEV_DECK_EMPTY", () => {
    assert.equal(humanizeErrorMessage("DEV_DECK_EMPTY"), "Dev deck is empty.");
  });

  test("humanizes ONLY_HOST", () => {
    assert.equal(humanizeErrorMessage("ONLY_HOST"), "Only the host can do that.");
  });

  test("humanizes GAME_ALREADY_STARTED", () => {
    const result = humanizeErrorMessage("GAME_ALREADY_STARTED");
    assert.ok(result.includes("Game in progress"));
    assert.ok(result.includes("join mid-game"));
    // Also works as plain string
    const result2 = humanizeErrorMessage("Game already started");
    assert.ok(result2.includes("Game in progress"));
  });

  test("humanizes piece limit errors", () => {
    assert.equal(humanizeErrorMessage("OUT_OF_PIECES_ROAD"), "Out of roads (15 max).");
    assert.equal(humanizeErrorMessage("OUT_OF_PIECES_SETTLEMENT"), "Out of settlements (5 max).");
    assert.equal(humanizeErrorMessage("OUT_OF_PIECES_CITY"), "Out of cities (4 max).");
  });

  test("humanizes emote errors", () => {
    assert.equal(humanizeErrorMessage("EMOTES_DISABLED"), "Emotes are off for this room.");
    const badEmote = humanizeErrorMessage("BAD_EMOTE");
    assert.ok(badEmote.includes("emote") && badEmote.includes("supported"));
    const cooldown = humanizeErrorMessage("EMOTE_COOLDOWN");
    assert.ok(cooldown.includes("Slow down") && cooldown.includes("cooldown"));
  });

  // ROOM_FULL with data
  test("humanizes ROOM_FULL with maxPlayers data", () => {
    const error = { code: "ROOM_FULL", data: { maxPlayers: 4 } };
    const result = humanizeErrorMessage(error);
    assert.ok(result.includes("max 4 players"));
    assert.ok(result.includes("Ask the host"));
  });

  test("humanizes ROOM_FULL without data", () => {
    const result = humanizeErrorMessage("ROOM_FULL");
    assert.ok(result.includes("max"));
    assert.ok(result.includes("?") || result.includes("players"));
  });

  // CANT_START_ROOM
  test("humanizes CANT_START_ROOM with player counts", () => {
    const error = { code: "CANT_START_ROOM", data: { minPlayers: 3, maxPlayers: 6 } };
    const result = humanizeErrorMessage(error);
    assert.ok(result.includes("3") && result.includes("6"));
    assert.ok(result.includes("everyone ready"));
  });

  // MAX_PLAYERS_TOO_LOW
  test("humanizes MAX_PLAYERS_TOO_LOW", () => {
    const error = { code: "MAX_PLAYERS_TOO_LOW", data: { players: 5 } };
    const result = humanizeErrorMessage(error);
    assert.ok(result.includes("5 players"));
  });

  // BAD_PHASE with context
  test("humanizes BAD_PHASE with needs_roll context", () => {
    const room = { game: { subphase: "needs_roll" } };
    const result = humanizeErrorMessage("BAD_PHASE", { room });
    assert.equal(result, "Need to roll first.");
  });

  test("humanizes BAD_PHASE with robber_discard context", () => {
    const room = { game: { subphase: "robber_discard" } };
    const result = humanizeErrorMessage("BAD_PHASE", { room });
    assert.equal(result, "Finish discarding first.");
  });

  test("humanizes BAD_PHASE with robber_move context", () => {
    const room = { game: { subphase: "robber_move" } };
    const result = humanizeErrorMessage("BAD_PHASE", { room });
    assert.equal(result, "Move the robber first.");
  });

  test("humanizes BAD_PHASE with robber_steal context", () => {
    const room = { game: { subphase: "robber_steal" } };
    const result = humanizeErrorMessage("BAD_PHASE", { room });
    assert.equal(result, "Steal a card first.");
  });

  test("humanizes BAD_PHASE with dev_road_building context", () => {
    const room = { game: { subphase: "dev_road_building" } };
    const result = humanizeErrorMessage("BAD_PHASE", { room });
    assert.equal(result, "Finish Road Building first.");
  });

  test("humanizes BAD_PHASE with hints.expected context", () => {
    const room = { game: { hints: { expected: "PLACE_SETTLEMENT" } } };
    const result = humanizeErrorMessage("BAD_PHASE", { room });
    assert.equal(result, "Place a settlement first.");
  });

  test("humanizes BAD_PHASE without context", () => {
    const result = humanizeErrorMessage("BAD_PHASE");
    assert.equal(result, "Not right now.");
  });

  // Unknown codes
  test("converts unknown code to sentence case", () => {
    const result = humanizeErrorMessage("SOME_UNKNOWN_ERROR");
    assert.equal(result, "Some unknown error");
  });

  test("returns non-code strings as-is", () => {
    assert.equal(humanizeErrorMessage("Something specific happened"), "Something specific happened");
    assert.equal(humanizeErrorMessage("Custom error message"), "Custom error message");
  });

  // Error object handling
  test("extracts code from error object", () => {
    const error = { code: "NOT_YOUR_TURN" };
    assert.equal(humanizeErrorMessage(error), "Not your turn.");
  });

  test("extracts code from nested data object", () => {
    const error = { code: "ROOM_FULL", data: { maxPlayers: 3 } };
    const result = humanizeErrorMessage(error);
    assert.ok(result.includes("max 3 players"));
  });

  // Regex match for room full message pattern
  test("parses ROOM_FULL message format", () => {
    const result = humanizeErrorMessage("Room is full (max 4 players)");
    assert.ok(result.includes("max 4 players"));
  });

  // Rate limiting
  test("humanizes RATE_LIMIT", () => {
    assert.equal(humanizeErrorMessage("RATE_LIMIT"), "Too many requests. Try again.");
  });

  // Request size errors
  test("humanizes REQUEST_TOO_LARGE", () => {
    assert.equal(humanizeErrorMessage("REQUEST_TOO_LARGE"), "That request was too big. Try again.");
  });

  test("humanizes BAD_JSON", () => {
    const result = humanizeErrorMessage("BAD_JSON");
    assert.ok(result.includes("send right") && result.includes("Try again"));
  });

  // Player identification errors
  test("humanizes BAD_PLAYER_ID", () => {
    assert.equal(humanizeErrorMessage("BAD_PLAYER_ID"), "Your seat looks stale. Rejoin the room.");
  });

  test("humanizes UNKNOWN_PLAYER_ID", () => {
    assert.equal(humanizeErrorMessage("UNKNOWN_PLAYER_ID"), "Your seat is gone. Rejoin the room.");
  });

  // Host errors
  test("humanizes BAD_ADMIN_SECRET", () => {
    assert.equal(humanizeErrorMessage("BAD_ADMIN_SECRET"), "Host controls are locked. Refresh and claim again.");
  });

  test("humanizes HOST_CONSOLE_CLAIMED", () => {
    assert.equal(humanizeErrorMessage("HOST_CONSOLE_CLAIMED"), "Host controls already claimed on another screen.");
  });
});
