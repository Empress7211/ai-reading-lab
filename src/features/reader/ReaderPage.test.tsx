import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DraftProposal, EvidenceAnchor, EvidenceLink, JudgmentNote, Paper } from '../../domain';
import { createEmptyJudgmentSections, reviewDraftProposal } from '../../domain';
import { ReaderPage, type PersistedReviewEntry } from './ReaderPage';

const paper: Paper = {
  id: 'paper-local', title: 'Local test PDF', currentVersionId: 'version-1', authors: ['Local Author'], year: 2026,
  abstract: null, identifiers: [], versions: [{ id: 'version-1', label: 'unknown', sourceUrl: null, license: null, pdfSha256: `sha256:${'b'.repeat(64)}`, isVersionOf: null }],
  zoteroItemKey: null, createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z',
};
const anchor: EvidenceAnchor = {
  id: 'anchor-1', paperVersionId: 'version-1', pageIndex: 0, bboxNorm: [0.1, 0.1, 0.8, 0.2],
  selectedText: 'Persistent local evidence for Reader review tests.', prefix: '', suffix: '',
  textHash: 'a'.repeat(64), sectionPath: [], semanticElementId: null, pdfSha256: `sha256:${'b'.repeat(64)}`,
  parserVersion: 'test', anchorType: 'text', relocationStatus: 'exact', createdBy: 'user_selection',
};
const judgment: JudgmentNote = {
  id: 'judgment-1', paperId: paper.id, paperVersionId: 'version-1', sections: createEmptyJudgmentSections(),
  status: 'draft', createdBy: 'user', updatedAt: '2026-08-05T00:00:00.000Z', completedAt: null,
};

function bundle(index: number): { draft: DraftProposal; link: EvidenceLink } {
  const id = `draft-${index}`;
  const link: EvidenceLink = { id: `link-${index}`, claimId: id, anchorId: anchor.id, relation: 'support', supportType: 'direct_statement', quotedFragment: anchor.selectedText, note: null, ordinal: 0 };
  return {
    link,
    draft: {
      id, paperId: paper.id, paperVersionId: 'version-1', claimText: `Manual review Claim number ${index}.`,
      claimType: 'interpretive', epistemicSource: 'author_claim', evidenceLinkIds: [link.id], assumptions: [],
      scopeConditions: [], limitations: [], confidence: 1, confidenceBasis: ['User-authored'], reviewStatus: 'draft',
      createdBy: 'user', needsHumanAttention: false, modelRunId: null, userComment: null, version: 1,
      createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z', reviewedBy: null, reviewedAt: null, originalAiDraft: null,
    },
  };
}
const bundles = [bundle(1), bundle(2), bundle(3)];

afterEach(cleanup);

function renderReader(entries: PersistedReviewEntry[], onReview = vi.fn().mockResolvedValue(undefined), openLedger = true) {
  render(<ReaderPage
    paper={paper} judgment={judgment} verifiedClaims={entries.flatMap((entry) => entry.verifiedClaim ? [entry.verifiedClaim] : [])}
    onBack={() => undefined} onMessage={() => undefined} localPdfFile={null}
    localPdfError="PDF intentionally unavailable in unit test" localAnchors={[anchor]} localPaperVersionId="version-1"
    persistedReviews={entries} nativeFileDialog={false} persistenceLabel="IndexedDB · 浏览器本地"
    onImportPdf={() => undefined} onAnchorCreate={() => undefined} onCreateManualDraft={async () => undefined}
    onRequestAiDraft={async () => { throw new Error('OPENAI_ADAPTER_DEFERRED'); }} onReviewDraft={onReview}
    onSaveJudgment={async () => undefined} onExportMarkdown={() => undefined}
  />);
  if (openLedger) fireEvent.click(screen.getByRole('tab', { name: /审阅/ }));
  return onReview;
}

describe('Reader persisted review UI', () => {
  it('exposes structured judgment and real document actions without legacy integrations', () => {
    renderReader([], vi.fn().mockResolvedValue(undefined), false);
    fireEvent.click(screen.getByRole('tab', { name: '我的判断' }));
    expect(screen.getByRole('heading', { name: '我的判断' })).toBeInTheDocument();
    expect(screen.getByText('核心判断')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '更多文档操作' }));
    expect(screen.getByRole('menuitem', { name: '更换 PDF' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '导出 Verified Markdown' })).toBeInTheDocument();
    expect(screen.queryByText(/Zotero/i)).not.toBeInTheDocument();
  });

  it('routes Accepted, Edited, and Rejected buttons through the formal review callback', async () => {
    const entries = bundles.map(({ draft, link }) => ({ draft, evidenceLinks: [link], reviewAction: null, verifiedClaim: null }));
    const onReview = renderReader(entries);
    const cards = bundles.map(({ draft }) => screen.getByText(draft.claimText).closest('article'));
    if (cards.some((card) => !card)) throw new Error('Expected Claim cards');
    fireEvent.click(within(cards[0]!).getByRole('button', { name: '接受' }));
    fireEvent.click(within(cards[1]!).getByRole('button', { name: '编辑' }));
    fireEvent.change(within(cards[1]!).getByRole('textbox', { name: '编辑 Claim 文本' }), { target: { value: '用户编辑后的正式 Verified Claim。' } });
    fireEvent.click(within(cards[1]!).getByRole('button', { name: '保存编辑并验证' }));
    fireEvent.click(within(cards[2]!).getByRole('button', { name: '驳回' }));
    await waitFor(() => expect(onReview).toHaveBeenCalledTimes(3));
    expect(onReview.mock.calls.map((call) => call[1].action)).toEqual(['accept', 'edit_and_accept', 'reject']);
  });

  it('restores provenance and keeps the original Edited Draft visible', () => {
    const decisions = [
      { action: 'accept' } as const,
      { action: 'edit_and_accept', patch: { claimText: '用户修订后的 Verified Claim。' } } as const,
      { action: 'reject', rejectionReason: 'other', reason: 'Not useful.' } as const,
    ];
    const entries = bundles.map(({ draft, link }, index): PersistedReviewEntry => {
      const result = reviewDraftProposal(draft, decisions[index]!, {
        auditId: `review-${index}`, actorId: 'local-user', occurredAt: `2026-08-05T0${index + 1}:00:00.000Z`,
        anchors: new Map([[anchor.id, anchor]]), evidenceLinks: new Map([[link.id, link]]),
      });
      return { draft, evidenceLinks: [link], reviewAction: result.reviewAction, verifiedClaim: result.verifiedClaim };
    });
    renderReader(entries);
    expect(screen.getByText('Verified · accepted')).toBeInTheDocument();
    expect(screen.getByText('Verified · edited')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('原始 Draft（未改写）')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: '接受' })).toHaveLength(0);
  });
});
