import {
  ArrowLeft,
  AlertTriangle,
  Check,
  ChevronRight,
  Ellipsis,
  FileUp,
  GitBranch,
  Library,
  MapPin,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Route,
  ShieldAlert,
  Target,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import type { ClaimFixture, ClaimReviewStatus, PaperFixture, ThemeFixture } from '../../data/fixtures';
import { roleLabels } from '../../data/fixtures';
import type {
  DraftProposal,
  DraftReviewDecision,
  EvidenceAnchor,
  ReviewAction,
  VerifiedClaim,
} from '../../domain';
import { validateAnchor } from '../../domain';
import {
  LocalPdfViewer,
  type AnchorLocationState,
  type LocalPdfAnchor,
} from '../LocalPdfViewer';

export type ReaderTab = 'guide' | 'anchors' | 'ledger' | 'notes' | 'ask';

interface ClaimUpdate {
  text?: string;
  status?: ClaimReviewStatus;
}

export interface PersistedReviewEntry {
  draft: DraftProposal;
  reviewAction: ReviewAction | null;
  verifiedClaim: VerifiedClaim | null;
}

interface ReaderPageProps {
  paper: PaperFixture;
  theme: ThemeFixture;
  claims: ClaimFixture[];
  notes: string;
  onBack: () => void;
  onOpenSyncPreview: () => void;
  onUpdateClaim: (claimId: string, update: ClaimUpdate) => void;
  onNotesChange: (value: string) => void;
  onMessage: (title: string, detail: string) => void;
  localDocumentTitle: string | null;
  localPdfFile: File | null;
  localPdfError: string | null;
  localAnchors: readonly EvidenceAnchor[];
  localAnchorCount: number;
  localPaperVersionId: string | null;
  persistedReviews: readonly PersistedReviewEntry[] | null;
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
  ['ask', '提问'],
];

export function ReaderPage({
  paper,
  theme,
  claims,
  notes,
  onBack,
  onOpenSyncPreview,
  onUpdateClaim,
  onNotesChange,
  onMessage,
  localDocumentTitle,
  localPdfFile,
  localPdfError,
  localAnchors,
  localAnchorCount,
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
  const hasLocalDocument = localDocumentTitle !== null;
  const verifiedCount = persistedReviews
    ? persistedReviews.filter((entry) => entry.verifiedClaim !== null).length
    : claims.filter((claim) => claim.status === 'verified' || claim.status === 'edited').length;
  const draftCount = persistedReviews
    ? persistedReviews.filter((entry) => entry.reviewAction === null).length
    : claims.filter((claim) => claim.status === 'draft').length;
  const draftAnchorIds = useMemo(
    () => new Set(persistedReviews?.flatMap((entry) => entry.draft.evidence.map((item) => item.anchorId)) ?? []),
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

  const jumpToAnchor = (anchorId: string) => {
    const element = document.getElementById(anchorId);
    if (!element) return;
    setActiveAnchor(anchorId);
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => setActiveAnchor((current) => current === anchorId ? null : current), 1500);
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
        <Button variant="secondary" className="icon-button" aria-label="返回阅读包" onClick={onBack}><ArrowLeft size={19} /></Button>
        <div className="reader-title"><strong>{localDocumentTitle ?? paper.title}</strong><span>{hasLocalDocument ? '本地 PDF · 未上传 · PDF.js 文本层' : `${paper.authors} · ${paper.year} · ${paper.venue} · fixture document`}</span></div>
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
            }}><FileUp size={16} /><span>{hasLocalDocument ? '更换 PDF' : '导入本地 PDF'}</span></button>
            <button type="button" role="menuitem" onClick={() => {
              setToolbarMenuOpen(false);
              onMessage('Zotero 未配置', '没有关联或创建 Zotero 条目。');
            }}><Library size={16} /><span>未关联 Zotero</span></button>
            <button type="button" role="menuitem" onClick={() => {
              setToolbarMenuOpen(false);
              onOpenSyncPreview();
            }}><GitBranch size={16} /><span>打开同步预览</span></button>
          </div> : null}
        </div>
        <Button variant="secondary" className="reader-panel-toggle" icon={<PanelRightOpen size={17} />} aria-expanded={researchOpen} onClick={() => setResearchOpen((value) => !value)}>研究面板</Button>
      </header>

      <div className={`reader-grid ${outlineOpen ? '' : 'is-outline-collapsed'}`}>
        <aside className="reader-outline" aria-label={hasLocalDocument ? '本地 Evidence Anchor' : '合成文档目录'}>
          <div className="outline-context">
            <div>
              <small>{hasLocalDocument ? '本地文档' : '当前阅读路径'}</small>
              <strong>{hasLocalDocument ? `${localAnchorCount} 个 Evidence Anchor` : `${theme.shortLabel} · ${roleLabels[paper.role]}`}</strong>
            </div>
            <button
              type="button"
              className="outline-toggle"
              aria-label={outlineOpen ? '收起 Evidence Anchor' : '展开 Evidence Anchor'}
              aria-expanded={outlineOpen}
              onClick={() => setOutlineOpen((value) => !value)}
            >{outlineOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
            <p>{hasLocalDocument ? '选区与坐标只保存在本地，可随时回到原始 PDF。' : paper.rationale}</p>
          </div>
          {hasLocalDocument ? <LocalAnchorList anchors={localAnchors} stateForAnchor={stateForAnchor} onJump={jumpToLocalAnchor} compact /> : <nav>{[
            ['Abstract', 'anchor-abstract', 1],
            ['1 Introduction', 'anchor-intro', 1],
            ['2 Background', 'anchor-background', 1],
            ['3 Method', 'anchor-method', 1],
            ['4 Experiments', 'anchor-result', 2],
            ['Table 2', 'anchor-table', 2],
            ['5 Limitations', 'anchor-limit', 2],
          ].map(([label, anchor, page]) => <button type="button" key={anchor} onClick={() => jumpToAnchor(String(anchor))}><span>{label}</span><small>{page}</small></button>)}</nav>}
        </aside>

        <main className={`document-stage ${hasLocalDocument ? 'has-live-pdf' : ''}`} aria-label={hasLocalDocument ? '本地 PDF 正文' : '合成论文演示正文'}>
          {hasLocalDocument ? (
            localPdfFile && localPaperVersionId
              ? <LocalPdfViewer
                file={localPdfFile}
                anchors={localAnchors}
                expectedPaperVersionId={localPaperVersionId}
                activeAnchorId={activeAnchor}
                onAnchorCreate={onAnchorCreate}
                onAnchorStatesChange={updateAnchorStates}
              />
              : <div className="reader-error reader-error--document"><AlertTriangle size={20} /><strong>本地 PDF 无法恢复</strong><p>{localPdfError ?? 'PDF 文件缺失；Anchor 与审阅记录仍保留在本地仓库。'}</p></div>
          ) : <SyntheticDocument paper={paper} theme={theme} activeAnchor={activeAnchor} />}
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
            {tab === 'guide' ? <GuidePanel paper={paper} claims={claims} onJump={jumpToAnchor} onOpenLedger={() => chooseTab('ledger')} localMode={hasLocalDocument} /> : null}
            {tab === 'anchors' ? hasLocalDocument
              ? <LocalAnchorPanel
                anchors={localAnchors}
                stateForAnchor={stateForAnchor}
                onJump={jumpToLocalAnchor}
                onCreateReviewDrafts={onCreateReviewDrafts}
                draftAnchorIds={draftAnchorIds}
              />
              : <PanelIntro eyebrow="Evidence Anchors" title="导入本地 PDF 后启用。">合成文档只演示布局，不会把 fixture 坐标写入正式仓库。</PanelIntro>
            : null}
            {tab === 'ledger' ? persistedReviews
              ? <PersistedLedgerPanel entries={persistedReviews} anchors={localAnchors} onJump={jumpToLocalAnchor} onReview={onReviewDraft} />
              : <LedgerPanel claims={claims} onJump={jumpToAnchor} />
            : null}
            {tab === 'notes' ? <NotesPanel
              value={notes}
              onChange={onNotesChange}
              persistenceLabel={persistenceLabel}
              anchors={localAnchors}
              onJump={jumpToLocalAnchor}
            /> : null}
            {tab === 'ask' ? <AskPanel onJump={jumpToAnchor} /> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function SyntheticDocument({ paper, theme, activeAnchor }: { paper: PaperFixture; theme: ThemeFixture; activeAnchor: string | null }) {
  const anchorClass = (id: string) => activeAnchor === id ? 'document-anchor is-active' : 'document-anchor';
  return (
    <>
      <article className="document-page">
        <header className="document-heading"><span>Fixture document · 不是论文原文</span><h1>{paper.title}</h1><p>{paper.authors}</p><small>Interactive evidence-anchor demonstration</small></header>
        <section id="anchor-abstract" className={anchorClass('anchor-abstract')}><h2>Abstract</h2><p><mark>We investigate how claims about {theme.shortLabel} depend on the relationship between an underlying capability and the metric used to observe it.</mark> This synthetic passage demonstrates traceable evidence without reproducing a publication.</p></section>
        <div className="document-columns">
          <section id="anchor-intro" className={anchorClass('anchor-intro')}><h2>1 Introduction</h2><p>Large models often exhibit performance changes that attract strong interpretations. A plotted discontinuity can reflect the system, a threshold in the metric, or an interaction between data and evaluation.</p><p><mark>The central question is whether comparable evidence supports a distinct underlying transition.</mark></p></section>
          <section id="anchor-background" className={anchorClass('anchor-background')}><h2>2 Background</h2><p>Binary exact-match may remain at zero until performance crosses a threshold, even while a latent signal changes smoothly. This paragraph is composed solely for the interface fixture.</p></section>
          <aside className="document-callout"><Route size={28} /><strong>Evidence path</strong><p>Scale → capability hypothesis → observed metric</p></aside>
          <section id="anchor-method" className={anchorClass('anchor-method')}><h2>3 Method</h2><p>We compare transformations of the same synthetic signal while holding the task definition and evaluation examples stable where possible.</p><p className="formula">m(x) = g(c(x)) + ε</p></section>
        </div>
        <span className="document-page-number">1</span>
      </article>
      <article className="document-page">
        <div className="document-columns">
          <section id="anchor-result" className={anchorClass('anchor-result')}><h2>4 Experiments</h2><p><mark>When a continuous score replaces a thresholded metric, several fixture discontinuities become smoother.</mark> Other cases remain uncertain because checkpoints are sparse.</p>
            <table id="anchor-table" className={`document-table ${activeAnchor === 'anchor-table' ? 'is-active' : ''}`}><caption>Table 2. Synthetic interaction data; not copied from the selected paper.</caption><thead><tr><th scope="col">Task</th><th scope="col">Original</th><th scope="col">Continuous</th></tr></thead><tbody><tr><td>Task A</td><td>Sharp</td><td>Smooth</td></tr><tr><td>Task B</td><td>Sharp</td><td>Uncertain</td></tr><tr><td>Task C</td><td>Gradual</td><td>Gradual</td></tr></tbody></table>
            <p><mark>The fixture supports a measurement-sensitive interpretation for a subset of cases, not a universal conclusion.</mark></p>
          </section>
          <section id="anchor-limit" className={anchorClass('anchor-limit')}><h2>5 Limitations</h2><p>This interface cannot observe latent capability, and its synthetic continuous metric makes assumptions of its own. Comparisons across model families require real paper text and verified provenance.</p><p><mark>Absence of a discontinuity under one metric is not proof that no meaningful qualitative change occurs elsewhere.</mark></p></section>
          <section><h2>6 Discussion</h2><p>All visible prose exists to validate reader layout, Claim review, page anchors and the separation between source evidence and AI proposals.</p></section>
        </div>
        <span className="document-page-number">2</span>
      </article>
    </>
  );
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

function GuidePanel({ paper, claims, onJump, onOpenLedger, localMode }: { paper: PaperFixture; claims: ClaimFixture[]; onJump: (anchor: string) => void; onOpenLedger: () => void; localMode: boolean }) {
  const steps: Array<[string, string, string]> = [
    ['anchor-abstract', '摘要', '确认研究问题与证据范围'],
    ['anchor-table', 'Table 2', '比较原指标与连续指标'],
    ['anchor-result', '主结果', '检查“部分任务”是否被泛化'],
    ['anchor-limit', '局限', '区分作者承认与 AI 推断'],
  ];
  if (localMode) {
    return <>
      <PanelIntro eyebrow="Local PDF · evidence first" title="先固定原文，再审阅提案。">选区、Anchor、Draft 与审阅记录都保存在本机；当前审阅内容是明确标记的固定 fixture，没有调用模型。</PanelIntro>
      <section className="guide-card"><header><MapPin size={17} /><h3>本地工作流</h3></header><ol><li>选择 PDF 正文并创建 Anchor。</li><li>在“证据”页确认可回跳与可见标记。</li><li>逐条接受、编辑或驳回本地审阅 fixture。</li></ol></section>
      <Button variant="primary" className="full-width" onClick={onOpenLedger}>打开正式审阅 <ChevronRight size={16} /></Button>
    </>;
  }
  return <>
    <PanelIntro eyebrow="Pre-read · synthetic fixture" title="先形成阅读假设，再去核验证据。">这不是最终总结。导引仅说明为什么读、先读哪里，以及哪些问题需要用户判断。</PanelIntro>
    <section className="guide-card"><header><Target size={17} /><h3>为什么在当前路径中</h3></header><p>{paper.rationale}</p></section>
    <section className="guide-card"><header><Route size={17} /><h3>推荐阅读路径</h3></header><div className="guide-steps">{steps.map(([anchor, title, detail], index) => <button type="button" key={anchor} onClick={() => onJump(anchor)}><span>{index + 1}</span><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={16} /></button>)}</div></section>
    <section className="guide-card"><header><ShieldAlert size={17} /><h3>阅读时需要验证</h3></header><ul><li>论文反驳的是能力跃迁，还是特定指标下的跃迁外观？</li><li>任务、检查点和 prompting 是否足够可比？</li><li>结论适用于哪些任务，哪些仍不确定？</li></ul></section>
    <Button variant="primary" className="full-width" onClick={onOpenLedger}>查看 {claims.length} 条待审阅 Claim <ChevronRight size={16} /></Button>
  </>;
}

function LedgerPanel({ claims, onJump }: { claims: ClaimFixture[]; onJump: (anchor: string) => void }) {
  const verified = claims.filter((claim) => claim.status === 'verified' || claim.status === 'edited').length;
  return <>
    <PanelIntro eyebrow="Evidence Ledger · read-only fixture" title="导入本地 PDF 后启用正式审阅。">这些合成 Claim 只说明布局；正式接受、编辑和驳回必须写入本地仓库。</PanelIntro>
    <div className="review-summary"><span><strong>{verified} / {claims.length} 已验证</strong><small>数字和 AI 推断不支持批量接受</small></span><strong>{Math.round((verified / Math.max(claims.length, 1)) * 100)}%</strong></div>
    {claims.map((claim) => <ClaimCard key={claim.id} claim={claim} onJump={onJump} />)}
  </>;
}

function ClaimCard({ claim, onJump }: { claim: ClaimFixture; onJump: (anchor: string) => void }) {
  const statusLabel = { draft: 'Draft', verified: 'Verified', edited: 'Verified · edited', rejected: 'Rejected' }[claim.status];

  return <article className={`claim-card is-${claim.status}`}>
    <header><span>{claim.sourceLabel}</span><small>{claim.confidence}%</small><strong>{statusLabel}</strong></header>
    <p className="claim-text">{claim.text}</p>
    <div className="anchor-chips">{claim.anchors.map((anchor) => <button type="button" key={anchor.id} onClick={() => onJump(anchor.id)}>p.{anchor.page} · {anchor.label}</button>)}</div>
    <p className="scope-note">{claim.scope}</p>
    <footer>
      <Button size="small" variant="ghost" className="claim-source" onClick={() => {
        const anchor = claim.anchors[0];
        if (anchor) onJump(anchor.id);
      }}>查看合成原文</Button>
    </footer>
  </article>;
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

function AskPanel({ onJump }: { onJump: (anchor: string) => void }) {
  const [input, setInput] = useState('');
  const [questions, setQuestions] = useState<Array<{ role: 'user' | 'fixture'; text: string }>>([]);
  const suggestions = ['这篇真正反驳了什么？', 'Table 2 能否外推？', '与基石论文的定义有何不同？'];
  const answer = useMemo(() => 'Fixture 回答：当前界面只能说明应区分“指标制造的断点”与“底层能力的变化”。请回到合成 Anchor 检查范围；这不是模型输出，也不是论文事实。', []);

  const submit = () => {
    const question = input.trim();
    if (!question) return;
    setQuestions((items) => [...items, { role: 'user', text: question }, { role: 'fixture', text: answer }]);
    setInput('');
  };

  return <>
    <PanelIntro eyebrow="Grounded Q&A · fixture" title="问题范围：当前合成文档。">没有模型调用。回答固定标记为 fixture，不能进入知识库。</PanelIntro>
    <div className="suggested-questions">{suggestions.map((question) => <button type="button" key={question} onClick={() => setInput(question)}>{question}</button>)}</div>
    <div className="chat-history">{questions.length ? questions.map((message, index) => <article className={`chat-message is-${message.role}`} key={`${message.role}-${index}`}><strong>{message.role === 'user' ? '你' : 'Fixture response'}</strong><p>{message.text}</p>{message.role === 'fixture' ? <div className="anchor-chips"><button type="button" onClick={() => onJump('anchor-result')}>p.2 · 主结果</button><button type="button" onClick={() => onJump('anchor-limit')}>p.2 · 局限</button></div> : null}</article>) : <p className="chat-empty">选择一个示例问题，或输入自己的验证问题。</p>}</div>
    <div className="ask-box"><label><span className="sr-only">问题</span><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="询问方法、证据或范围…" /></label><Button variant="primary" size="small" icon={<MessageSquareText size={15} />} onClick={submit}>添加 fixture 回答</Button></div>
  </>;
}
