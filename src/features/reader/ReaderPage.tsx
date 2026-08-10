import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  Ellipsis,
  FileUp,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import {
  JUDGMENT_SECTION_KEYS,
  type DraftProposal,
  type DraftReviewDecision,
  type EvidenceAnchor,
  type EvidenceLink,
  type EvidenceRelation,
  type JudgmentNote,
  type JudgmentSectionKey,
  type Paper,
  type ReviewAction,
  type VerifiedClaim,
} from '../../domain';
import { validateAnchor } from '../../domain';
import {
  LocalPdfViewer,
  type AnchorLocationState,
  type LocalPdfAnchor,
} from '../LocalPdfViewer';

export type ReaderTab = 'guide' | 'anchors' | 'ledger' | 'judgment';

export interface PersistedReviewEntry {
  draft: DraftProposal;
  evidenceLinks: readonly EvidenceLink[];
  reviewAction: ReviewAction | null;
  verifiedClaim: VerifiedClaim | null;
}

interface ReaderPageProps {
  paper: Paper;
  judgment: JudgmentNote;
  verifiedClaims: readonly VerifiedClaim[];
  onBack: () => void;
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
  onCreateManualDraft: (anchorId: string, claimText: string, relation: EvidenceRelation) => Promise<void>;
  onRequestAiDraft: (anchorId: string) => Promise<void>;
  onReviewDraft: (draftId: string, decision: DraftReviewDecision) => Promise<void>;
  onSaveJudgment: (judgment: JudgmentNote) => Promise<void>;
  onExportMarkdown: () => void;
}

const tabs: Array<[ReaderTab, string]> = [
  ['guide', '流程'],
  ['anchors', '证据'],
  ['ledger', '审阅'],
  ['judgment', '我的判断'],
];

