export type AppView =
  | 'discover'
  | 'library'
  | 'reading'
  | 'knowledge'
  | 'sync'
  | 'settings'
  | 'reader';

export type ResearchRole =
  | 'foundation'
  | 'frontier'
  | 'counterpoint'
  | 'bridge'
  | 'resource';

export type ClaimReviewStatus = 'draft' | 'verified' | 'edited' | 'rejected';

export interface PaperFixture {
  id: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  role: ResearchRole;
  confidence: number;
  rationale: string;
  access: string;
  libraryState: string;
  readMode: string;
  pages: number;
  demoRecord?: boolean;
}

export interface ThemeFixture {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  assumptions: string[];
  papers: PaperFixture[];
}

export interface EvidenceAnchorFixture {
  id: string;
  page: number;
  label: string;
}

export interface ClaimFixture {
  id: string;
  sourceKind: 'author_claim' | 'reported_result' | 'ai_inference';
  sourceLabel: string;
  text: string;
  confidence: number;
  scope: string;
  anchors: EvidenceAnchorFixture[];
  status: ClaimReviewStatus;
}

export const roleLabels: Record<ResearchRole, string> = {
  foundation: '基石',
  frontier: '当前发展',
  counterpoint: '反方视角',
  bridge: '桥梁综述',
  resource: '复现资源',
};

const emergencePapers: PaperFixture[] = [
  {
    id: 'kaplan-2020',
    title: 'Scaling Laws for Neural Language Models',
    authors: 'Kaplan et al.',
    year: 2020,
    venue: 'arXiv',
    role: 'foundation',
    confidence: 91,
    rationale: '提供参数、数据和算力之间的连续规模规律，是理解能力跃迁叙事的前置框架。',
    access: 'OA PDF',
    libraryState: '本地条目',
    readMode: '深读',
    pages: 30,
  },
  {
    id: 'brown-2020',
    title: 'Language Models are Few-Shot Learners',
    authors: 'Brown et al.',
    year: 2020,
    venue: 'NeurIPS',
    role: 'foundation',
    confidence: 87,
    rationale: '大规模模型少样本能力成为后续“涌现”论述的重要经验起点。',
    access: 'OA PDF',
    libraryState: '仅元数据',
    readMode: '查证',
    pages: 75,
  },
  {
    id: 'wei-2022',
    title: 'Emergent Abilities of Large Language Models',
    authors: 'Wei et al.',
    year: 2022,
    venue: 'TMLR',
    role: 'foundation',
    confidence: 96,
    rationale: '直接定义并展示若干随规模出现的非线性能力，是争议的核心主张来源。',
    access: 'OA PDF',
    libraryState: '未导入',
    readMode: '深读',
    pages: 33,
  },
  {
    id: 'big-bench-2022',
    title: 'Beyond the Imitation Game: Quantifying and Extrapolating the Capabilities of Language Models',
    authors: 'Srivastava et al.',
    year: 2022,
    venue: 'TMLR',
    role: 'frontier',
    confidence: 88,
    rationale: 'BIG-Bench 扩展了任务空间，为观察跨任务能力曲线和潜在断点提供基础。',
    access: 'OA PDF',
    libraryState: '未导入',
    readMode: '略读',
    pages: 120,
  },
  {
    id: 'palm-2022',
    title: 'PaLM: Scaling Language Modeling with Pathways',
    authors: 'Chowdhery et al.',
    year: 2022,
    venue: 'JMLR',
    role: 'frontier',
    confidence: 86,
    rationale: '在更大规模上报告多任务能力变化，可用于检验现象是否跨模型族出现。',
    access: 'OA PDF',
    libraryState: '仅元数据',
    readMode: '查证',
    pages: 87,
  },
  {
    id: 'finite-scaling-demo',
    title: 'Predicting Emergent Capabilities by Finite Scaling Analysis',
    authors: 'Fixture authors',
    year: 2025,
    venue: 'Demo corpus',
    role: 'frontier',
    confidence: 71,
    rationale: '演示“训练前预测能力拐点”的候选位置；正式产品中必须重新召回并核验。',
    access: 'Metadata fixture',
    libraryState: '演示记录',
    readMode: '略读',
    pages: 18,
    demoRecord: true,
  },
  {
    id: 'mirage-2023',
    title: 'Are Emergent Abilities of Large Language Models a Mirage?',
    authors: 'Schaeffer, Miranda & Koyejo',
    year: 2023,
    venue: 'NeurIPS',
    role: 'counterpoint',
    confidence: 97,
    rationale: '论证部分涌现曲线可由非线性或离散指标产生，是最直接的方法学反方。',
    access: 'OA PDF',
    libraryState: '本地条目',
    readMode: '深读',
    pages: 14,
  },
  {
    id: 'continuous-metrics-demo',
    title: 'Emergence or Smooth Scaling? Re-examining Capability Transitions',
    authors: 'Fixture authors',
    year: 2025,
    venue: 'Demo corpus',
    role: 'counterpoint',
    confidence: 74,
    rationale: '演示用连续评分和不确定性区间审查跃迁的反方位置。',
    access: 'Metadata fixture',
    libraryState: '演示记录',
    readMode: '查证',
    pages: 22,
    demoRecord: true,
  },
  {
    id: 'foundation-models-2021',
    title: 'On the Opportunities and Risks of Foundation Models',
    authors: 'Bommasani et al.',
    year: 2021,
    venue: 'Stanford CRFM',
    role: 'bridge',
    confidence: 77,
    rationale: '把规模、能力与社会技术问题连接为更宽的基础模型框架。',
    access: 'OA PDF',
    libraryState: '未导入',
    readMode: '参考',
    pages: 210,
  },
  {
    id: 'emergence-audit-template',
    title: 'Emergence Metric Audit Checklist',
    authors: 'PaperWeave fixture',
    year: 2026,
    venue: 'Local template',
    role: 'resource',
    confidence: 100,
    rationale: '逐项核验阈值、指标连续性、置信区间、模型族和任务选择偏差。',
    access: 'Local fixture',
    libraryState: '演示模板',
    readMode: '复现',
    pages: 4,
    demoRecord: true,
  },
];

