import { Check, GitBranch, Library, ShieldCheck } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from './components/AppShell';
import { Button } from './components/Button';
import { CommandPalette } from './components/CommandPalette';
import { Dialog } from './components/Dialog';
import { ToastRegion, type ToastMessage } from './components/ToastRegion';
import {
  createClaimFixtures,
  syncPreviewFixture,
  themeFixtures,
  type AppView,
  type ClaimFixture,
  type PaperFixture,
  type ThemeFixture,
} from './data/fixtures';
import { DiscoverPage } from './features/discover/DiscoverPage';
import { KnowledgePage } from './features/knowledge/KnowledgePage';
import { LibraryPage } from './features/library/LibraryPage';
import { ReaderPage } from './features/reader/ReaderPage';
import type { PersistedReviewEntry } from './features/reader/ReaderPage';
import { ReadingHome } from './features/reading/ReadingHome';
import { SettingsPage } from './features/settings/SettingsPage';
import { SyncPage } from './features/sync/SyncPage';
import type { LocalPdfAnchor } from './features/LocalPdfViewer';
import type {
  DraftProposal,
  DraftReviewDecision,
  EvidenceAnchor,
  NoteBlock,
  Paper,
  ReviewAction,
  SyncPlan,
  VerifiedClaim,
} from './domain';
import { reviewDraftProposal } from './domain';
import { createLocalReviewDrafts, createWorkspaceRepository } from './services';

export interface PaperWeaveUiAdapters {
  generatePack?: (query: string) => Promise<{ themeId: string } | null>;
  onSyncPreviewOpened?: (context: { paperId: string; themeId: string }) => void;
}

export interface AppProps {
  adapters?: PaperWeaveUiAdapters;
  fixtureThemes?: ThemeFixture[];
}

type OpenDialog = 'sync-preview' | 'pack-rationale' | null;

interface LocalDocument {
  paper: Paper;
  file: File | null;
  pdfError: string | null;
  anchors: EvidenceAnchor[];
  drafts: DraftProposal[];
  reviewActions: ReviewAction[];
  verifiedClaims: VerifiedClaim[];
  note: string;
}

const defaultNotes = `# 我的判断

读前预期：

最强证据：

我仍不相信：

这篇如何改变我对主题的认识：

下一步可检验行动：`;

