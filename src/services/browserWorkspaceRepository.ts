import type {
  DraftProposal,
  EvidenceAnchor,
  NoteBlock,
  Paper,
  ReviewAction,
  SyncPlan,
  VerifiedClaim,
} from '../domain';
import { assertValidClaim, validateAnchor } from '../domain';
import { createBrowserStore, type BrowserStore, type BrowserStoreOptions } from './browserStore';
import {
  DEFAULT_WORKSPACE_SETTINGS,
  type ImportPdfInput,
  type ImportedPdf,
  type ReviewDraftInput,
  type SyncPreviewRequest,
  type WorkspaceRepository,
  type WorkspaceSeed,
  type WorkspaceSettings,
  type WorkspaceSnapshot,
} from './types';

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function emptySnapshot(seed: WorkspaceSeed = {}): WorkspaceSnapshot {
  return {
    papers: clone(seed.papers ?? []),
    anchors: clone(seed.anchors ?? []),
    drafts: clone(seed.drafts ?? []),
    reviewActions: clone(seed.reviewActions ?? []),
    verifiedClaims: clone(seed.verifiedClaims ?? []),
    userNotes: clone(seed.userNotes ?? []),
    settings: {
      ...DEFAULT_WORKSPACE_SETTINGS,
      ...clone(seed.settings ?? {}),
    },
  };
}

function identityOf(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const identity =
    record.id ??
    record.paper_id ??
    record.anchor_id ??
    record.action_id ??
    record.note_id ??
    record.plan_id ??
    record.proposalId ??
    record.proposal_id ??
    record.claimId ??
    record.claim_id;
  return typeof identity === 'string' ? identity : undefined;
}

function upsert<T>(items: T[], value: T): T[] {
  const identity = identityOf(value);
  if (!identity) {
    return [...items, clone(value)];
  }
  const index = items.findIndex((item) => identityOf(item) === identity);
  if (index < 0) {
    return [...items, clone(value)];
  }
  return items.map((item, itemIndex) => (itemIndex === index ? clone(value) : item));
}

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'Untitled paper';
}

function hasPdfSignature(bytes: ArrayBuffer): boolean {
  const probe = new TextDecoder('ascii').decode(bytes.slice(0, Math.min(1024, bytes.byteLength)));
  return probe.includes('%PDF-');
}

async function sha256(bytes: ArrayBuffer): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return null;
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)]
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}

export interface BrowserWorkspaceRepositoryOptions extends BrowserStoreOptions {
  store?: BrowserStore;
}

export class BrowserWorkspaceRepository implements WorkspaceRepository {
  readonly #store: BrowserStore;
  readonly #objectUrls = new Map<string, string>();
  #state: Promise<WorkspaceSnapshot> | null = null;
  #mutation: Promise<unknown> = Promise.resolve();

  constructor(options: BrowserWorkspaceRepositoryOptions = {}) {
    this.#store = options.store ?? createBrowserStore(options);
  }

  get runtime(): WorkspaceRepository['runtime'] {
    return this.#store.runtime;
  }

