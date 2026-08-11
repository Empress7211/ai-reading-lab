export type UUID = string;

export const REVIEW_STATUSES = [
  "draft",
  "accepted",
  "edited",
  "rejected",
  "stale",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const CLAIM_TYPES = [
  "theoretical",
  "empirical",
  "methodological",
  "descriptive",
  "interpretive",
  "normative",
] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];

export const EPISTEMIC_SOURCES = [
  "direct_quote",
  "author_claim",
  "reported_result",
  "ai_inference",
  "user_judgment",
  "external_metadata",
] as const;

export type EpistemicSource = (typeof EPISTEMIC_SOURCES)[number];

export type ClaimCreator = "ai" | "user";

export const ANCHOR_TYPES = [
  "text",
  "figure",
  "table",
  "equation",
  "page_region",
  "reference",
] as const;

export type AnchorType = (typeof ANCHOR_TYPES)[number];

export type AnchorRelocationStatus =
  | "exact"
  | "relocated"
  | "low_confidence"
  | "orphaned";

export type NormalizedBoundingBox = readonly [number, number, number, number];

/**
 * The immutable, deterministic evidence layer. Model output may reference an
 * anchor id, but it must never create or alter page coordinates.
 */
export interface EvidenceAnchor {
  readonly id: UUID;
  readonly paperVersionId: UUID;
  readonly pageIndex: number;
  readonly bboxNorm: NormalizedBoundingBox;
  readonly selectedText: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly textHash: string;
  readonly sectionPath: readonly string[];
  readonly semanticElementId: string | null;
  readonly pdfSha256: string;
  readonly parserVersion: string;
  readonly anchorType: AnchorType;
  readonly relocationStatus: AnchorRelocationStatus;
  readonly createdBy: "user_selection" | "parser" | "migration";
}

export const EVIDENCE_SUPPORT_TYPES = [
  "direct_statement",
  "reported_result",
  "definition",
  "method_description",
  "limitation_statement",
  "figure",
  "table",
  "equation",
  "context",
] as const;

export type EvidenceSupportType = (typeof EVIDENCE_SUPPORT_TYPES)[number];

export const EVIDENCE_RELATIONS = ["support", "counter", "qualify", "context"] as const;

export type EvidenceRelation = (typeof EVIDENCE_RELATIONS)[number];

/** Immutable relationship between a Claim and a deterministic PDF Anchor. */
export interface EvidenceLink {
  readonly id: UUID;
  readonly claimId: UUID;
  readonly anchorId: UUID;
  readonly relation: EvidenceRelation;
  readonly supportType: EvidenceSupportType;
  readonly quotedFragment: string | null;
  readonly note: string | null;
  readonly ordinal: number;
}

export interface AiDraftSnapshot {
  readonly claimText: string;
  readonly claimType: ClaimType;
  readonly epistemicSource: EpistemicSource;
  readonly evidenceLinkIds: readonly UUID[];
  readonly assumptions: readonly string[];
  readonly scopeConditions: readonly string[];
  readonly limitations: readonly string[];
  readonly confidence: number;
  readonly confidenceBasis: readonly string[];
  readonly needsHumanAttention: boolean;
  readonly modelRunId: UUID | null;
}

/**
 * Runtime Claim entity. `accepted` and `edited` are the two persisted states
 * that derive to Verified; Verified itself is deliberately not a stored state.
 */
export interface Claim {
  readonly id: UUID;
  readonly paperId: UUID;
  readonly paperVersionId: UUID;
  readonly claimText: string;
  readonly claimType: ClaimType;
  readonly epistemicSource: EpistemicSource;
  readonly evidenceLinkIds: readonly UUID[];
  readonly assumptions: readonly string[];
  readonly scopeConditions: readonly string[];
  readonly limitations: readonly string[];
  readonly confidence: number;
  readonly confidenceBasis: readonly string[];
  readonly reviewStatus: ReviewStatus;
  readonly createdBy: ClaimCreator;
  readonly needsHumanAttention: boolean;
  readonly modelRunId: UUID | null;
  readonly userComment: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly originalAiDraft: AiDraftSnapshot | null;
}

