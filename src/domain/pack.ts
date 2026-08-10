import {
  READING_ROLES,
  type ReadingPack,
  type ReadingRole,
  type ReadingRoleCounts,
  type UUID,
} from "./types";

export type PackValidationIssueCode =
  | "PACK_EMPTY"
  | "PACK_ITEM_DUPLICATE"
  | "PACK_PAPER_DUPLICATE"
  | "PACK_RANK_DUPLICATE"
  | "PACK_RELATION_TARGET_MISSING"
  | "PACK_RELATION_SELF_REFERENCE"
  | "PACK_PREREQUISITE_CYCLE"
  | "PACK_ROLE_COUNT_MISMATCH"
  | "PACK_OA_RATIO_MISMATCH";

export interface PackValidationIssue {
  readonly code: PackValidationIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface PackValidationResult {
  readonly valid: boolean;
  readonly issues: readonly PackValidationIssue[];
}

function issue(code: PackValidationIssueCode, path: string, message: string): PackValidationIssue {
  return { code, path, message };
}

export function computePackRoleCounts(pack: Pick<ReadingPack, "entries">): ReadingRoleCounts {
  const counts: Record<ReadingRole, number> = {
    foundation: 0,
    frontier: 0,
    counterpoint: 0,
    bridge: 0,
    resource: 0,
  };
  for (const entry of pack.entries) counts[entry.role] += 1;
  return counts;
}

export function computePackOaRatio(pack: Pick<ReadingPack, "entries">): number {
  if (pack.entries.length === 0) return 0;
  const openCount = pack.entries.filter((entry) => entry.access.oaState === "open_license").length;
  return Math.round((openCount / pack.entries.length) * 1_000_000) / 1_000_000;
}

/** Referential, DAG and materialized-statistics policy beyond JSON Schema. */
export function validateReadingPack(pack: ReadingPack): PackValidationResult {
  const issues: PackValidationIssue[] = [];
  if (pack.entries.length === 0) {
    issues.push(issue("PACK_EMPTY", "entries", "A reading pack must contain at least one entry."));
  }

  const itemIds = new Set<UUID>();
  const paperIds = new Set<UUID>();
  const ranks = new Set<number>();
  pack.entries.forEach((entry, index) => {
    if (itemIds.has(entry.id)) {
      issues.push(issue("PACK_ITEM_DUPLICATE", `entries.${index}.id`, "Pack item IDs must be unique."));
    }
    itemIds.add(entry.id);
    if (paperIds.has(entry.paperId)) {
      issues.push(issue("PACK_PAPER_DUPLICATE", `entries.${index}.paperId`, "A Paper may appear only once per pack."));
    }
    paperIds.add(entry.paperId);
    if (ranks.has(entry.rank)) {
      issues.push(issue("PACK_RANK_DUPLICATE", `entries.${index}.rank`, "Pack ranks must be unique."));
    }
    ranks.add(entry.rank);
  });

  const prerequisiteGraph = new Map<UUID, UUID[]>();
  for (const entry of pack.entries) prerequisiteGraph.set(entry.id, []);
  pack.entries.forEach((entry, entryIndex) => {
    entry.relations.forEach((relation, relationIndex) => {
      const path = `entries.${entryIndex}.relations.${relationIndex}.targetItemId`;
      if (!itemIds.has(relation.targetItemId)) {
        issues.push(issue("PACK_RELATION_TARGET_MISSING", path, "Relations must target an item in the same pack."));
        return;
      }
      if (relation.targetItemId === entry.id) {
        issues.push(issue("PACK_RELATION_SELF_REFERENCE", path, "A pack item cannot relate to itself."));
      }
      if (relation.relationType === "prerequisite") {
        prerequisiteGraph.get(entry.id)?.push(relation.targetItemId);
      }
    });
  });

  const visiting = new Set<UUID>();
  const visited = new Set<UUID>();
  const hasCycle = (id: UUID): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const target of prerequisiteGraph.get(id) ?? []) {
      if (hasCycle(target)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if ([...itemIds].some(hasCycle)) {
    issues.push(issue("PACK_PREREQUISITE_CYCLE", "entries.relations", "Prerequisite relations must form a DAG."));
  }

  const actualCounts = computePackRoleCounts(pack);
  for (const role of READING_ROLES) {
    if (pack.coverage.roleCounts[role] !== actualCounts[role]) {
      issues.push(issue(
        "PACK_ROLE_COUNT_MISMATCH",
        `coverage.roleCounts.${role}`,
        `Expected ${actualCounts[role]} ${role} entries.`,
      ));
    }
  }
  const actualRatio = computePackOaRatio(pack);
  if (Math.abs(pack.coverage.oaRatio - actualRatio) > 0.000001) {
    issues.push(issue("PACK_OA_RATIO_MISMATCH", "coverage.oaRatio", `Expected OA ratio ${actualRatio}.`));
  }

  return { valid: issues.length === 0, issues };
}
