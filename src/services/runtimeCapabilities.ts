export type RuntimeKind = 'browser' | 'tauri-webview';
export type RuntimeCapabilityState = 'demo' | 'native-unavailable';

export type RuntimeTaskId =
  | 'workspace.storage'
  | 'audit.log'
  | 'pdf.reader'
  | 'ai.claim-generation'
  | 'sync.preview'
  | 'zotero.write'
  | 'git.commit'
  | 'github.push'
  | 'local.provider-credentials'
  | 'docling.parse'
  | 'metadata.cloud';

export interface RuntimeTaskCapability {
  id: RuntimeTaskId;
  state: RuntimeCapabilityState;
  label: string;
  reason: string;
}

export interface RuntimeCapabilities {
  runtime: RuntimeKind;
  tasks: Record<RuntimeTaskId, RuntimeTaskCapability>;
}

type RuntimeProbe = Record<string, unknown>;

export function detectRuntimeKind(probe: RuntimeProbe = globalThis as unknown as RuntimeProbe): RuntimeKind {
  return '__TAURI_INTERNALS__' in probe || '__TAURI__' in probe ? 'tauri-webview' : 'browser';
}

export function getRuntimeCapabilities(runtime: RuntimeKind = detectRuntimeKind()): RuntimeCapabilities {
  const demo = (
    id: RuntimeTaskId,
    label: string,
    reason: string,
  ): RuntimeTaskCapability => ({ id, state: 'demo', label, reason });
  const unavailable = (
    id: RuntimeTaskId,
    label: string,
    reason: string,
  ): RuntimeTaskCapability => ({ id, state: 'native-unavailable', label, reason });

  return {
    runtime,
    tasks: {
      'workspace.storage': demo(
        'workspace.storage',
        'Workspace persistence',
        'Uses a replaceable browser storage adapter; native SQLite is not connected.',
      ),
      'audit.log': demo(
        'audit.log',
        'Local audit log',
        'Records local demo events through a replaceable storage adapter.',
      ),
      'pdf.reader': demo(
        'pdf.reader',
        'PDF reader',
        'Reader behavior is available for product validation, without a native parser worker.',
      ),
      'ai.claim-generation': demo(
        'ai.claim-generation',
        'AI claim generation',
        'Responses are demo proposals; no provider or model credential is invoked.',
      ),
      'sync.preview': demo(
        'sync.preview',
        'Sync preview',
        'Produces deterministic plans without executing external writes.',
      ),
      'zotero.write': unavailable(
        'zotero.write',
        'Zotero write',
        'No validated Zotero native executor is registered.',
      ),
      'git.commit': unavailable(
        'git.commit',
        'Local Git commit',
        'No validated local Git executor is registered.',
      ),
      'github.push': unavailable(
        'github.push',
        'GitHub push',
        'Remote writes are outside this preview-only build.',
      ),
      'local.provider-credentials': unavailable(
        'local.provider-credentials',
        'Local provider credentials',
        'Provider credentials are accepted only by the PaperWeave macOS app.',
      ),
      'docling.parse': unavailable(
        'docling.parse',
        'Docling parser',
        'No sandboxed native parsing worker is connected.',
      ),
      'metadata.cloud': unavailable(
        'metadata.cloud',
        'Cloud metadata',
        'This build makes no PaperWeave cloud metadata requests.',
      ),
    },
  };
}

export function getTaskCapability(
  taskId: RuntimeTaskId,
  runtime: RuntimeKind = detectRuntimeKind(),
): RuntimeTaskCapability {
  return getRuntimeCapabilities(runtime).tasks[taskId];
}