const ragPapers: PaperFixture[] = [
  {
    id: 'rag-2020',
    title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
    authors: 'Lewis et al.',
    year: 2020,
    venue: 'NeurIPS',
    role: 'foundation',
    confidence: 97,
    rationale: '定义经典 RAG 形式和检索器、生成器的联合建模，是评估对象的起点。',
    access: 'OA PDF',
    libraryState: '本地条目',
    readMode: '深读',
    pages: 19,
  },
  {
    id: 'realm-2020',
    title: 'REALM: Retrieval-Augmented Language Model Pre-Training',
    authors: 'Guu et al.',
    year: 2020,
    venue: 'ICML',
    role: 'foundation',
    confidence: 83,
    rationale: '展示预训练阶段的可学习检索，为比较 RAG 范式提供基线。',
    access: 'OA PDF',
    libraryState: '仅元数据',
    readMode: '略读',
    pages: 17,
  },
  {
    id: 'kilt-2021',
    title: 'KILT: a Benchmark for Knowledge Intensive Language Tasks',
    authors: 'Petroni et al.',
    year: 2021,
    venue: 'NAACL',
    role: 'foundation',
    confidence: 89,
    rationale: '把答案质量与证据来源统一到知识密集任务基准。',
    access: 'OA PDF',
    libraryState: '未导入',
    readMode: '深读',
    pages: 21,
  },
  {
    id: 'ragas-2023',
    title: 'RAGAS: Automated Evaluation of Retrieval Augmented Generation',
    authors: 'Es et al.',
    year: 2023,
    venue: 'EACL demo',
    role: 'frontier',
    confidence: 93,
    rationale: '提出多维自动指标，直接对应当前工程实践。',
    access: 'OA PDF',
    libraryState: '未导入',
    readMode: '深读',
    pages: 8,
  },
  {
    id: 'ares-2024',
    title: 'ARES: An Automated Evaluation Framework for RAG Systems',
    authors: 'Saad-Falcon et al.',
    year: 2024,
    venue: 'NAACL',
    role: 'frontier',
    confidence: 90,
    rationale: '以合成训练数据和少量人工样本训练评判器，适合比较自动评估可靠性。',
    access: 'OA PDF',
    libraryState: '未导入',
    readMode: '查证',
    pages: 19,
  },
  {
    id: 'attribution-rag-demo',
    title: 'Attribution-first Evaluation for Multi-hop RAG',
    authors: 'Fixture authors',
    year: 2026,
    venue: 'Demo corpus',
    role: 'frontier',
    confidence: 70,
    rationale: '演示把答案、证据覆盖和推理链归因联合评估的候选位置。',
    access: 'Metadata fixture',
    libraryState: '演示记录',
    readMode: '略读',
    pages: 16,
    demoRecord: true,
  },
  {
    id: 'lost-middle-2023',
    title: 'Lost in the Middle: How Language Models Use Long Contexts',
    authors: 'Liu et al.',
    year: 2023,
    venue: 'TACL',
    role: 'counterpoint',
    confidence: 85,
    rationale: '说明提供相关上下文不等于模型有效使用，限制仅以检索命中率评估 RAG。',
    access: 'OA PDF',
    libraryState: '本地条目',
    readMode: '深读',
    pages: 18,
  },
  {
    id: 'judge-bias-demo',
    title: 'Reliability Limits of LLM-as-a-Judge for RAG Evaluation',
    authors: 'Fixture authors',
    year: 2026,
    venue: 'Demo corpus',
    role: 'counterpoint',
    confidence: 73,
    rationale: '演示自动评判器偏差与校准这一方法学反方。',
    access: 'Metadata fixture',
    libraryState: '演示记录',
    readMode: '查证',
    pages: 20,
    demoRecord: true,
  },
  {
    id: 'rag-survey-2023',
    title: 'Retrieval-Augmented Generation for Large Language Models: A Survey',
    authors: 'Gao et al.',
    year: 2023,
    venue: 'arXiv',
    role: 'bridge',
    confidence: 82,
    rationale: '连接 RAG 架构、检索增强阶段与评估维度。',
    access: 'OA PDF',
    libraryState: '未导入',
    readMode: '参考',
    pages: 24,
  },
  {
    id: 'rag-protocol-template',
    title: 'RAG Evaluation Protocol Card',
    authors: 'PaperWeave fixture',
    year: 2026,
    venue: 'Local template',
    role: 'resource',
    confidence: 100,
    rationale: '拆分检索召回、上下文利用、忠实度、答案质量与成本。',
    access: 'Local fixture',
    libraryState: '演示模板',
    readMode: '复现',
    pages: 5,
    demoRecord: true,
  },
];

