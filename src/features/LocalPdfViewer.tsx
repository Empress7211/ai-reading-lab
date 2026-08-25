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
  PDFDocumentProxy,
  PDFPageProxy,
  TextContent,
} from 'pdfjs-dist/types/src/display/api';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {
  EvidenceAnchor,
  LocalDocumentIndex,
  NormalizedBoundingBox,
  PageTextLine,
  PageTextRun,
} from '../domain';
import {
  buildDocumentBlocks,
  DOCUMENT_BLOCK_PARSER_VERSION,
  extractPageTextLines,
  validateAnchor,
} from '../domain';
import 'pdfjs-dist/web/pdf_viewer.css';

export interface LocalPdfAnchor {
  id: string;
  pageIndex: number;
  bboxNorm: NormalizedBoundingBox;
  rectsNorm?: readonly NormalizedBoundingBox[];
  selectedText: string;
  textHash: string;
  pdfSha256: string;
  createdAt: string;
  sectionPath?: readonly string[];
  semanticElementId?: string | null;
  parserVersion?: string;
  createdBy?: EvidenceAnchor['createdBy'];
}

interface LocalPdfViewerProps {
  file: File;
  anchors?: readonly EvidenceAnchor[];
  expectedPaperVersionId?: string;
  activeAnchorId?: string | null;
  activeDocumentBlockId?: string | null;
  onAnchorCreate: (anchor: LocalPdfAnchor) => Promise<void> | void;
  onAnchorStatesChange?: (states: readonly AnchorLocationState[]) => void;
  onDocumentIndexChange?: (index: LocalDocumentIndex | null) => void;
  onDocumentIndexError?: (message: string | null) => void;
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
  bboxNorm: NormalizedBoundingBox;
  rectsNorm: readonly NormalizedBoundingBox[];
  selectedText: string;
}

interface RectBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface PageRect extends RectBounds {
  width: number;
  height: number;
}

export interface SelectionGeometry {
  bboxNorm: NormalizedBoundingBox;
  rectsNorm: readonly NormalizedBoundingBox[];
}

export function selectionGeometryForPage(
  pageRect: PageRect,
  clientRects: readonly RectBounds[],
): SelectionGeometry | null {
  if (pageRect.width <= 0 || pageRect.height <= 0) return null;
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const rectsNorm: NormalizedBoundingBox[] = [];
  const seen = new Set<string>();

  for (const rect of clientRects) {
    const left = Math.max(pageRect.left, rect.left);
    const top = Math.max(pageRect.top, rect.top);
    const right = Math.min(pageRect.right, rect.right);
    const bottom = Math.min(pageRect.bottom, rect.bottom);
    if (right <= left || bottom <= top) continue;
    const normalized: NormalizedBoundingBox = [
      clamp((left - pageRect.left) / pageRect.width),
      clamp((top - pageRect.top) / pageRect.height),
      clamp((right - pageRect.left) / pageRect.width),
      clamp((bottom - pageRect.top) / pageRect.height),
    ];
    const key = normalized.map((value) => value.toFixed(6)).join(':');
    if (!seen.has(key)) {
      seen.add(key);
      rectsNorm.push(normalized);
    }
  }

  if (rectsNorm.length === 0) return null;
  let [x0, y0, x1, y1] = rectsNorm[0]!;
  for (const [rectX0, rectY0, rectX1, rectY1] of rectsNorm.slice(1)) {
    x0 = Math.min(x0, rectX0);
    y0 = Math.min(y0, rectY0);
    x1 = Math.max(x1, rectX1);
    y1 = Math.max(y1, rectY1);
  }
  return { bboxNorm: [x0, y0, x1, y1], rectsNorm };
}