export function ReaderPage({
  paper,
  judgment,
  verifiedClaims,
  onBack,
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
  onCreateManualDraft,
  onRequestAiDraft,
  onReviewDraft,
  onSaveJudgment,
  onExportMarkdown,
}: ReaderPageProps) {
  const [tab, setTab] = useState<ReaderTab>('guide');
  const [researchOpen, setResearchOpen] = useState(() => window.innerWidth >= 1024);
  const [outlineOpen, setOutlineOpen] = useState(() => window.innerWidth >= 1240);
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false);
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const [anchorStates, setAnchorStates] = useState<ReadonlyMap<string, AnchorLocationState>>(() => new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolbarMenuRef = useRef<HTMLDivElement>(null);
  const verifiedCount = persistedReviews.filter((entry) => entry.verifiedClaim !== null).length;
  const pendingCount = persistedReviews.filter((entry) => entry.reviewAction === null).length;
  const draftAnchorIds = useMemo(
    () => new Set(persistedReviews.flatMap((entry) => entry.evidenceLinks.map((link) => link.anchorId))),
    [persistedReviews],
  );

  const updateAnchorStates = useCallback((states: readonly AnchorLocationState[]) => {
    setAnchorStates(new Map(states.map((state) => [state.anchorId, state])));
  }, []);

  const stateForAnchor = (anchor: EvidenceAnchor): AnchorLocationState => {
    if (!localPdfFile) {
      return { anchorId: anchor.id, status: 'pdf-missing', message: localPdfError ?? '本地 PDF 缺失；请重新导入原文件。' };
    }
    const rendered = anchorStates.get(anchor.id);
    if (rendered) return rendered;
    const validation = validateAnchor(anchor);
    if (!validation.valid) {
      return { anchorId: anchor.id, status: 'corrupt', message: `Anchor 数据损坏：${validation.issues.map((issue) => issue.code).join('、')}` };
    }
    if (anchor.relocationStatus === 'orphaned') {
      return { anchorId: anchor.id, status: 'orphaned', message: 'Anchor 已孤立；请在当前 PDF 中重新选择原文。' };
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

  return <div className="reader-shell">
    <header className="reader-toolbar">
      <Button variant="secondary" className="icon-button" aria-label="返回文献库" onClick={onBack}><ArrowLeft size={19} /></Button>
      <div className="reader-title"><strong>{paper.title}</strong><span>{paper.authors.length ? paper.authors.join(', ') : '作者信息未录入'}{paper.year ? ` · ${paper.year}` : ''} · 本地 PDF</span></div>
      <span className="toolbar-state"><i />{persistenceLabel}</span>
      <span className="toolbar-state">{verifiedCount} Verified · {pendingCount} 待审阅</span>
      <input ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) onImportPdf(file);
        event.target.value = '';
      }} />
      <div className="reader-toolbar-menu" ref={toolbarMenuRef}>
        <Button variant="secondary" className="icon-button" aria-label="更多文档操作" aria-expanded={toolbarMenuOpen} onClick={() => setToolbarMenuOpen((value) => !value)}><Ellipsis size={19} /></Button>
        {toolbarMenuOpen ? <div className="reader-toolbar-popover" role="menu">
          <button type="button" role="menuitem" onClick={() => {
            setToolbarMenuOpen(false);
            if (nativeFileDialog) onImportPdf();
            else fileInputRef.current?.click();
          }}><FileUp size={16} /><span>更换 PDF</span></button>
          <button type="button" role="menuitem" onClick={() => { setToolbarMenuOpen(false); onExportMarkdown(); }}><Download size={16} /><span>导出 Verified Markdown</span></button>
        </div> : null}
      </div>
      <Button variant="secondary" className="reader-panel-toggle" icon={<PanelRightOpen size={17} />} aria-expanded={researchOpen} onClick={() => setResearchOpen((value) => !value)}>研究面板</Button>
    </header>

    <div className={`reader-grid ${outlineOpen ? '' : 'is-outline-collapsed'}`}>
      <aside className="reader-outline" aria-label="本地 Evidence Anchor">
        <div className="outline-context">
          <div><small>本地文档</small><strong>{localAnchors.length} 个 Evidence Anchor</strong></div>
          <button type="button" className="outline-toggle" aria-label={outlineOpen ? '收起 Evidence Anchor' : '展开 Evidence Anchor'} aria-expanded={outlineOpen} onClick={() => setOutlineOpen((value) => !value)}>{outlineOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
          <p>选区与坐标只保存在本地，可随时回到原始 PDF。</p>
        </div>
        <LocalAnchorList anchors={localAnchors} stateForAnchor={stateForAnchor} onJump={jumpToLocalAnchor} compact />
      </aside>

      <main className="document-stage has-live-pdf" aria-label="本地 PDF 正文">
        {localPdfFile && localPaperVersionId
          ? <LocalPdfViewer file={localPdfFile} anchors={localAnchors} expectedPaperVersionId={localPaperVersionId} activeAnchorId={activeAnchor} onAnchorCreate={onAnchorCreate} onAnchorStatesChange={updateAnchorStates} />
          : <div className="reader-error reader-error--document"><AlertTriangle size={20} /><strong>本地 PDF 无法恢复</strong><p>{localPdfError ?? 'PDF 文件缺失；Anchor 与审阅记录仍保留在本地仓库。'}</p></div>}
      </main>

      <button type="button" className={`research-scrim ${researchOpen ? 'is-open' : ''}`} aria-label="关闭研究面板" onClick={() => setResearchOpen(false)} />
      <aside className={`research-panel ${researchOpen ? 'is-open' : ''}`} aria-label="研究面板">
        <div className="research-panel__mobile-head"><strong>研究面板</strong><Button variant="ghost" className="icon-button" aria-label="关闭研究面板" onClick={() => setResearchOpen(false)}><X size={18} /></Button></div>
        <div className="research-tabs" role="tablist" aria-label="论文研究工具">
          {tabs.map(([value, label]) => <button type="button" role="tab" id={`reader-tab-${value}`} aria-controls={`reader-panel-${value}`} aria-selected={tab === value} className={tab === value ? 'is-active' : ''} key={value} onClick={() => setTab(value)}>
            {label}{value === 'ledger' && pendingCount ? <span>{pendingCount}</span> : value === 'anchors' && localAnchors.length ? <span>{localAnchors.length}</span> : null}
          </button>)}
        </div>
        <div className="research-content" role="tabpanel" id={`reader-panel-${tab}`} aria-labelledby={`reader-tab-${tab}`}>
          {tab === 'guide' ? <GuidePanel onChoose={chooseTab} /> : null}
          {tab === 'anchors' ? <LocalAnchorPanel anchors={localAnchors} stateForAnchor={stateForAnchor} onJump={jumpToLocalAnchor} onCreateManualDraft={onCreateManualDraft} onRequestAiDraft={onRequestAiDraft} draftAnchorIds={draftAnchorIds} /> : null}
          {tab === 'ledger' ? <PersistedLedgerPanel entries={persistedReviews} anchors={localAnchors} onJump={jumpToLocalAnchor} onReview={onReviewDraft} /> : null}
          {tab === 'judgment' ? <JudgmentPanel judgment={judgment} verifiedClaims={verifiedClaims} persistenceLabel={persistenceLabel} onSave={onSaveJudgment} onJump={(claimId) => {
            const entry = persistedReviews.find((candidate) => candidate.verifiedClaim?.id === claimId);
            const anchorId = entry?.evidenceLinks[0]?.anchorId;
            const anchor = localAnchors.find((candidate) => candidate.id === anchorId);
            if (anchor) jumpToLocalAnchor(anchor);
          }} /> : null}
        </div>
      </aside>
    </div>
  </div>;
}

