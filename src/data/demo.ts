export type AppView =
  | 'discover'
  | 'library'
  | 'reading'
  | 'reader'
  | 'knowledge'
  | 'sync'
  | 'settings';

export type PaperRole =
  | 'foundation'
  | 'frontier'
  | 'counterpoint'
  | 'bridge'
  | 'resource';

export interface DemoPaper {
  id: string;
  citekey: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  role: PaperRole;
  confidence: number;
  reason: string;
  access: 'OA PDF' | 'Metadata only';
  zotero: '已在库中' | '未入库';
  mode: '略读' | '深读' | '复现';
  pages: number;
}

export interface DemoClaim {
  id: string;
  claimText: string;
  claimType: 'empirical' | 'interpretive' | 'methodological';
  source: 'author_claim' | 'reported_result' | 'ai_inference';
  confidence: number;
  scope: string;
  anchorIds: string[];
}

export const roleLabels: Record<PaperRole, string> = {
  foundation: '基石',
  frontier: '当前发展',
  counterpoint: '反方视角',
  bridge: '桥梁综述',
  resource: '复现资源',
};

export const papers: DemoPaper[] = [
  {
    id: 'kaplan-2020',
    citekey: 'kaplan2020scaling',
    title: 'Scaling Laws for Neural Language Models',
    authors: 'Kaplan et al.',
    year: 2020,
    venue: 'arXiv',
    role: 'foundation',
    confidence: 91,
    reason: '提供参数、数据和算力之间的连续规模规律，是理解“何时出现能力跃迁”的前置框架。',
    access: 'OA PDF',
    zotero: '已在库中',
    mode: '深读',
    pages: 30,
  },
  {
    id: 'brown-2020',
    citekey: 'brown2020fewshot',
    title: 'Language Models are Few-Shot Learners',
    authors: 'Brown et al.',
    year: 2020,
    venue: 'NeurIPS',
    role: 'foundation',
    confidence: 87,
    reason: '建立大规模语言模型的少样本能力基线，为后续涌现讨论提供任务与评测语境。',
    access: 'OA PDF',
    zotero: '已在库中',
    mode: '略读',
    pages: 75,
  },
  {
    id: 'wei-2022',
    citekey: 'wei2022emergent',
    title: 'Emergent Abilities of Large Language Models',
    authors: 'Wei et al.',
    year: 2022,
    venue: 'TMLR',
    role: 'foundation',
    confidence: 89,
    reason: '明确提出并汇总“能力随规模非连续出现”的经验性定义，是争议的核心种子论文。',
    access: 'OA PDF',
    zotero: '未入库',
    mode: '深读',
    pages: 15,
  },
  {
    id: 'srivastava-2022',
    citekey: 'srivastava2022beyond',
    title: 'Beyond the Imitation Game: Quantifying and Extrapolating the Capabilities of Language Models',
    authors: 'Srivastava et al.',
    year: 2022,
    venue: 'TMLR',
    role: 'frontier',
    confidence: 88,
    reason: 'BIG-Bench 扩展了任务空间，为观察跨任务能力曲线和潜在断点提供基础。',
    access: 'OA PDF',
    zotero: '未入库',
    mode: '略读',
    pages: 120,
  },
  {
    id: 'chowdhery-2022',
    citekey: 'chowdhery2022palm',
    title: 'PaLM: Scaling Language Modeling with Pathways',
    authors: 'Chowdhery et al.',
    year: 2022,
    venue: 'JMLR',
    role: 'frontier',
    confidence: 86,
    reason: '在更大模型族和更广任务上报告能力变化，可检验不同规模区间的外推。',
    access: 'OA PDF',
    zotero: '未入库',
    mode: '深读',
    pages: 63,
  },
  {
    id: 'schaeffer-2023',
    citekey: 'schaeffer2023mirage',
    title: 'Are Emergent Abilities of Large Language Models a Mirage?',
    authors: 'Schaeffer, Miranda & Koyejo',
    year: 2023,
    venue: 'NeurIPS',
    role: 'counterpoint',
    confidence: 97,
    reason: '论证部分涌现曲线可由非线性或离散评测指标产生，是直接的方法学反方。',
    access: 'OA PDF',
    zotero: '已在库中',
    mode: '深读',
    pages: 14,
  },
  {
    id: 'continuous-2024',
    citekey: 'continuous2024metrics',
    title: 'Emergence or Smooth Scaling? Re-examining Capability Transitions with Continuous Metrics',
    authors: 'Miller et al.',
    year: 2024,
    venue: 'arXiv',
    role: 'counterpoint',
    confidence: 78,
    reason: '用连续指标重测能力转变，区分真实能力变化和度量阈值效应。',
    access: 'OA PDF',
    zotero: '未入库',
    mode: '深读',
    pages: 22,
  },
  {
    id: 'survey-2025',
    citekey: 'survey2025emergence',
    title: 'Emergent Capabilities in Foundation Models: Definitions, Evidence, and Open Problems',
    authors: 'Liu et al.',
    year: 2025,
    venue: 'ACM Computing Surveys',
    role: 'bridge',
    confidence: 81,
    reason: '梳理定义、指标与证据层级，连接规模律与方法学争论。',
    access: 'Metadata only',
    zotero: '未入库',
    mode: '略读',
    pages: 42,
  },
  {
    id: 'benchmark-2024',
    citekey: 'benchmark2024scaling',
    title: 'A Reproducible Benchmark for Capability Scaling Curves',
    authors: 'Nguyen et al.',
    year: 2024,
    venue: 'ML Reproducibility Challenge',
    role: 'resource',
    confidence: 74,
    reason: '提供连续/离散指标、模型检查点和可复现实验脚本。',
    access: 'OA PDF',
    zotero: '未入库',
    mode: '复现',
    pages: 18,
  },
];

