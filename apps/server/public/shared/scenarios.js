const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/g;

function normalizeText(input) {
  return String(input ?? "")
    .replace(CONTROL_CHARS_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text, maxLen) {
  const n = Number.isFinite(maxLen) ? Math.floor(maxLen) : 0;
  const limit = Math.max(0, n);
  if (!limit) return "";
  if (text.length <= limit) return text;
  if (limit <= 1) return "…".slice(0, limit);
  return `${text.slice(0, limit - 1)}…`;
}

export function safeUiText(input, { maxLen = 120 } = {}) {
  return truncate(normalizeText(input), maxLen);
}

export function findScenario(scenarios, scenarioId) {
  const id = typeof scenarioId === "string" ? scenarioId.trim() : "";
  const list = Array.isArray(scenarios) ? scenarios : [];
  if (!id) return null;
  return list.find((s) => s?.id === id) || null;
}

export function scenarioDisplay(scenarios, scenarioId, { fallbackName = "—" } = {}) {
  const scenario = findScenario(scenarios, scenarioId);

  const name = scenario ? safeUiText(scenario?.name, { maxLen: 36 }) : safeUiText(fallbackName, { maxLen: 36 });
  const rulesSummary = scenario ? safeUiText(scenario?.rulesSummary, { maxLen: 90 }) : "";
  const description = scenario ? safeUiText(scenario?.description, { maxLen: 120 }) : "";

  return { name, rulesSummary, description, scenario };
}
