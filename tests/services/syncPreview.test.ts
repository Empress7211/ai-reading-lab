import { describe, expect, it } from 'vitest';

import { createSyncPreview, executeSyncPreview } from '../../src/services/syncPreview';
import type { WorkspaceNote } from '../../src/services/workspaceStore';

const notes: WorkspaceNote[] = [
  {
    id: 'verified-note',
    paperId: 'paper-1',
    content: 'Verified content',
    noteType: 'claim',
    createdBy: 'ai',
    reviewStatus: 'verified',
    anchorIds: ['anchor-1'],
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
  },
  {
    id: 'draft-note',
    paperId: 'paper-1',
    content: 'Unreviewed content',
    noteType: 'claim',
    createdBy: 'ai',
    reviewStatus: 'draft',
    anchorIds: ['anchor-2'],
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
  },
];

describe('sync preview', () => {
  it('creates a deterministic preview using verified notes only', () => {
    const input = {
      paper: { id: 'paper-1', title: 'A Paper', citekey: 'Smith 2026/Paper' },
      notes,
      selectedTopicId: 'topic-1',
      topicSlug: 'RAG Evaluation',
      generatedAt: '2026-08-04T03:00:00.000Z',
    };

    const first = createSyncPreview(input);
    const second = createSyncPreview(input);

    expect(first).toEqual(second);
    expect(first.mode).toBe('preview-only');
    expect(first.verifiedNoteCount).toBe(1);
    expect(first.targets.git.changes.map((change) => change.destination)).toContain(
      'papers/smith-2026-paper/claims.json',
    );
    expect(first.targets.zotero.executionCapability).toBe('native-unavailable');
    expect(first.guarantees).toContain('Draft and stale notes are excluded from formal export.');
  });

  it('returns unsupported/simulated instead of claiming an external write succeeded', async () => {
    const plan = createSyncPreview({
      paper: { id: 'paper-1', title: 'A Paper', citekey: 'smith2026' },
      notes,
      generatedAt: '2026-08-04T03:00:00.000Z',
    });

    await expect(executeSyncPreview(plan, 'zotero')).resolves.toEqual({
      status: 'unsupported',
      mode: 'simulated',
      capability: 'native-unavailable',
      target: 'zotero',
      planId: plan.id,
      message: 'This build can preview synchronization only; no native executor is available.',
    });
  });
});
