import { describe, expect, it, vi } from 'vitest';
import {
  TAURI_COMMANDS,
  createAllowlistedInvoke,
  isAllowedTauriCommand,
} from '../tauriCommands';

describe('Tauri command allowlist', () => {
  it('contains only v0.1 local product operations and deferred OpenAI ports', () => {
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
      'generate_drafts',
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
});