export type ClaimEditableField =
  | "claimText"
  | "claimType"
  | "epistemicSource"
  | "assumptions"
  | "scopeConditions"
  | "limitations"
  | "confidence"
  | "confidenceBasis"
  | "needsHumanAttention"
  | "userComment";

export interface ClaimPatch {
  readonly claimText?: string;
  readonly claimType?: ClaimType;
  readonly epistemicSource?: EpistemicSource;
  readonly assumptions?: readonly string[];
  readonly scopeConditions?: readonly string[];
  readonly limitations?: readonly string[];
  readonly confidence?: number;
  readonly confidenceBasis?: readonly string[];
  readonly needsHumanAttention?: boolean;
  readonly userComment?: string | null;
}

export type ReviewActionKind = "accept" | "edit_and_accept" | "reject" | "mark_stale";

export type RejectionReason =
  | "inaccurate"
  | "no_evidence"
  | "over_inference"
  | "duplicate"
  | "no_value"
  | "role_wrong"
  | "other";

export interface ReviewAuditEvent {
  readonly id: UUID;
  readonly eventType: "claim_review_transition";
  readonly claimId: UUID;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly action: ReviewActionKind;
  readonly fromStatus: ReviewStatus;
  readonly toStatus: ReviewStatus;
  readonly claimVersionBefore: number;
  readonly claimVersionAfter: number;
  readonly changedFields: readonly ClaimEditableField[];
  readonly reason: string | null;
  readonly rejectionReason: RejectionReason | null;
  readonly originalAiDraftPreserved: boolean;
}

/** Immutable human-review record kept separately from the AI Draft. */
export type ReviewAction = ReviewAuditEvent;

export interface ReviewContext {
  readonly auditId: UUID;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly anchors: ReadonlyMap<UUID, EvidenceAnchor>;
  readonly evidenceLinks: ReadonlyMap<UUID, EvidenceLink>;
}

export interface ReviewTransitionResult {
  readonly claim: Claim;
  readonly auditEvent: ReviewAuditEvent;
}

export type ValidationSeverity = "error" | "warning";

export type ClaimValidationIssueCode =
  | "ANCHOR_BBOX_INVALID"
  | "ANCHOR_HASH_INVALID"
  | "ANCHOR_NOT_FOUND"
  | "ANCHOR_ORPHANED"
  | "ANCHOR_PAPER_VERSION_MISMATCH"
  | "ANCHOR_PAGE_INVALID"
  | "ANCHOR_TEXT_REQUIRED"
  | "CLAIM_CONFIDENCE_INVALID"
  | "CLAIM_EMPTY"
  | "CLAIM_EVIDENCE_DUPLICATE"
  | "EVIDENCE_LINK_NOT_FOUND"
  | "EVIDENCE_LINK_CLAIM_MISMATCH"
  | "EVIDENCE_LINK_RELATION_INVALID"
  | "EVIDENCE_LINK_ORDINAL_INVALID"
  | "CLAIM_TYPE_INVALID"
  | "DIRECT_QUOTE_FRAGMENT_REQUIRED"
  | "EPISTEMIC_SOURCE_INVALID"
  | "EVIDENCE_REQUIRED"
  | "AI_CANNOT_ASSERT_USER_JUDGMENT"
  | "AI_INFERENCE_REQUIRES_ATTENTION"
  | "QUOTE_ANCHOR_MISMATCH"
  | "REPORTED_RESULT_SUPPORT_REQUIRED";

export interface ClaimValidationIssue {
  readonly code: ClaimValidationIssueCode;
  readonly severity: ValidationSeverity;
  readonly path: string;
  readonly message: string;
}

export interface ClaimValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ClaimValidationIssue[];
}

export interface ClaimValidationPolicy {
  readonly requireEvidenceForFactualClaims: boolean;
  readonly requireExistingAnchorsForAiClaims: boolean;
  readonly rejectOrphanedAnchors: boolean;
  readonly requireSamePaperVersion: boolean;
  readonly requireAiInferenceAttention: boolean;
  readonly requireReportedResultSupport: boolean;
}

export interface PaperIdentifier {
  readonly type: string;
  readonly value: string;
}

