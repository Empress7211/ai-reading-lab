import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalDocumentIndex, PaperMapArtifact } from '../../domain';
import { PaperMapPanel } from './PaperMapPanel';

const documentIndex: LocalDocumentIndex = {
  pdfSha256: `sha256:${'b'.repeat(64)}`,
  parserVersion: 'paperweave-blocks-v1-pdfjs-5.6.205',
  pageCount: 2,
  blocks: [
    { id: 'p0001-b0001', page: 1, bbox: [0.1, 0.2, 0.8, 0.24], kind: 'paragraph', sectionPath: ['Introduction'], text: 'The paper defines the problem.' },
    { id: 'p0001-b0002', page: 1, bbox: [0.1, 0.3, 0.8, 0.34], kind: 'paragraph', sectionPath: ['Method'], text: 'The method distills memory.' },
    { id: 'p0002-b0001', page: 2, bbox: [0.1, 0.2, 0.8, 0.24], kind: 'paragraph', sectionPath: ['Results'], text: 'The reported result improves.' },
    { id: 'p0002-b0002', page: 2, bbox: [0.1, 0.3, 0.8, 0.34], kind: 'section_heading', sectionPath: ['Conclusion'], text: 'Conclusion' },
  ],
};

const kinds: PaperMapArtifact['nodes'][number]['kind'][] = [
  'problem', 'method', 'result', 'limitation', 'conclusion',
];
const paperMap: PaperMapArtifact = {
  id: 'paper-map-paper-1',
  schemaVersion: 'paper_map.v1',
  paperId: 'paper-1',
  paperVersionId: 'version-1',
  pdfSha256: documentIndex.pdfSha256,
  parserVersion: documentIndex.parserVersion,
  pageCount: 2,
  blockCount: 4,
  modelRunId: 'run-1',
  model: 'model-a',
  generatedAt: '2026-08-18T00:00:00.000Z',
  nodes: kinds.map((kind, index) => ({
    id: `node-${index}`,
    title: `${kind} node`,
    summary: `Explanation for ${kind}.`,
    kind,
    evidenceGroups: [{ id: `group-${index}`, label: 'Local evidence', blockIds: [documentIndex.blocks[Math.min(index, 2)]!.id] }],
  })),
};

afterEach(cleanup);

function renderPanelProps(
  overrides: Partial<React.ComponentProps<typeof PaperMapPanel>> = {},
): React.ComponentProps<typeof PaperMapPanel> {
  return {
    paperId: 'paper-1',
    paperVersionId: 'version-1',
    model: 'model-a',
    documentIndex,
    documentIndexError: null,
    paperMap: null,
    stalePaperMap: false,
    anchors: [],
    onGenerate: vi.fn().mockResolvedValue(undefined),
    onJumpBlock: vi.fn(),
    onIncludeBlock: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof PaperMapPanel>> = {}) {
  const props = renderPanelProps(overrides);
  render(<PaperMapPanel {...props} />);
  return props;
}

describe('PaperMapPanel', () => {
  it('labels every map state as experimental, single-paper, and unreviewed', () => {
    const { rerender } = render(<PaperMapPanel {...renderPanelProps({ documentIndex: null })} />);
    expect(screen.getByText('实验性 Paper Map · 仅当前单篇 · AI 生成且未审阅')).toBeInTheDocument();
    rerender(<PaperMapPanel {...renderPanelProps({ paperMap })} />);
    expect(screen.getByText('实验性 Paper Map · 仅当前单篇 · AI 生成且未审阅')).toBeInTheDocument();
  });

  it('shows an index failure instead of an endless loading state', () => {
    renderPanel({ documentIndex: null, documentIndexError: '第 2 页文本提取失败' });

    expect(screen.getByRole('alert')).toHaveTextContent('全文索引不可用');
    expect(screen.getByRole('alert')).toHaveTextContent('Paper Map 暂不可生成');
    expect(screen.queryByText('正在本地建立可回跳的全文索引…')).not.toBeInTheDocument();
  });
  it('requires an explicit per-paper confirmation before generation', async () => {
    const props = renderPanel();
    const generate = screen.getByRole('button', { name: '生成论证地图' });
    expect(generate).toBeDisabled();
    expect(screen.getByText(/本次发送 3 个正文证据块/)).toBeInTheDocument();
    expect(props.onGenerate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: '我确认本次发送这篇论文的结构化全文文本' }));
    fireEvent.click(generate);

    await waitFor(() => expect(props.onGenerate).toHaveBeenCalledWith(documentIndex, true));
  });

  it('shows provider errors without inventing a map or retrying', async () => {
    const onGenerate = vi.fn().mockRejectedValue(new Error('PAPER_MAP_BLOCK_NOT_FOUND: invalid block'));
    renderPanel({ onGenerate });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '生成论证地图' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('PAPER_MAP_BLOCK_NOT_FOUND: invalid block');
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('problem node')).not.toBeInTheDocument();
  });

  it('reorders the ready route locally and only jumps after a user click', async () => {
    const props = renderPanel({ paperMap });
    expect(screen.getAllByRole('heading', { level: 3 })[0]).toHaveTextContent('problem node');
    expect(props.onJumpBlock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('这次阅读的目标'), { target: { value: 'reproduce' } });
    expect(screen.getAllByRole('heading', { level: 3 })[0]).toHaveTextContent('method node');
    expect(props.onGenerate).not.toHaveBeenCalled();
    expect(props.onJumpBlock).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: /回到首条证据/ })[0]!);
    expect(props.onJumpBlock).toHaveBeenCalledWith(documentIndex.blocks[1]);

    fireEvent.click(screen.getAllByRole('button', { name: '纳入证据' })[0]!);
    await waitFor(() => expect(props.onIncludeBlock).toHaveBeenCalled());
  });

  it('marks an incompatible map stale and blocks its evidence actions', () => {
    renderPanel({ paperMap, stalePaperMap: true });

    expect(screen.getByRole('alert')).toHaveTextContent('论证地图已过期');
    expect(screen.queryByText('problem node')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '纳入证据' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成论证地图' })).toBeDisabled();
  });
});
