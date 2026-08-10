import type {
  DraftProposal,
  EvidenceAnchor,
  NoteBlock,
  Paper,
  ReviewAction,
  SyncPlan,
  VerifiedClaim,
} from '../domain';

export type RepositoryRuntime = 'tauri' | 'browser-indexeddb' | 'browser-localstorage';

export interface WorkspaceSettings {
  locale: 'zh-CN' | 'en-US';
  appearance: 'system' | 'light' | 'dark';
  cloudMetadataEnabled: boolean;
  cloudSyncEnabled: boolean;
  telemetryEnabled: boolean;
  parserMode: 'local' | 'local-with-ocr' | 'remote-opt-in';
  activeModelProfileId: string | null;
}

export const DEFAULT_WORKSPACE_SETTINGS: Readonly<WorkspaceSettings> = {
  locale: 'zh-CN',
  appearance: 'system',
  cloudMetadataEnabled: false,
  cloudSyncEnabled: false,
  telemetryEnabled: false,
  parserMode: 'local',
  activeModelProfileId: null,
};

export interface WorkspaceSnapshot {
  papers: Paper[];
  anchors: EvidenceAnchor[];
  drafts: DraftProposal[];
  reviewActions: ReviewAction[];
  verifiedClaims: VerifiedClaim[];
  userNotes: NoteBlock[];
  settings: WorkspaceSettings;
}

export type WorkspaceSeed = Partial<WorkspaceSnapshot>;

export interface PdfMetadataHint {
  paperId?: string;
  title?: string;
  authors?: string[];
  year?: number;
  sourceUrl?: string;
}

export type ImportPdfInput =
  | {
      kind: 'browser-file';
      file: File;
      metadata?: PdfMetadataHint;
    }
  | {
      kind: 'local-path';
      path: string;
      metadata?: PdfMetadataHint;
    };

export interface ImportedPdf {
  paper: Paper;
  byteLength: number | null;
  mimeType: string;
  storage: 'native-vault' | 'indexeddb' | 'object-url';
  objectUrl?: string;
}

export interface ReviewDraftInput {
  action: ReviewAction;
  verifiedClaim?: VerifiedClaim;
}

export interface SyncPreviewRequest {
  paperIds: string[];
  target: 'zotero' | 'git' | 'github';
}

export interface WorkspaceRepository {
  readonly runtime: RepositoryRuntime;

  initialize(seed?: WorkspaceSeed): Promise<WorkspaceSnapshot>;
  snapshot(): Promise<WorkspaceSnapshot>;
  importPdf(input: ImportPdfInput): Promise<ImportedPdf>;
  loadPdfBytes(paperId: string): Promise<ArrayBuffer | null>;
  saveAnchor(anchor: EvidenceAnchor): Promise<EvidenceAnchor>;
  saveDraft(draft: DraftProposal): Promise<DraftProposal>;
  reviewDraft(input: ReviewDraftInput): Promise<ReviewAction>;
  saveUserNote(note: NoteBlock): Promise<NoteBlock>;
  saveSettings(settings: WorkspaceSettings): Promise<WorkspaceSettings>;
  previewSync(request: SyncPreviewRequest): Promise<SyncPlan>;
}