export async function sha256LocalPdfValue(value: ArrayBuffer | string): Promise<string> {
  const input =
    typeof value === 'string' ? new TextEncoder().encode(value).buffer : value;
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

interface StableViewport {
  width: number;
  height: number;
  scale: number;
  transform: readonly number[];
}

function multiplyTransforms(left: readonly number[], right: readonly number[]): number[] {
  return [
    left[0]! * right[0]! + left[2]! * right[1]!,
    left[1]! * right[0]! + left[3]! * right[1]!,
    left[0]! * right[2]! + left[2]! * right[3]!,
    left[1]! * right[2]! + left[3]! * right[3]!,
    left[0]! * right[4]! + left[2]! * right[5]! + left[4]!,
    left[1]! * right[4]! + left[3]! * right[5]! + left[5]!,
  ];
}

function textRunsForPage(textContent: TextContent, viewport: StableViewport): PageTextRun[] {
  const runs: PageTextRun[] = [];
  for (const item of textContent.items) {
    if (!('str' in item) || !item.str) continue;
    const transform = multiplyTransforms(viewport.transform, item.transform);
    const fontHeight = Math.max(0.5, Math.hypot(transform[2]!, transform[3]!));
    const width = Math.max(0.5, Math.abs(item.width * viewport.scale));
    const left = transform[4]!;
    const baseline = transform[5]!;
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    runs.push({
      text: item.str,
      bbox: [
        clamp(left / viewport.width),
        clamp((baseline - fontHeight) / viewport.height),
        clamp((left + width) / viewport.width),
        clamp(baseline / viewport.height),
      ],
      fontSize: fontHeight / viewport.height,
      hasEol: item.hasEOL,
    });
  }
  return runs;
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
function ignoreDocumentIndex(): void {}
function ignoreDocumentIndexError(): void {}

interface PdfSession {
  pdfjs: typeof import('pdfjs-dist');
  pdf: PDFDocumentProxy;
  hash: string;
  pages: Map<number, Promise<PDFPageProxy>>;
  textContents: Map<number, Promise<TextContent>>;
}

function pageForSession(session: PdfSession, pageNumber: number): Promise<PDFPageProxy> {
  let page = session.pages.get(pageNumber);
  if (!page) {
    page = session.pdf.getPage(pageNumber);
    session.pages.set(pageNumber, page);
  }
  return page;
}

function textContentForSession(session: PdfSession, pageNumber: number): Promise<TextContent> {
  let textContent = session.textContents.get(pageNumber);
  if (!textContent) {
    textContent = pageForSession(session, pageNumber).then(readTextContent);
    session.textContents.set(pageNumber, textContent);
  }
  return textContent;
}

export function LocalPdfViewer({
  file,
  anchors = [],
  expectedPaperVersionId = '',
  activeAnchorId = null,
  activeDocumentBlockId = null,
  onAnchorCreate,
  onAnchorStatesChange = ignoreAnchorStates,
  onDocumentIndexChange = ignoreDocumentIndex,
  onDocumentIndexError = ignoreDocumentIndexError,
}: LocalPdfViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const documentIndexRef = useRef<LocalDocumentIndex | null>(null);
  const anchorsRef = useRef(anchors);
  const onAnchorStatesChangeRef = useRef(onAnchorStatesChange);
  const onDocumentIndexChangeRef = useRef(onDocumentIndexChange);
  const onDocumentIndexErrorRef = useRef(onDocumentIndexError);
  const [session, setSession] = useState<PdfSession | null>(null);
  const [renderState, setRenderState] = useState<'opening' | 'rendering' | 'ready' | 'failed'>('opening');
  const [indexProgress, setIndexProgress] = useState<string | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [renderWarning, setRenderWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfHash, setPdfHash] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [viewerWidth, setViewerWidth] = useState(0);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [renderRevision, setRenderRevision] = useState(0);

  anchorsRef.current = anchors;
  onAnchorStatesChangeRef.current = onAnchorStatesChange;
  onDocumentIndexChangeRef.current = onDocumentIndexChange;
  onDocumentIndexErrorRef.current = onDocumentIndexError;

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
    let canceled = false;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    setSession(null);
    setRenderState('opening');
    setRenderWarning(null);
    setPending(null);
    setError(null);
    setPdfHash('');
    setPageCount(0);
    setCurrentPage(1);
    setIndexProgress(null);
    setIndexError(null);
    documentIndexRef.current = null;
    onDocumentIndexChangeRef.current(null);
    onDocumentIndexErrorRef.current(null);
    hostRef.current?.replaceChildren();
    onAnchorStatesChangeRef.current(anchorsRef.current.map((anchor) => ({
      anchorId: anchor.id,
      status: 'loading',
      message: '正在恢复 PDF 页与可见标记…',
    })));

    async function openPdf() {
      const arrayBuffer = await file.arrayBuffer();
      const signature = new TextDecoder('ascii').decode(arrayBuffer.slice(0, 5));
      if (signature !== '%PDF-') {
        throw new Error('所选文件没有有效的 PDF 文件签名。');
      }

      const [pdfjs, hash] = await Promise.all([
        import('pdfjs-dist'),
        sha256LocalPdfValue(arrayBuffer),
      ]);
      if (canceled) return;

      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      setPdfHash(hash);
      loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      if (canceled) return;
      setPageCount(pdf.numPages);
      setCurrentPage(1);
      setSession({
        pdfjs,
        pdf,
        hash,
        pages: new Map(),
        textContents: new Map(),
      });
    }

    void openPdf().catch((reason: unknown) => {
      if (canceled) return;
      const message = reason instanceof Error ? reason.message : '无法打开此 PDF。';
      setRenderState('failed');
      setError(message);
      onAnchorStatesChangeRef.current(anchorsRef.current.map((anchor) => ({
        anchorId: anchor.id,
        status: 'pdf-corrupt',
        message: `PDF 损坏或无法解析：${message}`,
      })));
    });

    return () => {
      canceled = true;
      void loadingTask?.destroy();
    };
  }, [file]);

  useEffect(() => {
    if (!session) return;
    let canceled = false;
    setIndexError(null);
    setIndexProgress(`正在本地建立全文索引 0 / ${session.pdf.numPages} 页…`);
    onDocumentIndexErrorRef.current(null);

    async function buildIndex() {
      const documentLines: PageTextLine[][] = [];
      for (let pageNumber = 1; pageNumber <= session!.pdf.numPages; pageNumber += 1) {
        if (canceled) return;
        setIndexProgress(`正在本地建立全文索引 ${pageNumber} / ${session!.pdf.numPages} 页…`);
        const page = await pageForSession(session!, pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const textContent = await textContentForSession(session!, pageNumber).catch((reason: unknown) => {
          const message = reason instanceof Error ? reason.message : String(reason);
          throw new Error(`第 ${pageNumber} 页文本提取失败：${message}`);
        });
        documentLines.push(extractPageTextLines(
          pageNumber,
          textRunsForPage(textContent, baseViewport),
        ));
      }
      if (canceled) return;
      const documentIndex: LocalDocumentIndex = {
        pdfSha256: `sha256:${session!.hash}`,
        parserVersion: DOCUMENT_BLOCK_PARSER_VERSION,
        pageCount: session!.pdf.numPages,
        blocks: buildDocumentBlocks(documentLines),
      };
      documentIndexRef.current = documentIndex;
      onDocumentIndexChangeRef.current(documentIndex);
      setIndexProgress(null);
    }

    void buildIndex().catch((reason: unknown) => {
      if (canceled) return;
      const message = reason instanceof Error ? reason.message : '全文索引建立失败。';
      documentIndexRef.current = null;
      onDocumentIndexChangeRef.current(null);
      onDocumentIndexErrorRef.current(message);
      setIndexProgress(null);
      setIndexError(message);
    });

    return () => {
      canceled = true;
    };
  }, [session]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !session || viewerWidth === 0) return;
    const hostElement = host;
    let canceled = false;
    hostElement.replaceChildren();
    setPending(null);
    setRenderWarning(null);
    setRenderState('rendering');

    async function renderPdf() {
      const warnings: string[] = [];
      for (let pageNumber = 1; pageNumber <= session!.pdf.numPages; pageNumber += 1) {
        if (canceled) return;
        const page = await pageForSession(session!, pageNumber);
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
        pageLabel.textContent = `${pageNumber} / ${session!.pdf.numPages}`;
        pageElement.append(canvas, textLayer, pageLabel);
        hostElement.append(pageElement);

        await page.render({
          canvas,
          canvasContext: context,
          viewport,
          // PDF.js display rendering stalls on requestAnimationFrame in the bundled WKWebView.
          // Print intent uses PDF.js's non-rAF scheduler while producing the same static canvas.
          intent: 'print',
          transform:
            outputScale === 1
              ? undefined
              : [outputScale, 0, 0, outputScale, 0, 0],
        }).promise.catch((reason: unknown) => {
          const message = reason instanceof Error ? reason.message : String(reason);
          throw new Error(`第 ${pageNumber} 页画布渲染失败：${message}`);
        });

        try {
          const textContent = await textContentForSession(session!, pageNumber);
          const renderer = new session!.pdfjs.TextLayer({
            textContentSource: textContent,
            container: textLayer,
            viewport,
          });
          await renderer.render();
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : String(reason);
          warnings.push(`第 ${pageNumber} 页文本层不可用：${message}`);
        }
      }
      if (canceled) return;
      setRenderWarning(warnings.length > 0 ? warnings.join('；') : null);
      setRenderState('ready');
      setRenderRevision((revision) => revision + 1);
    }

    void renderPdf().catch((reason: unknown) => {
      if (canceled) return;
      const message = reason instanceof Error ? reason.message : 'PDF 渲染失败。';
      setRenderState('failed');
      setError(message);
      onAnchorStatesChangeRef.current(anchorsRef.current.map((anchor) => ({
        anchorId: anchor.id,
        status: 'pdf-corrupt',
        message: `PDF 损坏或无法解析：${message}`,
      })));
    });

    return () => {
      canceled = true;
    };
  }, [session, viewerWidth, zoom]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !pdfHash || pageCount === 0) return;
    for (const overlay of host.querySelectorAll('.pdf-anchor-overlay')) overlay.remove();
    const anchorStates = anchors.map((anchor) => classifyAnchorForPdf(anchor, {
      pdfHash,
      pageCount,
      paperVersionId: expectedPaperVersionId,
    }));
    const stateById = new Map(anchorStates.map((state) => [state.anchorId, state]));
    for (const anchor of anchors) {
      if (stateById.get(anchor.id)?.status !== 'ready') continue;
      const pageElement = host.querySelector<HTMLElement>(
        `.pdf-live-page[data-page-index="${anchor.pageIndex}"]`,
      );
      if (!pageElement) continue;
      const fragments = anchor.rectsNorm?.length ? anchor.rectsNorm : [anchor.bboxNorm];
      for (const [fragmentIndex, [x0, y0, x1, y1]] of fragments.entries()) {
        const overlay = document.createElement('div');
        overlay.className = `pdf-anchor-overlay${fragmentIndex === 0 ? ' is-first-fragment' : ''}`;
        overlay.dataset.anchorId = anchor.id;
        overlay.dataset.fragmentIndex = String(fragmentIndex);
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.left = `${x0 * 100}%`;
        overlay.style.top = `${y0 * 100}%`;
        overlay.style.width = `${(x1 - x0) * 100}%`;
        overlay.style.height = `${(y1 - y0) * 100}%`;
        pageElement.append(overlay);
      }
    }
    onAnchorStatesChangeRef.current(anchorStates);
  }, [anchors, expectedPaperVersionId, pageCount, pdfHash, renderRevision]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !activeAnchorId) return;
    const overlays = Array.from(
      host.querySelectorAll<HTMLElement>('.pdf-anchor-overlay'),
    );
    for (const overlay of overlays) overlay.classList.remove('is-focused');
    const targets = overlays.filter((overlay) => overlay.dataset.anchorId === activeAnchorId);
    if (targets.length === 0) return;
    for (const target of targets) target.classList.add('is-focused');
    targets[0]!.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [activeAnchorId, renderRevision]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.querySelector('.pdf-map-evidence-overlay')?.remove();
    if (!activeDocumentBlockId) return;
    const block = documentIndexRef.current?.blocks.find(
      (candidate) => candidate.id === activeDocumentBlockId,
    );
    if (!block) return;
    const pageElement = host.querySelector<HTMLElement>(
      `.pdf-live-page[data-page-index="${block.page - 1}"]`,
    );
    if (!pageElement) return;
    const [x0, y0, x1, y1] = block.bbox;
    const overlay = document.createElement('div');
    overlay.className = 'pdf-map-evidence-overlay';
    overlay.dataset.blockId = block.id;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.left = `${x0 * 100}%`;
    overlay.style.top = `${y0 * 100}%`;
    overlay.style.width = `${(x1 - x0) * 100}%`;
    overlay.style.height = `${(y1 - y0) * 100}%`;
    pageElement.append(overlay);
    overlay.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [activeDocumentBlockId, renderRevision]);

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
    const pageForNode = (node: Node) => {
      const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
      return element?.closest<HTMLElement>('.pdf-live-page') ?? null;
    };
    const pageElement = pageForNode(range.startContainer);
    const endPageElement = pageForNode(range.endContainer);
    if (!pageElement || pageElement !== endPageElement) {
      setPending(null);
      setError('一次只能在同一页内创建 Evidence Anchor。');
      return;
    }

    const pageRect = pageElement.getBoundingClientRect();
    const geometry = selectionGeometryForPage(pageRect, Array.from(range.getClientRects()));
    if (!geometry) {
      setPending(null);
      setError('无法定位这段文字的逐行选区，请重新选择。');
      return;
    }
    setError(null);
    setPending({
      pageIndex: Number(pageElement.dataset.pageIndex ?? 0),
      selectedText: text,
      bboxNorm: geometry.bboxNorm,
      rectsNorm: geometry.rectsNorm,
    });
  }

  async function commitSelection() {
    if (!pending || !pdfHash) return;
    try {
      const textHash = await sha256LocalPdfValue(pending.selectedText);
      await onAnchorCreate({
        id: crypto.randomUUID(),
        pageIndex: pending.pageIndex,
        bboxNorm: pending.bboxNorm,
        rectsNorm: pending.rectsNorm,
        selectedText: pending.selectedText,
        textHash,
        pdfSha256: pdfHash,
        createdAt: new Date().toISOString(),
      });
      window.getSelection()?.removeAllRanges();
      setPending(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Evidence Anchor 保存失败。');
    }
  }

  const status = renderState === 'opening'
    ? '正在校验并打开本地 PDF…'
    : renderState === 'rendering'
      ? `正在渲染 ${pageCount} 页 PDF…`
      : renderState === 'failed'
        ? 'PDF 打开失败'
        : indexError
          ? `已打开 ${pageCount} 页 · 全文索引不可用`
          : indexProgress
            ? `已打开 ${pageCount} 页 · ${indexProgress}`
            : `已打开 ${pageCount} 页 · 全文索引已完成 · 本地文件未上传`;
  const busy = renderState === 'opening' || renderState === 'rendering' || indexProgress !== null;
  const hasWarning = Boolean(error || indexError || renderWarning);

  return (
    <div ref={viewerRef} className="local-pdf-viewer">
      <div ref={scrollRef} className="pdf-scroll-area">
        <div className="pdf-local-status" role="status">
          {hasWarning ? <AlertTriangle size={15} /> : <LoaderCircle className={busy ? 'spin' : ''} size={15} />}
          <span>{status}</span>
        </div>
        {pending ? (
          <div className="selection-capture" role="toolbar" aria-label="PDF 选区操作">
            <span>
              已选择 {pending.selectedText.length} 个字符 · 第 {pending.pageIndex + 1} 页 · {pending.rectsNorm.length} 个文字片段
            </span>
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
        {indexError ? <div className="reader-error" role="alert">PDF 已打开，但全文索引失败：{indexError}；Paper Map 暂不可用。</div> : null}
        {renderWarning ? <div className="reader-error" role="alert">PDF 已打开，但部分文本层不可用：{renderWarning}；这些页面仍可查看，但无法选择对应文字。</div> : null}
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
