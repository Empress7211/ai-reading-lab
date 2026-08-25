import { describe, expect, it, vi } from 'vitest';
import {
  TAURI_COMMANDS,
  createAllowlistedInvoke,
  isAllowedTauriCommand,
} from '../tauriCommands';

describe('Tauri command allowlist', () => {
  it('contains only local product operations and the configured OpenAI-compatible ports', () => {
    expect(Object.values(TAURI_COMMANDS)).toEqual([
      'workspace_initialize',
      'workspace_snapshot',
      'import_local_pdf',
      'load_pdf_bytes',
      'update_paper_metadata',
      'save_anchor',
      'save_draft_bundle',
      'review_draft',
      'save_judgment',
      'save_settings',
      'open_ai_credential_status',
      'save_open_ai_api_key',
      'delete_open_ai_api_key',
      'list_open_ai_models',
      'generate_drafts',
      'generate_paper_map',
    ]);
    expect(isAllowedTauriCommand('execute_sync')).toBe(false);
    expect(isAllowedTauriCommand('zotero_write')).toBe(false);
    expect(isAllowedTauriCommand('git_push')).toBe(false);
  });

  it('does not call the native bridge for a non-allowlisted command', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const safeInvoke = createAllowlistedInvoke(invoke);

    await expect(safeInvoke('execute_sync')).rejects.toThrow(
      'Blocked non-allowlisted Tauri command: execute_sync',
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it('forwards allowlisted commands unchanged', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true });
    const safeInvoke = createAllowlistedInvoke(invoke);

    await expect(
      safeInvoke(TAURI_COMMANDS.generateDrafts, { input: { paperId: 'paper-1', anchorIds: ['anchor-1'] } }),
    ).resolves.toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('generate_drafts', { input: { paperId: 'paper-1', anchorIds: ['anchor-1'] } });
  });

  it('allows only the structured paper-map payload through the native bridge', async () => {
    const invoke = vi.fn().mockResolvedValue({ id: 'paper-map-paper-1' });
    const safeInvoke = createAllowlistedInvoke(invoke);
    const input = {
      paperId: 'paper-1',
      paperVersionId: 'version-1',
      confirmedFullTextUpload: true,
      documentIndex: {
        pdfSha256: `sha256:${'b'.repeat(64)}`,
        parserVersion: 'paperweave-blocks-v1-pdfjs-5.6.205',
        pageCount: 1,
        blocks: [{ id: 'p0001-b0001', page: 1, bbox: [0.1, 0.2, 0.8, 0.24], kind: 'paragraph', sectionPath: ['Results'], text: 'Local structured text.' }],
      },
    };

    await safeInvoke(TAURI_COMMANDS.generatePaperMap, { input });

    expect(invoke).toHaveBeenCalledWith('generate_paper_map', { input });
    expect(JSON.stringify(input)).not.toContain('apiKey');
    expect(JSON.stringify(input)).not.toContain('filePath');
  });
});
