import { BookOpen, CalendarDays, ChevronRight, Filter, Library, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { papers } from '../data.js'
import { EmptyState, Eyebrow, StatusPill } from '../components/Primitives.jsx'

const filters = ['全部', '精读', '扫描']

export default function LibraryPage({ onOpenReader }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('全部')
  const [selected, setSelected] = useState(null)

  const results = useMemo(() => papers.filter((paper) => {
    const haystack = `${paper.title} ${paper.authors} ${paper.topics.join(' ')}`.toLowerCase()
    const matchesQuery = haystack.includes(query.toLowerCase())
    const matchesFilter = filter === '全部' || paper.depthLabel === filter
    return matchesQuery && matchesFilter
  }), [query, filter])

  return (
    <div className="page library-page">
      <section className="page-intro compact-intro">
        <div><Eyebrow>论文库</Eyebrow><h1>队列清楚，状态诚实。</h1><p>10 篇周期核心论文已排期；当前没有论文被标记为已读。</p></div>
        <div className="library-summary"><span><strong>10</strong>核心论文</span><span><strong>0</strong>已读</span><span><strong>3</strong>深读候选</span></div>
      </section>

      <section className="library-toolbar">
        <label className="library-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、作者或主题" /><kbd>⌘ K</kbd></label>
        <div className="filter-group"><Filter size={16} />{filters.map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
      </section>

      {results.length ? (
        <section className="paper-table" aria-label="论文列表">
          <div className="paper-table-head"><span>论文</span><span>阅读深度</span><span>排期</span><span>状态</span><span /></div>
          {results.map((paper) => (
            <button className="paper-table-row" key={paper.id} onClick={() => setSelected(paper)}>
              <span className="paper-cell-main"><i><BookOpen size={17} /></i><span><strong>{paper.title}</strong><small>{paper.authors} · {paper.venue} {paper.year}</small></span></span>
              <span><StatusPill tone={paper.depth === 'deep' ? 'blue' : 'neutral'}>{paper.depthLabel}</StatusPill></span>
              <span><CalendarDays size={14} />{paper.week}</span>
              <span><StatusPill tone="amber">{paper.statusLabel}</StatusPill></span>
              <span><ChevronRight size={17} /></span>
            </button>
          ))}
        </section>
      ) : <EmptyState icon={Library} title="没有匹配的论文" description="试试清除关键词或切换阅读深度。" action={<button className="button button-secondary" onClick={() => { setQuery(''); setFilter('全部') }}>清除筛选</button>} />}

      {selected ? (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <aside className="paper-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-head"><Eyebrow>论文详情</Eyebrow><button className="icon-button" onClick={() => setSelected(null)}><X size={19} /></button></div>
            <StatusPill tone="amber">{selected.statusLabel}</StatusPill>
            <h2>{selected.title}</h2>
            <p>{selected.authors}</p>
            <dl>
              <div><dt>发表</dt><dd>{selected.venue} · {selected.year}</dd></div>
              <div><dt>计划</dt><dd>{selected.week} · {selected.depthLabel}</dd></div>
              <div><dt>阅读状态</dt><dd>尚未开始</dd></div>
            </dl>
            <div className="paper-tags light">{selected.topics.map((topic) => <span key={topic}>{topic}</span>)}</div>
            <div className="drawer-callout"><strong>进入阅读前</strong><p>先写下你对这篇论文的预期与反证条件；系统不会自动替你生成摘要。</p></div>
            {selected.id === 'ouyang_training_2022' ? <button className="button button-primary full" onClick={onOpenReader}>进入专注研读 <ChevronRight size={16} /></button> : <button className="button button-secondary full" disabled>排期到 {selected.week}</button>}
          </aside>
        </div>
      ) : null}
    </div>
  )
}
