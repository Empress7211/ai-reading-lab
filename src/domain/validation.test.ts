import { describe, expect, it } from "vitest";

import type { Claim, DraftProposal, EvidenceAnchor } from "./types";
import { validateClaim } from "./validation";

const HASH = "a".repeat(64);

const anchor: EvidenceAnchor = {
  id: "anchor-1",
  paperVersionId: "version-1",
  pageIndex: 0,
  bboxNorm: [0.1, 0.1, 0.8, 0.2],
  selectedText: "Accuracy improves by 2.1 percentage points on the held-out split.",
  prefix: "",
  suffix: "",
  textHash: HASH,
  sectionPath: ["Results"],
  semanticElementId: "paragraph-1",
  pdfSha256: HASH,
  parserVersion: "test-parser-1",
  anchorType: "text",
  relocationStatus: "exact",
  createdBy: "parser",
};

function draft(overrides: Partial<Claim> = {}): DraftProposal {
  return {
    id: "proposal-1",
    paperId: "paper-1",
    paperVersionId: anchor.paperVersionId,
    claimText: "Accuracy improves on the held-out split.",
    claimType: "empirical",
    epistemicSource: "reported_result",
    evidence: [{
      anchorId: anchor.id,
      supportType: "reported_result",
      quotedFragment: null,
      notes: null,
    }],
    assumptions: [],
    scopeConditions: ["Held-out split"],
    limitations: [],
    confidence: 0.8,
    confidenceBasis: ["Explicitly reported result"],
    reviewStatus: "draft",
    createdBy: "ai",
    needsHumanAttention: false,
    modelRunId: "model-run-1",
    userComment: null,
    version: 1,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    reviewedBy: null,
    reviewedAt: null,
    originalAiDraft: null,
    ...overrides,
  } as DraftProposal;
}

describe("Claim and Anchor domain policy", () => {
  it.each(["direct_quote", "author_claim", "reported_result", "external_metadata"] as const)(
    "rejects an unanchored factual %s Claim",
    (epistemicSource) => {
      const claim = draft({ epistemicSource, evidence: [] });
      const result = validateClaim(claim, new Map());

      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(expect.objectContaining({ code: "EVIDENCE_REQUIRED" }));
    },
  );

  it("requires an AI inference to remain visibly marked for human attention", () => {
    const result = validateClaim(
      draft({ epistemicSource: "ai_inference", evidence: [], needsHumanAttention: false }),
      new Map(),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "AI_INFERENCE_REQUIRES_ATTENTION" }),
    );
  });

  it("allows a clearly marked AI inference without pretending it is sourced fact", () => {
    const result = validateClaim(
      draft({ epistemicSource: "ai_inference", evidence: [], needsHumanAttention: true }),
      new Map(),
    );

    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("rejects invented and cross-version Anchors", () => {
    const wrongVersion = { ...anchor, id: "anchor-2", paperVersionId: "version-2" };
    const result = validateClaim(
      draft({
        evidence: [
          { anchorId: "missing", supportType: "reported_result", quotedFragment: null, notes: null },
          { anchorId: wrongVersion.id, supportType: "table", quotedFragment: null, notes: null },
        ],
      }),
      new Map([[wrongVersion.id, wrongVersion]]),
    );

    expect(result.issues.map((candidate) => candidate.code)).toEqual(
      expect.arrayContaining(["ANCHOR_NOT_FOUND", "ANCHOR_PAPER_VERSION_MISMATCH"]),
    );
  });
});
