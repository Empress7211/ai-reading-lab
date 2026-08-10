import { open } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell, type AppView } from './components/AppShell';
import { CommandPalette } from './components/CommandPalette';
import { ToastRegion, type ToastMessage } from './components/ToastRegion';
import type {
  DraftProposal,
  DraftReviewDecision,
  EvidenceAnchor,
  EvidenceLink,
  EvidenceRelation,
  JudgmentNote,
  Paper,
  ReviewAction,
  VerifiedClaim,
} from './domain';
import {
  createEmptyJudgmentSections,
  renderPaperMarkdown,
  reviewDraftProposal,
} from './domain';
import { LibraryPage } from './features/library/LibraryPage';
import type { LocalPdfAnchor } from './features/LocalPdfViewer';
import { ReaderEmptyState, ReaderPage, type PersistedReviewEntry } from './features/reader/ReaderPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { createWorkspaceRepository, type WorkspaceSnapshot } from './services';

interface LocalDocument {
  paper: Paper;
  file: File | null;
  pdfError: string | null;
  anchors: EvidenceAnchor[];
  evidenceLinks: EvidenceLink[];
  drafts: DraftProposal[];
  reviewActions: ReviewAction[];
  verifiedClaims: VerifiedClaim[];
  judgment: JudgmentNote;
}

function emptyJudgment(paper: Paper): JudgmentNote {
  return {
    id: `judgment-${paper.id}`,
    paperId: paper.id,
    paperVersionId: paper.currentVersionId ?? '',
    sections: createEmptyJudgmentSections(),
    status: 'draft',
    createdBy: 'user',
    updatedAt: new Date().toISOString(),
    completedAt: null,
  };
}

function paperDocument(snapshot: WorkspaceSnapshot, paper: Paper): Omit<LocalDocument, 'file' | 'pdfError'> {
  const anchors = snapshot.anchors.filter((anchor) => anchor.paperVersionId === paper.currentVersionId);
  const drafts = snapshot.drafts.filter((draft) => draft.paperId === paper.id);
  const draftIds = new Set(drafts.map((draft) => draft.id));
  return {
    paper,
    anchors,
    evidenceLinks: snapshot.evidenceLinks.filter((link) => draftIds.has(link.claimId)),
    drafts,
    reviewActions: snapshot.reviewActions.filter((action) => draftIds.has(action.claimId)),
    verifiedClaims: snapshot.verifiedClaims.filter((claim) => claim.paperId === paper.id),
    judgment: snapshot.judgments.find((item) => item.paperId === paper.id) ?? emptyJudgment(paper),
  };
}