export const claims: DemoClaim[] = [
  {
    id: 'claim-continuity',
    claimText: '使用非线性或离散指标时，底层连续且可预测的能力变化可以呈现为表面上的突发“涌现”。',
    claimType: 'empirical',
    source: 'author_claim',
    confidence: 0.84,
    scope: '本文报告的模型族、任务与评测设置；尚不能外推到所有能力。',
    anchorIds: ['anchor-abstract', 'anchor-results'],
  },
  {
    id: 'claim-threshold',
    claimText: '在将不连续指标替换为连续评分后，若干原本显示断点的任务呈现更平滑的规模曲线。',
    claimType: 'empirical',
    source: 'reported_result',
    confidence: 0.78,
    scope: '控制实验中的任务子集；绝对变化与相对变化需分别核验。',
    anchorIds: ['anchor-table', 'anchor-results'],
  },
  {
    id: 'claim-boundary',
    claimText: '该论文更适合被解释为对测量与可比性的限定，而不是证明所有相关主张都为假。',
    claimType: 'interpretive',
    source: 'ai_inference',
    confidence: 0.66,
    scope: 'AI 推断；需要用户确认，不能作为作者明确结论。',
    anchorIds: ['anchor-limitations'],
  },
];

export const outline = [
  ['Abstract', 'anchor-abstract', 1],
  ['1 Introduction', 'anchor-introduction', 1],
  ['2 Background', 'anchor-background', 2],
  ['3 Method', 'anchor-method', 3],
  ['3.1 Measurement', 'anchor-measurement', 3],
  ['4 Experiments', 'anchor-results', 5],
  ['4.2 Main results', 'anchor-table', 6],
  ['5 Limitations', 'anchor-limitations', 8],
  ['References', 'anchor-references', 12],
] as const;

export const propositions = [
  {
    proposition: '能力曲线存在随模型规模出现的非线性跃迁',
    detail: '需要区分任务能力与离散度量',
    stances: ['支持', '支持', '限定', '反对'],
  },
  {
    proposition: '部分“涌现”可由评测指标的非线性产生',
    detail: '同一连续能力被阈值化后表现为断点',
    stances: ['未检验', '未检验', '支持', '支持'],
  },
  {
    proposition: '能力拐点能从较小模型可靠外推',
    detail: '当前证据覆盖不足',
    stances: ['有限', '未涉及', '质疑', '质疑'],
  },
  {
    proposition: '不同模型族共享相同的跃迁位置',
    detail: '架构、数据与 prompting 不可比',
    stances: ['限定', '部分', '不可比', '不可比'],
  },
];

export const defaultUserNote = `# 我的判断

读前预期：

最强证据：

我仍不相信：

这篇如何改变我对主题的认识：

下一步可检验行动：`;
