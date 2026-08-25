import {
  ANCHOR_TYPES,
  CLAIM_TYPES,
  EVIDENCE_RELATIONS,
  EPISTEMIC_SOURCES,
  type Claim,
  type ClaimValidationIssue,
  type ClaimValidationIssueCode,
  type ClaimValidationPolicy,
  type ClaimValidationResult,
  type EvidenceAnchor,
  type EvidenceLink,
  type UUID,
} from "./types";

export const DEFAULT_CLAIM_VALIDATION_POLICY: ClaimValidationPolicy = {
  requireEvidenceForFactualClaims: true,
  requireExistingAnchorsForAiClaims: true,
  rejectOrphanedAnchors: true,
  requireSamePaperVersion: true,
  requireAiInferenceAttention: true,
  requireReportedResultSupport: true,
};

const REPORTED_RESULT_SUPPORT = new Set([
  "reported_result",
  "figure",
  "table",
  "equation",
]);

export class ClaimValidationError extends Error {
  readonly issues: readonly ClaimValidationIssue[];

  constructor(issues: readonly ClaimValidationIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "ClaimValidationError";
    this.issues = issues;
  }
}

function issue(
  code: ClaimValidationIssueCode,
  path: string,
  message: string,
): ClaimValidationIssue {
  return { code, path, message, severity: "error" };
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function isHash(value: string): boolean {
  return /^(?:sha256:)?[a-f\d]{64}$/i.test(value);
}

/** Inferences and user judgments may be unanchored, but must stay visibly distinguished. */
export function isFactualClaim(claim: Pick<Claim, "epistemicSource">): boolean {
  return claim.epistemicSource !== "user_judgment" && claim.epistemicSource !== "ai_inference";
}

export function validateAnchor(anchor: EvidenceAnchor): ClaimValidationResult {
  const issues: ClaimValidationIssue[] = [];

  if (!Number.isInteger(anchor.pageIndex) || anchor.pageIndex < 0) {
    issues.push(
      issue("ANCHOR_PAGE_INVALID", "pageIndex", "Anchor pageIndex must be a non-negative integer."),
    );
  }

  const [x0, y0, x1, y1] = anchor.bboxNorm;
  const boxValues = [x0, y0, x1, y1];
  if (
    boxValues.some((value) => !Number.isFinite(value) || value < 0 || value > 1) ||
    x0 >= x1 ||
    y0 >= y1
  ) {
    issues.push(
      issue(
        "ANCHOR_BBOX_INVALID",
        "bboxNorm",
        "Anchor coordinates must form a non-empty normalized rectangle.",
      ),
    );
  }

  if (
    anchor.rectsNorm !== undefined &&
    (
      !Array.isArray(anchor.rectsNorm) ||
      anchor.rectsNorm.length === 0 ||
      anchor.rectsNorm.some((rect) => {
        if (!Array.isArray(rect) || rect.length !== 4) return true;
        const [rectX0, rectY0, rectX1, rectY1] = rect;
        return (
          rect.some((value) => !Number.isFinite(value) || value < 0 || value > 1) ||
          rectX0 >= rectX1 ||
          rectY0 >= rectY1
        );
      })
    )
  ) {
    issues.push(
      issue(
        "ANCHOR_RECTS_INVALID",
        "rectsNorm",
        "Anchor selection fragments must contain non-empty normalized rectangles.",
      ),
    );
  }

  if (anchor.anchorType === "text" && anchor.selectedText.trim().length === 0) {
    issues.push(
      issue("ANCHOR_TEXT_REQUIRED", "selectedText", "A text anchor must retain selected text."),
    );
  }

  if (!isHash(anchor.textHash) || !isHash(anchor.pdfSha256)) {
    issues.push(
      issue(
        "ANCHOR_HASH_INVALID",
        "textHash",
        "Anchor text and PDF hashes must be SHA-256 values.",
      ),
    );
  }

  if (!ANCHOR_TYPES.includes(anchor.anchorType)) {
    issues.push(issue("CLAIM_TYPE_INVALID", "anchorType", "Unknown anchor type."));
  }

  return { valid: issues.length === 0, issues };
}

export function validateClaim(
  claim: Claim,
  anchors: ReadonlyMap<UUID, EvidenceAnchor>,
  evidenceLinks: ReadonlyMap<UUID, EvidenceLink>,
  policy: ClaimValidationPolicy = DEFAULT_CLAIM_VALIDATION_POLICY,
): ClaimValidationResult {
  const issues: ClaimValidationIssue[] = [];

  if (claim.claimText.trim().length < 5 || claim.claimText.length > 1_500) {
    issues.push(
      issue("CLAIM_EMPTY", "claimText", "A Claim must contain one non-trivial atomic statement."),
    );
  }

  if (!CLAIM_TYPES.includes(claim.claimType)) {
    issues.push(issue("CLAIM_TYPE_INVALID", "claimType", "Unknown Claim type."));
  }

  if (!EPISTEMIC_SOURCES.includes(claim.epistemicSource)) {
    issues.push(
      issue("EPISTEMIC_SOURCE_INVALID", "epistemicSource", "Unknown epistemic source."),
    );
  }

  const confidenceIsNumber = typeof claim.confidence === "number"
    && Number.isFinite(claim.confidence)
    && claim.confidence >= 0
    && claim.confidence <= 1;
  if (
    (claim.createdBy === "ai" && !confidenceIsNumber)
    || (claim.createdBy === "user" && claim.confidence !== null && !confidenceIsNumber)
  ) {
    issues.push(
      issue(
        "CLAIM_CONFIDENCE_INVALID",
        "confidence",
        "AI Claim confidence must be between zero and one; a user Claim may omit it.",
      ),
    );
  }

  if (claim.createdBy === "ai" && claim.epistemicSource === "user_judgment") {
    issues.push(
      issue(
        "AI_CANNOT_ASSERT_USER_JUDGMENT",
        "epistemicSource",
        "AI may suggest wording, but cannot create a user judgment.",
      ),
    );
  }

  const factualEvidenceRequired = policy.requireEvidenceForFactualClaims && isFactualClaim(claim);
  const aiEvidenceRequired = policy.requireExistingAnchorsForAiClaims && claim.createdBy === "ai";
  if ((factualEvidenceRequired || aiEvidenceRequired) && claim.evidenceLinkIds.length === 0) {
    issues.push(
      issue(
        "EVIDENCE_REQUIRED",
        "evidence",
        "A factual AI Claim must cite at least one existing Evidence Anchor.",
      ),
    );
  }

  if (
    policy.requireAiInferenceAttention &&
    claim.createdBy === "ai" &&
    claim.epistemicSource === "ai_inference" &&
    !claim.needsHumanAttention
  ) {
    issues.push(
      issue(
        "AI_INFERENCE_REQUIRES_ATTENTION",
        "needsHumanAttention",
        "AI inference must remain visibly marked for human attention.",
      ),
    );
  }

  const seenLinkIds = new Set<UUID>();
  const resolvedLinks: EvidenceLink[] = [];
  claim.evidenceLinkIds.forEach((linkId, index) => {
    const path = `evidenceLinkIds.${index}`;
    if (seenLinkIds.has(linkId)) {
      issues.push(
        issue(
          "CLAIM_EVIDENCE_DUPLICATE",
          path,
          "A Claim cannot cite the same EvidenceLink more than once.",
        ),
      );
      return;
    }
    seenLinkIds.add(linkId);

    const evidence = evidenceLinks.get(linkId);
    if (!evidence) {
      issues.push(issue("EVIDENCE_LINK_NOT_FOUND", path, `EvidenceLink ${linkId} does not exist.`));
      return;
    }
    resolvedLinks.push(evidence);
    if (evidence.claimId !== claim.id) {
      issues.push(issue("EVIDENCE_LINK_CLAIM_MISMATCH", path, "EvidenceLink belongs to another Claim."));
    }
    if (!EVIDENCE_RELATIONS.includes(evidence.relation)) {
      issues.push(issue("EVIDENCE_LINK_RELATION_INVALID", path, "EvidenceLink relation is invalid."));
    }
    if (!Number.isInteger(evidence.ordinal) || evidence.ordinal < 0) {
      issues.push(issue("EVIDENCE_LINK_ORDINAL_INVALID", path, "EvidenceLink ordinal must be a non-negative integer."));
    }

    const anchor = anchors.get(evidence.anchorId);
    if (!anchor) {
      issues.push(
        issue(
          "ANCHOR_NOT_FOUND",
          `${path}.anchorId`,
          `Evidence Anchor ${evidence.anchorId} does not exist.`,
        ),
      );
      return;
    }

    const anchorValidation = validateAnchor(anchor);
    issues.push(
      ...anchorValidation.issues.map((anchorIssue) => ({
        ...anchorIssue,
        path: `${path}.anchor.${anchorIssue.path}`,
      })),
    );

    if (policy.rejectOrphanedAnchors && anchor.relocationStatus === "orphaned") {
      issues.push(
        issue(
          "ANCHOR_ORPHANED",
          `${path}.anchorId`,
          "An orphaned Anchor must be repaired before a Claim can be verified.",
        ),
      );
    }

    if (policy.requireSamePaperVersion && anchor.paperVersionId !== claim.paperVersionId) {
      issues.push(
        issue(
          "ANCHOR_PAPER_VERSION_MISMATCH",
          `${path}.anchorId`,
          "Evidence must belong to the Claim's PaperVersion.",
        ),
      );
    }

    if (evidence.quotedFragment !== null) {
      const fragment = normalizeText(evidence.quotedFragment);
      const selectedText = normalizeText(anchor.selectedText);
      if (fragment.length > 0 && !selectedText.includes(fragment)) {
        issues.push(
          issue(
            "QUOTE_ANCHOR_MISMATCH",
            `${path}.quotedFragment`,
            "Quoted evidence does not occur within the selected Anchor text.",
          ),
        );
      }
    }
  });

  if (
    claim.epistemicSource === "direct_quote" &&
    !resolvedLinks.some((evidence) => evidence.quotedFragment?.trim())
  ) {
    issues.push(
      issue(
        "DIRECT_QUOTE_FRAGMENT_REQUIRED",
        "evidence",
        "A direct quote Claim must retain a minimal quoted fragment.",
      ),
    );
  }

  if (
    policy.requireReportedResultSupport &&
    claim.epistemicSource === "reported_result" &&
    !resolvedLinks.some((evidence) => REPORTED_RESULT_SUPPORT.has(evidence.supportType))
  ) {
    issues.push(
      issue(
        "REPORTED_RESULT_SUPPORT_REQUIRED",
        "evidence",
        "A reported result must point to result text, a figure, table, or equation.",
      ),
    );
  }

  return { valid: issues.length === 0, issues };
}

export function assertValidClaim(
  claim: Claim,
  anchors: ReadonlyMap<UUID, EvidenceAnchor>,
  evidenceLinks: ReadonlyMap<UUID, EvidenceLink>,
  policy: ClaimValidationPolicy = DEFAULT_CLAIM_VALIDATION_POLICY,
): void {
  const result = validateClaim(claim, anchors, evidenceLinks, policy);
  if (!result.valid) {
    throw new ClaimValidationError(result.issues);
  }
}
