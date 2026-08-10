import { describe, expect, it, vi } from 'vitest';
import {
  TAURI_COMMANDS,
  createAllowlistedInvoke,
  isAllowedTauriCommand,
} from '../tauriCommands';

describe('Tauri command allowlist', () => {
  it('contains only local workspace operations and sync preview', () => {
    expect(Object.values(TAURI_COMMANDS)).toEqual([
      'workspace_initialize',
      'workspace_snapshot',
      'import_local_pdf',
      'load_pdf_bytes',
      'save_anchor',
      'save_draft',
      'review_draft',
      'save_user_note',
      'save_settings',
      'preview_sync',
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
      safeInvoke(TAURI_COMMANDS.previewSync, { target: 'git' }),
    ).resolves.toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('preview_sync', { target: 'git' });
  });
});
