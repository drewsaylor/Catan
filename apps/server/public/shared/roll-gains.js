// Reads who gained what on the latest dice roll from the public game log.

const ROLL_LOG_TYPE = "roll";

export function latestRollGains(log) {
  const entries = Array.isArray(log) ? log : [];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i]?.type !== ROLL_LOG_TYPE) continue;
    const next = entries[i + 1];
    return next?.type === "bank" && next.data?.gains ? next.data.gains : null;
  }
  return null;
}

export function formatRollGains(gains, players) {
  if (!gains) return "";
  const list = Array.isArray(players) ? players : [];
  return list
    .flatMap((player) => {
      const parts = Object.entries(gains[player.playerId] || {})
        .filter(([, count]) => count > 0)
        .map(([resource, count]) => `+${count} ${resource}`);
      return parts.length ? [`${player.name} ${parts.join(", ")}`] : [];
    })
    .join(" · ");
}
