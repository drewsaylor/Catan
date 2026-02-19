export const RESOURCE_TYPES = ["wood", "brick", "sheep", "wheat", "ore"];

export function emptyHand() {
  return {
    wood: 0,
    brick: 0,
    sheep: 0,
    wheat: 0,
    ore: 0
  };
}

export function normalizeResourceCounts(counts) {
  const normalized = emptyHand();
  if (!counts || typeof counts !== "object") return normalized;
  for (const type of RESOURCE_TYPES) {
    const value = counts[type];
    normalized[type] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }
  return normalized;
}
