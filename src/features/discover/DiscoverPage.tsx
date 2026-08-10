import {
  ArrowRight,
  Blend,
  Filter,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { DemoBanner } from '../../components/DemoBanner';
import { PaperCard } from '../../components/PaperCard';
import {
  roleLabels,
  type PaperFixture,
  type ResearchRole,
  type ThemeFixture,
} from '../../data/fixtures';

const mainRoles: ResearchRole[] = ['foundation', 'frontier', 'counterpoint'];

const roleDescriptions: Record<ResearchRole, string> = {
  foundation: '先建立概念与原始贡献',
  frontier: '理解当前方法与证据',
  counterpoint: '审查反证、边界与替代解释',
  bridge: '连接概念与研究分支',
  resource: '记录复现协议与资产',
};

interface DiscoverPageProps {
  theme: ThemeFixture;
  themes: ThemeFixture[];
  pinnedPaperIds: Set<string>;
  onChooseTheme: (themeId: string) => void;
  onOpenPaper: (paperId: string) => void;
  onTogglePin: (paperId: string) => void;
  onOpenRationale: () => void;
  onGenerate: (query: string) => void;
  onMessage: (title: string, detail: string) => void;
}

export function DiscoverPage({
  theme,
  themes,
  pinnedPaperIds,
  onChooseTheme,
  onOpenPaper,
  onTogglePin,
  onOpenRationale,
  onGenerate,
  onMessage,
}: DiscoverPageProps) {
  const [query, setQuery] = useState(theme.label);
  const [counterpointRequired, setCounterpointRequired] = useState(true);
  const [openAccessOnly, setOpenAccessOnly] = useState(false);

  const groupedPapers = useMemo(() => {
    const groups = new Map<ResearchRole, PaperFixture[]>();
    for (const role of ['foundation', 'frontier', 'counterpoint', 'bridge', 'resource'] as const) {
      groups.set(role, theme.papers.filter((paper) => paper.role === role));
    }
    return groups;
  }, [theme]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onGenerate(query.trim() || theme.label);
  };

  return (
    <div className="page discover-page">
      <DemoBanner />
      <section className="discover-hero">
        <div>
          <h1>把一个研究主题，变成有证据、有反方的阅读路径。</h1>
          <p>PaperWeave 不只返回相似论文。它解释每篇为何是基石、当前发展或反方视角，并把阅读结果沉淀为能回到原文的研究知识。</p>
        </div>
        <dl className="hero-stats">
          <div><dt>9</dt><dd>篇精编路径</dd></div>
          <div><dt>3</dt><dd>种观点角色</dd></div>
          <div><dt>1</dt><dd>个待验证问题</dd></div>
        </dl>
      </section>

      <form className="topic-composer" onSubmit={submit}>
        <div className="topic-composer__main">
          <label>
            <span className="sr-only">研究主题</span>
            <Search size={20} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <Button type="submit" variant="primary" icon={<Sparkles size={17} />}>生成 fixture 阅读包</Button>
        </div>
        <div className="topic-composer__controls">
          <label className="control-pill">阅读目标
            <select defaultValue="research"><option value="research">深度研究</option><option value="overview">快速入门</option><option value="reproduce">复现评估</option></select>
          </label>
          <button
            type="button"
            className={`control-pill toggle-pill ${counterpointRequired ? 'is-on' : ''}`}
            aria-pressed={counterpointRequired}
            onClick={() => setCounterpointRequired((value) => !value)}
          ><span aria-hidden="true" />强制寻找反方</button>
          <button
            type="button"
            className={`control-pill toggle-pill ${openAccessOnly ? 'is-on' : ''}`}
            aria-pressed={openAccessOnly}
            onClick={() => setOpenAccessOnly((value) => !value)}
          ><span aria-hidden="true" />仅开放获取</button>
          <label className="control-pill">经典性
            <select defaultValue="balanced"><option value="balanced">平衡</option><option value="classic">偏经典</option><option value="novel">偏新颖</option></select>
          </label>
          <Button variant="ghost" size="small" icon={<Filter size={16} />} onClick={() => onMessage('高级约束', '当前为 fixture 模式；正式约束将交给检索编排服务。')}>高级约束</Button>
        </div>
      </form>

      <div className="topic-suggestions" aria-label="建议主题">
        <span>建议主题</span>
        {themes.map((item) => (
          <button
            type="button"
            key={item.id}
            className={item.id === theme.id ? 'is-active' : ''}
            aria-pressed={item.id === theme.id}
            onClick={() => {
              setQuery(item.label);
              onChooseTheme(item.id);
            }}
          >{item.shortLabel}</button>
        ))}
      </div>

      <section className="reading-pack" aria-labelledby="reading-pack-title">
        <header className="pack-header">
          <div>
            <h2 id="reading-pack-title">{theme.label}</h2>
            <p>{theme.description}</p>
            <div className="scope-tags">{theme.assumptions.map((assumption) => <span key={assumption}>{assumption}</span>)}</div>
          </div>
          <div className="pack-header__actions">
            <Button icon={<Blend size={17} />} onClick={onOpenRationale}>查看范围与缺口</Button>
            <Button icon={<RefreshCw size={17} />} onClick={() => onMessage('已更新排序', 'fixture 条目不变；正式版会保留固定论文并重新召回。')}>换一批</Button>
          </div>
        </header>
        <div className="role-legend">
          {mainRoles.map((role) => <span key={role}><i className={`legend-dot role-${role}`} />{roleLabels[role]}</span>)}
          <small>按阅读价值编排，不按引用数简单排序 · Fixture score</small>
        </div>
        <div className="paper-grid">
          {mainRoles.map((role) => {
            const papers = groupedPapers.get(role) ?? [];
            return (
              <section className="role-column" key={role} aria-labelledby={`role-${role}`}>
                <header><h3 id={`role-${role}`}>{roleLabels[role]}</h3><span>{roleDescriptions[role]}</span><small>{papers.length}</small></header>
                <div className="paper-stack">
                  {papers.map((paper) => (
                    <PaperCard
                      key={paper.id}
                      paper={paper}
                      pinned={pinnedPaperIds.has(paper.id)}
                      onOpen={onOpenPaper}
                      onTogglePin={onTogglePin}
                      onReplace={() => onMessage('替换预览', 'fixture 模式不会替换数据；正式版会保留角色和已固定论文。')}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <div className="supplement-grid">
          {(['bridge', 'resource'] as const).map((role) => {
            const paper = groupedPapers.get(role)?.[0];
            if (!paper) return null;
            return (
              <button type="button" className={`supplement-card role-${role}`} key={paper.id} onClick={() => onOpenPaper(paper.id)}>
                <span><strong>{paper.title}</strong><small>{roleLabels[role]} · {paper.rationale}</small></span>
                <ArrowRight size={19} />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

