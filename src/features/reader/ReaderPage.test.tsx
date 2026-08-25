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
      claimType: 'interpretive', epistemicSource: 'user_judgment', evidenceLinkIds: [link.id], assumptions: [],
      scopeConditions: [], limitations: [], confidence: null, confidenceBasis: [], reviewStatus: 'draft',
      createdBy: 'user', needsHumanAttention: false, modelRunId: null, userComment: null, version: 1,
      createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z', reviewedBy: null, reviewedAt: null, originalAiDraft: null,
    },
  };
}
const bundles = [bundle(1), bundle(2), bundle(3)];

afterEach(cleanup);

function renderReader(
  entries: PersistedReviewEntry[],
  onReview = vi.fn().mockResolvedValue(undefined),
  openLedger = true,
  onUpdatePaperMetadata = vi.fn().mockResolvedValue(undefined),
  onRequestAiDraft = vi.fn().mockRejectedValue(new Error('OPENAI_ADAPTER_DEFERRED')),
  openAiModel = 'model-test',
) {
  render(<ReaderPage
    paper={paper} judgment={judgment} verifiedClaims={entries.flatMap((entry) => entry.verifiedClaim ? [entry.verifiedClaim] : [])}
    onBack={() => undefined} onMessage={() => undefined} localPdfFile={null}
    localPdfError="PDF intentionally unavailable in unit test" localAnchors={[anchor]} localPaperVersionId="version-1"
    paperMap={null} stalePaperMap={false}
    persistedReviews={entries} nativeFileDialog={false} persistenceLabel="IndexedDB · 浏览器本地" openAiModel={openAiModel}
    onImportPdf={() => undefined} onUpdatePaperMetadata={onUpdatePaperMetadata} onAnchorCreate={() => undefined} onCreateManualDraft={async () => undefined}
    onGeneratePaperMap={async () => undefined}
    onRequestAiDraft={onRequestAiDraft} onReviewDraft={onReview}
    onSaveJudgment={async () => undefined} onExportMarkdown={() => undefined}
  />);
  if (openLedger) fireEvent.click(screen.getByRole('tab', { name: /审阅/ }));
  return onReview;
}

describe('Reader persisted review UI', () => {
  it('opens Evidence Anchors as the default reader surface', () => {
    renderReader([], vi.fn().mockResolvedValue(undefined), false);

    expect(screen.getByRole('tab', { name: /证据/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Evidence Anchors')).toBeInTheDocument();
  });

  it('exposes structured judgment and real document actions without legacy integrations', () => {
    renderReader([], vi.fn().mockResolvedValue(undefined), false);
    fireEvent.click(screen.getByRole('tab', { name: '我的判断' }));
    expect(screen.getByRole('heading', { name: '我的判断' })).toBeInTheDocument();
    expect(screen.getByText('核心判断')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '更多文档操作' }));
    expect(screen.getByRole('menuitem', { name: '导入另一篇 PDF' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '导出 Verified Markdown' })).toBeInTheDocument();
    expect(screen.queryByText(/Zotero/i)).not.toBeInTheDocument();
  });

  it('edits paper metadata from the document actions menu', async () => {
    const onUpdatePaperMetadata = vi.fn().mockResolvedValue(undefined);
    renderReader([], vi.fn().mockResolvedValue(undefined), false, onUpdatePaperMetadata);

    fireEvent.click(screen.getByRole('button', { name: '更多文档操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '编辑论文信息' }));
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Evidence-First Reading' } });
    fireEvent.change(screen.getByLabelText('作者'), { target: { value: 'Ada Lovelace, Alan Turing' } });
    fireEvent.change(screen.getByLabelText('年份'), { target: { value: '2025' } });
    fireEvent.click(screen.getByRole('button', { name: '保存论文信息' }));

    await waitFor(() => expect(onUpdatePaperMetadata).toHaveBeenCalledWith({
      title: 'Evidence-First Reading',
      authors: ['Ada Lovelace', 'Alan Turing'],
      year: 2025,
    }));
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

  it('labels a manual Draft as user-provided without fabricated 100% confidence', () => {
    const first = bundles[0]!;
    const entry = { draft: first.draft, evidenceLinks: [first.link], reviewAction: null, verifiedClaim: null };
    renderReader([entry]);
    const card = screen.getByText(first.draft.claimText).closest('article');
    if (!card) throw new Error('Expected manual Claim card');

    expect(within(card).getByText('人工 Draft · 用户判断')).toBeInTheDocument();
    expect(within(card).getByText('用户提供')).toBeInTheDocument();
    expect(within(card).queryByText('100%')).not.toBeInTheDocument();
  });

  it('shows the exact Anchor send scope and configured model beside AI generation', () => {
    renderReader([], vi.fn().mockResolvedValue(undefined), false, vi.fn().mockResolvedValue(undefined), vi.fn(), 'model-visible');
    fireEvent.click(screen.getByRole('tab', { name: /证据/ }));

    expect(screen.getByText('发送范围：此 Anchor 的选区文本；模型：model-visible')).toBeInTheDocument();
  });

  it('shows generation pending state without invoking a provider implementation', async () => {
    let finish!: () => void;
    const onRequestAiDraft = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderReader([], vi.fn().mockResolvedValue(undefined), false, vi.fn().mockResolvedValue(undefined), onRequestAiDraft, '');
    fireEvent.click(screen.getByRole('tab', { name: /证据/ }));
    expect(screen.getByText('发送范围：此 Anchor 的选区文本；模型：未配置')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '生成 AI Draft' }));
    expect(screen.getByRole('button', { name: '正在生成…' })).toBeDisabled();
    expect(onRequestAiDraft).toHaveBeenCalledWith(anchor.id);

    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: '生成 AI Draft' })).toBeEnabled());
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

  it('shows a Tauri string AI Draft error unchanged without creating a Draft', async () => {
    const error = 'OPENAI_DRAFT_REQUEST_FAILED: provider returned 401 Unauthorized';
    const onRequestAiDraft = vi.fn().mockRejectedValue(error);
    renderReader(
      [],
      vi.fn().mockResolvedValue(undefined),
      false,
      vi.fn().mockResolvedValue(undefined),
      onRequestAiDraft,
    );

    fireEvent.click(screen.getByRole('tab', { name: /证据/ }));
    fireEvent.click(screen.getByRole('button', { name: '生成 AI Draft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(error);
    expect(onRequestAiDraft).toHaveBeenCalledWith(anchor.id);
    fireEvent.click(screen.getByRole('tab', { name: /审阅/ }));
    expect(screen.getByText('先创建 Evidence Anchor，再写人工 Draft，或使用已配置模型生成待审阅 Draft。')).toBeInTheDocument();
  });
});
