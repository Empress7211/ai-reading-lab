import { describe, expect, it } from 'vitest';
import {
  buildDocumentBlocks,
  extractPageTextLines,
  isEvidenceDocumentBlock,
  orderPaperMapNodes,
  type PageTextLine,
  type PageTextRun,
  type PaperMapNode,
} from './paperMap';

function run(text: string, x0: number, y0: number, x1: number, y1: number, hasEol = false): PageTextRun {
  return { text, bbox: [x0, y0, x1, y1], fontSize: y1 - y0, hasEol };
}

describe('paper document blocks', () => {
  it('combines deterministic runs into lines with stable one-based ids', () => {
    const runs = [
      run('Evidence', 0.1, 0.2, 0.18, 0.22),
      run('bound', 0.19, 0.2, 0.24, 0.22),
      run('reading.', 0.25, 0.2, 0.32, 0.22, true),
    ];
    const lines = extractPageTextLines(1, runs);
    const blocks = buildDocumentBlocks([lines]);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toBe('Evidence bound reading.');
    expect(blocks[0]?.id).toBe('p0001-b0001');
    expect(blocks[0]?.page).toBe(1);
  });

  it('keeps front matter, email, and references outside the evidence whitelist', () => {
    const pageOne: PageTextLine[] = [
      { page: 1, text: 'Evidence Bound Paper', bbox: [0.1, 0.08, 0.9, 0.13], fontSize: 0.05 },
      { page: 1, text: 'Ada Author, Lin Reader', bbox: [0.2, 0.16, 0.8, 0.18], fontSize: 0.02 },
      { page: 1, text: 'ada@example.org', bbox: [0.3, 0.19, 0.7, 0.21], fontSize: 0.02 },
      { page: 1, text: 'Abstract', bbox: [0.1, 0.25, 0.2, 0.28], fontSize: 0.03 },
      { page: 1, text: 'This paper reports a result.', bbox: [0.1, 0.3, 0.9, 0.32], fontSize: 0.02 },
      { page: 1, text: 'References', bbox: [0.1, 0.8, 0.25, 0.83], fontSize: 0.03 },
      { page: 1, text: '[1] Prior work.', bbox: [0.1, 0.85, 0.5, 0.87], fontSize: 0.02 },
    ];
    const blocks = buildDocumentBlocks([pageOne]);

    expect(blocks.map((block) => block.kind)).toEqual([
      'title', 'front_matter', 'email', 'section_heading', 'abstract', 'section_heading', 'reference',
    ]);
    expect(blocks.filter(isEvidenceDocumentBlock).map((block) => block.text)).toEqual([
      'This paper reports a result.',
    ]);
  });
});

describe('paper map reading goals', () => {
  it('reorders nodes locally without changing the nodes', () => {
    const node = (id: string, kind: PaperMapNode['kind']): PaperMapNode => ({
      id,
      kind,
      title: id,
      summary: id,
      evidenceGroups: [{ id: `${id}-e`, label: id, blockIds: ['p0001-b0001'] }],
    });
    const nodes = [node('problem', 'problem'), node('method', 'method'), node('result', 'result')];

    expect(orderPaperMapNodes(nodes, 'reproduce').map((item) => item.id)).toEqual([
      'method', 'result', 'problem',
    ]);
    expect(nodes.map((item) => item.id)).toEqual(['problem', 'method', 'result']);
  });
});
