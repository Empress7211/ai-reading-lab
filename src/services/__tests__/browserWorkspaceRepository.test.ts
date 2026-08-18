import { describe, expect, it } from 'vitest';
import type { DraftProposal, EvidenceAnchor, EvidenceLink, JudgmentNote, Paper } from '../../domain';
import { createEmptyJudgmentSections, reviewDraftProposal } from '../../domain';
import type { BrowserStore, PdfAssetRecord } from '../browserStore';
import { BrowserWorkspaceRepository } from '../browserWorkspaceRepository';
import type { WorkspaceSnapshot } from '../types';

class MemoryStore implements BrowserStore {
  readonly runtime = 'browser-indexeddb' as const;
  snapshotValue: WorkspaceSnapshot | null = null;
  pdfs = new Map<string, ArrayBuffer>();
  async loadSnapshot() { return this.snapshotValue ? structuredClone(this.snapshotValue) : null; }
  async saveSnapshot(snapshot: WorkspaceSnapshot) { this.snapshotValue = structuredClone(snapshot); }
  async savePdf(asset: PdfAssetRecord) { this.pdfs.set(asset.paperId, asset.bytes.slice(0)); }
  async loadPdf(paperId: string) { return this.pdfs.get(paperId)?.slice(0) ?? null; }
}

const paper: Paper = {
  id: 'paper-1', title: 'Evidence first', currentVersionId: 'version-1', authors: [], year: null,
  abstract: null, identifiers: [], versions: [{ id: 'version-1', label: 'unknown', sourceUrl: null, license: null, pdfSha256: `sha256:${'b'.repeat(64)}`, isVersionOf: null }],
  zoteroItemKey: null, createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z',
};
const anchor: EvidenceAnchor = {
  id: 'anchor-1', paperVersionId: 'version-1', pageIndex: 0, bboxNorm: [0.1, 0.1, 0.8, 0.2],
  selectedText: 'Evidence remains attached to the original Draft.', prefix: '', suffix: '', textHash: 'a'.repeat(64),
  sectionPath: [], semanticElementId: null, pdfSha256: `sha256:${'b'.repeat(64)}`, parserVersion: 'test',
  anchorType: 'text', relocationStatus: 'exact', createdBy: 'user_selection',
};

function bundle(index = 1): { draft: DraftProposal; evidenceLinks: [EvidenceLink] } {
  const id = `draft-${index}`;
  const link: EvidenceLink = { id: `link-${index}`, claimId: id, anchorId: anchor.id, relation: 'support', supportType: 'direct_statement', quotedFragment: anchor.selectedText, note: null, ordinal: 0 };
  const now = '2026-08-05T00:00:00.000Z';
  return { evidenceLinks: [link], draft: {
    id, paperId: paper.id, paperVersionId: 'version-1', claimText: `Manual Claim ${index} remains reviewable.`,
    claimType: 'interpretive', epistemicSource: 'author_claim', evidenceLinkIds: [link.id], assumptions: [],
    scopeConditions: [], limitations: [], confidence: 1, confidenceBasis: ['User-authored'], reviewStatus: 'draft',
    createdBy: 'user', needsHumanAttention: false, modelRunId: null, userComment: null, version: 1,
    createdAt: now, updatedAt: now, reviewedBy: null, reviewedAt: null, originalAiDraft: null,
  } };
}

