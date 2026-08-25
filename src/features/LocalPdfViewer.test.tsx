import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvidenceAnchor } from '../domain';
import {
  LocalPdfViewer,
  classifyAnchorForPdf,
  readTextContent,
  selectionGeometryForPage,
} from './LocalPdfViewer';

const pdfMocks = vi.hoisted(() => ({
  failText: false,
  getDocument: vi.fn(),
  streamTextContent: vi.fn(),
  renderPage: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: pdfMocks.getDocument,
  TextLayer: class {
    render() { return Promise.resolve(); }
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

function installPdfMock() {
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
      scale,
      transform: [scale, 0, 0, -scale, 0, 800 * scale],
    }),
    streamTextContent: pdfMocks.streamTextContent.mockImplementation(textContentStream),
    render: pdfMocks.renderPage.mockImplementation(() => ({ promise: Promise.resolve() })),
  };
  pdfMocks.getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: 1, getPage: vi.fn().mockResolvedValue(page) }),
    destroy: vi.fn().mockResolvedValue(undefined),
  });
}

beforeEach(() => {
  pdfMocks.failText = false;
  pdfMocks.getDocument.mockReset();
  pdfMocks.streamTextContent.mockReset();
  pdfMocks.renderPage.mockReset();
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
    expect(pdfMocks.streamTextContent).toHaveBeenCalledTimes(1);

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
    expect(pdfMocks.streamTextContent).toHaveBeenCalledTimes(1);
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
