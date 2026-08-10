import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Paper } from '../../domain';
import { LibraryPage } from './LibraryPage';

const paper: Paper = {
  id: 'paper-1',
  title: 'A Real Local Paper',
  currentVersionId: 'version-1',
  authors: ['Ada Reader'],
  year: 2026,
  abstract: null,
  identifiers: [],
  versions: [{
    id: 'version-1',
    label: 'unknown',
    sourceUrl: null,
    license: null,
    pdfSha256: `sha256:${'b'.repeat(64)}`,
    isVersionOf: null,
  }],
  zoteroItemKey: null,
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
};

afterEach(cleanup);

describe('LibraryPage', () => {
  it('renders an honest empty workspace and starts a browser PDF import', () => {
    const onImportPdf = vi.fn();
    render(<LibraryPage
      papers={[]}
      anchorCount={0}
      draftCount={0}
      verifiedCount={0}
      openingPaperId={null}
      nativeFileDialog={false}
      onOpenPaper={() => undefined}
      onImportPdf={onImportPdf}
    />);

    expect(screen.getByRole('heading', { name: '还没有本地论文' })).toBeInTheDocument();
    expect(screen.getByText(/没有推荐流或演示论文/)).toBeInTheDocument();
    expect(screen.queryByText(/Zotero|GitHub|同步/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('选择本地 PDF')).toHaveAttribute('accept', 'application/pdf,.pdf');
  });

  it('filters real papers and opens the selected paper', () => {
    const onOpenPaper = vi.fn();
    render(<LibraryPage
      papers={[paper]}
      anchorCount={2}
      draftCount={1}
      verifiedCount={1}
      openingPaperId={null}
      nativeFileDialog
      onOpenPaper={onOpenPaper}
      onImportPdf={() => undefined}
    />);

    fireEvent.change(screen.getByPlaceholderText('按标题或作者筛选…'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: /A Real Local Paper/ }));
    expect(onOpenPaper).toHaveBeenCalledWith('paper-1');
  });
});
