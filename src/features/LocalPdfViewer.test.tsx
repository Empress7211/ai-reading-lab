import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvidenceAnchor } from '../domain';
import {
  LocalPdfViewer,
  classifyAnchorForPdf,
  pageNumbersForRenderWindow,
  readTextContent,
  selectionGeometryForPage,
} from './LocalPdfViewer';

const pdfMocks = vi.hoisted(() => ({
  failText: false,
  getDocument: vi.fn(),
  getPage: vi.fn(),
  streamTextContent: vi.fn(),
  renderPage: vi.fn(),
  cancelRenderPage: vi.fn(),
  cleanupPage: vi.fn(),
  renderTextLayer: vi.fn(),
  cancelTextLayer: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: pdfMocks.getDocument,
  TextLayer: class {
    render() { return pdfMocks.renderTextLayer(); }
    cancel() { pdfMocks.cancelTextLayer(); }
  },
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'mock-pdf-worker' }));

function textContentStream() {
  let read = false;
  return {
    getReader: () => ({
      read: async () => {
        if (pdfMocks.failText) throw new Error('mock text extraction failure');
        if (read) return { done: true, value: undefined };
        read = true;
        return {
          done: false,
          value: {
            items: [{ str: 'Mock PDF evidence', transform: [1, 0, 0, 12, 24, 48], width: 120, hasEOL: false }],
            styles: {},
            lang: 'en',
          },
        };
      },
      releaseLock: () => undefined,
    }),
  };
}

function installPdfMock({ numPages = 1 }: { numPages?: number } = {}) {
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
      scale,
      transform: [scale, 0, 0, -scale, 0, 800 * scale],
    }),
    streamTextContent: pdfMocks.streamTextContent.mockImplementation(textContentStream),
    render: pdfMocks.renderPage.mockImplementation(() => ({
      promise: Promise.resolve(),
      cancel: pdfMocks.cancelRenderPage,
    })),
    cleanup: pdfMocks.cleanupPage,
  };
  pdfMocks.getPage.mockImplementation(async () => page);
  pdfMocks.getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages, getPage: pdfMocks.getPage }),
    destroy: vi.fn().mockResolvedValue(undefined),
  });
}

beforeEach(() => {
  pdfMocks.failText = false;
  pdfMocks.getDocument.mockReset();
  pdfMocks.getPage.mockReset();
  pdfMocks.streamTextContent.mockReset();
  pdfMocks.renderPage.mockReset();
  pdfMocks.cancelRenderPage.mockReset();
  pdfMocks.cleanupPage.mockReset();
  pdfMocks.renderTextLayer.mockReset().mockResolvedValue(undefined);
  pdfMocks.cancelTextLayer.mockReset();
  installPdfMock();
  vi.stubGlobal('crypto', {
    randomUUID: () => 'anchor-new',
    subtle: { digest: async () => new Uint8Array(32).buffer },
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 900, bottom: 800,
    width: 900, height: 800, toJSON: () => ({}),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({})),
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function anchor(overrides: Partial<EvidenceAnchor> = {}): EvidenceAnchor {
  return {
    id: 'anchor-1',
    paperVersionId: 'version-1',
    pageIndex: 1,
    bboxNorm: [0.1, 0.2, 0.7, 0.3],
    selectedText: 'Persistent local evidence',
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
    ...overrides,
  };
}

const context = {
  pdfHash: 'b'.repeat(64),
  pageCount: 3,
  paperVersionId: 'version-1',
};

describe('persisted PDF Anchor location state', () => {
  it('keeps multi-line selections as precise fragments instead of one painted slab', () => {
    const geometry = selectionGeometryForPage(
      { left: 100, top: 200, right: 1100, bottom: 1200, width: 1000, height: 1000 },
      [
        { left: 200, top: 300, right: 600, bottom: 325 },
        { left: 200, top: 340, right: 480, bottom: 365 },
        { left: 1200, top: 340, right: 1250, bottom: 365 },
      ],
    );

    expect(geometry).toEqual({
      bboxNorm: [0.1, 0.1, 0.5, 0.165],
      rectsNorm: [
        [0.1, 0.1, 0.5, 0.125],
        [0.1, 0.14, 0.38, 0.165],
      ],
    });
  });

  it('reads PDF.js text chunks without requiring ReadableStream async iteration', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue({
          items: [{ str: 'Desktop text' }],
          styles: { body: { fontFamily: 'sans-serif', ascent: 0.8, descent: -0.2, vertical: false } },
          lang: 'zh-CN',
        });
        controller.close();
      },
    });
    Object.defineProperty(stream, Symbol.asyncIterator, { value: undefined });

    const content = await readTextContent({ streamTextContent: () => stream } as never);

    expect(content.lang).toBe('zh-CN');
    expect(content.items).toEqual([{ str: 'Desktop text' }]);
    expect(content.styles.body?.fontFamily).toBe('sans-serif');
  });

  it('distinguishes ready, orphaned, corrupt, mismatched, and invalid-page Anchors', () => {
    expect(classifyAnchorForPdf(anchor(), context).status).toBe('ready');
    expect(classifyAnchorForPdf(anchor({ relocationStatus: 'orphaned' }), context).status).toBe(
      'orphaned',
    );
    expect(classifyAnchorForPdf(anchor({ bboxNorm: [0.8, 0.2, 0.1, 0.3] }), context).status).toBe(
      'corrupt',
    );
    expect(classifyAnchorForPdf(anchor({ pdfSha256: `sha256:${'c'.repeat(64)}` }), context).status).toBe(
      'pdf-mismatch',
    );
    expect(classifyAnchorForPdf(anchor({ pageIndex: 3 }), context)).toMatchObject({
      status: 'page-invalid',
      message: expect.stringContaining('只有 3 页'),
    });
  });

  it('marks an Anchor from another paper version as recoverably orphaned', () => {
    expect(classifyAnchorForPdf(anchor({ paperVersionId: 'version-old' }), context)).toMatchObject({
      status: 'orphaned',
      message: expect.stringContaining('另一个 PDF 版本'),
    });
  });
});

