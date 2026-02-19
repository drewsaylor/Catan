/**
 * Scenarios Tests
 *
 * Tests for scenario display and text sanitization utilities.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { safeUiText, findScenario, scenarioDisplay } from "../apps/server/public/shared/scenarios.js";

describe("safeUiText", () => {
  test("returns empty string for null/undefined", () => {
    assert.equal(safeUiText(null), "");
    assert.equal(safeUiText(undefined), "");
  });

  test("returns empty string for empty input", () => {
    assert.equal(safeUiText(""), "");
  });

  test("trims whitespace", () => {
    assert.equal(safeUiText("  hello  "), "hello");
    assert.equal(safeUiText("\t\nhello\t\n"), "hello");
  });

  test("collapses multiple spaces", () => {
    assert.equal(safeUiText("hello   world"), "hello world");
    assert.equal(safeUiText("a    b    c"), "a b c");
  });

  test("removes control characters", () => {
    assert.equal(safeUiText("hello\x00world"), "helloworld");
    assert.equal(safeUiText("test\x1Fvalue"), "testvalue");
    assert.equal(safeUiText("\x00\x01\x02text\x1F"), "text");
  });

  test("truncates to maxLen", () => {
    const result = safeUiText("This is a very long string that should be truncated", { maxLen: 20 });
    assert.equal(result.length, 20);
    assert.ok(result.endsWith("…"));
  });

  test("does not truncate short strings", () => {
    assert.equal(safeUiText("short", { maxLen: 20 }), "short");
  });

  test("handles exact length", () => {
    const input = "exactly20characters!";
    assert.equal(safeUiText(input, { maxLen: 20 }), input);
  });

  test("uses default maxLen of 120", () => {
    const longString = "a".repeat(150);
    const result = safeUiText(longString);
    assert.equal(result.length, 120);
    assert.ok(result.endsWith("…"));
  });

  test("handles maxLen of 1", () => {
    assert.equal(safeUiText("hello", { maxLen: 1 }), "…");
  });

  test("handles maxLen of 0", () => {
    assert.equal(safeUiText("hello", { maxLen: 0 }), "");
  });

  test("handles non-string input", () => {
    assert.equal(safeUiText(123), "123");
    assert.equal(safeUiText({ toString: () => "object" }), "object");
  });
});

describe("findScenario", () => {
  const scenarios = [
    { id: "classic", name: "Classic" },
    { id: "beginner", name: "Beginner" },
    { id: "advanced", name: "Advanced" }
  ];

  test("finds scenario by id", () => {
    const result = findScenario(scenarios, "classic");
    assert.deepEqual(result, { id: "classic", name: "Classic" });
  });

  test("returns null for unknown id", () => {
    assert.equal(findScenario(scenarios, "unknown"), null);
  });

  test("returns null for empty id", () => {
    assert.equal(findScenario(scenarios, ""), null);
    assert.equal(findScenario(scenarios, null), null);
    assert.equal(findScenario(scenarios, undefined), null);
  });

  test("returns null for non-array scenarios", () => {
    assert.equal(findScenario(null, "classic"), null);
    assert.equal(findScenario(undefined, "classic"), null);
    assert.equal(findScenario({}, "classic"), null);
  });

  test("handles empty scenarios array", () => {
    assert.equal(findScenario([], "classic"), null);
  });

  test("trims whitespace from id", () => {
    // The id is trimmed before searching, so this should find the scenario
    const result = findScenario(scenarios, "  classic  ");
    assert.deepEqual(result, { id: "classic", name: "Classic" });
  });

  test("handles non-string id", () => {
    assert.equal(findScenario(scenarios, 123), null);
    assert.equal(findScenario(scenarios, {}), null);
  });
});

describe("scenarioDisplay", () => {
  const scenarios = [
    {
      id: "classic",
      name: "Classic Catan",
      rulesSummary: "Standard rules with balanced resources.",
      description: "The original Catan experience with the traditional hex layout and resource distribution."
    },
    {
      id: "party",
      name: "Party Mode",
      rulesSummary: "Fast games with events.",
      description: "Quick games with random events for casual play."
    }
  ];

  test("returns scenario data when found", () => {
    const result = scenarioDisplay(scenarios, "classic");

    assert.equal(result.name, "Classic Catan");
    assert.equal(result.rulesSummary, "Standard rules with balanced resources.");
    assert.ok(result.description.includes("original Catan"));
    assert.deepEqual(result.scenario, scenarios[0]);
  });

  test("returns fallback name when scenario not found", () => {
    const result = scenarioDisplay(scenarios, "unknown");

    assert.equal(result.name, "—");
    assert.equal(result.rulesSummary, "");
    assert.equal(result.description, "");
    assert.equal(result.scenario, null);
  });

  test("uses custom fallback name", () => {
    const result = scenarioDisplay(scenarios, "unknown", { fallbackName: "Unknown Scenario" });

    assert.equal(result.name, "Unknown Scenario");
  });

  test("sanitizes name field", () => {
    const scenariosWithBadData = [
      {
        id: "bad",
        name: "Bad\x00Name",
        rulesSummary: "Rules\x00Summary",
        description: "Desc\x00ription"
      }
    ];

    const result = scenarioDisplay(scenariosWithBadData, "bad");

    assert.equal(result.name, "BadName");
    assert.equal(result.rulesSummary, "RulesSummary");
    assert.equal(result.description, "Description");
  });

  test("truncates long fields", () => {
    const longName = "A".repeat(100);
    const longRules = "B".repeat(200);
    const longDesc = "C".repeat(300);

    const scenariosWithLongData = [
      {
        id: "long",
        name: longName,
        rulesSummary: longRules,
        description: longDesc
      }
    ];

    const result = scenarioDisplay(scenariosWithLongData, "long");

    assert.equal(result.name.length, 36); // maxLen for name
    assert.equal(result.rulesSummary.length, 90); // maxLen for rulesSummary
    assert.equal(result.description.length, 120); // maxLen for description
  });

  test("handles scenario with missing fields", () => {
    const scenariosWithMissing = [{ id: "minimal" }];

    const result = scenarioDisplay(scenariosWithMissing, "minimal");

    assert.equal(result.name, "");
    assert.equal(result.rulesSummary, "");
    assert.equal(result.description, "");
    assert.deepEqual(result.scenario, { id: "minimal" });
  });

  test("handles null scenario fields", () => {
    const scenariosWithNulls = [
      {
        id: "nulls",
        name: null,
        rulesSummary: null,
        description: null
      }
    ];

    const result = scenarioDisplay(scenariosWithNulls, "nulls");

    assert.equal(result.name, "");
    assert.equal(result.rulesSummary, "");
    assert.equal(result.description, "");
  });

  test("handles empty scenarios array", () => {
    const result = scenarioDisplay([], "classic");

    assert.equal(result.name, "—");
    assert.equal(result.scenario, null);
  });

  test("handles null scenarios array", () => {
    const result = scenarioDisplay(null, "classic");

    assert.equal(result.name, "—");
    assert.equal(result.scenario, null);
  });

  test("sanitizes fallback name", () => {
    const result = scenarioDisplay([], "unknown", { fallbackName: "Bad\x00Fallback  Name" });

    assert.equal(result.name, "BadFallback Name");
  });
});
