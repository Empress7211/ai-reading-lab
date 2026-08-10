import type { CanonicalStance, ClaimRelationshipType } from "./types";

export type CanonicalCounterpointClassification =
  | "direct_contradiction"
  | "failed_or_weaker_replication"
  | "methodological_critique"
  | "boundary_condition"
  | "alternative_explanation"
  | "negative_result"
  | "theoretical_limit"
  | "incomparable"
  | "not_counterpoint"
  | "uncertain";

export type CounterpointClassificationAlias =
  | CanonicalCounterpointClassification
  | "direct_counter"
  | "replication_failure"
  | "qualifies"
  | "not_comparable";

const COUNTERPOINT_ALIASES: Readonly<Record<CounterpointClassificationAlias, CanonicalCounterpointClassification>> = {
  direct_contradiction: "direct_contradiction",
  direct_counter: "direct_contradiction",
  failed_or_weaker_replication: "failed_or_weaker_replication",
  replication_failure: "failed_or_weaker_replication",
  methodological_critique: "methodological_critique",
  boundary_condition: "boundary_condition",
  qualifies: "boundary_condition",
  alternative_explanation: "alternative_explanation",
  negative_result: "negative_result",
  theoretical_limit: "theoretical_limit",
  incomparable: "incomparable",
  not_comparable: "incomparable",
  not_counterpoint: "not_counterpoint",
  uncertain: "uncertain",
};

export function canonicalizeCounterpoint(
  classification: CounterpointClassificationAlias,
): CanonicalCounterpointClassification {
  return COUNTERPOINT_ALIASES[classification];
}

export type StanceAlias =
  | CanonicalStance
  | "supports"
  | "counters"
  | "qualifies"
  | "replicates"
  | "uses_different_definition"
  | "uses_incomparable_setup"
  | CounterpointClassificationAlias;

const RELATIONSHIP_STANCES: Readonly<Partial<Record<ClaimRelationshipType, CanonicalStance>>> = {
  supports: "support",
  counters: "counter",
  qualifies: "qualify",
  incomparable: "incomparable",
  replicates: "support",
  uses_different_definition: "incomparable",
  uses_incomparable_setup: "incomparable",
};

export function canonicalizeStance(value: StanceAlias): CanonicalStance {
  if (value === "support" || value === "counter" || value === "qualify" || value === "incomparable" || value === "unclear") {
    return value;
  }

  const relationshipStance = RELATIONSHIP_STANCES[value as ClaimRelationshipType];
  if (relationshipStance) return relationshipStance;

  switch (canonicalizeCounterpoint(value as CounterpointClassificationAlias)) {
    case "direct_contradiction":
    case "failed_or_weaker_replication":
    case "negative_result":
      return "counter";
    case "methodological_critique":
    case "boundary_condition":
    case "alternative_explanation":
    case "theoretical_limit":
      return "qualify";
    case "incomparable":
      return "incomparable";
    case "not_counterpoint":
    case "uncertain":
      return "unclear";
  }
}
