import { FilePlus2, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { DemoBanner } from '../../components/DemoBanner';
import { PageHeader } from '../../components/PageHeader';
import type { Paper } from '../../domain';

interface LibraryPageProps {
  papers: readonly Paper[];
  anchorCount: number;
  draftCount: number;
  verifiedCount: number;
  openingPaperId: string | null;
  nativeFileDialog: boolean;
  onOpenPaper: (paperId: string) => void;
  onImportPdf: (file?: File) => void;
}

export function LibraryPage({
  papers,
  anchorCount,
  draftCount,
  verifiedCount,
  openingPaperId,
  nativeFileDialog,
  onOpenPaper,
  onImportPdf,
}: LibraryPageProps) {
  const [query, setQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredPapers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return papers;
    return papers.filter((paper) =>
      `${paper.title} ${paper.authors.join(' ')} ${paper.year ?? ''}`.toLowerCase().includes(normalized),
    );
  }, [papers, query]);

  const startImport = () => {
    if (nativeFileDialog) onImportPdf();
    else fileInputRef.current?.click();
  };

  return (
    <div className="page">
      <DemoBanner />
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept="application/pdf,.pdf"
        aria-label="选择本地 PDF"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImportPdf(file);
          event.target.value = '';
        }}
      />
      <PageHeader
        title="文献库"
        description="这里只显示已经导入当前本地工作区的真实 PDF；没有推荐流或演示论文。"
        actions={<Button variant="primary" icon={<FilePlus2 size={17} />} onClick={startImport}>导入 PDF</Button>}
      />
      <section className="metric-grid" aria-label="本地工作区概览">
        <article><span>本地论文</span><strong>{papers.length}</strong><small>来自当前 workspace</small></article>
        <article><span>Evidence Anchor</span><strong>{anchorCount}</strong><small>均可回到原始 PDF</small></article>
        <article><span>待审阅 Draft</span><strong>{draftCount}</strong><small>人工或未来 AI 提案</small></article>
        <article><span>Verified Claim</span><strong>{verifiedCount}</strong><small>经过人工接受或编辑</small></article>
      </section>
      <section className="table-shell" aria-label="本地论文列表">
        <div className="table-toolbar">
          <strong>已导入 PDF</strong>
          <label className="table-search"><Search size={16} /><span className="sr-only">筛选当前列表</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按标题或作者筛选…" /></label>
        </div>
        {papers.length === 0 ? (
          <div className="empty-state">
            <h2>还没有本地论文</h2>
            <p>导入一个 PDF，开始建立可回溯的 Evidence Anchor。</p>
            <Button variant="primary" icon={<FilePlus2 size={17} />} onClick={startImport}>导入第一个 PDF</Button>
          </div>
        ) : (
          <div className="responsive-table" tabIndex={0} aria-label="可横向滚动的论文表格">
            <table>
              <thead><tr><th scope="col">论文</th><th scope="col">年份</th><th scope="col">版本</th><th scope="col">本地状态</th></tr></thead>
              <tbody>
                {filteredPapers.map((paper) => (
                  <tr key={paper.id}>
                    <td><button type="button" className="table-title" disabled={openingPaperId !== null} onClick={() => onOpenPaper(paper.id)}><strong>{paper.title}</strong><small>{paper.authors.length ? paper.authors.join(', ') : '作者信息未录入'}</small></button></td>
                    <td>{paper.year ?? '—'}</td>
                    <td>{paper.versions.find((version) => version.id === paper.currentVersionId)?.label ?? 'unknown'}</td>
                    <td><span className="state-badge is-reading">{openingPaperId === paper.id ? '正在打开' : '本机持久化'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {papers.length > 0 && filteredPapers.length === 0 ? <div className="empty-state"><h2>没有匹配的论文</h2><p>清除筛选条件后再试。</p></div> : null}
      </section>
    </div>
  );
}
