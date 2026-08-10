import { Check, CircleHelp, EqualNot, Triangle, X } from 'lucide-react';

import { propositions as demoPropositions } from '../data/demo';

export type KnowledgeProposition = (typeof demoPropositions)[number];

export interface KnowledgeInsight {
  id: string;
  kind: string;
  provenance: string;
  title: string;
  detail: string;
}

export interface KnowledgeMetrics {
  readPapers: string;
  verifiedPropositions: number;
  evidenceAnchors: number;
  cognitiveDeltas: number;
}

export interface KnowledgeProps {
  topicName: string;
  columns: readonly string[];
  propositions: readonly KnowledgeProposition[];
  insights: readonly KnowledgeInsight[];
  metrics: KnowledgeMetrics;
  onOpenProposition: (proposition: KnowledgeProposition) => void;
  onRequestSynthesis: () => void;
  onShowLinearView: () => void;
}

type StanceKind = 'support' | 'counter' | 'qualify' | 'incomparable' | 'unknown';

function classifyStance(stance: string): StanceKind {
  if (stance.includes('支持')) return 'support';
  if (stance.includes('反对') || stance.includes('质疑')) return 'counter';
  if (stance.includes('限定') || stance.includes('有限') || stance.includes('部分')) {
    return 'qualify';
  }
  if (stance.includes('不可比')) return 'incomparable';
  return 'unknown';
}

function StanceCell({ stance }: { stance: string }) {
  const kind = classifyStance(stance);
  const icon =
    kind === 'support' ? (
      <Check aria-hidden="true" />
    ) : kind === 'counter' ? (
      <X aria-hidden="true" />
    ) : kind === 'qualify' ? (
      <Triangle aria-hidden="true" />
    ) : kind === 'incomparable' ? (
      <EqualNot aria-hidden="true" />
    ) : (
      <CircleHelp aria-hidden="true" />
    );

  return (
    <span className={`stance ${kind}`} aria-label={`关系：${stance}`}>
      {icon}
      <span>{stance}</span>
    </span>
  );
}

export function Knowledge({
  topicName,
  columns,
  propositions,
  insights,
  metrics,
  onOpenProposition,
  onRequestSynthesis,
  onShowLinearView,
}: KnowledgeProps) {
  return (
    <div className="page knowledge-page">
      <div className="section-heading">
        <div>
          <h1>主题知识 · {topicName}</h1>
          <p>只使用 Verified Claim 构建命题；AI 建议的合并仍需用户确认。</p>
        </div>
        <div className="actions">
          <button className="secondary-button" type="button" onClick={onRequestSynthesis}>
            重新综合
          </button>
        </div>
      </div>

      <dl className="metric-grid" aria-label="主题知识摘要">
        <div className="metric-card">
          <dt>已读论文</dt>
          <dd>{metrics.readPapers}</dd>
          <small>按用户确认的阅读状态统计</small>
        </div>
        <div className="metric-card">
          <dt>Verified 命题</dt>
          <dd>{metrics.verifiedPropositions}</dd>
          <small>Draft 不计入正式综合</small>
        </div>
        <div className="metric-card">
          <dt>证据锚点</dt>
          <dd>{metrics.evidenceAnchors}</dd>
          <small>失效锚点需单独复核</small>
        </div>
        <div className="metric-card">
          <dt>认知变化</dt>
          <dd>{metrics.cognitiveDeltas}</dd>
          <small>保留修改时间与依据</small>
        </div>
      </dl>

      <div className="knowledge-layout">
        <section className="panel" aria-labelledby="matrix-title">
          <div className="panel-head">
            <strong id="matrix-title">Proposition Matrix</strong>
            <span>支持、反对、限定、不可比和未检验</span>
            <button className="ghost-button right" type="button" onClick={onShowLinearView}>
              线性视图
            </button>
          </div>
          <div className="matrix-wrap" tabIndex={0} aria-label="可横向滚动的命题矩阵">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th scope="col">规范化命题</th>
                  {columns.map((column) => (
                    <th scope="col" key={column}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {propositions.map((row) => (
                  <tr key={row.proposition}>
                    <th className="title-cell" scope="row">
                      <button
                        className="matrix-proposition-button"
                        type="button"
                        onClick={() => onOpenProposition(row)}
                      >
                        <strong>{row.proposition}</strong>
                        <span>{row.detail}</span>
                      </button>
                    </th>
                    {columns.map((column, index) => {
                      const stance = row.stances[index] ?? '未检验';
                      return (
                        <td data-mobile-label={column} key={`${row.proposition}-${column}`}>
                          <StanceCell stance={stance} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel" aria-labelledby="knowledge-insights-title">
          <div className="panel-head">
            <strong id="knowledge-insights-title">当前洞见</strong>
            <span className="right">{insights.length} 条</span>
          </div>
          <div className="insight-list">
            {insights.map((insight) => (
              <article className="insight-item" key={insight.id}>
                <small>
                  {insight.kind} · {insight.provenance}
                </small>
                <strong>{insight.title}</strong>
                <p>{insight.detail}</p>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