export default function App({ adapters, fixtureThemes = themeFixtures }: AppProps) {
  const repository = useMemo(() => createWorkspaceRepository({ global: globalThis }), []);
  const [view, setView] = useState<AppView>('discover');
  const [themeId, setThemeId] = useState(fixtureThemes[0]?.id ?? 'emergence');
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [pinnedPaperIds, setPinnedPaperIds] = useState(() => new Set<string>(['wei-2022']));
  const [claimsByPaper, setClaimsByPaper] = useState<Record<string, ClaimFixture[]>>({});
  const [notesByPaper, setNotesByPaper] = useState<Record<string, string>>({});
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [localDocument, setLocalDocument] = useState<LocalDocument | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<'initializing' | 'ready' | 'error'>('initializing');
  const [lastSyncPlan, setLastSyncPlan] = useState<SyncPlan | null>(null);

  const activeTheme = useMemo(
    () => fixtureThemes.find((theme) => theme.id === themeId) ?? fixtureThemes[0],
    [fixtureThemes, themeId],
  );

  const paperIndex = useMemo(() => {
    const index = new Map<string, { paper: PaperFixture; theme: ThemeFixture }>();
    for (const theme of fixtureThemes) {
      for (const paper of theme.papers) index.set(paper.id, { paper, theme });
    }
    return index;
  }, [fixtureThemes]);

  const selectedPaperHit = selectedPaperId ? paperIndex.get(selectedPaperId) : undefined;

  const pushToast = useCallback((title: string, detail: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((messages) => [...messages, { id, title, detail }].slice(-3));
    window.setTimeout(() => setToasts((messages) => messages.filter((message) => message.id !== id)), 4200);
  }, []);

  const closeDialog = useCallback(() => setOpenDialog(null), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useEffect(() => {
    let cancelled = false;
    void repository.initialize().then(async (snapshot) => {
      if (cancelled) return;
      const paper = snapshot.papers.at(-1);
      if (paper) {
        const anchors = snapshot.anchors.filter((anchor) => anchor.paperVersionId === paper.currentVersionId);
        const drafts = snapshot.drafts.filter((draft) => draft.paperId === paper.id);
        const draftIds = new Set(drafts.map((draft) => draft.id));
        const reviewActions = snapshot.reviewActions.filter((action) => draftIds.has(action.claimId));
        const verifiedClaims = snapshot.verifiedClaims.filter((claim) => claim.paperId === paper.id);
        const note = snapshot.userNotes.filter((item) => item.paperId === paper.id).at(-1)?.content ?? defaultNotes;
        try {
          const bytes = await repository.loadPdfBytes(paper.id);
          if (!bytes) throw new Error('本地仓库保留了论文记录，但 PDF 内容文件缺失。');
          if (!cancelled) {
            setLocalDocument({
              paper,
              file: new File([bytes], `${paper.title}.pdf`, { type: 'application/pdf' }),
              pdfError: null,
              anchors,
              drafts,
              reviewActions,
              verifiedClaims,
              note,
            });
          }
        } catch (reason) {
          if (!cancelled) {
            setLocalDocument({
              paper,
              file: null,
              pdfError: reason instanceof Error ? reason.message : '无法从本地仓库读取 PDF。',
              anchors,
              drafts,
              reviewActions,
              verifiedClaims,
              note,
            });
          }
        }
        const restoredPaperId = fixtureThemes[0]?.papers[0]?.id;
        if (!cancelled && restoredPaperId) {
          setSelectedPaperId(restoredPaperId);
          setView('reader');
        }
      }
      if (!cancelled) setWorkspaceStatus('ready');
    }).catch(() => {
      if (!cancelled) setWorkspaceStatus('error');
    });
    return () => { cancelled = true; };
  }, [repository]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteQuery('');
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  if (!activeTheme) {
    return <main className="fatal-state"><h1>无法加载 fixture</h1><p>至少需要一个主题数据集。</p></main>;
  }

  const navigate = (nextView: AppView) => {
    setView(nextView);
    if (nextView !== 'reader') setSelectedPaperId(null);
  };

  const openPaper = (paperId: string) => {
    const hit = paperIndex.get(paperId);
    if (!hit) return;
    setThemeId(hit.theme.id);
    setSelectedPaperId(paperId);
    setClaimsByPaper((current) => current[paperId] ? current : { ...current, [paperId]: createClaimFixtures(hit.paper) });
    setNotesByPaper((current) => current[paperId] ? current : { ...current, [paperId]: defaultNotes });
    setView('reader');
  };

  const generatePack = async (query: string) => {
    let nextThemeId = /rag|检索增强|retrieval/i.test(query)
      ? 'rag'
      : /规模|scaling|chinchilla|compute/i.test(query)
        ? 'scaling'
        : 'emergence';

    if (adapters?.generatePack) {
      try {
        const result = await adapters.generatePack(query);
        if (result?.themeId) nextThemeId = result.themeId;
      } catch {
        pushToast('适配器未返回结果', '已保留本地 fixture，不会静默发起其他外部请求。');
      }
    }

    if (!fixtureThemes.some((theme) => theme.id === nextThemeId)) nextThemeId = fixtureThemes[0]?.id ?? themeId;
    setThemeId(nextThemeId);
    pushToast('Fixture 阅读包已切换', '没有执行网络检索；候选来自明确标记的本地演示数据。');
  };

  const openSyncPreview = () => {
    const paperId = selectedPaperId ?? activeTheme.papers[0]?.id;
    if (paperId) adapters?.onSyncPreviewOpened?.({ paperId, themeId: activeTheme.id });
    if (localDocument) {
      void repository.previewSync({ paperIds: [localDocument.paper.id], target: 'git' })
        .then(setLastSyncPlan)
        .catch(() => pushToast('无法生成本地同步计划', '没有执行任何 Zotero、Git 或 GitHub 操作。'));
    } else {
      setLastSyncPlan(null);
    }
    setOpenDialog('sync-preview');
  };

  const importLocalPdf = async (file?: File) => {
    try {
      let imported;
      let displayFile: File;
      if (repository.runtime === 'tauri') {
        const selectedPath = await open({
          multiple: false,
          directory: false,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        if (typeof selectedPath !== 'string') return;
        imported = await repository.importPdf({ kind: 'local-path', path: selectedPath });
        const bytes = await repository.loadPdfBytes(imported.paper.id);
        if (!bytes) throw new Error('本地 PDF 已登记，但无法从加密边界内读取。');
        displayFile = new File([bytes], `${imported.paper.title}.pdf`, { type: 'application/pdf' });
      } else {
        if (!file) return;
        imported = await repository.importPdf({ kind: 'browser-file', file });
        displayFile = file;
      }
      setLocalDocument({
        paper: imported.paper,
        file: displayFile,
        pdfError: null,
        anchors: [],
        drafts: [],
        reviewActions: [],
        verifiedClaims: [],
        note: defaultNotes,
      });
      pushToast(
        '本地 PDF 已导入',
        repository.runtime === 'tauri'
          ? '文件副本已进入本机内容寻址 vault；没有上传。'
          : '文件保存在浏览器本地存储；没有上传。',
      );
    } catch (reason) {
      pushToast('PDF 导入失败', reason instanceof Error ? reason.message : '无法读取所选文件。');
    }
  };

  const saveLocalAnchor = (selection: LocalPdfAnchor) => {
    const current = localDocument;
    if (!current?.paper.currentVersionId) return;
    const anchor: EvidenceAnchor = {
      id: selection.id,
      paperVersionId: current.paper.currentVersionId,
      pageIndex: selection.pageIndex,
      bboxNorm: selection.bboxNorm,
      selectedText: selection.selectedText,
      prefix: '',
      suffix: '',
      textHash: selection.textHash,
      sectionPath: [],
      semanticElementId: null,
      pdfSha256: selection.pdfSha256.startsWith('sha256:') ? selection.pdfSha256 : `sha256:${selection.pdfSha256}`,
      parserVersion: 'pdfjs-5.6.205-text-layer',
      anchorType: 'text',
      relocationStatus: 'exact',
      createdBy: 'user_selection',
    };
    void repository.saveAnchor(anchor).then((saved) => {
      setLocalDocument((document) => document?.paper.id === current.paper.id
        ? { ...document, anchors: [...document.anchors.filter((item) => item.id !== saved.id), saved] }
        : document);
      pushToast('Evidence Anchor 已保存', `第 ${saved.pageIndex + 1} 页 · ${saved.selectedText.length} 个字符 · 本机持久化`);
      if (current.drafts.length === 0) {
        void persistReviewDrafts(current, saved).catch((reason) => {
          pushToast('本地审阅 Draft 未创建', reason instanceof Error ? reason.message : 'Anchor 已保留，可在“证据”页重新创建 Draft。');
        });
      }
    }).catch((reason) => {
      pushToast('Anchor 保存失败', reason instanceof Error ? reason.message : '本地仓库拒绝了此 Anchor。');
    });
  };

  const persistReviewDrafts = async (document: LocalDocument, anchor: EvidenceAnchor) => {
    const candidates = createLocalReviewDrafts(document.paper, anchor, new Date().toISOString());
    const existingIds = new Set(document.drafts.map((draft) => draft.id));
    const savedDrafts: DraftProposal[] = [];
    for (const draft of candidates) {
      if (existingIds.has(draft.id)) continue;
      savedDrafts.push(await repository.saveDraft(draft));
    }
    if (savedDrafts.length === 0) return;
    setLocalDocument((current) => current?.paper.id === document.paper.id
      ? { ...current, drafts: [...current.drafts, ...savedDrafts] }
      : current);
    pushToast('本地审阅 Draft 已保存', `${savedDrafts.length} 条固定 fixture；没有调用 LLM。`);
  };

  const createReviewDraftsForAnchor = async (anchorId: string) => {
    const current = localDocument;
    if (!current) throw new Error('没有可用的本地论文。');
    const anchor = current.anchors.find((candidate) => candidate.id === anchorId);
    if (!anchor) throw new Error(`Evidence Anchor ${anchorId} 不存在。`);
    await persistReviewDrafts(current, anchor);
  };

  const reviewLocalDraft = async (draftId: string, decision: DraftReviewDecision) => {
    const current = localDocument;
    if (!current) throw new Error('没有可用的本地论文。');
    const draft = current.drafts.find((candidate) => candidate.id === draftId);
    if (!draft) throw new Error(`DraftProposal ${draftId} 不存在。`);
    if (current.reviewActions.some((action) => action.claimId === draftId)) {
      throw new Error('该 Draft 已完成审阅，不能重复产生 ReviewAction。');
    }
    const result = reviewDraftProposal(draft, decision, {
      auditId: crypto.randomUUID(),
      actorId: 'local-user',
      occurredAt: new Date().toISOString(),
      anchors: new Map(current.anchors.map((anchor) => [anchor.id, anchor])),
    });
    await repository.reviewDraft({
      action: result.reviewAction,
      ...(result.verifiedClaim ? { verifiedClaim: result.verifiedClaim } : {}),
    });
    setLocalDocument((document) => document?.paper.id === current.paper.id
      ? {
        ...document,
        reviewActions: [...document.reviewActions, result.reviewAction],
        verifiedClaims: result.verifiedClaim
          ? [...document.verifiedClaims.filter((claim) => claim.id !== result.verifiedClaim?.id), result.verifiedClaim]
          : document.verifiedClaims,
      }
      : document);
    if (result.state === 'rejected') {
      pushToast('Draft 已驳回', 'ReviewAction 已保存；没有产生 VerifiedClaim。');
    } else if (result.verifiedClaim.reviewStatus === 'edited') {
      pushToast('编辑并验证完成', '原始 Draft 未改写；ReviewAction 与 Verified · edited 已分别保存。');
    } else {
      pushToast('Draft 已接受', 'ReviewAction 与 Verified · accepted 已分别保存。');
    }
  };

  const updateClaim = (claimId: string, update: { text?: string; status?: ClaimFixture['status'] }) => {
    if (!selectedPaperId) return;
    setClaimsByPaper((current) => ({
      ...current,
      [selectedPaperId]: (current[selectedPaperId] ?? []).map((claim) => claim.id === claimId ? { ...claim, ...update } : claim),
    }));
    if (update.status === 'verified') pushToast('Claim 已验证', '本次只更新 React 会话状态；尚未写入正式知识库。');
    if (update.status === 'edited') pushToast('用户修订已保存', '编辑后的文本和 Verified · edited provenance 已保留在当前会话。');
    if (update.status === 'rejected') pushToast('Claim 已驳回', 'Rejected 不计入 Verified，也不再计为待审阅。');
  };

  const fixtureVerifiedCount = Object.values(claimsByPaper).reduce(
    (count, claims) => count + claims.filter((claim) => claim.status === 'verified' || claim.status === 'edited').length,
    0,
  );
  const localReviews: PersistedReviewEntry[] | null = localDocument
    ? localDocument.drafts.map((draft) => ({
      draft,
      reviewAction: localDocument.reviewActions.find((action) => action.claimId === draft.id) ?? null,
      verifiedClaim: localDocument.verifiedClaims.find((claim) => claim.id === draft.id) ?? null,
    }))
    : null;
  const verifiedCount = localDocument?.verifiedClaims.length ?? fixtureVerifiedCount;

  useEffect(() => {
    if (!localDocument) return;
    const content = localDocument.note;
    const timer = window.setTimeout(() => {
      const reviewedAt = new Date().toISOString();
      const note: NoteBlock = {
        id: `user-note-${localDocument.paper.id}`,
        paperId: localDocument.paper.id,
        paperVersionId: localDocument.paper.currentVersionId ?? '',
        noteType: 'summary',
        title: '我的判断',
        content,
        evidence: localDocument.anchors.map((anchor) => ({
          anchorId: anchor.id,
          supportType: 'context',
          quotedFragment: anchor.selectedText,
          notes: null,
        })),
        reviewStatus: 'accepted',
        createdBy: 'user',
        originalAiContent: null,
        reviewedBy: 'local-user',
        reviewedAt,
      };
      void repository.saveUserNote(note).catch(() => {
        pushToast('笔记尚未持久化', '编辑仍保留在当前会话，请检查本地存储权限。');
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [localDocument?.anchors, localDocument?.note, localDocument?.paper.currentVersionId, localDocument?.paper.id, pushToast, repository]);

  let pageContent;
  if (view === 'discover') {
    pageContent = <DiscoverPage
      theme={activeTheme}
      themes={fixtureThemes}
      pinnedPaperIds={pinnedPaperIds}
      onChooseTheme={setThemeId}
      onOpenPaper={openPaper}
      onTogglePin={(paperId) => setPinnedPaperIds((current) => {
        const next = new Set(current);
        if (next.has(paperId)) next.delete(paperId); else next.add(paperId);
        return next;
      })}
      onOpenRationale={() => setOpenDialog('pack-rationale')}
      onGenerate={(query) => void generatePack(query)}
      onMessage={pushToast}
    />;
  } else if (view === 'library') {
    pageContent = <LibraryPage papers={activeTheme.papers} onOpenPaper={openPaper} onMessage={pushToast} />;
  } else if (view === 'reading') {
    pageContent = <ReadingHome papers={activeTheme.papers} onOpenPaper={openPaper} />;
  } else if (view === 'knowledge') {
    pageContent = <KnowledgePage theme={activeTheme} verifiedCount={verifiedCount} onMessage={pushToast} />;
  } else if (view === 'sync') {
    pageContent = <SyncPage onOpenPreview={openSyncPreview} onMessage={pushToast} />;
  } else if (view === 'settings') {
    pageContent = <SettingsPage onMessage={pushToast} />;
  } else if (selectedPaperHit) {
    const paperClaims = claimsByPaper[selectedPaperHit.paper.id] ?? createClaimFixtures(selectedPaperHit.paper);
    pageContent = <ReaderPage
      paper={selectedPaperHit.paper}
      theme={selectedPaperHit.theme}
      claims={paperClaims}
      notes={localDocument?.note ?? notesByPaper[selectedPaperHit.paper.id] ?? defaultNotes}
      onBack={() => navigate('discover')}
      onOpenSyncPreview={openSyncPreview}
      onUpdateClaim={updateClaim}
      onNotesChange={(value) => {
        if (localDocument) {
          setLocalDocument((current) => current ? { ...current, note: value } : current);
        } else {
          setNotesByPaper((current) => ({ ...current, [selectedPaperHit.paper.id]: value }));
        }
      }}
      onMessage={pushToast}
      localDocumentTitle={localDocument?.paper.title ?? null}
      localPdfFile={localDocument?.file ?? null}
      localPdfError={localDocument?.pdfError ?? null}
      localAnchors={localDocument?.anchors ?? []}
      localAnchorCount={localDocument?.anchors.length ?? 0}
      localPaperVersionId={localDocument?.paper.currentVersionId ?? null}
      persistedReviews={localReviews}
      nativeFileDialog={repository.runtime === 'tauri'}
      persistenceLabel={workspaceStatus === 'initializing'
        ? '正在初始化本地仓库'
        : workspaceStatus === 'error'
          ? '本地仓库不可用'
          : repository.runtime === 'tauri'
            ? 'SQLite · 本机持久化'
            : repository.runtime === 'browser-indexeddb'
              ? 'IndexedDB · 浏览器本地'
              : 'localStorage · 浏览器降级'}
      onImportPdf={(file) => void importLocalPdf(file)}
      onAnchorCreate={saveLocalAnchor}
      onCreateReviewDrafts={createReviewDraftsForAnchor}
      onReviewDraft={reviewLocalDraft}
    />;
  } else {
    pageContent = <ReadingHome papers={activeTheme.papers} onOpenPaper={openPaper} />;
  }

  const syncPaper = selectedPaperHit?.paper ?? activeTheme.papers[0];

  return (
    <>
      <AppShell
        view={view}
        onNavigate={navigate}
        onOpenPalette={() => { setPaletteQuery(''); setPaletteOpen(true); }}
        onOpenSync={openSyncPreview}
        runtimeLabel={repository.runtime === 'tauri' ? 'Tauri + SQLite · 本机' : repository.runtime === 'browser-indexeddb' ? 'Web + IndexedDB · 本地' : 'Web + localStorage · 降级'}
      >{pageContent}</AppShell>
      <CommandPalette open={paletteOpen} initialQuery={paletteQuery} onClose={closePalette} onNavigate={navigate} />
      <Dialog
        open={openDialog === 'pack-rationale'}
        title="主题范围、覆盖与已知缺口"
        description="推荐角色相对于当前阅读包成立，不是论文永久标签。"
        onClose={closeDialog}
        footer={<Button variant="primary" onClick={closeDialog}>了解</Button>}
      >
        <div className="rationale-grid">
          <section><h3>主题解释</h3><p>{activeTheme.description}</p></section>
          <section><h3>召回状态</h3><p>所有条目来自本地 fixture。OpenAlex、Crossref、Semantic Scholar 与 Zotero 均未访问。</p></section>
          <section className="full"><h3>角色依据</h3><ul><li>基石：概念起源、原始贡献和当前主题相关性。</li><li>当前发展：近期证据、新方向与可用实验资产。</li><li>反方：同一命题的方法学批评、负结果或边界条件。</li></ul></section>
          <section className="full"><h3>已知缺口</h3><p>Demo corpus 条目不能当作真实论文；全文可用性、许可、字段来源与更新时间均未核验。</p></section>
        </div>
      </Dialog>
      <Dialog
        open={openDialog === 'sync-preview'}
        title="同步预览 · 不会执行"
        description="明确区分 Zotero 写入、本地 Git commit 与 GitHub push；所有适配器当前关闭。"
        onClose={closeDialog}
        width="large"
        footer={<><Button onClick={closeDialog}>关闭</Button><Button variant="primary" icon={<ShieldCheck size={16} />} onClick={() => { closeDialog(); pushToast('预览已确认', '没有执行 Zotero、Git 或 GitHub 操作。'); }}>确认预览，不执行</Button></>}
      >
        <div className="sync-plan">
          {lastSyncPlan ? <section className="full"><header><ShieldCheck size={18} /><strong>确定性本地计划</strong><span>{lastSyncPlan.actions.length} 个动作</span></header>{lastSyncPlan.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section> : null}
          <section>
            <header><Library size={18} /><strong>Zotero · 未配置</strong><span>{syncPreviewFixture.zotero.length} 项预览</span></header>
            {syncPreviewFixture.zotero.map((item) => <p key={item}><Check size={15} />{item}</p>)}
          </section>
          <section>
            <header><GitBranch size={18} /><strong>Local Git · 仅预览</strong><span>{syncPreviewFixture.git.length} 个目标</span></header>
            {syncPreviewFixture.git.map((item) => <p key={item}><Check size={15} /><span><strong>{item.replace('{paperId}', syncPaper?.id ?? 'paper').replace('{themeId}', activeTheme.id)}</strong><small>尚未选择仓库，不会生成文件</small></span></p>)}
          </section>
          <pre className="diff-preview">commit preview: paperweave: review {syncPaper?.id ?? 'paper'}{`\n\n`}+ verified claims from current session{`\n`}+ evidence anchor references{`\n`}+ cognitive delta draft{`\n\n`}GitHub push: OFF</pre>
        </div>
      </Dialog>
      <ToastRegion messages={toasts} />
    </>
  );
}