export interface PaperMarkdownExport {
  readonly paperId: UUID;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: number | null;
  readonly identifiers: readonly PaperIdentifier[];
  readonly claims: readonly Claim[];
  readonly anchors: ReadonlyMap<UUID, EvidenceAnchor>;
  readonly evidenceLinks: ReadonlyMap<UUID, EvidenceLink>;
}

/** A reviewable proposal created manually or by the later AI adapter. */
export interface DraftProposal extends Omit<Claim, "reviewStatus" | "createdBy" | "reviewedBy" | "reviewedAt" | "originalAiDraft"> {
  readonly reviewStatus: "draft";
  readonly createdBy: ClaimCreator;
  readonly reviewedBy: null;
  readonly reviewedAt: null;
  readonly originalAiDraft: null;
}

/** Accepted and user-edited Claims are the only Verified Claim states. */
export interface VerifiedClaim extends Omit<Claim, "reviewStatus"> {
  readonly reviewStatus: "accepted" | "edited";
}

export interface PaperVersion {
  readonly id: UUID;
  readonly label: "submitted" | "accepted" | "published" | "unknown";
  readonly sourceUrl: string | null;
  readonly license: string | null;
  readonly pdfSha256: string | null;
  readonly isVersionOf: UUID | null;
}

/** Internal identity; Zotero/provider identifiers are external references only. */
export interface Paper {
  readonly id: UUID;
  readonly currentVersionId: UUID | null;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: number | null;
  readonly abstract: string | null;
  readonly identifiers: readonly PaperIdentifier[];
  readonly versions: readonly PaperVersion[];
  readonly zoteroItemKey: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const READING_ROLES = [
  "foundation",
  "frontier",
  "counterpoint",
  "bridge",
  "resource",
] as const;
export type ReadingRole = (typeof READING_ROLES)[number];
export type ReadingMode = "skim" | "deep_read" | "verify" | "reference";

export type RationaleEvidenceType =
  | "semantic_relevance"
  | "citation_graph"
  | "shared_ancestor"
  | "citation_velocity"
  | "citation_context"
  | "methodological_critique"
  | "replication_signal"
  | "negative_result"
  | "user_library"
  | "llm_classification"
  | "manual";

export interface ReadingRationale {
  readonly text: string;
  readonly evidenceType: RationaleEvidenceType;
  readonly confidence: number;
  readonly sourceRefs: readonly string[];
}

export type PackRelationType =
  | "prerequisite"
  | "extends"
  | "counters"
  | "bridges"
  | "replicates"
  | "compares";

export interface PackRelation {
  readonly targetItemId: UUID;
  readonly relationType: PackRelationType;
  readonly confidence: number;
}

export interface PackAccess {
  readonly zoteroState: "present_with_pdf" | "present_no_pdf" | "not_present" | "unknown";
  readonly pdfState: "local" | "resolvable_oa" | "manual_access_required" | "unavailable" | "unknown";
  readonly oaState: "open_license" | "accessible_license_unknown" | "closed" | "unknown";
  readonly preferredVersion: "submitted" | "accepted" | "published" | "unknown" | null;
}

/** Domain form of a `topic-pack.schema.json` item. */
export interface ReadingPackEntry {
  readonly id: UUID;
  readonly paperId: UUID;
  readonly title: string;
  readonly year: number | null;
  readonly authors: readonly string[];
  readonly identifiers: Readonly<Record<string, string>>;
  readonly role: ReadingRole;
  readonly secondaryRoles: readonly ReadingRole[];
  readonly roleConfidence: number;
  readonly rank: number;
  readonly readingMode: ReadingMode;
  readonly rationales: readonly ReadingRationale[];
  readonly relations: readonly PackRelation[];
  readonly access: PackAccess;
  readonly selectionSource: "algorithm" | "user_pinned" | "user_replaced" | "manual";
  readonly userFeedback: "relevant" | "irrelevant" | "outdated" | "duplicate" | "role_wrong" | "already_read" | null;
}

export type ReadingRoleCounts = Readonly<Record<ReadingRole, number>>;

export interface ReadingPackCoverage {
  readonly subtopics: readonly string[];
  readonly roleCounts: ReadingRoleCounts;
  readonly oaRatio: number;
  readonly knownGaps: readonly string[];
}

export interface ReadingPack {
  readonly id: UUID;
  readonly entries: readonly ReadingPackEntry[];
  readonly coverage: ReadingPackCoverage;
}

export interface NoteBlock {
  readonly id: UUID;
  readonly paperId: UUID;
  readonly paperVersionId: UUID;
  readonly noteType: "summary" | "method" | "limitation" | "question" | "action_item" | "reproduction" | "definition";
  readonly title: string | null;
  readonly content: string;
  readonly evidenceLinkIds: readonly UUID[];
  readonly reviewStatus: ReviewStatus;
  readonly createdBy: ClaimCreator;
  readonly originalAiContent: string | null;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
}

export const JUDGMENT_SECTION_KEYS = [
  "judgment",
  "reasoning",
  "supportingEvidence",
  "counterEvidence",
  "uncertainties",
  "nextValidation",
] as const;

export type JudgmentSectionKey = (typeof JUDGMENT_SECTION_KEYS)[number];

export interface JudgmentSection {
  readonly text: string;
  readonly verifiedClaimIds: readonly UUID[];
}

/** User-owned output. AI may create Draft Claims but cannot write this entity. */
export interface JudgmentNote {
  readonly id: UUID;
  readonly paperId: UUID;
  readonly paperVersionId: UUID;
  readonly sections: Readonly<Record<JudgmentSectionKey, JudgmentSection>>;
  readonly status: "draft" | "complete";
  readonly createdBy: "user";
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

export type ClaimRelationshipType =
  | "supports"
  | "counters"
  | "qualifies"
  | "incomparable"
  | "depends_on"
  | "replicates"
  | "extends"
  | "uses_different_definition"
  | "uses_incomparable_setup"
  | "supersedes";

export type CanonicalStance = "support" | "counter" | "qualify" | "incomparable" | "unclear";

export interface PropositionPaperStance {
  readonly paperId: UUID;
  readonly stance: CanonicalStance;
  readonly claimIds: readonly UUID[];
  readonly reason: string;
  readonly confidence: number;
}

export interface Proposition {
  readonly id: UUID;
  readonly topicId: UUID;
  readonly canonicalText: string;
  readonly status: "candidate" | "confirmed" | "archived";
  readonly needsUserConfirmation: boolean;
  readonly memberClaimIds: readonly UUID[];
  readonly scopeDimensions: {
    readonly definition: readonly string[];
    readonly dataOrPopulation: readonly string[];
    readonly methodOrIntervention: readonly string[];
    readonly metricOrOutcome: readonly string[];
    readonly studyDesign: readonly string[];
  };
  readonly paperStances: readonly PropositionPaperStance[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type JobKind =
  | "parse_pdf"
  | "generate_topic_pack"
  | "generate_draft"
  | "validate_anchors"
  | "zotero_sync"
  | "git_sync";

export interface Job {
  readonly id: UUID;
  readonly kind: JobKind;
  readonly status: "queued" | "running" | "succeeded" | "failed" | "blocked" | "cancelled";
  readonly entityId: UUID | null;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly nextAttemptAt: string | null;
  readonly errorCode: string | null;
  /** Identifiers/options only; never credentials, notes, Anchor quotes or PDF text. */
  readonly payload: Readonly<Record<string, string | number | boolean | null | readonly string[]>>;
}

export type SyncTarget = "zotero" | "git" | "local_file";

export interface SyncPlanAction {
  readonly id: UUID;
  readonly target: SyncTarget;
  readonly operation: string;
  readonly resourceRef: string;
  readonly summary: string;
  readonly preconditions: readonly string[];
  readonly destructive: boolean;
}

/** Produced by a deterministic executor, never directly by a model. */
export interface SyncPlan {
  readonly id: UUID;
  readonly createdBy: "deterministic_executor";
  readonly status: "preview" | "approved" | "executing" | "succeeded" | "failed" | "cancelled";
  readonly workspaceId: UUID;
  readonly repositoryPath: string | null;
  readonly gitBranch: string | null;
  readonly zoteroLibraryId: string | null;
  readonly actions: readonly SyncPlanAction[];
  readonly warnings: readonly string[];
  readonly createdAt: string;
  readonly approvedAt: string | null;
  readonly approvedBy: UUID | null;
}