describe('BrowserWorkspaceRepository', () => {
  it('persists EvidenceLink, ReviewAction, Verified Claim and settings across repository instances', async () => {
    const store = new MemoryStore();
    const first = new BrowserWorkspaceRepository({ store });
    await first.initialize({ papers: [paper] });
    await first.saveAnchor(anchor);
    const item = bundle();
    await first.saveDraftBundle(item);
    const reviewed = reviewDraftProposal(item.draft, { action: 'accept' }, {
      auditId: 'review-1', actorId: 'local-user', occurredAt: '2026-08-05T01:00:00.000Z',
      anchors: new Map([[anchor.id, anchor]]), evidenceLinks: new Map([[item.evidenceLinks[0].id, item.evidenceLinks[0]]]),
    });
    if (reviewed.state !== 'verified') throw new Error('Expected Verified');
    await first.reviewDraft({ action: reviewed.reviewAction, verifiedClaim: reviewed.verifiedClaim });
    const sections = createEmptyJudgmentSections();
    sections.judgment = {
      text: 'The evidence supports a reviewable conclusion.',
      verifiedClaimIds: [reviewed.verifiedClaim.id],
    };
    const judgment: JudgmentNote = {
      id: 'judgment-1', paperId: paper.id, paperVersionId: 'version-1', sections,
      status: 'complete', createdBy: 'user', updatedAt: '2026-08-05T02:00:00.000Z', completedAt: '2026-08-05T02:00:00.000Z',
    };
    await first.saveJudgment(judgment);

    const restored = await new BrowserWorkspaceRepository({ store }).snapshot();
    expect(restored.evidenceLinks).toEqual(item.evidenceLinks);
    expect(restored.drafts[0]?.reviewStatus).toBe('draft');
    expect(restored.verifiedClaims[0]?.reviewStatus).toBe('accepted');
    expect(restored.judgments).toEqual([judgment]);
  });

  it('persists Accepted, Edited and Rejected outcomes without rewriting Drafts', async () => {
    const repository = new BrowserWorkspaceRepository({ store: new MemoryStore() });
    await repository.initialize({ papers: [paper] });
    await repository.saveAnchor(anchor);
    const decisions = [
      { action: 'accept' } as const,
      { action: 'edit_and_accept', patch: { claimText: 'User edited and accepted this Claim.' } } as const,
      { action: 'reject', rejectionReason: 'other', reason: 'Not useful.' } as const,
    ];
    for (const [index, decision] of decisions.entries()) {
      const item = bundle(index + 1);
      await repository.saveDraftBundle(item);
      const result = reviewDraftProposal(item.draft, decision, {
        auditId: `review-${index}`, actorId: 'local-user', occurredAt: `2026-08-05T0${index + 1}:00:00.000Z`,
        anchors: new Map([[anchor.id, anchor]]), evidenceLinks: new Map([[item.evidenceLinks[0].id, item.evidenceLinks[0]]]),
      });
      await repository.reviewDraft({ action: result.reviewAction, ...(result.verifiedClaim ? { verifiedClaim: result.verifiedClaim } : {}) });
    }
    const snapshot = await repository.snapshot();
    expect(snapshot.reviewActions.map((action) => action.toStatus)).toEqual(['accepted', 'edited', 'rejected']);
    expect(snapshot.verifiedClaims).toHaveLength(2);
    expect(snapshot.drafts.every((draft) => draft.reviewStatus === 'draft')).toBe(true);
    await expect(repository.reviewDraft({ action: snapshot.reviewActions[0]! })).rejects.toThrow('不能重复审阅');
  });

  it('persists imported PDF bytes and paper metadata in the browser store', async () => {
    const store = new MemoryStore();
    const repository = new BrowserWorkspaceRepository({ store });
    const bytes = Uint8Array.from([37, 80, 68, 70, 45]).buffer;
    const file = { name: 'notes.pdf', type: 'application/pdf', size: bytes.byteLength, arrayBuffer: async () => bytes } as File;
    const imported = await repository.importPdf({ kind: 'browser-file', file, metadata: { paperId: 'paper-pdf', title: 'Trustworthy Notes' } });
    expect(imported.storage).toBe('indexeddb');
    expect(new Uint8Array((await repository.loadPdfBytes('paper-pdf'))!)).toEqual(new Uint8Array(bytes));
    expect((await new BrowserWorkspaceRepository({ store }).snapshot()).papers[0]?.title).toBe('Trustworthy Notes');
  });

  it('updates paper metadata without replacing its PDF version', async () => {
    const store = new MemoryStore();
    const repository = new BrowserWorkspaceRepository({ store });
    await repository.initialize({ papers: [paper] });

    const updated = await repository.updatePaperMetadata({
      paperId: paper.id,
      title: '  Evidence-led Reading  ',
      authors: ['Ada Lovelace', 'Alan Turing'],
      year: 2025,
    });

    expect(updated).toMatchObject({
      id: paper.id,
      title: 'Evidence-led Reading',
      authors: ['Ada Lovelace', 'Alan Turing'],
      year: 2025,
      versions: paper.versions,
    });
    expect((await new BrowserWorkspaceRepository({ store }).snapshot()).papers[0]?.title).toBe('Evidence-led Reading');
  });

  it('requires Verified Claim references before completing a Judgment', async () => {
    const repository = new BrowserWorkspaceRepository({ store: new MemoryStore() });
    await repository.initialize({ papers: [paper] });
    const invalid: JudgmentNote = {
      id: 'judgment-1', paperId: paper.id, paperVersionId: 'version-1', sections: createEmptyJudgmentSections(),
      status: 'complete', createdBy: 'user', updatedAt: '2026-08-05T00:00:00.000Z', completedAt: '2026-08-05T00:00:00.000Z',
    };
    await expect(repository.saveJudgment(invalid)).rejects.toThrow('核心判断');
  });

  it('fails explicitly when the native-only OpenAI adapter is requested in a browser', async () => {
    const repository = new BrowserWorkspaceRepository({ store: new MemoryStore() });
    await expect(repository.generateDrafts({ paperId: 'paper-1', anchorIds: ['anchor-1'] })).rejects.toThrow('不会保存密钥或伪造结果');
  });
});
