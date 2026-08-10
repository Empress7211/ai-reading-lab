import type {
  DraftProposal,
  EvidenceAnchor,
  EvidenceLink,
  JudgmentNote,
  NoteBlock,
  Paper,
  ReviewAction,
  VerifiedClaim,
} from '../domain';

export type RepositoryRuntime = 'tauri' | 'browser-indexeddb';

export interface WorkspaceSettings {
  locale: 'zh-CN' | 'en-US';
  appearance: 'system' | 'light' | 'dark';
  cloudMetadataEnabled: boolean;
  cloudSyncEnabled: boolean;
  telemetryEnabled: boolean;
  parserMode: 'local' | 'local-with-ocr' | 'remote-opt-in';
  activeModelProfileId: string | null;
  openAiCredentialRef: string | null;
}

export const DEFAULT_WORKSPACE_SETTINGS: Readonly<WorkspaceSettings> = {
  locale: 'zh-CN',
  appearance: 'system',
  cloudMetadataEnabled: false,
  cloudSyncEnabled: false,
  telemetryEnabled: false,
  parserMode: 'local',
  activeModelProfileId: null,
  openAiCredentialRef: null,
};

export interface WorkspaceSnapshot {
  papers: Paper[];
  anchors: EvidenceAnchor[];
  evidenceLinks: EvidenceLink[];
  drafts: DraftProposal[];
  reviewActions: ReviewAction[];
  verifiedClaims: VerifiedClaim[];
  userNotes: NoteBlock[];
  judgments: JudgmentNote[];
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

export interface DraftBundle {
  draft: DraftProposal;
  evidenceLinks: EvidenceLink[];
}

export interface GenerateDraftsInput {
  paperId: string;
  anchorIds: string[];
}

export interface GenerateDraftsResult {
  modelRunId: string;
  bundles: DraftBundle[];
}

export interface OpenAiCredentialStatus {
  configured: boolean;
  credentialRef: string | null;
}

export interface WorkspaceRepository {
  readonly runtime: RepositoryRuntime;

  initialize(seed?: WorkspaceSeed): Promise<WorkspaceSnapshot>;
  snapshot(): Promise<WorkspaceSnapshot>;
  importPdf(input: ImportPdfInput): Promise<ImportedPdf>;
  loadPdfBytes(paperId: string): Promise<ArrayBuffer | null>;
  saveAnchor(anchor: EvidenceAnchor): Promise<EvidenceAnchor>;
  saveDraftBundle(bundle: DraftBundle): Promise<DraftBundle>;
  reviewDraft(input: ReviewDraftInput): Promise<ReviewAction>;
  saveJudgment(judgment: JudgmentNote): Promise<JudgmentNote>;
  saveSettings(settings: WorkspaceSettings): Promise<WorkspaceSettings>;
  openAiCredentialStatus(): Promise<OpenAiCredentialStatus>;
  saveOpenAiApiKey(apiKey: string): Promise<OpenAiCredentialStatus>;
  deleteOpenAiApiKey(): Promise<OpenAiCredentialStatus>;
  generateDrafts(input: GenerateDraftsInput): Promise<GenerateDraftsResult>;
}
