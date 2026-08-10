import { describe, expect, it } from "vitest";
import {
  acceptClaim,
  editAndAcceptClaim,
  InvalidReviewTransitionError,
  isVerified,
  markClaimStale,
  rejectClaim,
} from "../../src/domain/review";
import { draftClaim, reviewContext } from "./fixtures";

describe("Claim review state machine", () => {
  it("derives Verified only from accepted and edited states", () => {
    expect(isVerified("draft")).toBe(false);
    expect(isVerified("accepted")).toBe(true);
    expect(isVerified("edited")).toBe(true);
    expect(isVerified("rejected")).toBe(false);
    expect(isVerified("stale")).toBe(false);
  });

  it("accepts a valid Draft and emits an append-only audit payload", () => {
    const result = acceptClaim(draftClaim(), reviewContext());

    expect(result.claim.reviewStatus).toBe("accepted");
    expect(result.claim.version).toBe(2);
    expect(result.auditEvent).toMatchObject({
      action: "accept",
      fromStatus: "draft",
      toStatus: "accepted",
      claimVersionBefore: 1,
      claimVersionAfter: 2,
    });
  });

  it("edits and accepts while preserving the original AI draft", () => {
    const original = draftClaim();
    const result = editAndAcceptClaim(
      original,
      {
        claimText: "The method improves accuracy by 2.1 percentage points on Dataset A.",
        userComment: "Changed absolute points to percentage points after review.",
      },
      reviewContext(),
    );

    expect(result.claim.reviewStatus).toBe("edited");
    expect(result.claim.originalAiDraft?.claimText).toBe(original.claimText);
    expect(result.claim.originalAiDraft?.modelRunId).toBe(original.modelRunId);
    expect(result.auditEvent.changedFields).toEqual(["claimText", "userComment"]);
    expect(result.auditEvent.originalAiDraftPreserved).toBe(true);
  });

  it("marks reviewed knowledge stale and permits re-review without losing provenance", () => {
    const edited = editAndAcceptClaim(
      draftClaim(),
      { claimText: "The method reports a 2.1-point improvement on Dataset A." },
      reviewContext(),
    ).claim;
    const stale = markClaimStale(
      edited,
      "A newer PaperVersion changed the evidence location.",
      reviewContext({
        auditId: "60000000-0000-4000-8000-000000000002",
        occurredAt: "2026-08-04T02:00:00.000Z",
      }),
    ).claim;

    expect(stale.reviewStatus).toBe("stale");
    expect(isVerified(stale)).toBe(false);
    expect(stale.originalAiDraft).toEqual(edited.originalAiDraft);
  });

  it("rejects a Draft with a structured reason", () => {
    const result = rejectClaim(
      draftClaim(),
      "over_inference",
      reviewContext(),
      "The evidence does not support the scope of the conclusion.",
    );

    expect(result.claim.reviewStatus).toBe("rejected");
    expect(result.auditEvent.rejectionReason).toBe("over_inference");
    expect(isVerified(result.claim)).toBe(false);
  });

  it("blocks transitions that bypass the review protocol", () => {
    const accepted = acceptClaim(draftClaim(), reviewContext()).claim;

    expect(() => rejectClaim(accepted, "inaccurate", reviewContext())).toThrow(
      InvalidReviewTransitionError,
    );
  });
});
