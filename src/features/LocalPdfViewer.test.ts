import { describe, expect, it } from 'vitest';
import type { EvidenceAnchor } from '../domain';
import { classifyAnchorForPdf, readTextContent } from './LocalPdfViewer';

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
