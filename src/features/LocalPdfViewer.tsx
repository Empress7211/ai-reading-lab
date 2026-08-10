import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  LoaderCircle,
  Maximize2,
  Minus,
  Plus,
} from 'lucide-react';
import type {
  PDFDocumentLoadingTask,
  PDFPageProxy,
  TextContent,
} from 'pdfjs-dist/types/src/display/api';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { EvidenceAnchor } from '../domain';
import { validateAnchor } from '../domain';
import 'pdfjs-dist/web/pdf_viewer.css';

export interface LocalPdfAnchor {
  id: string;
  pageIndex: number;
  bboxNorm: [number, number, number, number];
  selectedText: string;
  textHash: string;
  pdfSha256: string;
  createdAt: string;
}

interface LocalPdfViewerProps {
  file: File;
  anchors?: readonly EvidenceAnchor[];
  expectedPaperVersionId?: string;
  activeAnchorId?: string | null;
  onAnchorCreate: (anchor: LocalPdfAnchor) => void;
  onAnchorStatesChange?: (states: readonly AnchorLocationState[]) => void;
}

export type AnchorLocationStatus =
  | 'loading'
  | 'ready'
  | 'orphaned'
  | 'corrupt'
  | 'pdf-corrupt'
  | 'pdf-mismatch'
  | 'page-invalid'
  | 'pdf-missing';

export interface AnchorLocationState {
  anchorId: string;
  status: AnchorLocationStatus;
  message: string;
}

interface PendingSelection {
  pageIndex: number;
  bboxNorm: [number, number, number, number];
  selectedText: string;
}

