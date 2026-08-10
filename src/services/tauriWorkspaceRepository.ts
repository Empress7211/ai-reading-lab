import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { EvidenceAnchor, JudgmentNote, Paper, ReviewAction } from '../domain';
import {
  TAURI_COMMANDS,
  createAllowlistedInvoke,
  type Invoke,
} from './tauriCommands';
import type {
  DraftBundle,
  GenerateDraftsInput,
  GenerateDraftsResult,
  ImportPdfInput,
  ImportedPdf,
  OpenAiCredentialStatus,
  ReviewDraftInput,
  WorkspaceRepository,
  WorkspaceSeed,
  WorkspaceSettings,
  WorkspaceSnapshot,
} from './types';

function normalizePdfBytes(
  payload: ArrayBuffer | Uint8Array | number[] | null,
): ArrayBuffer | null {
  if (payload === null) {
    return null;
  }
  if (payload instanceof ArrayBuffer) {
    return payload.slice(0);
  }
  if (payload instanceof Uint8Array) {
    return payload.slice().buffer;
  }
  return Uint8Array.from(payload).buffer;
}

function mimeTypeForPath(path: string): string {
  return path.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
}

export class TauriWorkspaceRepository implements WorkspaceRepository {
  readonly runtime = 'tauri' as const;
  readonly #invoke: Invoke;

  constructor(invoke: Invoke = tauriInvoke as Invoke) {
    this.#invoke = createAllowlistedInvoke(invoke);
  }

  initialize(seed: WorkspaceSeed = {}): Promise<WorkspaceSnapshot> {
    return this.#invoke<WorkspaceSnapshot>(TAURI_COMMANDS.initializeWorkspace, { seed });
  }

  snapshot(): Promise<WorkspaceSnapshot> {
    return this.#invoke<WorkspaceSnapshot>(TAURI_COMMANDS.getWorkspaceSnapshot);
  }

  async importPdf(input: ImportPdfInput): Promise<ImportedPdf> {
    if (input.kind !== 'local-path') {
      throw new Error('Tauri PDF imports require a path returned by the native file dialog.');
    }
    const paper = await this.#invoke<Paper>(TAURI_COMMANDS.importLocalPdf, {
      path: input.path,
      metadata: input.metadata ?? {},
    });
    return {
      paper,
      byteLength: null,
      mimeType: mimeTypeForPath(input.path),
      storage: 'native-vault',
    };
  }

  async loadPdfBytes(paperId: string): Promise<ArrayBuffer | null> {
    const payload = await this.#invoke<ArrayBuffer | Uint8Array | number[] | null>(
      TAURI_COMMANDS.loadPdfBytes,
      { paperId },
    );
    return normalizePdfBytes(payload);
  }

  saveAnchor(anchor: EvidenceAnchor): Promise<EvidenceAnchor> {
    return this.#invoke<EvidenceAnchor>(TAURI_COMMANDS.saveAnchor, { anchor });
  }

  saveDraftBundle(bundle: DraftBundle): Promise<DraftBundle> {
    return this.#invoke<DraftBundle>(TAURI_COMMANDS.saveDraftBundle, { bundle });
  }

  reviewDraft(input: ReviewDraftInput): Promise<ReviewAction> {
    return this.#invoke<ReviewAction>(TAURI_COMMANDS.reviewDraft, { input });
  }

  saveJudgment(judgment: JudgmentNote): Promise<JudgmentNote> {
    return this.#invoke<JudgmentNote>(TAURI_COMMANDS.saveJudgment, { judgment });
  }

  saveSettings(settings: WorkspaceSettings): Promise<WorkspaceSettings> {
    return this.#invoke<WorkspaceSettings>(TAURI_COMMANDS.saveSettings, { settings });
  }

  openAiCredentialStatus(): Promise<OpenAiCredentialStatus> {
    return this.#invoke<OpenAiCredentialStatus>(TAURI_COMMANDS.openAiCredentialStatus);
  }

  saveOpenAiApiKey(apiKey: string): Promise<OpenAiCredentialStatus> {
    return this.#invoke<OpenAiCredentialStatus>(TAURI_COMMANDS.saveOpenAiApiKey, { apiKey });
  }

  deleteOpenAiApiKey(): Promise<OpenAiCredentialStatus> {
    return this.#invoke<OpenAiCredentialStatus>(TAURI_COMMANDS.deleteOpenAiApiKey);
  }

  generateDrafts(input: GenerateDraftsInput): Promise<GenerateDraftsResult> {
    return this.#invoke<GenerateDraftsResult>(TAURI_COMMANDS.generateDrafts, { input });
  }
}
