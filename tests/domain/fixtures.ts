import type { Claim, EvidenceAnchor, EvidenceLink, ReviewContext } from "../../src/domain/types";

export const anchor: EvidenceAnchor = {
  id: "10000000-0000-4000-8000-000000000001",
  paperVersionId: "20000000-0000-4000-8000-000000000001",
  pageIndex: 6,
  bboxNorm: [0.1, 0.2, 0.9, 0.3],
  selectedText: "The method improves accuracy by 2.1 absolute points on Dataset A.",
  prefix: "Main result.",
  suffix: "See Table 2.",
  textHash: "a".repeat(64),
  sectionPath: ["4 Experiments", "4.2 Main results"],
  semanticElementId: "p7-block-18",
  pdfSha256: "b".repeat(64),
  parserVersion: "docling-spike-1",
  anchorType: "text",
  relocationStatus: "exact",
  createdBy: "user_selection",
};

export const anchors = new Map([[anchor.id, anchor]]);

export const evidenceLink: EvidenceLink = {
  id: "70000000-0000-4000-8000-000000000001",
  claimId: "30000000-0000-4000-8000-000000000001",
  anchorId: anchor.id,
  relation: "support",
  supportType: "reported_result",
  quotedFragment: "improves accuracy by 2.1 absolute points",
  note: null,
  ordinal: 0,
};

export const evidenceLinks = new Map([[evidenceLink.id, evidenceLink]]);

export function evidenceLinkForClaim(claimId: string): EvidenceLink {
  return {
    ...evidenceLink,
    id: claimId === evidenceLink.claimId ? evidenceLink.id : `link-${claimId}`,
    claimId,
  };
}

export function draftClaim(overrides: Partial<Claim> = {}): Claim {
  const claimId = overrides.id ?? evidenceLink.claimId;
  return {
    id: claimId,
    paperId: "40000000-0000-4000-8000-000000000001",
    paperVersionId: anchor.paperVersionId,
    claimText: "The method improves accuracy by 2.1 absolute points on Dataset A.",
    claimType: "empirical",
    epistemicSource: "reported_result",
    evidenceLinkIds: [evidenceLinkForClaim(claimId).id],
    assumptions: [],
    scopeConditions: ["Dataset A test split"],
    limitations: [],
    confidence: 0.86,
    confidenceBasis: ["Explicit result statement"],
    reviewStatus: "draft",
    createdBy: "ai",
    needsHumanAttention: false,
    modelRunId: "50000000-0000-4000-8000-000000000001",
    userComment: null,
    version: 1,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    reviewedBy: null,
    reviewedAt: null,
    originalAiDraft: null,
    ...overrides,
  };
}

export function reviewContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return {
    auditId: "60000000-0000-4000-8000-000000000001",
    actorId: "user-1",
    occurredAt: "2026-08-04T01:00:00.000Z",
    anchors,
    evidenceLinks,
    ...overrides,
  };
}
