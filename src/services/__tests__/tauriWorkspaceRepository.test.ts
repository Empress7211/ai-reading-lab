import { describe, expect, it, vi } from 'vitest';
import { TauriWorkspaceRepository } from '../tauriWorkspaceRepository';

describe('TauriWorkspaceRepository', () => {
  it('fills model settings defaults when opening an older native workspace snapshot', async () => {
    const invoke = vi.fn().mockResolvedValue({
      papers: [], anchors: [], evidenceLinks: [], drafts: [], reviewActions: [],
      verifiedClaims: [], userNotes: [], judgments: [],
      settings: { cloudMetadataEnabled: false },
    });
    const repository = new TauriWorkspaceRepository(invoke);

    const snapshot = await repository.snapshot();

    expect(snapshot.settings.openAiBaseUrl).toBe('https://api.openai.com/v1');
    expect(snapshot.settings.openAiModel).toBe('');
    expect(snapshot.settings.openAiCredentialRef).toBeNull();
    expect(snapshot.paperMaps).toEqual([]);
  });

  it('loads PDF bytes by paper id without accepting a path', async () => {
    const invoke = vi.fn().mockResolvedValue([37, 80, 68, 70]);
    const repository = new TauriWorkspaceRepository(invoke);

    const bytes = await repository.loadPdfBytes('paper-1');

    expect(new Uint8Array(bytes ?? new ArrayBuffer(0))).toEqual(
      Uint8Array.from([37, 80, 68, 70]),
    );
    expect(invoke).toHaveBeenCalledWith('load_pdf_bytes', { paperId: 'paper-1' });
  });

  it('rejects browser File imports before invoking native code', async () => {
    const invoke = vi.fn();
    const repository = new TauriWorkspaceRepository(invoke);

    await expect(
      repository.importPdf({ kind: 'browser-file', file: {} as File }),
    ).rejects.toThrow('native file dialog');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('updates paper metadata through the native repository command', async () => {
    const updated = {
      id: 'paper-1',
      title: 'Updated paper',
      authors: ['Local Author'],
      year: 2025,
    };
    const invoke = vi.fn().mockResolvedValue(updated);
    const repository = new TauriWorkspaceRepository(invoke);
    const input = { paperId: 'paper-1', title: 'Updated paper', authors: ['Local Author'], year: 2025 };

    await expect(repository.updatePaperMetadata(input)).resolves.toEqual(updated);
    expect(invoke).toHaveBeenCalledWith('update_paper_metadata', { input });
  });

  it('loads models through the allowlisted native command without persisting a temporary key', async () => {
    const models = [{ id: 'model-a', ownedBy: 'provider' }];
    const invoke = vi.fn().mockResolvedValue(models);
    const repository = new TauriWorkspaceRepository(invoke);

    await expect(repository.listOpenAiModels({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'temporary-test-key',
    })).resolves.toEqual(models);
    expect(invoke).toHaveBeenCalledWith('list_open_ai_models', {
      input: {
        baseUrl: 'https://provider.example/v1',
        apiKey: 'temporary-test-key',
      },
    });
  });

  it('generates a paper map with the exact confirmed local document index', async () => {
    const artifact = { id: 'paper-map-paper-1', schemaVersion: 'paper_map.v1', nodes: [] };
    const invoke = vi.fn().mockResolvedValue(artifact);
    const repository = new TauriWorkspaceRepository(invoke);
    const input = {
      paperId: 'paper-1',
      paperVersionId: 'version-1',
      confirmedFullTextUpload: true,
      documentIndex: {
        pdfSha256: `sha256:${'b'.repeat(64)}`,
        parserVersion: 'paperweave-blocks-v1-pdfjs-5.6.205' as const,
        pageCount: 1,
        blocks: [{ id: 'p0001-b0001', page: 1, bbox: [0.1, 0.2, 0.8, 0.24] as const, kind: 'paragraph' as const, sectionPath: ['Results'], text: 'Local structured text.' }],
      },
    };

    await expect(repository.generatePaperMap(input)).resolves.toEqual(artifact);
    expect(invoke).toHaveBeenCalledWith('generate_paper_map', { input });
  });
});