export function ReaderEmptyState({ nativeFileDialog, onBack, onImportPdf }: { nativeFileDialog: boolean; onBack: () => void; onImportPdf: (file?: File) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startImport = () => nativeFileDialog ? onImportPdf() : fileInputRef.current?.click();
  return <div className="reader-shell">
    <header className="reader-toolbar"><Button variant="secondary" className="icon-button" aria-label="返回文献库" onClick={onBack}><ArrowLeft size={19} /></Button><div className="reader-title"><strong>阅读器</strong><span>只打开真实的本地 PDF</span></div></header>
    <input ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" aria-label="选择本地 PDF" onChange={(event) => {
      const file = event.target.files?.[0];
      if (file) onImportPdf(file);
      event.target.value = '';
    }} />
    <main className="page"><div className="empty-state"><h2>没有打开的论文</h2><p>从文献库选择一篇论文，或现在导入本地 PDF。</p><Button variant="primary" icon={<FileUp size={17} />} onClick={startImport}>导入 PDF</Button></div></main>
  </div>;
}

function PanelIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children: string }) {
  return <header className="panel-intro"><small>{eyebrow}</small><h2>{title}</h2><p>{children}</p></header>;
}

const anchorStatusLabels: Record<AnchorLocationState['status'], string> = {
  loading: '恢复中', ready: '可定位', orphaned: '已孤立', corrupt: '已损坏', 'pdf-corrupt': 'PDF 损坏', 'pdf-mismatch': 'PDF 不匹配', 'page-invalid': '页码失效', 'pdf-missing': 'PDF 缺失',
};

