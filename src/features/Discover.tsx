import { ArrowRight, FileText, Layers3, Search, Sparkles } from 'lucide-react';
import type { FormEvent } from 'react';

import {
  roleLabels,
  type DemoPaper,
  type PaperRole,
} from '../data/demo';

const PRIMARY_ROLES: readonly PaperRole[] = [
  'foundation',
  'frontier',
  'counterpoint',
];

const GENERATION_STEPS = [
  '解释主题',
  '召回候选',
  '合并版本',
  '构建引用关系',
  '寻找反方',
  '排定阅读顺序',
] as const;

const ROLE_DESCRIPTIONS: Record<PaperRole, string> = {
  foundation: '先建立概念与原始贡献',
  frontier: '理解当前方法与证据',
  counterpoint: '审查反证、边界与替代解释',
  bridge: '连接定义、方法与争议',
  resource: '复现实验与核验清单',
};

export interface DiscoverProps {
  query: string;
  papers: readonly DemoPaper[];
  isGenerating: boolean;
  generationStep: number;
  counterpointRequired: boolean;
  openAccessOnly: boolean;
  topicTitle: string;
  topicDescription: string;
  topicAssumptions: readonly string[];
  onQueryChange: (query: string) => void;
  onGenerate: () => void;
  onToggleCounterpoint: (nextValue: boolean) => void;
  onToggleOpenAccess: (nextValue: boolean) => void;
  onOpenPaper: (paper: DemoPaper) => void;
  onOpenAdvanced?: () => void;
  onOpenScope?: () => void;
  onRefresh?: () => void;
}

interface PaperCardProps {
  paper: DemoPaper;
  onOpenPaper: (paper: DemoPaper) => void;
}

function PaperCard({ paper, onOpenPaper }: PaperCardProps) {
  return (
    <article className={`paper-card ${paper.role}`}>
      <div className="paper-topline">
        <span className="role-badge">{roleLabels[paper.role]}</span>
        <span className="confidence">角色置信度 {paper.confidence}%</span>
      </div>
      <h4 className="paper-title">{paper.title}</h4>
      <p className="paper-meta">
        {paper.authors} · {paper.year} · {paper.venue}
      </p>
      <p className="reason">
        <strong>为什么读：</strong>
        {paper.reason}
      </p>
      <div className="paper-status" aria-label="论文可用性与阅读成本">
        <span className="status-mini">
          <FileText aria-hidden="true" /> {paper.access}
        </span>
        <span className="status-mini">Zotero · {paper.zotero}</span>
        <span className="status-mini">
          {paper.mode} · {paper.pages}p
        </span>
      </div>
      <button
        className="text-action paper-open-action"
        type="button"
        onClick={() => onOpenPaper(paper)}
        aria-label={`开始阅读《${paper.title}》`}
      >
        开始阅读 <ArrowRight aria-hidden="true" />
      </button>
    </article>
  );
}

interface RoleColumnProps {
  papers: readonly DemoPaper[];
  role: PaperRole;
  onOpenPaper: (paper: DemoPaper) => void;
}

function RoleColumn({ role, papers, onOpenPaper }: RoleColumnProps) {
  const headingId = `role-${role}`;

  return (
    <section className="role-column" aria-labelledby={headingId}>
      <div className="role-column-head">
        <h3 id={headingId}>{roleLabels[role]}</h3>
        <span>{ROLE_DESCRIPTIONS[role]}</span>
        <span className="count" aria-label={`${papers.length} 篇`}>
          {papers.length}
        </span>
      </div>
      <div className="paper-stack">
        {papers.map((paper) => (
          <PaperCard key={paper.id} paper={paper} onOpenPaper={onOpenPaper} />
        ))}
      </div>
    </section>
  );
}