  async initialize(seed: WorkspaceSeed = {}): Promise<WorkspaceSnapshot> {
    if (!this.#state) {
      this.#state = this.#store.loadSnapshot().then(async (persisted) => {
        if (persisted) {
          return emptySnapshot(persisted);
        }
        const initial = emptySnapshot(seed);
        await this.#store.saveSnapshot(initial);
        return initial;
      });
    }
    return clone(await this.#state);
  }

  async snapshot(): Promise<WorkspaceSnapshot> {
    return this.initialize();
  }

  async importPdf(input: ImportPdfInput): Promise<ImportedPdf> {
    if (input.kind !== 'browser-file') {
      throw new Error('The browser fallback can import a File, not an arbitrary local path.');
    }

    const { file, metadata = {} } = input;
    const bytes = await file.arrayBuffer();
    if (!hasPdfSignature(bytes)) {
      throw new Error('The selected file does not contain a valid PDF signature.');
    }
    const paperId = metadata.paperId ?? createId();
    const versionId = createId();
    const now = new Date().toISOString();
    const pdfSha256 = await sha256(bytes);
    const paper = {
      id: paperId,
      currentVersionId: versionId,
      title: metadata.title ?? titleFromFileName(file.name),
      authors: metadata.authors ?? [],
      year: metadata.year ?? null,
      abstract: null,
      identifiers: [],
      versions: [
        {
          id: versionId,
          label: 'unknown',
          pdfSha256,
          sourceUrl: metadata.sourceUrl ?? null,
          license: null,
          isVersionOf: null,
        },
      ],
      zoteroItemKey: null,
      createdAt: now,
      updatedAt: now,
    } satisfies Paper;

    await this.#store.savePdf({
      paperId,
      bytes,
      mimeType: file.type || 'application/pdf',
      fileName: file.name,
    });
    await this.#update((state) => ({
      ...state,
      papers: upsert(state.papers, paper),
    }));

    const objectUrl = this.#createObjectUrl(paperId, file);
    return {
      paper: clone(paper),
      byteLength: bytes.byteLength,
      mimeType: file.type || 'application/pdf',
      storage: this.runtime === 'browser-indexeddb' ? 'indexeddb' : 'object-url',
      ...(objectUrl ? { objectUrl } : {}),
    };
  }

  loadPdfBytes(paperId: string): Promise<ArrayBuffer | null> {
    return this.#store.loadPdf(paperId);
  }

  async saveAnchor(anchor: EvidenceAnchor): Promise<EvidenceAnchor> {
    const validation = validateAnchor(anchor);
    if (!validation.valid) {
      throw new Error(`Anchor 校验失败：${validation.issues.map((issue) => issue.code).join(', ')}`);
    }
    await this.#update((state) => {
      if (state.anchors.some((candidate) => candidate.id === anchor.id)) {
        throw new Error('EvidenceAnchor 已存在，不能原地改写。');
      }
      return {
        ...state,
        anchors: [...state.anchors, clone(anchor)],
      };
    });
    return clone(anchor);
  }

  async saveDraft(draft: DraftProposal): Promise<DraftProposal> {
    await this.#update((state) => {
      if (draft.reviewStatus !== 'draft' || draft.createdBy !== 'ai') {
        throw new Error('DraftProposal 必须保持 AI draft 身份。');
      }
      if (state.drafts.some((candidate) => candidate.id === draft.id)) {
        throw new Error('DraftProposal 已存在，原始 Draft 不能被改写。');
      }
      assertValidClaim(draft, new Map(state.anchors.map((anchor) => [anchor.id, anchor])));
      return {
        ...state,
        drafts: [...state.drafts, clone(draft)],
      };
    });
    return clone(draft);
  }

  async reviewDraft(input: ReviewDraftInput): Promise<ReviewAction> {
    await this.#update((state) => {
      const draft = state.drafts.find((candidate) => candidate.id === input.action.claimId);
      if (!draft) throw new Error('待审阅 DraftProposal 不存在。');
      if (state.reviewActions.some((action) => action.claimId === draft.id)) {
        throw new Error('该 DraftProposal 已有 ReviewAction，不能重复审阅。');
      }
      if (input.action.fromStatus !== 'draft') {
        throw new Error('ReviewAction 必须从 draft 状态开始。');
      }
      const expectedStatus = input.action.action === 'accept'
        ? 'accepted'
        : input.action.action === 'edit_and_accept'
          ? 'edited'
          : input.action.action === 'reject'
            ? 'rejected'
            : null;
      if (!expectedStatus || input.action.toStatus !== expectedStatus) {
        throw new Error('ReviewAction 的动作与目标状态不一致。');
      }
      if (expectedStatus === 'rejected') {
        if (input.verifiedClaim) throw new Error('Rejected 审阅不能产生 VerifiedClaim。');
      } else {
        const verified = input.verifiedClaim;
        if (!verified) throw new Error('Accepted 或 Edited 审阅必须产生 VerifiedClaim。');
        if (
          verified.id !== draft.id
          || verified.paperId !== draft.paperId
          || verified.paperVersionId !== draft.paperVersionId
          || verified.reviewStatus !== expectedStatus
          || JSON.stringify(verified.evidence) !== JSON.stringify(draft.evidence)
        ) {
          throw new Error('VerifiedClaim 必须保留 Draft 的身份、论文版本与证据引用。');
        }
      }
      return {
        ...state,
        reviewActions: [...state.reviewActions, clone(input.action)],
        verifiedClaims: input.verifiedClaim
          ? upsert(state.verifiedClaims, input.verifiedClaim)
          : state.verifiedClaims,
      };
    });
    return clone(input.action);
  }

  async saveUserNote(note: NoteBlock): Promise<NoteBlock> {
    await this.#update((state) => ({
      ...state,
      userNotes: upsert(state.userNotes, note),
    }));
    return clone(note);
  }

  async saveSettings(settings: WorkspaceSettings): Promise<WorkspaceSettings> {
    await this.#update((state) => ({ ...state, settings: clone(settings) }));
    return clone(settings);
  }

  async previewSync(request: SyncPreviewRequest): Promise<SyncPlan> {
    const state = await this.initialize();
    const selectedPaperIds = new Set(request.paperIds);
    const selectedPapers = state.papers.filter((paper) => selectedPaperIds.has(identityOf(paper) ?? ''));
    const now = new Date().toISOString();
    return {
      id: createId(),
      createdBy: 'deterministic_executor',
      status: 'preview',
      workspaceId: 'browser-local',
      repositoryPath: null,
      gitBranch: null,
      zoteroLibraryId: null,
      actions: selectedPapers.map((paper) => ({
        id: createId(),
        target: request.target === 'zotero' ? 'zotero' : 'git',
        operation: request.target === 'github' ? 'preview_push' : 'preview_write',
        resourceRef: paper.id,
        summary: `Preview ${paper.title}`,
        preconditions: ['explicit_user_approval'],
        destructive: false,
      })),
      warnings: [
        'Preview only. No Zotero, Git, or GitHub operation has been executed.',
      ],
      createdAt: now,
      approvedAt: null,
      approvedBy: null,
    } satisfies SyncPlan;
  }

  async #update(
    mutation: (state: WorkspaceSnapshot) => WorkspaceSnapshot,
  ): Promise<WorkspaceSnapshot> {
    const task = this.#mutation.then(async () => {
      const state = await this.initialize();
      const next = emptySnapshot(mutation(state));
      await this.#store.saveSnapshot(next);
      this.#state = Promise.resolve(next);
      return clone(next);
    });
    this.#mutation = task.catch(() => undefined);
    return task;
  }

  #createObjectUrl(paperId: string, file: File): string | undefined {
    if (typeof URL.createObjectURL !== 'function') {
      return undefined;
    }
    const previous = this.#objectUrls.get(paperId);
    if (previous) {
      URL.revokeObjectURL(previous);
    }
    const objectUrl = URL.createObjectURL(file);
    this.#objectUrls.set(paperId, objectUrl);
    return objectUrl;
  }
}

export function createBrowserWorkspaceRepository(
  options: BrowserWorkspaceRepositoryOptions = {},
): BrowserWorkspaceRepository {
  return new BrowserWorkspaceRepository(options);
}
