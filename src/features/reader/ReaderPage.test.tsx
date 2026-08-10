import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvidenceAnchor, Paper } from '../../domain';
import { reviewDraftProposal } from '../../domain';
import { createLocalReviewDrafts } from '../../services/localReviewDrafts';
import { ReaderPage, type PersistedReviewEntry } from './ReaderPage';

const paper: Paper = {
  id: 'paper-local',
  title: 'Local test PDF',
  currentVersionId: 'version-1',
  authors: ['Local Author'],
  year: 2026,
  abstract: null,
  identifiers: [],
  versions: [{
    id: 'version-1',
    label: 'unknown',
    sourceUrl: null,
    license: null,
    pdfSha256: `sha256:${'b'.repeat(64)}`,
    isVersionOf: null,
  }],
  zoteroItemKey: null,
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
};
const anchor: EvidenceAnchor = {
  id: 'anchor-1',
  paperVersionId: 'version-1',
  pageIndex: 0,
  bboxNorm: [0.1, 0.1, 0.8, 0.2],
  selectedText: 'Persistent local evidence for Reader review tests.',
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
const drafts = createLocalReviewDrafts(paper, anchor, '2026-08-05T00:00:00.000Z');

afterEach(cleanup);

function renderReader(
  entries: PersistedReviewEntry[],
  onReview = vi.fn().mockResolvedValue(undefined),
  openLedger = true,
  ) {
  render(<ReaderPage
    paper={paper}
    notes="User note"
    onBack={() => undefined}
    onNotesChange={() => undefined}
    onMessage={() => undefined}
    localPdfFile={null}
    localPdfError="PDF fixture intentionally unavailable in unit test"
    localAnchors={[anchor]}
    localPaperVersionId="version-1"
    persistedReviews={entries}
    nativeFileDialog={false}
    persistenceLabel="IndexedDB · 浏览器本地"
    onImportPdf={() => undefined}
    onAnchorCreate={() => undefined}
    onCreateReviewDrafts={async () => undefined}
    onReviewDraft={onReview}
  />);
  if (openLedger) fireEvent.click(screen.getByRole('tab', { name: /证据账本/ }));
  return onReview;
}

describe('Reader persisted review UI', () => {
  it('opens in the local notes workspace and exposes only the real PDF replacement action', () => {
    renderReader([], vi.fn().mockResolvedValue(undefined), false);

    expect(screen.getByRole('heading', { name: '我的笔记' })).toBeInTheDocument();
    const notesPanel = screen.getByRole('tabpanel', { name: '我的笔记' });
    expect(within(notesPanel).getByText(anchor.selectedText).closest('button')).toHaveTextContent(
      'Evidence Anchor',
    );

    fireEvent.click(screen.getByRole('button', { name: '更多文档操作' }));
    expect(screen.getByRole('menuitem', { name: '更换 PDF' })).toBeInTheDocument();
    expect(screen.queryByText(/Zotero/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/同步预览/)).not.toBeInTheDocument();
  });

  it('routes Accepted, Edited, and Rejected buttons through the formal review callback', async () => {
    const onReview = renderReader(drafts.map((draft) => ({
      draft,
      reviewAction: null,
      verifiedClaim: null,
    })));

    const firstCard = screen.getByText(drafts[0]!.claimText).closest('article');
    const secondCard = screen.getByText(drafts[1]!.claimText).closest('article');
    const thirdCard = screen.getByText(drafts[2]!.claimText).closest('article');
    if (!firstCard || !secondCard || !thirdCard) throw new Error('Expected three Claim cards');

    fireEvent.click(within(firstCard).getByRole('button', { name: '接受' }));
    fireEvent.click(within(secondCard).getByRole('button', { name: '编辑' }));
    fireEvent.change(within(secondCard).getByRole('textbox', { name: '编辑 Claim 文本' }), {
      target: { value: '用户编辑后的正式 Verified Claim。' },
    });
    fireEvent.click(within(secondCard).getByRole('button', { name: '保存编辑并验证' }));
    fireEvent.click(within(thirdCard).getByRole('button', { name: '驳回' }));

    await waitFor(() => expect(onReview).toHaveBeenCalledTimes(3));
    expect(onReview.mock.calls.map((call) => call[1].action)).toEqual([
      'accept',
      'edit_and_accept',
      'reject',
    ]);
  });

  it('restores distinct provenance and keeps the original Edited Draft visible', () => {
    const decisions = [
      { action: 'accept' } as const,
      { action: 'edit_and_accept', patch: { claimText: '用户修订后的 Verified Claim。' } } as const,
      { action: 'reject', rejectionReason: 'other', reason: 'Not useful.' } as const,
    ];
    const entries = drafts.map((draft, index): PersistedReviewEntry => {
      const result = reviewDraftProposal(draft, decisions[index]!, {
        auditId: `review-${index}`,
        actorId: 'local-user',
        occurredAt: `2026-08-05T0${index + 1}:00:00.000Z`,
        anchors: new Map([[anchor.id, anchor]]),
      });
      return {
        draft,
        reviewAction: result.reviewAction,
        verifiedClaim: result.verifiedClaim,
      };
    });

    renderReader(entries);

    expect(screen.getByText('Verified · accepted')).toBeInTheDocument();
    expect(screen.getByText('Verified · edited')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('原始 Draft（未改写）')).toBeInTheDocument();
    expect(screen.getByText(drafts[1]!.claimText)).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: '接受' })).toHaveLength(0);
  });
});
