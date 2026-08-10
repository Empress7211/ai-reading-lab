import { describe, expect, it } from "vitest";

import { canonicalizeCounterpoint, canonicalizeStance } from "./counterpoint";

describe("counterpoint canonical mappings", () => {
  it("normalizes recommendation and prompt vocabulary", () => {
    expect(canonicalizeCounterpoint("direct_counter")).toBe("direct_contradiction");
    expect(canonicalizeCounterpoint("replication_failure")).toBe("failed_or_weaker_replication");
    expect(canonicalizeCounterpoint("qualifies")).toBe("boundary_condition");
    expect(canonicalizeCounterpoint("not_comparable")).toBe("incomparable");
  });

  it("maps relationship and counterpoint vocabulary to proposition stances", () => {
    expect(canonicalizeStance("supports")).toBe("support");
    expect(canonicalizeStance("failed_or_weaker_replication")).toBe("counter");
    expect(canonicalizeStance("boundary_condition")).toBe("qualify");
    expect(canonicalizeStance("uses_different_definition")).toBe("incomparable");
    expect(canonicalizeStance("uncertain")).toBe("unclear");
  });
});
