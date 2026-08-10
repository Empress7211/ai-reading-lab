import { Sparkles } from 'lucide-react';
import { Button } from '../../components/Button';
import { DemoBanner } from '../../components/DemoBanner';
import { PageHeader } from '../../components/PageHeader';
import { propositionFixtures, type ThemeFixture } from '../../data/fixtures';

interface KnowledgePageProps {
  theme: ThemeFixture;
  verifiedCount: number;
  onMessage: (title: string, detail: string) => void;
}

function stanceClass(stance: string) {
  if (stance === '支持') return 'is-support';
  if (stance === '反对' || stance === '质疑') return 'is-counter';
  if (stance === '限定' || stance === '有限') return 'is-qualify';
  return 'is-incomparable';
}

export function KnowledgePage({ theme, verifiedCount, onMessage }: KnowledgePageProps) {
  return (
    <div className="page">
      <DemoBanner />
      <PageHeader
        title={`主题知识 · ${theme.shortLabel}`}
        description="只有当前会话中人工接受或编辑的 Claim 会计入 Verified；命题矩阵仍是 fixture 视图。"
        actions={<Button icon={<Sparkles size={17} />} onClick={() => onMessage('综合未执行', '需要正式综合服务和更多 Verified Claim；当前仅展示界面。')}>预览重新综合</Button>}
      />
      <section className="metric-grid" aria-label="知识状态">
        <article><span>阅读包条目</span><strong>{theme.papers.length}</strong><small>含 bridge 与 resource</small></article>
        <article><span>本会话 Verified</span><strong>{verifiedCount}</strong><small>接受或用户编辑</small></article>
        <article><span>命题 fixture</span><strong>{propositionFixtures.length}</strong><small>未写入正式知识库</small></article>
        <article><span>Cognitive Delta</span><strong>Draft</strong><small>等待用户撰写</small></article>
      </section>
      <div className="knowledge-layout">
        <section className="panel">
          <header className="panel-header"><div><h2>Proposition Matrix</h2><p>支持、反对、限定与不可比</p></div><span className="preview-label">Fixture preview</span></header>
          <div className="responsive-table matrix-wrap" tabIndex={0} aria-label="可横向滚动的命题矩阵">
            <table className="matrix-table">
              <thead><tr><th scope="col">规范化命题</th><th scope="col">Wei 2022</th><th scope="col">PaLM</th><th scope="col">Schaeffer 2023</th><th scope="col">Continuous metrics</th></tr></thead>
              <tbody>{propositionFixtures.map((row) => <tr key={row.proposition}>
                <th scope="row"><strong>{row.proposition}</strong><small>{row.note}</small></th>
                {row.stances.map((stance, index) => <td key={`${stance}-${index}`}><span className={`stance ${stanceClass(stance)}`}>{stance}</span></td>)}
              </tr>)}</tbody>
            </table>
          </div>
        </section>
        <aside className="panel insight-panel">
          <header className="panel-header"><div><h2>当前洞见</h2><p>用户判断与 AI 提案保持分离</p></div></header>
          <article><small>认知变化 · User-owned fixture</small><strong>我不再把“曲线看起来有断点”直接等同于能力本身发生离散相变。</strong><p>需要用 Verified Anchor 替换这段演示依据。</p></article>
          <article><small>研究缺口 · AI inference</small><strong>需要跨模型族、连续指标与预注册阈值的同协议比较。</strong><p>这是待审阅推断，不能作为已证实结论。</p></article>
          <article><small>下一步</small><strong>选择一篇 Frontier 工作并审查外推区间。</strong><p>阅读后记录 Cognitive Delta。</p></article>
        </aside>
      </div>
    </div>
  );
}

