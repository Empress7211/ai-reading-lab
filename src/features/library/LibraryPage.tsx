import { FilePlus2, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { DemoBanner } from '../../components/DemoBanner';
import { PageHeader } from '../../components/PageHeader';
import { roleLabels, type PaperFixture } from '../../data/fixtures';

type LibraryFilter = 'all' | 'reading' | 'review' | 'fixture';

interface LibraryPageProps {
  papers: PaperFixture[];
  onOpenPaper: (paperId: string) => void;
  onMessage: (title: string, detail: string) => void;
}

export function LibraryPage({ papers, onOpenPaper, onMessage }: LibraryPageProps) {
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [query, setQuery] = useState('');

  const filteredPapers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return papers.filter((paper, index) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'fixture' && paper.demoRecord) ||
        (filter === 'reading' && index < 3) ||
        (filter === 'review' && index % 3 === 0);
      const matchesQuery = !normalized || `${paper.title} ${paper.authors} ${paper.venue}`.toLowerCase().includes(normalized);
      return matchesFilter && matchesQuery;
    });
  }, [filter, papers, query]);

  return (
    <div className="page">
      <DemoBanner />
      <PageHeader
        title="文献库"
        description="正式版由 Zotero 管理书目与附件；当前列表仅展示本地 fixture 和 UI 状态。"
        actions={(
          <>
            <Button icon={<RefreshCw size={17} />} onClick={() => onMessage('Zotero 未配置', '没有启动扫描，也没有访问任何外部应用。')}>扫描 Zotero</Button>
            <Button variant="primary" icon={<FilePlus2 size={17} />} onClick={() => onMessage('文件选择未配置', '产品验证版不会读取或导入真实 PDF。')}>导入 PDF</Button>
          </>
        )}
      />
      <section className="metric-grid" aria-label="文献库概览">
        <article><span>Fixture 条目</span><strong>{papers.length}</strong><small>不是本地真实文献数</small></article>
        <article><span>正在阅读</span><strong>3</strong><small>会话状态仅在本页内存</small></article>
        <article><span>Verified Claim</span><strong>0</strong><small>等待人工审阅</small></article>
        <article><span>外部连接</span><strong>0</strong><small>Zotero / Git 均未配置</small></article>
      </section>
      <section className="table-shell" aria-label="论文列表">
        <div className="table-toolbar">
          <div className="filter-group" aria-label="筛选论文">
            {([
              ['all', '全部'],
              ['reading', '阅读中'],
              ['review', '待审阅'],
              ['fixture', 'Demo fixture'],
            ] as const).map(([value, label]) => (
              <button type="button" className={filter === value ? 'is-active' : ''} aria-pressed={filter === value} key={value} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
          <label className="table-search"><Search size={16} /><span className="sr-only">筛选当前列表</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选当前列表…" /></label>
        </div>
        <div className="responsive-table" tabIndex={0} aria-label="可横向滚动的论文表格">
          <table>
            <thead><tr><th scope="col">论文</th><th scope="col">状态</th><th scope="col">主题角色</th><th scope="col">附件</th><th scope="col">记录</th></tr></thead>
            <tbody>
              {filteredPapers.map((paper, index) => (
                <tr key={paper.id}>
                  <td><button type="button" className="table-title" onClick={() => onOpenPaper(paper.id)}><strong>{paper.title}</strong><small>{paper.authors} · {paper.year}</small></button></td>
                  <td><span className={`state-badge ${index < 3 ? 'is-reading' : ''}`}>{index < 3 ? '阅读中' : '已排队'}</span></td>
                  <td>{roleLabels[paper.role]}</td>
                  <td>{paper.access}</td>
                  <td>{paper.demoRecord ? 'Fixture' : paper.libraryState}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredPapers.length === 0 ? <div className="empty-state"><h2>没有匹配的论文</h2><p>清除筛选条件后再试。</p></div> : null}
      </section>
    </div>
  );
}

