import type {
  DraftProposal,
  EvidenceAnchor,
  EvidenceLink,
  Job,
  JudgmentNote,
  NoteBlock,
  Paper,
  Proposition,
  ReadingPack,
  ReviewAction,
  SyncPlan,
  UUID,
  VerifiedClaim,
} from "./types";

/** Serializable snapshot for an IndexedDB/OPFS browser adapter. */
export interface BrowserRepositorySnapshotDTO {
  readonly schemaVersion: 2;
  readonly workspaceId: UUID;
  readonly revision: number;
  readonly updatedAt: string;
  readonly papers: readonly Paper[];
  readonly readingPacks: readonly ReadingPack[];
  readonly evidenceAnchors: readonly EvidenceAnchor[];
  readonly evidenceLinks: readonly EvidenceLink[];
  readonly draftProposals: readonly DraftProposal[];
  readonly reviewActions: readonly ReviewAction[];
  readonly verifiedClaims: readonly VerifiedClaim[];
  readonly noteBlocks: readonly NoteBlock[];
  readonly judgments: readonly JudgmentNote[];
  readonly propositions: readonly Proposition[];
  readonly jobs: readonly Job[];
  readonly syncPlans: readonly SyncPlan[];
}

export interface RepositoryCommitDTO {
  readonly expectedRevision: number;
  readonly snapshot: BrowserRepositorySnapshotDTO;
}

export type RepositoryCommitResultDTO =
  | { readonly status: "committed"; readonly revision: number }
  | { readonly status: "conflict"; readonly currentRevision: number };

/**
 * Local-first port shared by a browser IndexedDB adapter and the future SQLite
 * desktop adapter. Optimistic revisions prevent silent lost updates.
 */
export interface BrowserLocalRepository {
  load(workspaceId: UUID): Promise<BrowserRepositorySnapshotDTO | null>;
  commit(request: RepositoryCommitDTO): Promise<RepositoryCommitResultDTO>;
  clear(workspaceId: UUID): Promise<void>;
}
