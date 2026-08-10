import type { WorkspaceNote } from './workspaceStore';

export type SyncTarget = 'zotero' | 'git';
export type PreviewCapability = 'demo';
export type ExecutionCapability = 'native-unavailable';

export interface SyncPaper {
  id: string;
  title: string;
  citekey: string;
  zoteroItemKey?: string;
}

export interface SyncPreviewInput {
  paper: SyncPaper;
  notes: readonly WorkspaceNote[];
  selectedTopicId?: string | null;
  topicSlug?: string;
  generatedAt?: string;
}

export interface SyncPreviewChange {
  id: string;
  target: SyncTarget;
  action: 'match' | 'create' | 'update' | 'render' | 'commit';
  destination: string;
  summary: string;
  requiresApproval: true;
}

export interface SyncTargetPreview {
  target: SyncTarget;
  capability: PreviewCapability;
  executionCapability: ExecutionCapability;
  changes: SyncPreviewChange[];
}

export interface SyncPreviewPlan {
  id: string;
  mode: 'preview-only';
  generatedAt: string;
  paperId: string;
  verifiedNoteCount: number;
  targets: Record<SyncTarget, SyncTargetPreview>;
  warnings: string[];
  guarantees: string[];
}

export interface SyncExecutionResult {
  status: 'unsupported';
  mode: 'simulated';
  capability: ExecutionCapability;
  target: SyncTarget | 'all';
  planId: string;
  message: string;
}

function safePathSegment(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return normalized || fallback;
}

function stablePlanId(paperId: string, generatedAt: string): string {
  let hash = 2166136261;
  for (const char of `${paperId}:${generatedAt}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `preview-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function createSyncPreview(input: SyncPreviewInput): SyncPreviewPlan {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const verifiedNotes = input.notes.filter((note) => note.reviewStatus === 'verified');
  const citekey = safePathSegment(input.paper.citekey, safePathSegment(input.paper.id, 'paper'));
  const topicSlug = input.topicSlug ? safePathSegment(input.topicSlug, 'topic') : undefined;
  const zoteroDestination = input.paper.zoteroItemKey
    ? `zotero:item/${input.paper.zoteroItemKey}`
    : `zotero:match-or-create/${input.paper.id}`;

  const zoteroChanges: SyncPreviewChange[] = [
    {
      id: 'zotero-match-item',
      target: 'zotero',
      action: input.paper.zoteroItemKey ? 'match' : 'create',
      destination: zoteroDestination,
      summary: input.paper.zoteroItemKey
        ? 'Match the existing Zotero item without creating a duplicate.'
        : 'Match by stable identifiers, or propose creating one top-level item.',
      requiresApproval: true,
    },
    {
      id: 'zotero-paperweave-note',
      target: 'zotero',
      action: 'update',
      destination: `${zoteroDestination}/child-note/paperweave`,
      summary: `Render a marked PaperWeave child note from ${verifiedNotes.length} verified note(s).`,
      requiresApproval: true,
    },
  ];

  const gitChanges: SyncPreviewChange[] = [
    {
      id: 'git-render-paper-note',
      target: 'git',
      action: 'render',
      destination: `papers/${citekey}/index.md`,
      summary: 'Render stable Markdown while preserving content outside PaperWeave markers.',
      requiresApproval: true,
    },
    {
      id: 'git-render-claims',
      target: 'git',
      action: 'render',
      destination: `papers/${citekey}/claims.json`,
      summary: `Render structured data from ${verifiedNotes.length} verified note(s); drafts stay excluded.`,
      requiresApproval: true,
    },
  ];

  if (topicSlug && input.selectedTopicId) {
    gitChanges.push({
      id: 'git-render-topic',
      target: 'git',
      action: 'render',
      destination: `topics/${topicSlug}/index.md`,
      summary: `Render the selected topic view for ${input.selectedTopicId}.`,
      requiresApproval: true,
    });
  }

  gitChanges.push({
    id: 'git-local-commit',
    target: 'git',
    action: 'commit',
    destination: `paperweave/${topicSlug ?? citekey}`,
    summary: `Propose a local commit: notes(${citekey}): update verified reading record.`,
    requiresApproval: true,
  });

  const warnings = [
    'Preview only: no Zotero, file-system, Git, or remote operation has run.',
  ];
  if (verifiedNotes.length === 0) {
    warnings.push('No verified notes are eligible for the formal export.');
  }

  return {
    id: stablePlanId(input.paper.id, generatedAt),
    mode: 'preview-only',
    generatedAt,
    paperId: input.paper.id,
    verifiedNoteCount: verifiedNotes.length,
    targets: {
      zotero: {
        target: 'zotero',
        capability: 'demo',
        executionCapability: 'native-unavailable',
        changes: zoteroChanges,
      },
      git: {
        target: 'git',
        capability: 'demo',
        executionCapability: 'native-unavailable',
        changes: gitChanges,
      },
    },
    warnings,
    guarantees: [
      'PDF assets are excluded from Zotero note and Git plans.',
      'Draft and stale notes are excluded from formal export.',
      'GitHub push is never implied by a local commit preview.',
      'User-authored Zotero notes and Markdown outside managed markers are not overwrite targets.',
    ],
  };
}

/**
 * Explicitly non-operational until a validated native executor is injected.
 * Keeping this function unavailable is safer than returning a fake success.
 */
export async function executeSyncPreview(
  plan: SyncPreviewPlan,
  target: SyncTarget | 'all' = 'all',
): Promise<SyncExecutionResult> {
  return Promise.resolve({
    status: 'unsupported',
    mode: 'simulated',
    capability: 'native-unavailable',
    target,
    planId: plan.id,
    message: 'This build can preview synchronization only; no native executor is available.',
  });
}
