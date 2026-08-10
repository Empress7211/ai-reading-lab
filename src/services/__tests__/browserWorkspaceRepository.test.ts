import { beforeEach, describe, expect, it } from 'vitest';
import type {
  EvidenceAnchor,
  NoteBlock,
  Paper,
} from '../../domain';
import { reviewDraftProposal } from '../../domain';
import { BrowserWorkspaceRepository } from '../browserWorkspaceRepository';
import { createLocalReviewDrafts } from '../localReviewDrafts';
import { DEFAULT_WORKSPACE_SETTINGS, type WorkspaceSettings } from '../types';

function record<T>(value: Record<string, unknown>): T {
  return value as T;
}

describe('BrowserWorkspaceRepository localStorage fallback', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists workspace entities and privacy settings across repository instances', async () => {
    const options = {
      indexedDB: null,
      localStorage: window.localStorage,
      storageKey: 'paperweave.test.persistence',
    } as const;
    const paper = record<Paper>({
      id: 'paper-1',
      title: 'Evidence first',
      currentVersionId: 'version-1',
    });
    const anchor: EvidenceAnchor = {
      id: 'anchor-1',
      paperVersionId: 'version-1',
      pageIndex: 0,
      bboxNorm: [0.1, 0.1, 0.8, 0.2],
      selectedText: 'Evidence remains attached to the original Draft.',
      prefix: '',
      suffix: '',
      textHash: 'a'.repeat(64),
      sectionPath: [],
      semanticElementId: null,
      pdfSha256: `sha256:${'b'.repeat(64)}`,
      parserVersion: 'test',
      anchorType: 'text',
      relocationStatus: 'exact',
      createdBy: 'user_selection',
    };
    const draft = createLocalReviewDrafts(
      paper,
      anchor,
      '2026-08-05T00:00:00.000Z',
    )[0];
    if (!draft) throw new Error('Expected a review fixture Draft');
    const reviewed = reviewDraftProposal(draft, { action: 'accept' }, {
      auditId: 'review-1',
      actorId: 'local-user',
      occurredAt: '2026-08-05T01:00:00.000Z',
      anchors: new Map([[anchor.id, anchor]]),
    });
    if (reviewed.state !== 'verified') throw new Error('Expected Verified result');
    const action = reviewed.reviewAction;
    const verified = reviewed.verifiedClaim;
    const note = record<NoteBlock>({
      id: 'note-1',
      paperId: 'paper-1',
      noteType: 'question',
      content: 'My interpretation',
    });
    const settings: WorkspaceSettings = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      appearance: 'dark',
      cloudMetadataEnabled: true,
    };

    const first = new BrowserWorkspaceRepository(options);
    await first.initialize({ papers: [paper] });
    await first.saveAnchor(anchor);
    await first.saveDraft(draft);
    await first.reviewDraft({ action, verifiedClaim: verified });
    await first.saveUserNote(note);
    await first.saveSettings(settings);

    const second = new BrowserWorkspaceRepository(options);
    const snapshot = await second.snapshot();

    expect(second.runtime).toBe('browser-localstorage');
    expect(snapshot.papers).toEqual([paper]);
    expect(snapshot.anchors).toEqual([anchor]);
    expect(snapshot.drafts).toEqual([draft]);
    expect(snapshot.reviewActions).toEqual([action]);
    expect(snapshot.verifiedClaims).toEqual([verified]);
    expect(snapshot.userNotes).toEqual([note]);
    expect(snapshot.settings).toEqual(settings);
  });

  it('persists Accepted, Edited, and Rejected outcomes while keeping Drafts immutable', async () => {
    const repository = new BrowserWorkspaceRepository({
      indexedDB: null,
      localStorage: window.localStorage,
      storageKey: 'paperweave.test.review-actions',
    });
    const paper = record<Paper>({ id: 'paper-1', title: 'Review', currentVersionId: 'version-1' });
    const anchor: EvidenceAnchor = {
      id: 'anchor-1',
      paperVersionId: 'version-1',
      pageIndex: 0,
      bboxNorm: [0.1, 0.1, 0.8, 0.2],
      selectedText: 'A stable evidence selection for three review outcomes.',
      prefix: '',
      suffix: '',
      textHash: 'a'.repeat(64),
      sectionPath: [],
      semanticElementId: null,
      pdfSha256: `sha256:${'b'.repeat(64)}`,
      parserVersion: 'test',
      anchorType: 'text',
      relocationStatus: 'exact',
      createdBy: 'user_selection',
    };
    await repository.initialize({ papers: [paper] });
    await repository.saveAnchor(anchor);
    const drafts = createLocalReviewDrafts(paper, anchor, '2026-08-05T00:00:00.000Z');
    const decisions = [
      { action: 'accept' } as const,
      { action: 'edit_and_accept', patch: { claimText: 'User edited and accepted this Claim.' } } as const,
      { action: 'reject', rejectionReason: 'other', reason: 'Not useful.' } as const,
    ];
    for (const [index, draft] of drafts.entries()) {
      await repository.saveDraft(draft);
      const result = reviewDraftProposal(draft, decisions[index]!, {
        auditId: `review-${index}`,
        actorId: 'local-user',
        occurredAt: `2026-08-05T0${index + 1}:00:00.000Z`,
        anchors: new Map([[anchor.id, anchor]]),
      });
      await repository.reviewDraft({
        action: result.reviewAction,
        ...(result.verifiedClaim ? { verifiedClaim: result.verifiedClaim } : {}),
      });
    }

    const restored = await new BrowserWorkspaceRepository({
      indexedDB: null,
      localStorage: window.localStorage,
      storageKey: 'paperweave.test.review-actions',
    }).snapshot();
    expect(restored.reviewActions.map((action) => action.toStatus)).toEqual([
      'accepted',
      'edited',
      'rejected',
    ]);
    expect(restored.verifiedClaims.map((claim) => claim.reviewStatus)).toEqual([
      'accepted',
      'edited',
    ]);
    expect(restored.drafts.every((item) => item.reviewStatus === 'draft')).toBe(true);
    expect(restored.drafts[1]?.claimText).toBe(drafts[1]?.claimText);

    await expect(repository.reviewDraft({ action: restored.reviewActions[0]! })).rejects.toThrow(
      '不能重复审阅',
    );
  });

  it('keeps imported bytes in-session and persists imported paper metadata', async () => {
    const options = {
      indexedDB: null,
      localStorage: window.localStorage,
      storageKey: 'paperweave.test.pdf',
    } as const;
    const bytes = Uint8Array.from([37, 80, 68, 70, 45]).buffer;
    const file = {
      name: 'trustworthy-notes.pdf',
      type: 'application/pdf',
      size: bytes.byteLength,
      arrayBuffer: async () => bytes,
    } as File;

    const repository = new BrowserWorkspaceRepository(options);
    const imported = await repository.importPdf({
      kind: 'browser-file',
      file,
      metadata: { paperId: 'paper-pdf', title: 'Trustworthy Notes' },
    });

    expect(imported.storage).toBe('object-url');
    expect(new Uint8Array((await repository.loadPdfBytes('paper-pdf')) ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array(bytes),
    );

    const reloaded = new BrowserWorkspaceRepository(options);
    const snapshot = await reloaded.snapshot();
    expect(snapshot.papers).toHaveLength(1);
    expect(snapshot.papers[0]).toMatchObject({
      id: 'paper-pdf',
      title: 'Trustworthy Notes',
    });
  });

  it('only produces a preview plan and exposes no sync executor', async () => {
    const repository = new BrowserWorkspaceRepository({
      indexedDB: null,
      localStorage: window.localStorage,
      storageKey: 'paperweave.test.preview',
    });
    await repository.initialize({
      papers: [record<Paper>({ id: 'paper-1', title: 'Local first' })],
    });

    const plan = await repository.previewSync({
      paperIds: ['paper-1'],
      target: 'git',
    });

    expect(plan).toMatchObject({
      createdBy: 'deterministic_executor',
      status: 'preview',
    });
    expect(JSON.stringify(plan)).toContain('No Zotero, Git, or GitHub operation has been executed.');
    expect('executeSync' in repository).toBe(false);
  });
});
