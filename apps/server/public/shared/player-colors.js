// The server stores plain colour names. These are the shades we actually draw:
// saturated enough for a TV across the room, and distinct on every tile colour.
const DISPLAY_COLORS = {
  red: "#e5484d",
  blue: "#3b82f6",
  white: "#f3efe4",
  orange: "#f59324",
  green: "#2fb574",
  brown: "#9a6a44"
};

export function displayColor(color) {
  return DISPLAY_COLORS[color] || color;
}

// Text that stays legible on top of a player's colour.
export function inkOnColor(color) {
  return color === "white" || color === "orange" ? "#1a1420" : "#fff";
}

// Swaps colour names for display shades on a room snapshot, in place.
export function applyDisplayColors(room) {
  for (const player of room?.players || []) {
    player.colorName = player.colorName || player.color;
    player.color = displayColor(player.colorName);
  }
  return room;
}
