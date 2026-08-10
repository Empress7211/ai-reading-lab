import { describe, expect, it } from "vitest";

import type { PackRelation, ReadingPack, ReadingPackEntry, ReadingRole } from "./types";
import { computePackOaRatio, computePackRoleCounts, validateReadingPack } from "./pack";

function entry(
  id: string,
  role: ReadingRole,
  rank: number,
  relations: readonly PackRelation[] = [],
): ReadingPackEntry {
  return {
    id,
    paperId: `paper-${id}`,
    title: `Paper ${id}`,
    year: 2025,
    authors: ["Researcher"],
    identifiers: {},
    role,
    secondaryRoles: [],
    roleConfidence: 0.8,
    rank,
    readingMode: "deep_read",
    rationales: [{ text: "Fixture rationale", evidenceType: "manual", confidence: 1, sourceRefs: [] }],
    relations,
    access: {
      zoteroState: "not_present",
      pdfState: rank === 1 ? "resolvable_oa" : "manual_access_required",
      oaState: rank === 1 ? "open_license" : "closed",
      preferredVersion: "published",
    },
    selectionSource: "manual",
    userFeedback: null,
  };
}

function pack(entries: readonly ReadingPackEntry[]): ReadingPack {
  const partial = { id: "pack-1", entries };
  return {
    ...partial,
    coverage: {
      subtopics: [],
      roleCounts: computePackRoleCounts(partial),
      oaRatio: computePackOaRatio(partial),
      knownGaps: [],
    },
  };
}

describe("Reading Pack policy", () => {
  it("accepts valid targets, prerequisite DAG and materialized statistics", () => {
    const candidate = pack([
      entry("foundation", "foundation", 1),
      entry("frontier", "frontier", 2, [
        { targetItemId: "foundation", relationType: "prerequisite", confidence: 0.9 },
      ]),
      entry("counterpoint", "counterpoint", 3),
    ]);

    expect(validateReadingPack(candidate)).toEqual({ valid: true, issues: [] });
  });

  it("rejects a relation target outside the same Pack", () => {
    const candidate = pack([
      entry("foundation", "foundation", 1, [
        { targetItemId: "missing", relationType: "extends", confidence: 0.9 },
      ]),
    ]);

    expect(validateReadingPack(candidate).issues).toContainEqual(
      expect.objectContaining({ code: "PACK_RELATION_TARGET_MISSING" }),
    );
  });

  it("rejects prerequisite cycles", () => {
    const candidate = pack([
      entry("foundation", "foundation", 1, [
        { targetItemId: "frontier", relationType: "prerequisite", confidence: 1 },
      ]),
      entry("frontier", "frontier", 2, [
        { targetItemId: "counterpoint", relationType: "prerequisite", confidence: 1 },
      ]),
      entry("counterpoint", "counterpoint", 3, [
        { targetItemId: "foundation", relationType: "prerequisite", confidence: 1 },
      ]),
    ]);

    expect(validateReadingPack(candidate).issues).toContainEqual(
      expect.objectContaining({ code: "PACK_PREREQUISITE_CYCLE" }),
    );
  });

  it("rejects stale role counts and OA statistics", () => {
    const candidate = pack([entry("foundation", "foundation", 1)]);
    const stale: ReadingPack = {
      ...candidate,
      coverage: {
        ...candidate.coverage,
        roleCounts: { ...candidate.coverage.roleCounts, foundation: 0 },
        oaRatio: 0,
      },
    };

    expect(validateReadingPack(stale).issues.map((candidateIssue) => candidateIssue.code)).toEqual(
      expect.arrayContaining(["PACK_ROLE_COUNT_MISMATCH", "PACK_OA_RATIO_MISMATCH"]),
    );
  });
});