function LocalAnchorList({ anchors, stateForAnchor, onJump, compact = false }: { anchors: readonly EvidenceAnchor[]; stateForAnchor: (anchor: EvidenceAnchor) => AnchorLocationState; onJump: (anchor: EvidenceAnchor) => void; compact?: boolean }) {
  if (anchors.length === 0) return <p className="local-outline-message">选择正文文字后创建 Anchor；正文与坐标不会上传。</p>;
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

function LocalAnchorPanel({ anchors, stateForAnchor, onJump, onCreateManualDraft, onRequestAiDraft, draftAnchorIds }: {
  anchors: readonly EvidenceAnchor[];
  stateForAnchor: (anchor: EvidenceAnchor) => AnchorLocationState;
  onJump: (anchor: EvidenceAnchor) => void;
  onCreateManualDraft: (anchorId: string, claimText: string, relation: EvidenceRelation) => Promise<void>;
  onRequestAiDraft: (anchorId: string) => Promise<void>;
  draftAnchorIds: ReadonlySet<string>;
}) {
  const [editingAnchorId, setEditingAnchorId] = useState<string | null>(null);
  const [claimText, setClaimText] = useState('');
  const [relation, setRelation] = useState<EvidenceRelation>('support');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (anchorId: string) => {
    setPending(true);
    setError(null);
    try {
      await onCreateManualDraft(anchorId, claimText, relation);
      setEditingAnchorId(null);
      setClaimText('');
      setRelation('support');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Draft 未保存。');
    } finally {
      setPending(false);
    }
  };

  const requestAi = async (anchorId: string) => {
    setPending(true);
    setError(null);
    try {
      await onRequestAiDraft(anchorId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI Draft 不可用。');
    } finally {
      setPending(false);
    }
  };

  return <>
    <PanelIntro eyebrow="Evidence Anchors" title="把原文固定为可回跳证据。">每条 Claim 通过独立 EvidenceLink 关联支持、反证、限定或上下文。</PanelIntro>
    <LocalAnchorList anchors={anchors} stateForAnchor={stateForAnchor} onJump={onJump} />
    {anchors.map((anchor) => <section className="anchor-actions" key={`${anchor.id}-actions`}>
      <div className="anchor-actions__head"><span>p.{anchor.pageIndex + 1}{draftAnchorIds.has(anchor.id) ? ' · 已有关联 Draft' : ''}</span><button type="button" onClick={() => { setEditingAnchorId(anchor.id); setError(null); }}>写人工 Draft</button></div>
      {editingAnchorId === anchor.id ? <div className="manual-draft-form">
        <label><span>原子 Claim</span><textarea value={claimText} onChange={(event) => setClaimText(event.target.value)} placeholder="用自己的话写出一条可审核主张" autoFocus /></label>
        <label><span>与证据关系</span><select value={relation} onChange={(event) => setRelation(event.target.value as EvidenceRelation)}><option value="support">支持</option><option value="counter">反证</option><option value="qualify">限定</option><option value="context">上下文</option></select></label>
        <div><Button size="small" variant="primary" disabled={pending} onClick={() => void submit(anchor.id)}>保存为待审阅 Draft</Button><Button size="small" disabled={pending} onClick={() => setEditingAnchorId(null)}>取消</Button></div>
      </div> : null}
      <Button size="small" variant="secondary" className="full-width" icon={<Sparkles size={14} />} disabled={pending} onClick={() => void requestAi(anchor.id)}>请求 AI Draft（接口保留）</Button>
    </section>)}
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
  </>;
}

function PersistedLedgerPanel({ entries, anchors, onJump, onReview }: { entries: readonly PersistedReviewEntry[]; anchors: readonly EvidenceAnchor[]; onJump: (anchor: EvidenceAnchor) => void; onReview: (draftId: string, decision: DraftReviewDecision) => Promise<void> }) {
  const verified = entries.filter((entry) => entry.verifiedClaim !== null).length;
  const rejected = entries.filter((entry) => entry.reviewAction?.toStatus === 'rejected').length;
  return <>
    <PanelIntro eyebrow="Human Review Gate" title="Draft、ReviewAction 与 Verified 分层保存。">人工或 AI Draft 都不能直接进入最终知识；必须逐条接受、编辑或驳回。</PanelIntro>
    <div className="review-summary"><span><strong>{verified} Verified · {rejected} Rejected</strong><small>{entries.length - verified - rejected} 条待审阅</small></span><strong>{Math.round((verified / Math.max(entries.length, 1)) * 100)}%</strong></div>
    {entries.length === 0 ? <p className="chat-empty">先创建 Evidence Anchor，再写一条人工 Draft；AI 接口未配置不会阻塞人工流程。</p> : null}
    {entries.map((entry) => <PersistedClaimCard key={entry.draft.id} entry={entry} anchors={anchors} onJump={onJump} onReview={onReview} />)}
  </>;
}

const sourceLabels: Record<DraftProposal['epistemicSource'], string> = {
  direct_quote: '直接引文', author_claim: '作者主张', reported_result: '报告结果', ai_inference: 'AI 推断', user_judgment: '用户判断', external_metadata: '外部元数据',
};
const relationLabels: Record<EvidenceRelation, string> = { support: '支持', counter: '反证', qualify: '限定', context: '上下文' };

function PersistedClaimCard({ entry, anchors, onJump, onReview }: { entry: PersistedReviewEntry; anchors: readonly EvidenceAnchor[]; onJump: (anchor: EvidenceAnchor) => void; onReview: (draftId: string, decision: DraftReviewDecision) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(entry.draft.claimText);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = entry.reviewAction?.toStatus ?? 'draft';
  const statusLabel = { draft: 'Draft', accepted: 'Verified · accepted', edited: 'Verified · edited', rejected: 'Rejected', stale: 'Stale' }[status];
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
    if (!claimText) return setError('编辑后的 Claim 不能为空。');
    void review({ action: 'edit_and_accept', patch: { claimText } });
  };

  return <article className={`claim-card is-${status}`}>
    <header><span>{entry.draft.createdBy === 'ai' ? 'AI Draft' : '人工 Draft'} · {sourceLabels[entry.draft.epistemicSource]}</span><small>{Math.round(entry.draft.confidence * 100)}%</small><strong>{statusLabel}</strong></header>
    {editing ? <label className="claim-editor"><span>编辑 Claim 文本</span><textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} autoFocus /></label> : <p className="claim-text">{visibleClaim.claimText}</p>}
    {status === 'edited' ? <p className="original-draft"><strong>原始 Draft（未改写）</strong>{entry.draft.claimText}</p> : null}
    <div className="anchor-chips">{entry.evidenceLinks.map((link) => {
      const anchor = anchors.find((candidate) => candidate.id === link.anchorId);
      return anchor ? <button type="button" key={link.id} onClick={() => onJump(anchor)}>p.{anchor.pageIndex + 1} · {relationLabels[link.relation]}</button> : <span className="anchor-chip-error" key={link.id}>Anchor 缺失 · {link.anchorId}</span>;
    })}</div>
    {entry.reviewAction ? <p className="review-provenance">ReviewAction · {entry.reviewAction.action} · {entry.reviewAction.occurredAt}</p> : null}
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
    {!entry.reviewAction ? <footer>{editing ? <><Button size="small" variant="primary" disabled={pending} onClick={saveEdit}>保存编辑并验证</Button><Button size="small" disabled={pending} onClick={() => { setDraftText(entry.draft.claimText); setEditing(false); setError(null); }}>取消</Button></> : <><Button size="small" disabled={pending} onClick={() => void review({ action: 'accept' })} icon={<Check size={14} />}>接受</Button><Button size="small" disabled={pending} onClick={() => setEditing(true)}>编辑</Button><Button size="small" variant="danger" disabled={pending} onClick={() => void review({ action: 'reject', rejectionReason: 'other', reason: '用户在 Reader 审阅中驳回。' })}>驳回</Button></>}</footer> : null}
  </article>;
}

function GuidePanel({ onChoose }: { onChoose: (tab: ReaderTab) => void }) {
  return <>
    <PanelIntro eyebrow="Evidence first · local only" title="从原文到自己的判断。">没有自动写入知识：原文先成为 Anchor，Claim 必须审核，最终判断始终由你完成。</PanelIntro>
    <section className="guide-card"><header><MapPin size={17} /><h3>唯一工作流</h3></header><ol><li>在 PDF 中选择原文，创建可回跳 Anchor。</li><li>基于 Anchor 写人工 Draft；未来也可请求 AI Draft。</li><li>逐条接受、编辑或驳回，形成 Verified Claim。</li><li>在“我的判断”中引用 Verified Claim 并完成结论。</li></ol></section>
    <Button variant="primary" className="full-width" onClick={() => onChoose('anchors')}>开始固定证据 <ChevronRight size={16} /></Button>
  </>;
}

const judgmentLabels: Record<JudgmentSectionKey, [string, string]> = {
  judgment: ['核心判断', '你最终相信什么？'],
  reasoning: ['推理', '这些证据为什么支持你的判断？'],
  supportingEvidence: ['支持证据', '最有力的 Verified Claim 是什么？'],
  counterEvidence: ['反方证据', '哪些证据会削弱或限定判断？'],
  uncertainties: ['仍不确定', '目前无法从论文确认什么？'],
  nextValidation: ['下一步验证', '接下来准备查证或复现什么？'],
};

function JudgmentPanel({ judgment, verifiedClaims, persistenceLabel, onSave, onJump }: { judgment: JudgmentNote; verifiedClaims: readonly VerifiedClaim[]; persistenceLabel: string; onSave: (judgment: JudgmentNote) => Promise<void>; onJump: (claimId: string) => void }) {
  const [draft, setDraft] = useState(judgment);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(judgment), [judgment]);

  const updateText = (key: JudgmentSectionKey, text: string) => setDraft((current) => ({
    ...current,
    sections: { ...current.sections, [key]: { ...current.sections[key], text } },
  }));
  const toggleClaim = (key: JudgmentSectionKey, claimId: string) => setDraft((current) => {
    const ids = current.sections[key].verifiedClaimIds;
    return {
      ...current,
      sections: {
        ...current.sections,
        [key]: { ...current.sections[key], verifiedClaimIds: ids.includes(claimId) ? ids.filter((id) => id !== claimId) : [...ids, claimId] },
      },
    };
  });
  const persist = async (status: JudgmentNote['status']) => {
    setPending(true);
    setError(null);
    const now = new Date().toISOString();
    try {
      await onSave({ ...draft, status, updatedAt: now, completedAt: status === 'complete' ? now : null });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '“我的判断”未保存。');
    } finally {
      setPending(false);
    }
  };

  return <>
    <PanelIntro eyebrow="User-owned output" title="我的判断">AI 无权写入此处；只有 Verified Claim 可以作为引用，且每条都能回跳 PDF。</PanelIntro>
    <p className="judgment-status"><strong>{draft.status === 'complete' ? '已完成' : '草稿'}</strong><span>{persistenceLabel}</span></p>
    {JUDGMENT_SECTION_KEYS.map((key) => <section className="judgment-section" key={key}>
      <label><strong>{judgmentLabels[key][0]}</strong><small>{judgmentLabels[key][1]}</small><textarea value={draft.sections[key].text} onChange={(event) => updateText(key, event.target.value)} /></label>
      <div className="judgment-claims">
        {verifiedClaims.length === 0 ? <small>完成前需先审核通过至少一条 Claim。</small> : verifiedClaims.map((claim) => <label key={claim.id} className={draft.sections[key].verifiedClaimIds.includes(claim.id) ? 'is-selected' : ''}>
          <input type="checkbox" checked={draft.sections[key].verifiedClaimIds.includes(claim.id)} onChange={() => toggleClaim(key, claim.id)} />
          <span>{claim.claimText}</span><button type="button" onClick={(event) => { event.preventDefault(); onJump(claim.id); }}>回到证据</button>
        </label>)}
      </div>
    </section>)}
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
    <div className="judgment-actions"><Button disabled={pending} onClick={() => void persist('draft')}>保存草稿</Button><Button variant="primary" disabled={pending} onClick={() => void persist('complete')}>完成我的判断</Button></div>
  </>;
}