describe('LocalPdfViewer lifecycle separation', () => {
  function localPdfFile(): File {
    return {
      name: 'paper.pdf',
      arrayBuffer: async () => new TextEncoder().encode('%PDF-mock').buffer,
    } as unknown as File;
  }

  it('keeps a bounded render window around the current page', () => {
    expect(pageNumbersForRenderWindow(86, 1)).toEqual([1, 2]);
    expect(pageNumbersForRenderWindow(86, 42)).toEqual([41, 42, 43]);
    expect(pageNumbersForRenderWindow(86, 86)).toEqual([85, 86]);
  });

  it('creates every page placeholder without rendering every page canvas', async () => {
    pdfMocks.getDocument.mockReset();
    installPdfMock({ numPages: 8 });

    const { container } = render(<LocalPdfViewer
      file={localPdfFile()}
      onAnchorCreate={() => undefined}
    />);

    await waitFor(() => {
      expect(container.querySelectorAll('.pdf-live-page')).toHaveLength(8);
      expect(pdfMocks.renderPage).toHaveBeenCalledTimes(2);
    });
    expect(container.querySelectorAll('.pdf-live-page canvas')).toHaveLength(2);
    expect(container.querySelectorAll('.pdf-live-page .textLayer')).toHaveLength(2);
  });

  it('hydrates mixed-size and rotated page placeholders with each page viewport', async () => {
    pdfMocks.getDocument.mockReset();
    const pageSizes = new Map<number, readonly [number, number]>([
      [1, [612, 792]],
      [2, [595.276, 841.89]],
      [3, [792, 612]],
      [4, [595.276, 841.89]],
    ]);
    pdfMocks.getPage.mockImplementation(async (pageNumber: number) => {
      const size = pageSizes.get(pageNumber);
      if (!size) throw new Error(`missing mock page ${pageNumber}`);
      const [width, height] = size;
      return {
        getViewport: ({ scale }: { scale: number }) => ({
          width: width * scale,
          height: height * scale,
          scale,
          transform: [scale, 0, 0, -scale, 0, height * scale],
        }),
        streamTextContent: pdfMocks.streamTextContent,
        render: pdfMocks.renderPage,
        cleanup: pdfMocks.cleanupPage,
      };
    });
    pdfMocks.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 4, getPage: pdfMocks.getPage }),
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    const { container } = render(<LocalPdfViewer
      file={localPdfFile()}
      onAnchorCreate={() => undefined}
    />);

    await waitFor(() => {
      const pages = container.querySelectorAll<HTMLElement>('.pdf-live-page');
      expect(pages).toHaveLength(4);
      expect(Number.parseFloat(pages[0]!.style.getPropertyValue('--page-height')))
        .toBeCloseTo(820 * 792 / 612, 3);
      expect(Number.parseFloat(pages[1]!.style.getPropertyValue('--page-height')))
        .toBeCloseTo(820 * 841.89 / 595.276, 3);
      expect(Number.parseFloat(pages[2]!.style.getPropertyValue('--page-height')))
        .toBeCloseTo(820 * 612 / 792, 3);
    });
    expect(container.querySelectorAll('.pdf-live-page canvas')).toHaveLength(2);
  });

  it('moves the bounded canvas window when paging while preserving placeholders', async () => {
    pdfMocks.getDocument.mockReset();
    installPdfMock({ numPages: 8 });

    const { container } = render(<LocalPdfViewer
      file={localPdfFile()}
      onAnchorCreate={() => undefined}
    />);

    await waitFor(() => expect(pdfMocks.renderPage).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(pdfMocks.renderPage).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(container.querySelector('.pdf-page-control')).toHaveTextContent('2 / 8'));
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(pdfMocks.renderPage).toHaveBeenCalledTimes(4));

    expect(container.querySelectorAll('.pdf-live-page')).toHaveLength(8);
    expect(container.querySelectorAll('.pdf-live-page canvas')).toHaveLength(3);
    expect(container.querySelector('.pdf-live-page[data-page-index="0"] canvas')).not.toBeInTheDocument();
    expect(container.querySelector('.pdf-live-page[data-page-index="3"] canvas')).toBeInTheDocument();
    expect(pdfMocks.cleanupPage).toHaveBeenCalled();
  });

  it('does not mount a slow page after a newer far-away render window wins', async () => {
    pdfMocks.getDocument.mockReset();
    let resolveSlowPage!: (page: ReturnType<typeof pageForNumber>) => void;

    function pageForNumber(pageNumber: number) {
      return {
        getViewport: ({ scale }: { scale: number }) => ({
          width: 600 * scale,
          height: 800 * scale,
          scale,
          transform: [scale, 0, 0, -scale, 0, 800 * scale],
        }),
        streamTextContent: pdfMocks.streamTextContent,
        render: pdfMocks.renderPage,
        cleanup: () => pdfMocks.cleanupPage(pageNumber),
      };
    }

    const slowPage = new Promise<ReturnType<typeof pageForNumber>>((resolve) => {
      resolveSlowPage = resolve;
    });
    pdfMocks.getPage.mockImplementation((pageNumber: number) => (
      pageNumber === 2 ? slowPage : Promise.resolve(pageForNumber(pageNumber))
    ));
    pdfMocks.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 86, getPage: pdfMocks.getPage }),
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    const farAnchor = anchor({
      pageIndex: 85,
      pdfSha256: `sha256:${'0'.repeat(64)}`,
      rectsNorm: [[0.1, 0.2, 0.7, 0.3]],
    });
    const { container } = render(<LocalPdfViewer
      file={localPdfFile()}
      anchors={[farAnchor]}
      expectedPaperVersionId="version-1"
      activeAnchorId={farAnchor.id}
      onAnchorCreate={() => undefined}
    />);

    await waitFor(() => {
      expect(container.querySelectorAll('.pdf-live-page canvas')).toHaveLength(2);
      expect(container.querySelector('.pdf-live-page[data-page-index="84"] canvas')).toBeInTheDocument();
      expect(container.querySelector('.pdf-live-page[data-page-index="85"] canvas')).toBeInTheDocument();
    });

    resolveSlowPage(pageForNumber(2));

    await waitFor(() => {
      expect(pdfMocks.cleanupPage.mock.calls.filter(([pageNumber]) => pageNumber === 2))
        .toHaveLength(2);
    });
    expect(container.querySelector('.pdf-live-page[data-page-index="1"] canvas')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.pdf-live-page canvas')).toHaveLength(2);
    expect(screen.queryByText('PDF 打开失败')).not.toBeInTheDocument();
  });

  it('does not retain raw TextContent after a page leaves the render window', async () => {
    pdfMocks.getDocument.mockReset();
    installPdfMock({ numPages: 8 });

    const { container } = render(<LocalPdfViewer
      file={localPdfFile()}
      onAnchorCreate={() => undefined}
    />);

    await waitFor(() => expect(pdfMocks.renderTextLayer).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(pdfMocks.renderTextLayer).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(pdfMocks.renderTextLayer).toHaveBeenCalledTimes(4));
    const textReadsAfterForwardPaging = pdfMocks.streamTextContent.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: '上一页' }));
    await waitFor(() => expect(container.querySelector('.pdf-page-control')).toHaveTextContent('2 / 8'));
    await waitFor(() => expect(pdfMocks.renderTextLayer).toHaveBeenCalledTimes(5));
    expect(pdfMocks.streamTextContent.mock.calls.length).toBeGreaterThan(textReadsAfterForwardPaging);
  });

  it('cancels an obsolete render on zoom and ignores its later failure', async () => {
    let rejectObsoleteRender: ((reason: Error) => void) | undefined;
    const cancelObsoleteRender = vi.fn();
    pdfMocks.renderPage
      .mockImplementationOnce(() => ({
        promise: new Promise<void>((_resolve, reject) => {
          rejectObsoleteRender = reject;
        }),
        cancel: cancelObsoleteRender,
      }))
      .mockImplementation(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));

    render(<LocalPdfViewer
      file={localPdfFile()}
      onAnchorCreate={() => undefined}
    />);

    await waitFor(() => expect(pdfMocks.renderPage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    await waitFor(() => expect(cancelObsoleteRender).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pdfMocks.renderPage).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/全文索引已完成/)).toBeInTheDocument();

    rejectObsoleteRender?.(new Error('obsolete canvas failure'));
    await waitFor(() => expect(screen.queryByText('PDF 打开失败')).not.toBeInTheDocument());
    expect(screen.queryByText(/obsolete canvas failure/)).not.toBeInTheDocument();
  });

  it('cancels an obsolete TextLayer on zoom', async () => {
    pdfMocks.renderTextLayer
      .mockImplementationOnce(() => new Promise<void>(() => undefined))
      .mockResolvedValue(undefined);

    render(<LocalPdfViewer
      file={localPdfFile()}
      onAnchorCreate={() => undefined}
    />);

    await waitFor(() => expect(pdfMocks.renderTextLayer).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    await waitFor(() => expect(pdfMocks.cancelTextLayer).toHaveBeenCalled());
    await waitFor(() => expect(pdfMocks.renderTextLayer).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/全文索引已完成/)).toBeInTheDocument();
  });

  it('keeps the current page render window when zooming away from page one', async () => {
    pdfMocks.getDocument.mockReset();
    installPdfMock({ numPages: 8 });

    const { container } = render(<LocalPdfViewer
      file={localPdfFile()}
      onAnchorCreate={() => undefined}
    />);

    await waitFor(() => expect(pdfMocks.renderPage).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(container.querySelector('.pdf-page-control')).toHaveTextContent('2 / 8'));
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(container.querySelector('.pdf-page-control')).toHaveTextContent('3 / 8'));
    fireEvent.click(screen.getByRole('button', { name: '放大' }));

    await waitFor(() => expect(container.querySelectorAll('.pdf-live-page canvas')).toHaveLength(3));
    expect(container.querySelector('.pdf-live-page[data-page-index="0"] canvas')).not.toBeInTheDocument();
    expect(container.querySelector('.pdf-live-page[data-page-index="1"] canvas')).toBeInTheDocument();
    expect(container.querySelector('.pdf-live-page[data-page-index="2"] canvas')).toBeInTheDocument();
    expect(container.querySelector('.pdf-live-page[data-page-index="3"] canvas')).toBeInTheDocument();
  });

  it('indexes once while zoom and Anchor updates only rerender their own layers', async () => {
    const file = localPdfFile();
    const onDocumentIndexChange = vi.fn();
    const onAnchorStatesChange = vi.fn();
    const { rerender } = render(<LocalPdfViewer
      file={file}
      anchors={[]}
      expectedPaperVersionId="version-1"
      onAnchorCreate={() => undefined}
      onAnchorStatesChange={onAnchorStatesChange}
      onDocumentIndexChange={onDocumentIndexChange}
    />);

    await waitFor(() => expect(onDocumentIndexChange).toHaveBeenCalledWith(
      expect.objectContaining({ pageCount: 1 }),
    ));
    await screen.findByText(/全文索引已完成/);
    expect(pdfMocks.getDocument).toHaveBeenCalledTimes(1);
    expect(pdfMocks.streamTextContent).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    await waitFor(() => expect(pdfMocks.renderPage).toHaveBeenCalledTimes(2));
    expect(pdfMocks.getDocument).toHaveBeenCalledTimes(1);
    expect(pdfMocks.streamTextContent).toHaveBeenCalledTimes(2);

    const nextAnchor = anchor({
      pageIndex: 0,
      pdfSha256: `sha256:${'0'.repeat(64)}`,
      rectsNorm: [[0.1, 0.2, 0.7, 0.3]],
    });
    rerender(<LocalPdfViewer
      file={file}
      anchors={[nextAnchor]}
      expectedPaperVersionId="version-1"
      onAnchorCreate={() => undefined}
      onAnchorStatesChange={onAnchorStatesChange}
      onDocumentIndexChange={onDocumentIndexChange}
    />);
    await waitFor(() => expect(document.querySelector('.pdf-anchor-overlay')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Evidence Anchor/ })).not.toBeInTheDocument();
    expect(pdfMocks.getDocument).toHaveBeenCalledTimes(1);
    expect(pdfMocks.streamTextContent).toHaveBeenCalledTimes(2);
    expect(onDocumentIndexChange.mock.calls.filter(([value]) => value?.pageCount === 1)).toHaveLength(1);
  });

  it('uses the non-rAF PDF.js render path required by the bundled WKWebView', async () => {
    pdfMocks.renderPage.mockImplementationOnce((options: { intent?: string }) => ({
      promise: options.intent === 'print' ? Promise.resolve() : new Promise<void>(() => undefined),
    }));

    render(<LocalPdfViewer
      file={localPdfFile()}
      onAnchorCreate={() => undefined}
    />);

    expect(await screen.findByText(/全文索引已完成/)).toBeInTheDocument();
    expect(pdfMocks.renderPage).toHaveBeenCalledWith(expect.objectContaining({ intent: 'print' }));
  });

  it('keeps 61 precise Anchor fragments visual without exposing repeated controls', async () => {
    const file = localPdfFile();
    const fragments = Array.from({ length: 61 }, (_, index) => [
      0.1,
      0.01 + index * 0.01,
      0.7,
      0.015 + index * 0.01,
    ] as const);
    const fragmentedAnchor = anchor({
      pageIndex: 0,
      pdfSha256: `sha256:${'0'.repeat(64)}`,
      rectsNorm: fragments,
    });
    const { container } = render(<LocalPdfViewer
      file={file}
      anchors={[fragmentedAnchor]}
      expectedPaperVersionId="version-1"
      activeAnchorId={fragmentedAnchor.id}
      onAnchorCreate={() => undefined}
      onAnchorStatesChange={() => undefined}
    />);

    await waitFor(() => {
      expect(container.querySelectorAll('.pdf-anchor-overlay')).toHaveLength(61);
      expect(container.querySelectorAll('.pdf-anchor-overlay.is-focused')).toHaveLength(61);
    });
    expect(screen.queryByRole('button', { name: /Evidence Anchor/ })).not.toBeInTheDocument();
    for (const overlay of container.querySelectorAll('.pdf-anchor-overlay')) {
      expect(overlay.tagName).toBe('DIV');
      expect(overlay).toHaveAttribute('aria-hidden', 'true');
      expect(overlay).not.toHaveAttribute('tabindex');
    }
    const scrollIntoView = vi.mocked(HTMLElement.prototype.scrollIntoView);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    await waitFor(() => expect(pdfMocks.renderPage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.querySelectorAll('.pdf-anchor-overlay')).toHaveLength(61));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('keeps the PDF canvas usable when optional full-text indexing fails', async () => {
    const file = localPdfFile();
    pdfMocks.failText = true;
    const onDocumentIndexError = vi.fn();
    const onAnchorStatesChange = vi.fn();
    render(<LocalPdfViewer
      file={file}
      anchors={[anchor({ pageIndex: 0, pdfSha256: `sha256:${'0'.repeat(64)}` })]}
      expectedPaperVersionId="version-1"
      onAnchorCreate={() => undefined}
      onAnchorStatesChange={onAnchorStatesChange}
      onDocumentIndexError={onDocumentIndexError}
    />);

    expect(await screen.findByText(/PDF 已打开，但全文索引失败/)).toBeInTheDocument();
    expect(screen.getByLabelText('PDF 第 1 页')).toBeInTheDocument();
    expect(onDocumentIndexError).toHaveBeenCalledWith(expect.stringContaining('文本提取失败'));
    expect(onAnchorStatesChange.mock.calls.flatMap(([states]) => states)
      .some((state) => state.status === 'pdf-corrupt')).toBe(false);
  });
});
