import type {
  AiDraftSnapshot,
  Claim,
  ClaimEditableField,
  ClaimPatch,
  RejectionReason,
  DraftProposal,
  ReviewAction,
  ReviewActionKind,
  ReviewAuditEvent,
  ReviewContext,
  ReviewStatus,
  ReviewTransitionResult,
  VerifiedClaim,
} from "./types";
import { assertValidClaim } from "./validation";

export class InvalidReviewTransitionError extends Error {
  readonly fromStatus: ReviewStatus;
  readonly action: ReviewActionKind;

  constructor(fromStatus: ReviewStatus, action: ReviewActionKind) {
    super(`Cannot ${action} a Claim in ${fromStatus} status.`);
    this.name = "InvalidReviewTransitionError";
    this.fromStatus = fromStatus;
    this.action = action;
  }
}

export function isVerified(statusOrClaim: ReviewStatus | Pick<Claim, "reviewStatus">): boolean {
  const status = typeof statusOrClaim === "string" ? statusOrClaim : statusOrClaim.reviewStatus;
  return status === "accepted" || status === "edited";
}

function snapshotAiDraft(claim: Claim): AiDraftSnapshot | null {
  if (claim.createdBy !== "ai") {
    return null;
  }

  return {
    claimText: claim.claimText,
    claimType: claim.claimType,
    epistemicSource: claim.epistemicSource,
    evidenceLinkIds: [...claim.evidenceLinkIds],
    assumptions: [...claim.assumptions],
    scopeConditions: [...claim.scopeConditions],
    limitations: [...claim.limitations],
    confidence: claim.confidence,
    confidenceBasis: [...claim.confidenceBasis],
    needsHumanAttention: claim.needsHumanAttention,
    modelRunId: claim.modelRunId,
  };
}

function audit(
  before: Claim,
  after: Claim,
  action: ReviewActionKind,
  context: ReviewContext,
  changedFields: readonly ClaimEditableField[],
  reason: string | null,
  rejectionReason: RejectionReason | null,
): ReviewAuditEvent {
  return {
    id: context.auditId,
    eventType: "claim_review_transition",
    claimId: before.id,
    actorId: context.actorId,
    occurredAt: context.occurredAt,
    action,
    fromStatus: before.reviewStatus,
    toStatus: after.reviewStatus,
    claimVersionBefore: before.version,
    claimVersionAfter: after.version,
    changedFields,
    reason,
    rejectionReason,
    originalAiDraftPreserved: after.originalAiDraft !== null,
  };
}

function requireStatus(claim: Claim, allowed: readonly ReviewStatus[], action: ReviewActionKind): void {
  if (!allowed.includes(claim.reviewStatus)) {
    throw new InvalidReviewTransitionError(claim.reviewStatus, action);
  }
}

function reviewedClaim(
  claim: Claim,
  status: ReviewStatus,
  context: ReviewContext,
  additions: Partial<Claim> = {},
): Claim {
  return {
    ...claim,
    ...additions,
    reviewStatus: status,
    version: claim.version + 1,
    updatedAt: context.occurredAt,
    reviewedBy: context.actorId,
    reviewedAt: context.occurredAt,
  };
}

export function acceptClaim(claim: Claim, context: ReviewContext): ReviewTransitionResult {
  requireStatus(claim, ["draft", "stale"], "accept");
  assertValidClaim(claim, context.anchors, context.evidenceLinks);

  const accepted = reviewedClaim(claim, "accepted", context);
  return {
    claim: accepted,
    auditEvent: audit(claim, accepted, "accept", context, [], null, null),
  };
}

const EDITABLE_FIELDS: readonly ClaimEditableField[] = [
  "claimText",
  "claimType",
  "epistemicSource",
  "assumptions",
  "scopeConditions",
  "limitations",
  "confidence",
  "confidenceBasis",
  "needsHumanAttention",
  "userComment",
];

function hasOwn<K extends PropertyKey>(value: object, key: K): value is Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function changedFields(patch: ClaimPatch): ClaimEditableField[] {
  return EDITABLE_FIELDS.filter((field) => hasOwn(patch, field));
}

