function parseNonNegativeInt(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function normalizeErrorData(err) {
  if (!err || typeof err !== "object") return null;
  if (err.data && typeof err.data === "object") return err.data;
  if ("maxPlayers" in err || "minPlayers" in err || "players" in err) return err;
  return null;
}

export function errorCode(err) {
  if (!err) return "";
  if (typeof err === "string") return err.trim();
  if (typeof err === "object") {
    if (typeof err.code === "string" && err.code.trim()) return err.code.trim();
    if (typeof err.message === "string" && err.message.trim()) return err.message.trim();
  }
  return "";
}

function codeToCopy(code, { room = null, data = null } = {}) {
  const msg = String(code || "").trim();
  if (!msg) return null;

  const game = room?.game || null;
  const expected = game?.hints?.expected || null;
  const subphase = String(game?.subphase || "");

  if (msg === "ROOM_FULL") {
    const max = parseNonNegativeInt(Number(data?.maxPlayers ?? NaN));
    return `Room is full (max ${max || "?"} players). Ask the host to raise Max players or try another room.`;
  }

  if (msg === "CANT_START_ROOM") {
    const min = parseNonNegativeInt(Number(data?.minPlayers ?? 3)) || 3;
    const max = parseNonNegativeInt(Number(data?.maxPlayers ?? NaN));
    return `Need ${min}–${max || "?"} players and everyone ready.`;
  }

  if (msg === "MAX_PLAYERS_TOO_LOW") {
    const players = parseNonNegativeInt(Number(data?.players ?? NaN));
    return `Room already has ${players || "?"} players.`;
  }

  const known = {
    CONNECTION_ERROR: "Connection error.",
    NOT_YOUR_TURN: "Not your turn.",
    NOT_ENOUGH_RESOURCES: "Not enough resources.",
    ILLEGAL_PLACEMENT: "That placement isn’t legal.",
    ILLEGAL_TARGET: "That target isn’t legal.",
    BAD_EDGE: "Pick a valid spot.",
    BAD_VERTEX: "Pick a valid spot.",
    BAD_DICE: "Dice error. Try again.",
    BAD_TRADE: "That trade doesn't work.",
    BAD_TRADE_TO: "Pick a valid player.",
    BANK_EMPTY: "Bank is out of that resource.",
    BAD_DISCARD: "Discard exactly what’s required.",
    NO_DISCARD_REQUIRED: "No discard required.",
    ALREADY_DISCARDED: "Already discarded.",
    DEV_DECK_EMPTY: "Dev deck is empty.",
    BAD_DEV_CARD: "That dev card can't be played.",
    NO_DEV_CARD: "You don't have that card.",
    ALREADY_PLAYED_DEV_CARD: "Only 1 dev card per turn.",
    BAD_DEV_SELECTION: "Pick a valid selection.",
    BAD_PLAYER: "Pick a valid player.",
    BAD_ACTION_TYPE: "That action isn’t supported.",
    MISSING_OFFER_ID: "That offer is missing.",
    BAD_RESPONSE: "Pick accept or reject.",
    MISSING_HEX_ID: "Pick a hex.",
    MISSING_EDGE_ID: "Pick an edge.",
    MISSING_FROM_PLAYER_ID: "Pick a player.",
    NOT_FOR_YOU: "That offer isn't for you.",
    CANNOT_ACCEPT_OWN_OFFER: "You can't accept your own offer.",
    NO_SUCH_OFFER: "Trade offer not found.",
    OFFER_CLOSED: "Trade offer already closed.",
    ALREADY_REJECTED: "Already rejected.",
    BAD_TRADE_RESPONSE: "Bad trade response.",
    UNKNOWN_ACTION: "Unknown action.",
    OUT_OF_PIECES_ROAD: "Out of roads (15 max).",
    OUT_OF_PIECES_SETTLEMENT: "Out of settlements (5 max).",
    OUT_OF_PIECES_CITY: "Out of cities (4 max).",
    BAD_HOUSE_RULES: "Invalid house rules.",
    MISSING_HOUSE_RULES: "Missing house rules.",
    BAD_VICTORY_POINTS_TO_WIN: "VP to win must be 6–15.",
    BAD_PRESET: "That preset isn’t available.",
    BAD_GAME_MODE: "That mode isn’t available.",
    BAD_MAX_PLAYERS: "Max players must be 3–6.",
    CONFIRM_RESET_REQUIRED: "Confirm reset to continue.",
    MISSING_TARGET_PLAYER_ID: "Pick a player.",
    UNKNOWN_TARGET_PLAYER_ID: "That player is gone.",
    MISSING_HOST_PLAYER_ID: "Pick a host.",
    UNKNOWN_HOST_PLAYER_ID: "That player is gone.",
    REQUEST_TOO_LARGE: "That request was too big. Try again.",
    BAD_JSON: "That didn’t send right. Try again.",
    BAD_PAYLOAD: "That didn’t send right. Try again.",
    GAME_ALREADY_STARTED: "Game in progress. New players can’t join mid-game.",
    GAME_NOT_STARTED: "Game hasn’t started yet.",
    GAME_NOT_OVER: "Game isn’t over yet.",
    BAD_PLAYER_ID: "Your seat looks stale. Rejoin the room.",
    UNKNOWN_PLAYER_ID: "Your seat is gone. Rejoin the room.",
    ONLY_HOST: "Only the host can do that.",
    BAD_ADMIN_SECRET: "Host controls are locked. Refresh and claim again.",
    HOST_CONSOLE_CLAIMED: "Host controls already claimed on another screen.",
    MISSING_PLAYER_NAME: "Enter a name.",
    BAD_PLAYER_NAME: "Name can’t include weird control characters.",
    HOST_PIN_REQUIRED: "Host PIN required.",
    BAD_HOST_PIN: "Bad host PIN.",
    RATE_LIMIT: "Too many requests. Try again."
  };
  if (known[msg]) return known[msg];

  if (msg === "EMOTES_DISABLED") return "Emotes are off for this room.";
  if (msg === "BAD_EMOTE") return "That emote isn’t supported.";
  if (msg === "EMOTE_COOLDOWN") return "Slow down — emote cooldown.";

  if (msg === "BAD_PHASE") {
    if (expected === "ROLL_DICE" || subphase === "needs_roll") return "Need to roll first.";
    if (expected === "DISCARD_CARDS" || subphase === "robber_discard") return "Finish discarding first.";
    if (expected === "MOVE_ROBBER" || subphase === "robber_move") return "Move the robber first.";
    if (expected === "STEAL_CARD" || subphase === "robber_steal") return "Steal a card first.";
    if (expected === "PLACE_SETTLEMENT") return "Place a settlement first.";
    if (expected === "PLACE_ROAD") return "Place a road first.";
    if (expected === "DEV_ROAD_BUILDING_PLACE_ROAD" || subphase === "dev_road_building") return "Finish Road Building first.";
    return "Not right now.";
  }

  return null;
}

export function humanizeErrorMessage(raw, { room = null } = {}) {
  const code = errorCode(raw);
  const data = normalizeErrorData(raw);
  const msg = String(code || "").trim();
  if (!msg) return "Something went wrong.";
  if (msg === "HTTP 404" || msg === "HTTP_404") return "Room not found. Check the code on the TV.";
  if (msg === "HTTP 429" || msg === "HTTP_429") return "Too many requests. Try again.";
  if (msg === "HTTP 413" || msg === "HTTP_413") return "That request was too big. Try again.";
  if (msg.startsWith("HTTP ") || msg.startsWith("HTTP_")) {
    const status = parseNonNegativeInt(Number(msg.slice(5)));
    if (status >= 500) return "Server error. Try again.";
    return "Connection error.";
  }
  if (msg === "Game already started" || msg === "GAME_ALREADY_STARTED") return "Game in progress. New players can’t join mid-game.";

  const roomFullMatch = msg.match(/^Room is full \\(max (\\d+) players\\)$/i);
  if (roomFullMatch) {
    const max = parseNonNegativeInt(Number(roomFullMatch[1]));
    return `Room is full (max ${max || "?"} players). Ask the host to raise Max players or try another room.`;
  }

  const codeCopy = codeToCopy(msg, { room, data });
  if (codeCopy) return codeCopy;

  const looksLikeCode = msg === msg.toUpperCase() && /^[A-Z0-9_ -]+$/.test(msg);
  if (!looksLikeCode) return msg;

  const spaced = msg.replace(/_/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