const scalingPapers: PaperFixture[] = emergencePapers.map((paper) => ({
  ...paper,
  id: `scaling-${paper.id}`,
  role:
    paper.id === 'mirage-2023' || paper.id === 'continuous-metrics-demo'
      ? 'counterpoint'
      : paper.role,
  rationale:
    paper.role === 'counterpoint'
      ? '用于审查单一规模律在架构、数据质量与外推区间变化时的边界。'
      : paper.rationale,
}));

export const themeFixtures: ThemeFixture[] = [
  {
    id: 'emergence',
    label: '大语言模型的“涌现能力”是真实相变，还是度量假象？',
    shortLabel: 'LLM 涌现能力争议',
    description:
      '从规模定律与能力跃迁的原始主张出发，加入经验发展，并用连续度量、阈值选择与替代解释审查“离散涌现”。',
    assumptions: ['关注能力随规模变化', '区分能力与评测指标', '优先原始工作与方法学批评'],
    papers: emergencePapers,
  },
  {
    id: 'rag',
    label: '如何可信地评估检索增强生成（RAG）系统？',
    shortLabel: 'RAG 评估方法',
    description:
      '覆盖 RAG 原始范式、知识密集基准、自动评估框架与归因，并加入“长上下文不等于有效使用证据”的反方。',
    assumptions: ['同时评价检索与生成', '关注可归因性', '优先可复现实验'],
    papers: ragPapers,
  },
  {
    id: 'scaling',
    label: '神经网络规模定律如何改变最优训练与数据配置？',
    shortLabel: '神经规模定律',
    description:
      '从经验规模律、计算最优训练到数据重复、架构差异与外推失败，建立连续趋势、资源决策与适用边界的阅读路径。',
    assumptions: ['关注语言模型训练', '比较参数/数据/计算配置', '要求明确外推范围'],
    papers: scalingPapers,
  },
];