function applyPatch(claim: Claim, patch: ClaimPatch): Claim {
  return {
    ...claim,
    ...(hasOwn(patch, "claimText") ? { claimText: patch.claimText as string } : {}),
    ...(hasOwn(patch, "claimType") ? { claimType: patch.claimType } : {}),
    ...(hasOwn(patch, "epistemicSource")
      ? { epistemicSource: patch.epistemicSource }
      : {}),
    ...(hasOwn(patch, "assumptions")
      ? { assumptions: [...(patch.assumptions as readonly string[])] }
      : {}),
    ...(hasOwn(patch, "scopeConditions")
      ? { scopeConditions: [...(patch.scopeConditions as readonly string[])] }
      : {}),
    ...(hasOwn(patch, "limitations")
      ? { limitations: [...(patch.limitations as readonly string[])] }
      : {}),
    ...(hasOwn(patch, "confidence") ? { confidence: patch.confidence as number } : {}),
    ...(hasOwn(patch, "confidenceBasis")
      ? { confidenceBasis: [...(patch.confidenceBasis as readonly string[])] }
      : {}),
    ...(hasOwn(patch, "needsHumanAttention")
      ? { needsHumanAttention: patch.needsHumanAttention as boolean }
      : {}),
    ...(hasOwn(patch, "userComment") ? { userComment: patch.userComment as string | null } : {}),
  };
}

export function editAndAcceptClaim(
  claim: Claim,
  patch: ClaimPatch,
  context: ReviewContext,
): ReviewTransitionResult {
  requireStatus(claim, ["draft", "stale"], "edit_and_accept");
  const fields = changedFields(patch);
  if (fields.length === 0) {
    throw new Error("editAndAcceptClaim requires at least one edited field.");
  }

  const editedContent = applyPatch(claim, patch);
  const edited = reviewedClaim(editedContent, "edited", context, {
    originalAiDraft: claim.originalAiDraft ?? snapshotAiDraft(claim),
  });
  assertValidClaim(edited, context.anchors, context.evidenceLinks);

  return {
    claim: edited,
    auditEvent: audit(claim, edited, "edit_and_accept", context, fields, null, null),
  };
}

export function rejectClaim(
  claim: Claim,
  rejectionReason: RejectionReason,
  context: ReviewContext,
  reason: string | null = null,
): ReviewTransitionResult {
  requireStatus(claim, ["draft"], "reject");
  const rejected = reviewedClaim(claim, "rejected", context);
  return {
    claim: rejected,
    auditEvent: audit(claim, rejected, "reject", context, [], reason, rejectionReason),
  };
}

export function markClaimStale(
  claim: Claim,
  reason: string,
  context: ReviewContext,
): ReviewTransitionResult {
  requireStatus(claim, ["accepted", "edited"], "mark_stale");
  if (reason.trim().length === 0) {
    throw new Error("A stale transition requires a reviewable reason.");
  }

  const stale = reviewedClaim(claim, "stale", context);
  return {
    claim: stale,
    auditEvent: audit(claim, stale, "mark_stale", context, [], reason, null),
  };
}

export type DraftReviewDecision =
  | { readonly action: "accept" }
  | { readonly action: "edit_and_accept"; readonly patch: ClaimPatch }
  | {
      readonly action: "reject";
      readonly rejectionReason: RejectionReason;
      readonly reason: string | null;
    };

export type DraftReviewStateResult =
  | {
      readonly state: "verified";
      readonly draft: DraftProposal;
      readonly reviewAction: ReviewAction;
      readonly verifiedClaim: VerifiedClaim;
    }
  | {
      readonly state: "rejected";
      readonly draft: DraftProposal;
      readonly reviewAction: ReviewAction;
      readonly verifiedClaim: null;
    };

function toVerifiedClaim(claim: Claim): VerifiedClaim {
  if (!isVerified(claim)) {
    throw new Error("Only an accepted or edited Claim is Verified.");
  }
  return claim as VerifiedClaim;
}

/**
 * Pure Draft -> ReviewAction -> Verified transition. It always returns the
 * original Draft separately and never changes its `reviewStatus` in place.
 */
export function reviewDraftProposal(
  draft: DraftProposal,
  decision: DraftReviewDecision,
  context: ReviewContext,
): DraftReviewStateResult {
  if (decision.action === "accept") {
    const result = acceptClaim(draft, context);
    return {
      state: "verified",
      draft,
      reviewAction: result.auditEvent,
      verifiedClaim: toVerifiedClaim(result.claim),
    };
  }
  if (decision.action === "edit_and_accept") {
    const result = editAndAcceptClaim(draft, decision.patch, context);
    return {
      state: "verified",
      draft,
      reviewAction: result.auditEvent,
      verifiedClaim: toVerifiedClaim(result.claim),
    };
  }
  const result = rejectClaim(draft, decision.rejectionReason, context, decision.reason);
  return {
    state: "rejected",
    draft,
    reviewAction: result.auditEvent,
    verifiedClaim: null,
  };
}