export function Discover({
  query,
  papers,
  isGenerating,
  generationStep,
  counterpointRequired,
  openAccessOnly,
  topicTitle,
  topicDescription,
  topicAssumptions,
  onQueryChange,
  onGenerate,
  onToggleCounterpoint,
  onToggleOpenAccess,
  onOpenPaper,
  onOpenAdvanced,
  onOpenScope,
  onRefresh,
}: DiscoverProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onGenerate();
  };

  const papersByRole = new Map<PaperRole, DemoPaper[]>();
  for (const role of Object.keys(roleLabels) as PaperRole[]) {
    papersByRole.set(
      role,
      papers.filter((paper) => paper.role === role),
    );
  }

  const supplementaryPapers = [
    ...(papersByRole.get('bridge') ?? []),
    ...(papersByRole.get('resource') ?? []),
  ];

  return (
    <div className="page discover-page">
      <section className="discover-hero" aria-labelledby="discover-title">
        <div className="hero-copy">
          <h1 id="discover-title">把一个研究主题，变成有证据、有反方的阅读路径。</h1>
          <p>
            PaperWeave 不只返回相似论文。它解释每篇为何是基石、当前发展或反方视角，并把阅读结果沉淀为可回到原文的研究知识。
          </p>
        </div>
        <dl className="hero-side" aria-label="当前阅读包摘要">
          <div className="micro-stat">
            <strong>{papers.length}</strong>
            <span>篇候选路径</span>
          </div>
          <div className="micro-stat">
            <strong>3</strong>
            <span>种核心角色</span>
          </div>
        </dl>
      </section>

      <form className="topic-composer" onSubmit={handleSubmit}>
        <div className="composer-main">
          <label className="topic-input-wrap" htmlFor="discover-query">
            <Search aria-hidden="true" />
            <span className="sr-only">研究主题</span>
            <input
              className="topic-input"
              id="discover-query"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="输入研究问题、关键词、DOI 或论文标题"
            />
          </label>
          <button className="primary-button" type="submit" disabled={isGenerating}>
            <Sparkles aria-hidden="true" />
            {isGenerating ? '正在编排…' : '生成平衡阅读包'}
          </button>
        </div>
        <div className="composer-controls" aria-label="主题约束">
          <button
            className={`control-pill ${counterpointRequired ? 'on' : ''}`}
            type="button"
            aria-pressed={counterpointRequired}
            onClick={() => onToggleCounterpoint(!counterpointRequired)}
          >
            <span className="toggle" aria-hidden="true" />
            强制寻找反方
          </button>
          <button
            className={`control-pill ${openAccessOnly ? 'on' : ''}`}
            type="button"
            aria-pressed={openAccessOnly}
            onClick={() => onToggleOpenAccess(!openAccessOnly)}
          >
            <span className="toggle" aria-hidden="true" />
            仅开放获取
          </button>
          <span className="composer-spacer" />
          {onOpenAdvanced ? (
            <button className="ghost-button" type="button" onClick={onOpenAdvanced}>
              高级约束
            </button>
          ) : null}
        </div>
      </form>

      {isGenerating ? (
        <section className="loading-pack" aria-live="polite" aria-label="阅读包生成进度">
          <div className="loading-steps">
            {GENERATION_STEPS.map((step, index) => {
              const stepNumber = index + 1;
              const stateClass =
                stepNumber < generationStep
                  ? 'done'
                  : stepNumber === generationStep
                    ? 'active'
                    : '';
              return (
                <div className={`loading-step ${stateClass}`} key={step}>
                  <span>{String(stepNumber).padStart(2, '0')}</span>
                  <strong>{step}</strong>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="reading-pack" aria-labelledby="reading-pack-title">
          <div className="pack-header">
            <div>
              <h2 id="reading-pack-title">{topicTitle}</h2>
              <p>{topicDescription}</p>
              <div className="scope-line" aria-label="主题范围假设">
                {topicAssumptions.map((assumption) => (
                  <span className="scope-tag" key={assumption}>
                    {assumption}
                  </span>
                ))}
              </div>
            </div>
            <div className="pack-actions">
              {onOpenScope ? (
                <button className="secondary-button" type="button" onClick={onOpenScope}>
                  <Layers3 aria-hidden="true" /> 查看范围与缺口
                </button>
              ) : null}
              {onRefresh ? (
                <button className="secondary-button" type="button" onClick={onRefresh}>
                  换一批
                </button>
              ) : null}
            </div>
          </div>

          <div className="role-legend" aria-label="阅读角色图例">
            {PRIMARY_ROLES.map((role) => (
              <span className="legend-item" key={role}>
                <span className={`legend-swatch ${role}`} aria-hidden="true" />
                {roleLabels[role]}
              </span>
            ))}
            <span className="legend-note">角色是当前主题中的判断，不是论文永久标签。</span>
          </div>

          <div className="paper-grid">
            {PRIMARY_ROLES.map((role) => (
              <RoleColumn
                key={role}
                role={role}
                papers={papersByRole.get(role) ?? []}
                onOpenPaper={onOpenPaper}
              />
            ))}
          </div>

          {supplementaryPapers.length > 0 ? (
            <div className="supplement-rail" aria-label="桥梁综述与复现资源">
              {supplementaryPapers.map((paper) => (
                <button
                  className="supplement-card"
                  type="button"
                  key={paper.id}
                  onClick={() => onOpenPaper(paper)}
                >
                  <span className={`supplement-icon ${paper.role}`} aria-hidden="true">
                    <Layers3 />
                  </span>
                  <span>
                    <strong>{paper.title}</strong>
                    <span>
                      {roleLabels[paper.role]} · {paper.reason}
                    </span>
                  </span>
                  <ArrowRight className="arrow" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
