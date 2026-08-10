export const TAURI_COMMANDS = {
  initializeWorkspace: 'workspace_initialize',
  getWorkspaceSnapshot: 'workspace_snapshot',
  importLocalPdf: 'import_local_pdf',
  loadPdfBytes: 'load_pdf_bytes',
  saveAnchor: 'save_anchor',
  saveDraft: 'save_draft',
  reviewDraft: 'review_draft',
  saveUserNote: 'save_user_note',
  saveSettings: 'save_settings',
  previewSync: 'preview_sync',
} as const;

export type TauriCommand = (typeof TAURI_COMMANDS)[keyof typeof TAURI_COMMANDS];

const TAURI_COMMAND_ALLOWLIST = new Set<string>(Object.values(TAURI_COMMANDS));

export function isAllowedTauriCommand(command: string): command is TauriCommand {
  return TAURI_COMMAND_ALLOWLIST.has(command);
}

export function assertAllowedTauriCommand(command: string): asserts command is TauriCommand {
  if (!isAllowedTauriCommand(command)) {
    throw new Error(`Blocked non-allowlisted Tauri command: ${command}`);
  }
}

export type Invoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export function createAllowlistedInvoke(invoke: Invoke): Invoke {
  return async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    assertAllowedTauriCommand(command);
    return invoke<T>(command, args);
  };
}
