import {
  ArrowLeft,
  AlertTriangle,
  Check,
  ChevronRight,
  Ellipsis,
  FileUp,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import type {
  DraftProposal,
  DraftReviewDecision,
  EvidenceAnchor,
  Paper,
  ReviewAction,
  VerifiedClaim,
} from '../../domain';
import { validateAnchor } from '../../domain';
import {
  LocalPdfViewer,
  type AnchorLocationState,
  type LocalPdfAnchor,
} from '../LocalPdfViewer';

export type ReaderTab = 'guide' | 'anchors' | 'ledger' | 'notes';

export interface PersistedReviewEntry {
  draft: DraftProposal;
  reviewAction: ReviewAction | null;
  verifiedClaim: VerifiedClaim | null;
}

interface ReaderPageProps {
  paper: Paper;
  notes: string;
  onBack: () => void;
  onNotesChange: (value: string) => void;
  onMessage: (title: string, detail: string) => void;
  localPdfFile: File | null;
  localPdfError: string | null;
  localAnchors: readonly EvidenceAnchor[];
  localPaperVersionId: string | null;
  persistedReviews: readonly PersistedReviewEntry[];
  nativeFileDialog: boolean;
  persistenceLabel: string;
  onImportPdf: (file?: File) => void;
  onAnchorCreate: (anchor: LocalPdfAnchor) => void;
  onCreateReviewDrafts: (anchorId: string) => Promise<void>;
  onReviewDraft: (draftId: string, decision: DraftReviewDecision) => Promise<void>;
}

const tabs: Array<[ReaderTab, string]> = [
  ['guide', '阅读导引'],
  ['anchors', '证据'],
  ['ledger', '证据账本'],
  ['notes', '我的笔记'],
];

export function ReaderPage({
  paper,
  notes,
  onBack,
  onNotesChange,
  onMessage,
  localPdfFile,
  localPdfError,
  localAnchors,
  localPaperVersionId,
  persistedReviews,
  nativeFileDialog,
  persistenceLabel,
  onImportPdf,
  onAnchorCreate,
  onCreateReviewDrafts,
  onReviewDraft,
}: ReaderPageProps) {
  const [tab, setTab] = useState<ReaderTab>('notes');
  const [researchOpen, setResearchOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(() => window.innerWidth >= 1240);
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false);
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const [anchorStates, setAnchorStates] = useState<ReadonlyMap<string, AnchorLocationState>>(
    () => new Map(),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolbarMenuRef = useRef<HTMLDivElement>(null);
  const localAnchorCount = localAnchors.length;
  const verifiedCount = persistedReviews.filter((entry) => entry.verifiedClaim !== null).length;
  const draftCount = persistedReviews.filter((entry) => entry.reviewAction === null).length;
  const draftAnchorIds = useMemo(
    () => new Set(persistedReviews.flatMap((entry) => entry.draft.evidence.map((item) => item.anchorId))),
    [persistedReviews],
  );

  const updateAnchorStates = useCallback((states: readonly AnchorLocationState[]) => {
    setAnchorStates(new Map(states.map((state) => [state.anchorId, state])));
  }, []);

  const stateForAnchor = (anchor: EvidenceAnchor): AnchorLocationState => {
    if (!localPdfFile) {
      return {
        anchorId: anchor.id,
        status: 'pdf-missing',
        message: localPdfError ?? '本地 PDF 缺失；请重新导入原文件后再定位 Anchor。',
      };
    }
    const rendered = anchorStates.get(anchor.id);
    if (rendered) return rendered;
    const validation = validateAnchor(anchor);
    if (!validation.valid) {
      return {
        anchorId: anchor.id,
        status: 'corrupt',
        message: `Anchor 数据损坏：${validation.issues.map((issue) => issue.code).join('、')}`,
      };
    }
    if (anchor.relocationStatus === 'orphaned') {
      return {
        anchorId: anchor.id,
        status: 'orphaned',
        message: 'Anchor 已孤立；请在当前 PDF 中重新选择原文。',
      };
    }
    return { anchorId: anchor.id, status: 'loading', message: '正在恢复 PDF 页与可见标记…' };
  };

  const jumpToLocalAnchor = (anchor: EvidenceAnchor) => {
    const state = stateForAnchor(anchor);
    if (state.status !== 'ready' && state.status !== 'loading') {
      setTab('anchors');
      setResearchOpen(true);
      onMessage('Anchor 无法定位', state.message);
      return;
    }
    setActiveAnchor(anchor.id);
  };

  const chooseTab = (nextTab: ReaderTab) => {
    setTab(nextTab);
    setResearchOpen(true);
  };

  useEffect(() => {
    if (!toolbarMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!toolbarMenuRef.current?.contains(event.target as Node)) setToolbarMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setToolbarMenuOpen(false);
    };
    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [toolbarMenuOpen]);

  return (
    <div className="reader-shell">
      <header className="reader-toolbar">
        <Button variant="secondary" className="icon-button" aria-label="返回文献库" onClick={onBack}><ArrowLeft size={19} /></Button>
        <div className="reader-title"><strong>{paper.title}</strong><span>{paper.authors.length ? paper.authors.join(', ') : '作者信息未录入'}{paper.year ? ` · ${paper.year}` : ''} · 本地 PDF · 未上传</span></div>
        <span className="toolbar-state"><i />{persistenceLabel}</span>
        <span className="toolbar-state">{verifiedCount} Verified · {draftCount} 待审阅</span>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImportPdf(file);
            event.target.value = '';
          }}
        />
        <div className="reader-toolbar-menu" ref={toolbarMenuRef}>
          <Button
            variant="secondary"
            className="icon-button"
            aria-label="更多文档操作"
            aria-expanded={toolbarMenuOpen}
            onClick={() => setToolbarMenuOpen((value) => !value)}
          ><Ellipsis size={19} /></Button>
          {toolbarMenuOpen ? <div className="reader-toolbar-popover" role="menu">
            <button type="button" role="menuitem" onClick={() => {
              setToolbarMenuOpen(false);
              if (nativeFileDialog) onImportPdf();
              else fileInputRef.current?.click();
            }}><FileUp size={16} /><span>更换 PDF</span></button>
          </div> : null}
        </div>
        <Button variant="secondary" className="reader-panel-toggle" icon={<PanelRightOpen size={17} />} aria-expanded={researchOpen} onClick={() => setResearchOpen((value) => !value)}>研究面板</Button>
      </header>

      <div className={`reader-grid ${outlineOpen ? '' : 'is-outline-collapsed'}`}>
        <aside className="reader-outline" aria-label="本地 Evidence Anchor">
          <div className="outline-context">
            <div>
              <small>本地文档</small>
              <strong>{localAnchorCount} 个 Evidence Anchor</strong>
            </div>
            <button
              type="button"
              className="outline-toggle"
              aria-label={outlineOpen ? '收起 Evidence Anchor' : '展开 Evidence Anchor'}
              aria-expanded={outlineOpen}
              onClick={() => setOutlineOpen((value) => !value)}
            >{outlineOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
            <p>选区与坐标只保存在本地，可随时回到原始 PDF。</p>
          </div>
          <LocalAnchorList anchors={localAnchors} stateForAnchor={stateForAnchor} onJump={jumpToLocalAnchor} compact />
        </aside>

        <main className="document-stage has-live-pdf" aria-label="本地 PDF 正文">
          {localPdfFile && localPaperVersionId
            ? <LocalPdfViewer
              file={localPdfFile}
              anchors={localAnchors}
              expectedPaperVersionId={localPaperVersionId}
              activeAnchorId={activeAnchor}
              onAnchorCreate={onAnchorCreate}
              onAnchorStatesChange={updateAnchorStates}
            />
            : <div className="reader-error reader-error--document"><AlertTriangle size={20} /><strong>本地 PDF 无法恢复</strong><p>{localPdfError ?? 'PDF 文件缺失；Anchor 与审阅记录仍保留在本地仓库。'}</p></div>}
        </main>

        <button type="button" className={`research-scrim ${researchOpen ? 'is-open' : ''}`} aria-label="关闭研究面板" onClick={() => setResearchOpen(false)} />
        <aside className={`research-panel ${researchOpen ? 'is-open' : ''}`} aria-label="研究面板">
          <div className="research-panel__mobile-head"><strong>研究面板</strong><Button variant="ghost" className="icon-button" aria-label="关闭研究面板" onClick={() => setResearchOpen(false)}><X size={18} /></Button></div>
          <div className="research-tabs" role="tablist" aria-label="论文研究工具">
            {tabs.map(([value, label]) => <button
              type="button"
              role="tab"
              id={`reader-tab-${value}`}
              aria-controls={`reader-panel-${value}`}
              aria-selected={tab === value}
              className={tab === value ? 'is-active' : ''}
              key={value}
              onClick={() => setTab(value)}
            >{label}{value === 'ledger' ? <span>{draftCount}</span> : value === 'anchors' && localAnchorCount ? <span>{localAnchorCount}</span> : null}</button>)}
          </div>
          <div className="research-content" role="tabpanel" id={`reader-panel-${tab}`} aria-labelledby={`reader-tab-${tab}`}>
            {tab === 'guide' ? <GuidePanel onOpenLedger={() => chooseTab('ledger')} /> : null}
            {tab === 'anchors' ? <LocalAnchorPanel
                anchors={localAnchors}
                stateForAnchor={stateForAnchor}
                onJump={jumpToLocalAnchor}
                onCreateReviewDrafts={onCreateReviewDrafts}
                draftAnchorIds={draftAnchorIds}
              /> : null}
            {tab === 'ledger' ? <PersistedLedgerPanel entries={persistedReviews} anchors={localAnchors} onJump={jumpToLocalAnchor} onReview={onReviewDraft} /> : null}
            {tab === 'notes' ? <NotesPanel
              value={notes}
              onChange={onNotesChange}
              persistenceLabel={persistenceLabel}
              anchors={localAnchors}
              onJump={jumpToLocalAnchor}
            /> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function ReaderEmptyState({
  nativeFileDialog,
  onBack,
  onImportPdf,
}: {
  nativeFileDialog: boolean;
  onBack: () => void;
  onImportPdf: (file?: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startImport = () => {
    if (nativeFileDialog) onImportPdf();
    else fileInputRef.current?.click();
  };

  return <div className="reader-shell">
    <header className="reader-toolbar">
      <Button variant="secondary" className="icon-button" aria-label="返回文献库" onClick={onBack}><ArrowLeft size={19} /></Button>
      <div className="reader-title"><strong>阅读器</strong><span>只打开真实的本地 PDF</span></div>
    </header>
    <input
      ref={fileInputRef}
      className="sr-only"
      type="file"
      accept="application/pdf,.pdf"
      aria-label="选择本地 PDF"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) onImportPdf(file);
        event.target.value = '';
      }}
    />
    <main className="page">
      <div className="empty-state">
        <h2>没有打开的论文</h2>
        <p>从文献库选择一篇论文，或现在导入本地 PDF。</p>
        <Button variant="primary" icon={<FileUp size={17} />} onClick={startImport}>导入 PDF</Button>
      </div>
    </main>
  </div>;
}

function PanelIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children: string }) {
  return <header className="panel-intro"><small>{eyebrow}</small><h2>{title}</h2><p>{children}</p></header>;
}

const anchorStatusLabels: Record<AnchorLocationState['status'], string> = {
  loading: '恢复中',
  ready: '可定位',
  orphaned: '已孤立',
  corrupt: '已损坏',
  'pdf-corrupt': 'PDF 损坏',
  'pdf-mismatch': 'PDF 不匹配',
  'page-invalid': '页码失效',
  'pdf-missing': 'PDF 缺失',
};

function LocalAnchorList({
  anchors,
  stateForAnchor,
  onJump,
  compact = false,
}: {
  anchors: readonly EvidenceAnchor[];
  stateForAnchor: (anchor: EvidenceAnchor) => AnchorLocationState;
  onJump: (anchor: EvidenceAnchor) => void;
  compact?: boolean;
}) {
  if (anchors.length === 0) {
    return <p className="local-outline-message">选择正文文字后创建 Anchor；正文与坐标不会上传。</p>;
  }
  return <div className={`local-anchor-list ${compact ? 'is-compact' : ''}`}>
    {anchors.map((anchor) => {
      const state = stateForAnchor(anchor);
      return <button type="button" className={`local-anchor-item is-${state.status}`} key={anchor.id} onClick={() => onJump(anchor)}>
        <span><strong>p.{anchor.pageIndex + 1}</strong><small>{anchorStatusLabels[state.status]}</small></span>
        <p>{anchor.selectedText || 'Anchor 未保留选区文本'}</p>
        {!compact && state.status !== 'ready' ? <em>{state.message}</em> : null}
      </button>;
    })}
  </div>;
}

function LocalAnchorPanel({
  anchors,
  stateForAnchor,
  onJump,
  onCreateReviewDrafts,
  draftAnchorIds,
}: {
  anchors: readonly EvidenceAnchor[];
  stateForAnchor: (anchor: EvidenceAnchor) => AnchorLocationState;
  onJump: (anchor: EvidenceAnchor) => void;
  onCreateReviewDrafts: (anchorId: string) => Promise<void>;
  draftAnchorIds: ReadonlySet<string>;
}) {
  const [pendingAnchorId, setPendingAnchorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createDrafts = async (anchorId: string) => {
    setPendingAnchorId(anchorId);
    setError(null);
    try {
      await onCreateReviewDrafts(anchorId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法创建本地审阅 Draft。');
    } finally {
      setPendingAnchorId(null);
    }
  };

  return <>
    <PanelIntro eyebrow="Persisted Evidence Anchors" title="已保存选区与定位状态。">点击可回到正确 PDF 页并重绘选区；失效记录会保留并说明恢复方法。</PanelIntro>
    <LocalAnchorList anchors={anchors} stateForAnchor={stateForAnchor} onJump={onJump} />
    {anchors.map((anchor) => draftAnchorIds.has(anchor.id) ? null : <Button
      key={`${anchor.id}-drafts`}
      size="small"
      className="full-width anchor-draft-button"
      disabled={pendingAnchorId !== null}
      onClick={() => void createDrafts(anchor.id)}
    >{pendingAnchorId === anchor.id ? '正在保存 Draft…' : `为 p.${anchor.pageIndex + 1} 创建 3 条本地审阅 fixture`}</Button>)}
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
  </>;
}

function PersistedLedgerPanel({
  entries,
  anchors,
  onJump,
  onReview,
}: {
  entries: readonly PersistedReviewEntry[];
  anchors: readonly EvidenceAnchor[];
  onJump: (anchor: EvidenceAnchor) => void;
  onReview: (draftId: string, decision: DraftReviewDecision) => Promise<void>;
}) {
  const verified = entries.filter((entry) => entry.verifiedClaim !== null).length;
  const rejected = entries.filter((entry) => entry.reviewAction?.toStatus === 'rejected').length;
  return <>
    <PanelIntro eyebrow="Persisted Evidence Ledger" title="Draft、ReviewAction 与 Verified 分层保存。">所有按钮都先经过领域纯函数；Rejected 不会产生 Verified Claim，用户笔记也不会混入这里。</PanelIntro>
    <div className="review-summary"><span><strong>{verified} Verified · {rejected} Rejected</strong><small>{entries.length - verified - rejected} 条待审阅</small></span><strong>{Math.round((verified / Math.max(entries.length, 1)) * 100)}%</strong></div>
    {entries.length === 0 ? <p className="chat-empty">创建一个 Evidence Anchor，然后在“证据”页生成明确标记的本地审阅 fixture。</p> : null}
    {entries.map((entry) => <PersistedClaimCard key={entry.draft.id} entry={entry} anchors={anchors} onJump={onJump} onReview={onReview} />)}
  </>;
}

const sourceLabels: Record<DraftProposal['epistemicSource'], string> = {
  direct_quote: '直接引文',
  author_claim: '作者主张 fixture',
  reported_result: '报告结果 fixture',
  ai_inference: 'AI 推断 fixture',
  user_judgment: '用户判断',
  external_metadata: '外部元数据',
};

function PersistedClaimCard({
  entry,
  anchors,
  onJump,
  onReview,
}: {
  entry: PersistedReviewEntry;
  anchors: readonly EvidenceAnchor[];
  onJump: (anchor: EvidenceAnchor) => void;
  onReview: (draftId: string, decision: DraftReviewDecision) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(entry.draft.claimText);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = entry.reviewAction?.toStatus ?? 'draft';
  const statusLabel = {
    draft: 'Draft',
    accepted: 'Verified · accepted',
    edited: 'Verified · edited',
    rejected: 'Rejected',
    stale: 'Stale',
  }[status];
  const visibleClaim = entry.verifiedClaim ?? entry.draft;

  const review = async (decision: DraftReviewDecision) => {
    setPending(true);
    setError(null);
    try {
      await onReview(entry.draft.id, decision);
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '审阅动作未保存。');
    } finally {
      setPending(false);
    }
  };

  const saveEdit = () => {
    const claimText = draftText.trim();
    if (!claimText) {
      setError('编辑后的 Claim 不能为空。');
      return;
    }
    void review({ action: 'edit_and_accept', patch: { claimText } });
  };

  return <article className={`claim-card is-${status}`}>
    <header><span>{sourceLabels[entry.draft.epistemicSource]}</span><small>{Math.round(entry.draft.confidence * 100)}%</small><strong>{statusLabel}</strong></header>
    {editing ? <label className="claim-editor"><span>编辑 Claim 文本</span><textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} autoFocus /></label> : <p className="claim-text">{visibleClaim.claimText}</p>}
    {status === 'edited' ? <p className="original-draft"><strong>原始 Draft（未改写）</strong>{entry.draft.claimText}</p> : null}
    <div className="anchor-chips">{entry.draft.evidence.map((evidence) => {
      const anchor = anchors.find((candidate) => candidate.id === evidence.anchorId);
      return anchor
        ? <button type="button" key={evidence.anchorId} onClick={() => onJump(anchor)}>p.{anchor.pageIndex + 1} · Evidence Anchor</button>
        : <span className="anchor-chip-error" key={evidence.anchorId}>Anchor 缺失 · {evidence.anchorId}</span>;
    })}</div>
    <p className="scope-note">{entry.draft.scopeConditions.join(' ')}</p>
    {entry.reviewAction ? <p className="review-provenance">ReviewAction · {entry.reviewAction.action} · {entry.reviewAction.occurredAt}</p> : null}
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
    {!entry.reviewAction ? <footer>
      {editing ? <>
        <Button size="small" variant="primary" disabled={pending} onClick={saveEdit}>保存编辑并验证</Button>
        <Button size="small" disabled={pending} onClick={() => { setDraftText(entry.draft.claimText); setEditing(false); setError(null); }}>取消</Button>
      </> : <>
        <Button size="small" disabled={pending} onClick={() => void review({ action: 'accept' })} icon={<Check size={14} />}>接受</Button>
        <Button size="small" disabled={pending} onClick={() => setEditing(true)}>编辑</Button>
        <Button size="small" variant="danger" disabled={pending} onClick={() => void review({ action: 'reject', rejectionReason: 'other', reason: '用户在 Reader 审阅中驳回。' })}>驳回</Button>
      </>}
    </footer> : null}
  </article>;
}

function GuidePanel({ onOpenLedger }: { onOpenLedger: () => void }) {
  return <>
    <PanelIntro eyebrow="Local PDF · evidence first" title="先固定原文，再形成自己的判断。">PDF、Anchor、Draft 与审阅记录都保存在本机；当前 Draft 是明确标记的固定 fixture，没有调用 AI。</PanelIntro>
    <section className="guide-card"><header><MapPin size={17} /><h3>唯一工作流</h3></header><ol><li>选择 PDF 正文并创建 Anchor。</li><li>在“证据”页确认能够回跳和重绘。</li><li>逐条接受、编辑或驳回审阅 fixture。</li><li>在“我的笔记”写下个人判断与仍不确定之处。</li></ol></section>
    <Button variant="primary" className="full-width" onClick={onOpenLedger}>打开证据账本 <ChevronRight size={16} /></Button>
  </>;
}

function NotesPanel({
  value,
  onChange,
  persistenceLabel,
  anchors,
  onJump,
}: {
  value: string;
  onChange: (value: string) => void;
  persistenceLabel: string;
  anchors: readonly EvidenceAnchor[];
  onJump: (anchor: EvidenceAnchor) => void;
}) {
  const linkedAnchor = anchors[0];
  return <>
    <PanelIntro eyebrow="User-owned notes" title="我的笔记">你的解释始终与 AI 草稿、Verified Claim 分开，并保存在本地。</PanelIntro>
    <div className="notes-toolbar" aria-hidden="true"><span>H</span><strong>B</strong><span>@Claim</span><span>TODO</span><small>{persistenceLabel} · {anchors.length} Anchors</small></div>
    <label className="notes-field"><span className="sr-only">个人研究笔记</span><textarea value={value} onChange={(event) => onChange(event.target.value)} /></label>
    {linkedAnchor ? <button type="button" className="notes-anchor-card" onClick={() => onJump(linkedAnchor)}>
      <span><strong>Evidence Anchor</strong><small>p.{linkedAnchor.pageIndex + 1}</small></span>
      <p>{linkedAnchor.selectedText || '此 Anchor 未保留选区文本'}</p>
      <ChevronRight size={17} />
    </button> : null}
  </>;
}