export function createClaimFixtures(paper: PaperFixture): ClaimFixture[] {
  const counterpoint = paper.role === 'counterpoint';

  return [
    {
      id: `${paper.id}-claim-author`,
      sourceKind: 'author_claim',
      sourceLabel: '作者主张 · Empirical',
      text: counterpoint
        ? '使用非线性或离散指标时，底层连续的能力变化可能呈现为表面上的突发跃迁。'
        : '该工作把主要现象表述为由本文实验观察支持的核心结论。',
      confidence: 84,
      scope: '仅适用于当前演示中的模型族、任务和评测设置；正式版本必须回到原文核验。',
      anchors: [
        { id: 'anchor-abstract', page: 1, label: '摘要' },
        { id: 'anchor-result', page: 2, label: '主结果' },
      ],
      status: 'draft',
    },
    {
      id: `${paper.id}-claim-result`,
      sourceKind: 'reported_result',
      sourceLabel: '报告结果 · Quantitative',
      text: '演示结果显示，替代连续指标后，部分原本呈现断点的任务曲线变得更平滑。',
      confidence: 78,
      scope: '需核验绝对值、比较基线、不确定性和任务切分；本句来自合成演示正文。',
      anchors: [
        { id: 'anchor-table', page: 2, label: 'Table 2' },
        { id: 'anchor-result', page: 2, label: '主结果' },
      ],
      status: 'draft',
    },
    {
      id: `${paper.id}-claim-inference`,
      sourceKind: 'ai_inference',
      sourceLabel: 'AI 推断 · Boundary',
      text: counterpoint
        ? '这篇论文更适合被视为对测量与可比性的限定，而不是对所有相关主张的普遍否定。'
        : '当前证据无法区分观察趋势来自方法机制、规模本身，还是数据与评测设计的共同变化。',
      confidence: 66,
      scope: '这是用于验证审阅协议的 AI fixture，必须由用户确认，不能冒充作者结论。',
      anchors: [{ id: 'anchor-limit', page: 2, label: '局限' }],
      status: 'draft',
    },
  ];
}

export const propositionFixtures = [
  {
    proposition: '能力曲线存在随模型规模出现的非线性跃迁',
    note: '需要区分任务能力与离散度量',
    stances: ['支持', '支持', '限定', '反对'],
  },
  {
    proposition: '部分“涌现”可由评测指标的非线性产生',
    note: '同一连续能力被阈值化后可能表现为断点',
    stances: ['未检验', '未检验', '支持', '支持'],
  },
  {
    proposition: '能力拐点能从较小模型可靠外推',
    note: '当前 Verified 证据覆盖不足',
    stances: ['有限', '未涉及', '质疑', '质疑'],
  },
] as const;

export const syncPreviewFixture = {
  zotero: [
    '预览：匹配可能的现有顶层条目，不创建重复记录',
    '预览：更新受 PaperWeave marker 管理的 child note 区块',
  ],
  git: [
    'papers/{paperId}/index.md',
    'papers/{paperId}/claims.json',
    'topics/{themeId}/index.md',
  ],
};
