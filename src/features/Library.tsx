import { FilePlus2, RefreshCw, Search } from 'lucide-react';

import { roleLabels, type DemoPaper } from '../data/demo';

export type LibraryFilter = 'all' | 'reading' | 'review' | 'missing-pdf' | 'conflict';

const FILTER_LABELS: Record<LibraryFilter, string> = {
  all: '全部',
  reading: '阅读中',
  review: '待审阅',
  'missing-pdf': '无 PDF',
  conflict: '同步冲突',
};

export interface LibraryProps {
  papers: readonly DemoPaper[];
  activeFilter: LibraryFilter;
  searchQuery: string;
  pendingReviewByPaperId: Readonly<Record<string, number>>;
  onFilterChange: (filter: LibraryFilter) => void;
  onSearchQueryChange: (query: string) => void;
  onOpenPaper: (paper: DemoPaper) => void;
  onScanZotero: () => void;
  onImportPdf: () => void;
}

export function Library({
  papers,
  activeFilter,
  searchQuery,
  pendingReviewByPaperId,
  onFilterChange,
  onSearchQueryChange,
  onOpenPaper,
  onScanZotero,
  onImportPdf,
}: LibraryProps) {
  const localPdfCount = papers.filter((paper) => paper.access === 'OA PDF').length;
  const zoteroCount = papers.filter((paper) => paper.zotero === '已在库中').length;
  const pendingReviewCount = Object.values(pendingReviewByPaperId).reduce(
    (sum, count) => sum + count,
    0,
  );
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const visiblePapers = normalizedQuery
    ? papers.filter((paper) =>
        [paper.title, paper.authors, paper.venue, roleLabels[paper.role]]
          .join(' ')
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    : papers;

  return (
    <div className="page library-page">
      <div className="section-heading">
        <div>
          <h1>文献库</h1>
          <p>Zotero 管理书目与附件；PaperWeave 管理阅读状态、证据与研究理解。</p>
        </div>
        <div className="actions">
          <button className="secondary-button" type="button" onClick={onScanZotero}>
            <RefreshCw aria-hidden="true" /> 扫描 Zotero
          </button>
          <button className="primary-button" type="button" onClick={onImportPdf}>
            <FilePlus2 aria-hidden="true" /> 导入 PDF
          </button>
        </div>
      </div>

      <dl className="metric-grid" aria-label="文献库摘要">
        <div className="metric-card">
          <dt>工作区论文</dt>
          <dd>{papers.length}</dd>
          <small>{localPdfCount} 篇可打开 PDF</small>
        </div>
        <div className="metric-card">
          <dt>Zotero 已关联</dt>
          <dd>{zoteroCount}</dd>
          <small>书目与附件仍以 Zotero 为准</small>
        </div>
        <div className="metric-card">
          <dt>待审阅</dt>
          <dd>{pendingReviewCount}</dd>
          <small>Draft 不进入正式综合</small>
        </div>
        <div className="metric-card">
          <dt>本地状态</dt>
          <dd>可用</dd>
          <small>断网仍可阅读与手工笔记</small>
        </div>
      </dl>

      <section className="table-shell" aria-labelledby="library-table-title">
        <div className="table-toolbar">
          <h2 className="sr-only" id="library-table-title">
            论文列表
          </h2>
          <div className="filter-group" aria-label="筛选论文">
            {(Object.keys(FILTER_LABELS) as LibraryFilter[]).map((filter) => (
              <button
                className={`filter-button ${activeFilter === filter ? 'active' : ''}`}
                type="button"
                aria-pressed={activeFilter === filter}
                key={filter}
                onClick={() => onFilterChange(filter)}
              >
                {FILTER_LABELS[filter]}
              </button>
            ))}
          </div>
          <label className="table-search-wrap" htmlFor="library-search">
            <Search aria-hidden="true" />
            <span className="sr-only">筛选当前论文列表</span>
            <input
              className="table-search"
              id="library-search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="筛选当前列表…"
            />
          </label>
        </div>

        <div className="table-scroll" tabIndex={0} aria-label="可横向滚动的论文表格">
          <table className="library-table">
            <thead>
              <tr>
                <th scope="col">论文</th>
                <th scope="col">主题角色</th>
                <th scope="col">Zotero</th>
                <th scope="col">PDF</th>
                <th scope="col">待审阅</th>
                <th scope="col">阅读模式</th>
              </tr>
            </thead>
            <tbody>
              {visiblePapers.map((paper) => {
                const reviewCount = pendingReviewByPaperId[paper.id] ?? 0;
                return (
                  <tr key={paper.id}>
                    <td className="title-cell" data-mobile-label="论文">
                      <button
                        className="table-title-button"
                        type="button"
                        onClick={() => onOpenPaper(paper)}
                      >
                        <strong>{paper.title}</strong>
                        <span>
                          {paper.authors} · {paper.year} · {paper.venue}
                        </span>
                      </button>
                    </td>
                    <td data-mobile-label="主题角色">
                      <span className={`role-badge ${paper.role}`}>
                        {roleLabels[paper.role]}
                      </span>
                    </td>
                    <td data-mobile-label="Zotero">{paper.zotero}</td>
                    <td data-mobile-label="PDF">{paper.access}</td>
                    <td data-mobile-label="待审阅">
                      <span className={reviewCount > 0 ? 'state-badge review-pending' : 'state-badge'}>
                        {reviewCount}
                      </span>
                    </td>
                    <td data-mobile-label="阅读模式">
                      {paper.mode} · {paper.pages}p
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {visiblePapers.length === 0 ? (
          <div className="empty-state" role="status">
            <h3>当前筛选没有论文</h3>
            <p>调整关键词或筛选条件；已有工作区内容不会被删除。</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