async function sha256(value: ArrayBuffer | string): Promise<string> {
  const input =
    typeof value === 'string' ? new TextEncoder().encode(value).buffer : value;
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizedHash(value: string): string {
  return value.replace(/^sha256:/i, '').toLowerCase();
}

export async function readTextContent(
  page: Pick<PDFPageProxy, 'streamTextContent'>,
): Promise<TextContent> {
  const reader = page.streamTextContent().getReader();
  const content: TextContent = {
    items: [],
    styles: Object.create(null) as TextContent['styles'],
    lang: null,
  };
  try {
    while (true) {
      const { value, done } = await reader.read() as ReadableStreamReadResult<TextContent>;
      if (done) return content;
      content.lang ??= value.lang;
      Object.assign(content.styles, value.styles);
      content.items.push(...value.items);
    }
  } finally {
    reader.releaseLock();
  }
}

export function classifyAnchorForPdf(
  anchor: EvidenceAnchor,
  context: {
    pdfHash: string;
    pageCount: number;
    paperVersionId: string;
  },
): AnchorLocationState {
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
  if (anchor.paperVersionId !== context.paperVersionId) {
    return {
      anchorId: anchor.id,
      status: 'orphaned',
      message: 'Anchor 属于另一个 PDF 版本；请切换版本或重新创建。',
    };
  }
  if (normalizedHash(anchor.pdfSha256) !== normalizedHash(context.pdfHash)) {
    return {
      anchorId: anchor.id,
      status: 'pdf-mismatch',
      message: 'Anchor 的 PDF 指纹与当前文件不一致；请恢复原 PDF 或重新创建。',
    };
  }
  if (anchor.pageIndex >= context.pageCount) {
    return {
      anchorId: anchor.id,
      status: 'page-invalid',
      message: `Anchor 指向第 ${anchor.pageIndex + 1} 页，但当前 PDF 只有 ${context.pageCount} 页。`,
    };
  }
  return {
    anchorId: anchor.id,
    status: 'ready',
    message: `可定位到第 ${anchor.pageIndex + 1} 页。`,
  };
}

function ignoreAnchorStates(): void {}

export function LocalPdfViewer({
  file,
  anchors = [],
  expectedPaperVersionId = '',
  activeAnchorId = null,
  onAnchorCreate,
  onAnchorStatesChange = ignoreAnchorStates,
}: LocalPdfViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('正在校验并打开本地 PDF…');
  const [error, setError] = useState<string | null>(null);
  const [pdfHash, setPdfHash] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [viewerWidth, setViewerWidth] = useState(0);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [renderRevision, setRenderRevision] = useState(0);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const measure = () => setViewerWidth(Math.round(viewer.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(viewer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || viewerWidth === 0) return;
    const hostElement = host;

    let canceled = false;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    hostElement.replaceChildren();
    setPending(null);
    setError(null);
    setStatus('正在校验并打开本地 PDF…');

    async function openPdf() {
      const arrayBuffer = await file.arrayBuffer();
      const signature = new TextDecoder('ascii').decode(arrayBuffer.slice(0, 5));
      if (signature !== '%PDF-') {
        throw new Error('所选文件没有有效的 PDF 文件签名。');
      }

      const [pdfjs, hash] = await Promise.all([
        import('pdfjs-dist'),
        sha256(arrayBuffer),
      ]);
      if (canceled) return;

      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      setPdfHash(hash);
      loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      setPageCount(pdf.numPages);
      setCurrentPage(1);
      setStatus(`已打开 ${pdf.numPages} 页 · 本地文件未上传`);

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (canceled) return;
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const fitWidth = Math.max(320, Math.min(820, viewerWidth - 72));
        const fitScale = fitWidth / baseViewport.width;
        const viewport = page.getViewport({
          scale: Math.max(0.45, Math.min(2.4, fitScale * zoom)),
        });
        const pageElement = document.createElement('section');
        pageElement.className = 'pdf-live-page';
        pageElement.dataset.pageIndex = String(pageNumber - 1);
        pageElement.style.setProperty('--page-width', `${viewport.width}px`);
        pageElement.style.setProperty('--page-height', `${viewport.height}px`);
        pageElement.setAttribute('aria-label', `PDF 第 ${pageNumber} 页`);

        const canvas = document.createElement('canvas');
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('浏览器无法创建 PDF 画布。');

        const textLayer = document.createElement('div');
        textLayer.className = 'textLayer';
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;

        const pageLabel = document.createElement('div');
        pageLabel.className = 'pdf-page-label';
        pageLabel.textContent = `${pageNumber} / ${pdf.numPages}`;
        pageElement.append(canvas, textLayer, pageLabel);
        hostElement.append(pageElement);

        const textContent = await readTextContent(page).catch((reason: unknown) => {
          const message = reason instanceof Error ? reason.message : String(reason);
          throw new Error(`第 ${pageNumber} 页文本提取失败：${message}`);
        });
        const canvasRender = page.render({
            canvas,
            canvasContext: context,
            viewport,
            transform:
              outputScale === 1
                ? undefined
                : [outputScale, 0, 0, outputScale, 0, 0],
          }).promise.catch((reason: unknown) => {
            const message = reason instanceof Error ? reason.message : String(reason);
            throw new Error(`第 ${pageNumber} 页画布渲染失败：${message}`);
          });
        let textLayerRenderer: InstanceType<typeof pdfjs.TextLayer>;
        try {
          textLayerRenderer = new pdfjs.TextLayer({
            textContentSource: textContent,
            container: textLayer,
            viewport,
          });
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : String(reason);
          throw new Error(`第 ${pageNumber} 页文本层初始化失败：${message}`);
        }
        const textRender = textLayerRenderer.render().catch((reason: unknown) => {
            const message = reason instanceof Error ? reason.message : String(reason);
            throw new Error(`第 ${pageNumber} 页文本层渲染失败：${message}`);
          });
        await Promise.all([canvasRender, textRender]);
      }

      if (canceled) return;
      const anchorStates = anchors.map((anchor) => classifyAnchorForPdf(anchor, {
        pdfHash: hash,
        pageCount: pdf.numPages,
        paperVersionId: expectedPaperVersionId,
      }));
      const stateById = new Map(anchorStates.map((state) => [state.anchorId, state]));
      for (const anchor of anchors) {
        if (stateById.get(anchor.id)?.status !== 'ready') continue;
        const pageElement = hostElement.querySelector<HTMLElement>(
          `.pdf-live-page[data-page-index="${anchor.pageIndex}"]`,
        );
        if (!pageElement) continue;
        const [x0, y0, x1, y1] = anchor.bboxNorm;
        const overlay = document.createElement('button');
        overlay.type = 'button';
        overlay.className = 'pdf-anchor-overlay';
        overlay.dataset.anchorId = anchor.id;
        overlay.setAttribute('aria-label', `Evidence Anchor：${anchor.selectedText}`);
        overlay.title = `第 ${anchor.pageIndex + 1} 页 · ${anchor.selectedText}`;
        overlay.style.left = `${x0 * 100}%`;
        overlay.style.top = `${y0 * 100}%`;
        overlay.style.width = `${(x1 - x0) * 100}%`;
        overlay.style.height = `${(y1 - y0) * 100}%`;
        pageElement.append(overlay);
      }
      onAnchorStatesChange(anchorStates);
      setRenderRevision((revision) => revision + 1);
    }

    void openPdf().catch((reason: unknown) => {
      if (canceled) return;
      const message = reason instanceof Error ? reason.message : '无法打开此 PDF。';
      setError(message);
      setStatus('PDF 打开失败');
      onAnchorStatesChange(anchors.map((anchor) => ({
        anchorId: anchor.id,
        status: 'pdf-corrupt',
        message: `PDF 损坏或无法解析：${message}`,
      })));
    });

    return () => {
      canceled = true;
      void loadingTask?.destroy();
    };
  }, [anchors, expectedPaperVersionId, file, onAnchorStatesChange, viewerWidth, zoom]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !activeAnchorId) return;
    const overlays = Array.from(
      host.querySelectorAll<HTMLElement>('.pdf-anchor-overlay'),
    );
    for (const overlay of overlays) overlay.classList.remove('is-focused');
    const target = overlays.find((overlay) => overlay.dataset.anchorId === activeAnchorId);
    if (!target) return;
    target.classList.add('is-focused');
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [activeAnchorId, renderRevision]);

  useEffect(() => {
    const scroller = scrollRef.current;
    const host = hostRef.current;
    if (!scroller || !host) return;
    const updateCurrentPage = () => {
      const pages = Array.from(host.querySelectorAll<HTMLElement>('.pdf-live-page'));
      if (pages.length === 0) return;
      const viewportCenter = scroller.getBoundingClientRect().top + scroller.clientHeight / 2;
      let closestPage = 1;
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const page of pages) {
        const rect = page.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = Number(page.dataset.pageIndex ?? 0) + 1;
        }
      }
      setCurrentPage(closestPage);
    };
    updateCurrentPage();
    scroller.addEventListener('scroll', updateCurrentPage, { passive: true });
    return () => scroller.removeEventListener('scroll', updateCurrentPage);
  }, [renderRevision]);

  const goToPage = (pageNumber: number) => {
    const nextPage = Math.max(1, Math.min(pageCount, pageNumber));
    const page = hostRef.current?.querySelector<HTMLElement>(
      `.pdf-live-page[data-page-index="${nextPage - 1}"]`,
    );
    if (!page) return;
    setCurrentPage(nextPage);
    page.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'center' });
  };

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const text = selection.toString().trim();
    if (!text) return;

    const range = selection.getRangeAt(0);
    const pageElement =
      range.commonAncestorContainer.parentElement?.closest<HTMLElement>('.pdf-live-page');
    if (!pageElement) return;

    const pageRect = pageElement.getBoundingClientRect();
    const rect = range.getBoundingClientRect();
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    setPending({
      pageIndex: Number(pageElement.dataset.pageIndex ?? 0),
      selectedText: text,
      bboxNorm: [
        clamp((rect.left - pageRect.left) / pageRect.width),
        clamp((rect.top - pageRect.top) / pageRect.height),
        clamp((rect.right - pageRect.left) / pageRect.width),
        clamp((rect.bottom - pageRect.top) / pageRect.height),
      ],
    });
  }

  async function commitSelection() {
    if (!pending || !pdfHash) return;
    const textHash = await sha256(pending.selectedText);
    onAnchorCreate({
      id: crypto.randomUUID(),
      pageIndex: pending.pageIndex,
      bboxNorm: pending.bboxNorm,
      selectedText: pending.selectedText,
      textHash,
      pdfSha256: pdfHash,
      createdAt: new Date().toISOString(),
    });
    window.getSelection()?.removeAllRanges();
    setPending(null);
  }

  return (
    <div ref={viewerRef} className="local-pdf-viewer">
      <div ref={scrollRef} className="pdf-scroll-area">
        <div className="pdf-local-status" role="status">
          {error ? <AlertTriangle size={15} /> : <LoaderCircle className={pageCount ? '' : 'spin'} size={15} />}
          <span>{status}</span>
        </div>
        {pending ? (
          <div className="selection-capture" role="toolbar" aria-label="PDF 选区操作">
            <span>已选择 {pending.selectedText.length} 个字符 · 第 {pending.pageIndex + 1} 页</span>
            <button className="primary-button small-button" onClick={() => void commitSelection()}>
              <Highlighter size={14} />
              创建证据 Anchor
            </button>
            <button className="ghost-button small-button" onClick={() => setPending(null)}>
              取消
            </button>
          </div>
        ) : null}
        {error ? <div className="reader-error">{error}</div> : null}
        <div ref={hostRef} className="pdf-live-pages" onMouseUp={captureSelection} />
      </div>
      <div className="pdf-reader-controls" role="toolbar" aria-label="PDF 页面与缩放">
        <button type="button" aria-label="上一页" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}><ChevronLeft size={17} /></button>
        <span className="pdf-page-control">{pageCount ? `${currentPage} / ${pageCount}` : '— / —'}</span>
        <button type="button" aria-label="下一页" disabled={currentPage >= pageCount} onClick={() => goToPage(currentPage + 1)}><ChevronRight size={17} /></button>
        <i />
        <button type="button" aria-label="缩小" disabled={zoom <= 0.8} onClick={() => setZoom((value) => Math.max(0.8, Number((value - 0.2).toFixed(1))))}><Minus size={17} /></button>
        <span className="pdf-zoom-control">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="放大" disabled={zoom >= 1.6} onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.2).toFixed(1))))}><Plus size={17} /></button>
        <button type="button" aria-label="适合宽度" disabled={zoom === 1} onClick={() => setZoom(1)}><Maximize2 size={16} /></button>
      </div>
    </div>
  );
}