export default function App() {
  const repository = useMemo(() => createWorkspaceRepository({ global: globalThis }), []);
  const [view, setView] = useState<AppView>('library');
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [localDocument, setLocalDocument] = useState<LocalDocument | null>(null);
  const [openingPaperId, setOpeningPaperId] = useState<string | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<'initializing' | 'ready' | 'error'>('initializing');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((title: string, detail: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((messages) => [...messages, { id, title, detail }].slice(-3));
    window.setTimeout(() => setToasts((messages) => messages.filter((message) => message.id !== id)), 4200);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void repository.initialize()
      .then((snapshot) => {
        if (cancelled) return;
        setWorkspaceSnapshot(snapshot);
        setWorkspaceStatus('ready');
      })
      .catch((reason) => {
        if (cancelled) return;
        setWorkspaceStatus('error');
        pushToast('本地仓库初始化失败', reason instanceof Error ? reason.message : '无法打开本地工作区。');
      });
    return () => { cancelled = true; };
  }, [pushToast, repository]);

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

  const refreshOpenDocument = useCallback(async (paperId: string) => {
    const snapshot = await repository.snapshot();
    const paper = snapshot.papers.find((candidate) => candidate.id === paperId);
    if (!paper) throw new Error(`本地工作区中不存在论文 ${paperId}。`);
    setWorkspaceSnapshot(snapshot);
    setLocalDocument((current) => ({
      ...paperDocument(snapshot, paper),
      file: current?.paper.id === paperId ? current.file : null,
      pdfError: current?.paper.id === paperId ? current.pdfError : null,
    }));
  }, [repository]);

  const openStoredPaper = useCallback(async (paperId: string) => {
    setOpeningPaperId(paperId);
    try {
      const snapshot = await repository.snapshot();
      const paper = snapshot.papers.find((candidate) => candidate.id === paperId);
      if (!paper) throw new Error(`本地工作区中不存在论文 ${paperId}。`);
      let file: File | null = null;
      let pdfError: string | null = null;
      try {
        const bytes = await repository.loadPdfBytes(paper.id);
        if (!bytes) throw new Error('论文记录存在，但 PDF 内容文件缺失。');
        file = new File([bytes], `${paper.title}.pdf`, { type: 'application/pdf' });
      } catch (reason) {
        pdfError = reason instanceof Error ? reason.message : '无法从本地仓库读取 PDF。';
      }
      setWorkspaceSnapshot(snapshot);
      setLocalDocument({ ...paperDocument(snapshot, paper), file, pdfError });
      setView('reader');
    } catch (reason) {
      pushToast('论文打开失败', reason instanceof Error ? reason.message : '无法读取本地论文。');
    } finally {
      setOpeningPaperId(null);
    }
  }, [pushToast, repository]);

  const importLocalPdf = useCallback(async (file?: File) => {
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
        if (!bytes) throw new Error('本地 PDF 已登记，但无法从本机 vault 读取。');
        displayFile = new File([bytes], `${imported.paper.title}.pdf`, { type: 'application/pdf' });
      } else {
        if (!file) return;
        imported = await repository.importPdf({ kind: 'browser-file', file });
        displayFile = file;
      }

      const snapshot = await repository.snapshot();
      setWorkspaceSnapshot(snapshot);
      setLocalDocument({
        ...paperDocument(snapshot, imported.paper),
        file: displayFile,
        pdfError: null,
      });
      setView('reader');
      pushToast('本地 PDF 已导入', '文件与研究数据只保存在当前设备；没有上传。');
    } catch (reason) {
      pushToast('PDF 导入失败', reason instanceof Error ? reason.message : '无法读取所选文件。');
    }
  }, [pushToast, repository]);

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
    void repository.saveAnchor(anchor).then(async (saved) => {
      await refreshOpenDocument(current.paper.id);
      pushToast('Evidence Anchor 已保存', `第 ${saved.pageIndex + 1} 页 · ${saved.selectedText.length} 个字符 · 本机持久化`);
    }).catch((reason) => {
      pushToast('Anchor 保存失败', reason instanceof Error ? reason.message : '本地仓库拒绝了此 Anchor。');
    });
  };

  const createManualDraft = async (anchorId: string, claimText: string, relation: EvidenceRelation) => {
    const current = localDocument;
    if (!current?.paper.currentVersionId) throw new Error('没有可用的本地论文版本。');
    const anchor = current.anchors.find((candidate) => candidate.id === anchorId);
    if (!anchor) throw new Error(`Evidence Anchor ${anchorId} 不存在。`);
    const normalizedText = claimText.trim();
    if (normalizedText.length < 5) throw new Error('Draft Claim 至少需要 5 个字符。');
    const now = new Date().toISOString();
    const draftId = crypto.randomUUID();
    const linkId = crypto.randomUUID();
    const evidenceLink: EvidenceLink = {
      id: linkId,
      claimId: draftId,
      anchorId,
      relation,
      supportType: 'direct_statement',
      quotedFragment: anchor.selectedText,
      note: null,
      ordinal: 0,
    };
    const draft: DraftProposal = {
      id: draftId,
      paperId: current.paper.id,
      paperVersionId: current.paper.currentVersionId,
      claimText: normalizedText,
      claimType: 'interpretive',
      epistemicSource: 'author_claim',
      evidenceLinkIds: [linkId],
      assumptions: [],
      scopeConditions: [],
      limitations: [],
      confidence: 1,
      confidenceBasis: ['用户根据已保存的 PDF Evidence Anchor 手工创建'],
      reviewStatus: 'draft',
      createdBy: 'user',
      needsHumanAttention: false,
      modelRunId: null,
      userComment: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      originalAiDraft: null,
    };
    await repository.saveDraftBundle({ draft, evidenceLinks: [evidenceLink] });
    await refreshOpenDocument(current.paper.id);
    pushToast('人工 Draft 已保存', '它仍须经过接受、编辑或驳回，才能成为 Verified Claim。');
  };

  const requestAiDrafts = async (anchorId: string) => {
    const current = localDocument;
    if (!current) throw new Error('没有可用的本地论文。');
    await repository.generateDrafts({ paperId: current.paper.id, anchorIds: [anchorId] });
    await refreshOpenDocument(current.paper.id);
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
      evidenceLinks: new Map(current.evidenceLinks.map((link) => [link.id, link])),
    });
    await repository.reviewDraft({
      action: result.reviewAction,
      ...(result.verifiedClaim ? { verifiedClaim: result.verifiedClaim } : {}),
    });
    await refreshOpenDocument(current.paper.id);
    pushToast(
      result.state === 'rejected' ? 'Draft 已驳回' : 'Claim 已验证',
      result.state === 'rejected'
        ? 'ReviewAction 已保存；没有产生 Verified Claim。'
        : 'ReviewAction 与 Verified Claim 已分层保存。',
    );
  };

  const saveJudgment = async (judgment: JudgmentNote) => {
    const current = localDocument;
    if (!current) throw new Error('没有可用的本地论文。');
    await repository.saveJudgment(judgment);
    await refreshOpenDocument(current.paper.id);
    pushToast(judgment.status === 'complete' ? '“我的判断”已完成' : '判断草稿已保存', '结构化内容与 Verified Claim 引用已本机持久化。');
  };

  const exportMarkdown = () => {
    const current = localDocument;
    if (!current) return;
    const markdown = renderPaperMarkdown({
      paperId: current.paper.id,
      title: current.paper.title,
      authors: current.paper.authors,
      year: current.paper.year,
      identifiers: current.paper.identifiers,
      claims: current.verifiedClaims,
      anchors: new Map(current.anchors.map((anchor) => [anchor.id, anchor])),
      evidenceLinks: new Map(current.evidenceLinks.map((link) => [link.id, link])),
    });
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = url;
    download.download = `${current.paper.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'paperweave'}.md`;
    download.click();
    URL.revokeObjectURL(url);
    pushToast('Markdown 已导出', '只包含 Verified Claims 与可回溯页码，不包含 PDF 原文或文件路径。');
  };

  const runtimeLabel = repository.runtime === 'tauri' ? 'Tauri + SQLite · 本机' : 'Web + IndexedDB · 本地';
  const persistenceLabel = workspaceStatus === 'initializing'
    ? '正在初始化本地仓库'
    : workspaceStatus === 'error'
      ? '本地仓库不可用'
      : repository.runtime === 'tauri'
        ? 'SQLite · 本机持久化'
        : 'IndexedDB · 浏览器本地';

  const localReviews: PersistedReviewEntry[] = localDocument
    ? localDocument.drafts.map((draft) => ({
      draft,
      evidenceLinks: localDocument.evidenceLinks.filter((link) => link.claimId === draft.id),
      reviewAction: localDocument.reviewActions.find((action) => action.claimId === draft.id) ?? null,
      verifiedClaim: localDocument.verifiedClaims.find((claim) => claim.id === draft.id) ?? null,
    }))
    : [];
  const pendingDraftCount = workspaceSnapshot?.drafts.filter((draft) =>
    !workspaceSnapshot.reviewActions.some((action) => action.claimId === draft.id),
  ).length ?? 0;

  let pageContent;
  if (view === 'library') {
    pageContent = <LibraryPage
      papers={workspaceSnapshot?.papers ?? []}
      anchorCount={workspaceSnapshot?.anchors.length ?? 0}
      draftCount={pendingDraftCount}
      verifiedCount={workspaceSnapshot?.verifiedClaims.length ?? 0}
      openingPaperId={openingPaperId}
      nativeFileDialog={repository.runtime === 'tauri'}
      onOpenPaper={(paperId) => void openStoredPaper(paperId)}
      onImportPdf={(file) => void importLocalPdf(file)}
    />;
  } else if (view === 'settings') {
    pageContent = <SettingsPage runtimeLabel={runtimeLabel} />;
  } else if (!localDocument) {
    pageContent = <ReaderEmptyState
      nativeFileDialog={repository.runtime === 'tauri'}
      onBack={() => setView('library')}
      onImportPdf={(file) => void importLocalPdf(file)}
    />;
  } else {
    pageContent = <ReaderPage
      paper={localDocument.paper}
      judgment={localDocument.judgment}
      verifiedClaims={localDocument.verifiedClaims}
      onBack={() => setView('library')}
      onMessage={pushToast}
      localPdfFile={localDocument.file}
      localPdfError={localDocument.pdfError}
      localAnchors={localDocument.anchors}
      localPaperVersionId={localDocument.paper.currentVersionId}
      persistedReviews={localReviews}
      nativeFileDialog={repository.runtime === 'tauri'}
      persistenceLabel={persistenceLabel}
      onImportPdf={(file) => void importLocalPdf(file)}
      onAnchorCreate={saveLocalAnchor}
      onCreateManualDraft={createManualDraft}
      onRequestAiDraft={requestAiDrafts}
      onReviewDraft={reviewLocalDraft}
      onSaveJudgment={saveJudgment}
      onExportMarkdown={exportMarkdown}
    />;
  }

  return <>
    <AppShell
      view={view}
      onNavigate={setView}
      onOpenPalette={() => { setPaletteQuery(''); setPaletteOpen(true); }}
      runtimeLabel={runtimeLabel}
    >{pageContent}</AppShell>
    <CommandPalette open={paletteOpen} initialQuery={paletteQuery} onClose={() => setPaletteOpen(false)} onNavigate={setView} />
    <ToastRegion messages={toasts} />
  </>;
}
