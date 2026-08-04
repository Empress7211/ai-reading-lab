# 04｜论文推荐与角色分类引擎

## 1. 产品目标

推荐系统要生成一个 **可解释、平衡、适合按顺序阅读的小型论文集合**，而不是最大化点击或堆叠热门论文。

系统输出两个层次：

1. Candidate relevance：哪些论文和主题有关；
2. Reading role：为什么它在这一套阅读路径中扮演基石、前沿、反方、桥梁或资源角色。

角色是 **相对于当前主题包** 的，不是论文永久属性。同一篇论文在“Transformer 架构”中可能是基石，在“长上下文方法”中只是背景。

## 2. 数据源策略

### 核心元数据

- OpenAlex：作品、主题、引用图、开放版本；
- Crossref：DOI、出版元数据、license、更新/撤稿关系；
- Semantic Scholar：论文搜索、引用/参考文献、推荐、引用语境与部分 OA PDF；
- arXiv、PubMed/PMC 等领域来源；
- Unpaywall：DOI 对应开放获取位置。

### 可选增强

- scite：Supporting / Contrasting / Mentioning citation；
- Retraction Watch/Crossref 更新关系；
- Papers with Code 或官方仓库信息；
- 用户 Zotero 库、阅读状态、手工反馈。

### 原则

- 不依赖单一供应商；
- 每条字段保存来源与更新时间；
- 同一字段冲突时保留 provenance；
- 商业化前逐一确认 API 许可、展示归属和缓存条款；
- 可替换 Provider，不让推荐逻辑绑定某个 API。

## 3. 流程总览

```text
主题理解
  → 查询扩展
  → 多源候选召回
  → ID 对齐与去重
  → 元数据/引用图/全文可用性增强
  → 主题聚类
  → 角色评分
  → 多样性与配额优化
  → LLM 角色复核与解释
  → 质量/合规过滤
  → 阅读顺序规划
```

## 4. 主题理解

输入可以是：关键词、自然语言问题、种子论文、Zotero Collection 或用户已有笔记。

输出 `TopicIntent`：

- canonical_query；
- concepts / aliases / acronyms；
- inclusion_terms；
- exclusion_terms；
- target_domains；
- research_question_type；
- expected paper types；
- time preference；
- known seed papers；
- ambiguity questions（MVP 尽量用可编辑假设而非阻塞式追问）。

示例：

```json
{
  "canonical_query": "emergent abilities in large language models",
  "aliases": ["emergence", "phase transition", "scaling discontinuity"],
  "exclusions": ["emergent communication in multi-agent RL"],
  "question_type": "empirical controversy",
  "desired_roles": ["foundation", "frontier", "counterpoint"]
}
```

## 5. 候选召回

并行召回至少包括：

1. 关键词/布尔检索；
2. 语义检索；
3. 种子论文的 references；
4. 种子论文的 citations；
5. co-citation；
6. bibliographic coupling；
7. 同主题/同领域聚类；
8. 推荐 API；
9. 用户 Zotero 中的相似论文；
10. 已读论文的作者/系列工作。

候选池建议 500–3000 篇，再逐层缩小。MVP 可先控制在 500–1000 篇以降低 API 和计算成本。

## 6. 实体对齐与去重

优先键：DOI、arXiv、PMID、Corpus ID。无 ID 时使用：

- normalized title；
- 作者集合；
- 年份；
- venue；
- abstract fingerprint。

预印本与正式发表版本应建立 `is_version_of` 关系，不简单视为重复删除。主题包默认展示权威版本，但保留版本差异和可用 PDF 来源。

## 7. 通用特征

### 主题相关

- title/abstract embedding similarity；
- BM25/keyword coverage；
- 与种子论文的图距离；
- Topic/field 一致性；
- LLM relevance judgment（只做后段 rerank）。

### 影响与结构

- 年龄归一化引用数；
- 本地子图 PageRank / betweenness；
- 被候选集中多少核心论文共同引用；
- influential citations；
- 参考文献覆盖率。

### 时间与增长

- publication recency；
- citation velocity；
- 最近新增引用；
- 是否进入新兴聚类；
- preprint → published 状态。

### 质量与可信信号

- retract/correction/expression of concern；
- venue 和同行评审状态（仅作为信号，不作为真理）；
- 代码/数据可用；
- 复现论文；
- 支持/反方引用语境；
- 元数据完整性。

### 用户适配

- 已读/未读；
- Zotero 中是否存在；
- 用户领域与项目；
- 用户手工固定/排除；
- 历史角色修正；
- 语言和 OA 偏好。

## 8. 角色定义与评分

所有分数先在当前主题候选集内归一化，并输出贡献解释。

### 8.1 Foundation｜基石

定义：对当前主题的关键概念、方法、问题定义或共同知识祖先具有高贡献的论文。

建议初始公式：

```text
FoundationScore =
  0.25 * TopicRelevance
+ 0.20 * LocalGraphCentrality
+ 0.18 * SharedAncestorScore
+ 0.12 * AgeNormalizedInfluence
+ 0.10 * ConceptOriginLikelihood
+ 0.08 * ReferenceCoverage
+ 0.07 * UserNeedFit
- BiasPenalty
```

`BiasPenalty` 包括：纯年龄优势、领域引用习惯差异、综述替代原始工作、著名作者偏置。

基石不必最老，也不应只按引用数排序。

### 8.2 Frontier｜当前发展

定义：代表当前最相关的新方向、方法突破、重要扩展或快速增长证据的论文。

```text
FrontierScore =
  0.28 * TopicRelevance
+ 0.18 * Recency
+ 0.16 * CitationVelocity
+ 0.14 * EmergingClusterCentrality
+ 0.10 * NoveltyVsPack
+ 0.08 * EvidenceOrArtifactAvailability
+ 0.06 * UserNeedFit
- HypePenalty
```

`HypePenalty`：只有社交热度而缺乏完整论文/证据、重复已有方法、元数据不完整等。

### 8.3 Counterpoint｜反方视角

定义不局限于“明确反驳”，包括：

- 结论相反；
- 复现失败或效果显著缩小；
- 指出统计/实验设计问题；
- 提出替代解释；
- 使用不同定义揭示原结论不稳健；
- 报告负结果；
- 理论上证明边界或不可能性；
- 对主流范式提出替代方法。

```text
CounterpointScore =
  0.22 * SamePropositionRelevance
+ 0.20 * ContrastingCitationSignal
+ 0.16 * ConclusionPolarityDifference
+ 0.14 * MethodologicalCritiqueSignal
+ 0.10 * ReplicationOrNegativeResultSignal
+ 0.08 * AlternativeParadigmDistance
+ 0.06 * EvidenceStrength
+ 0.04 * Recency
- FalseConflictPenalty
```

`FalseConflictPenalty` 用于处理：研究对象不同、指标方向不同、数据切分不同、定义不同却被 LLM 误判为冲突。

### 8.4 Bridge / Survey｜桥梁或综述

作用：帮助用户建立术语、谱系和分支，不替代原始论文。

特征：高覆盖引用、主题广度、清晰分类、较新、被多子群共同引用。

### 8.5 Resource｜资源/复现

数据集、基准、代码、复现实验、教程或系统论文。该角色对算法工程师尤其重要。

## 9. 反方视角识别管线

### Stage 1｜结构召回

- 搜索引用目标论文且 citation context 含 critique/contrast 语义的文献；
- 查找标题/摘要中的 replication、revisit、limitations、negative results、myth、mirage、failure、reassessment 等模式；
- scite contrasting 信号（若接入）；
- Crossref correction/retraction/commentary 关系；
- 同命题但结论方向不同的论文。

### Stage 2｜命题对齐

LLM/规则抽取：研究对象、核心命题、结果方向、效应大小、数据和指标。

### Stage 3｜可比性判断

输出：

- `direct_counter`：同一或高度可比条件下相反；
- `qualifies`：限制外推或仅在某些条件成立；
- `alternative_explanation`；
- `methodological_critique`；
- `replication_failure`；
- `not_comparable`；
- `uncertain`。

### Stage 4｜证据解释

卡片显示：

- 它反对的是哪个具体命题；
- 反方证据来自何处；
- 两篇实验是否可比；
- 系统置信度；
- 用户可修正角色。

系统不得为了满足配额而把普通“不同方法”硬标为反方。没有可靠反方时显示缺口本身。

## 10. 配额与多样性优化

在每个角色内使用 MMR 或约束优化，避免：

- 同一研究组/作者占据大多数；
- 多篇论文几乎相同；
- 全是高引用旧论文或全是新预印本；
- 单一数据集/基准；
- 地域、机构、语言和 venue 偏差；
- 已读内容重复。

目标函数示意：

```text
SetUtility = Σ RoleScore(p)
           + λ1 * TopicalCoverage
           + λ2 * MethodDiversity
           + λ3 * TemporalCoverage
           + λ4 * ViewpointBalance
           - λ5 * PairwiseRedundancy
           - λ6 * UserFatigue
```

## 11. 阅读顺序规划

顺序不是简单按年份。构建 prerequisite DAG：

- 概念依赖；
- 方法继承；
- 明确引用；
- 综述作为导航；
- 反方应在用户理解被反对命题之后出现；
- 对熟悉用户可跳过基础层。

每篇标注：

- `must_read_before`；
- `recommended_after`；
- `skim_only_sections`；
- `deep_read_sections`。

## 12. 解释生成

解释模板必须引用结构化特征，禁止纯生成式包装：

> 作为“基石”：它被本主题候选集中 41% 的核心论文共同引用；提出了当前仍沿用的问题定义；与种子论文的引用图距离为 1。角色置信度 0.86。

> 作为“反方”：它在相同数据集和指标上未复现原论文的非线性跃迁，并将差异归因于离散指标。两篇模型规模不同，因此系统将关系标为“限定/部分反方”，置信度 0.74。

## 13. 冷启动与个性化

### 冷启动

- 让用户选择 3–10 个主题；
- 可选扫描 Zotero 顶层元数据，不读取全文；
- 提供公开主题模板；
- 不要求先连接 GitHub。

### 个性化边界

个性化用于：减少重复、调整难度、优先用户项目相关论文；不应形成只推荐同一范式的“学术回音室”。反方配额和多样性约束不因点击偏好完全消失。

## 14. 反馈信号

显式：固定、替换、角色修正、不相关、过时、已读、反方不成立。  
隐式：打开、加入队列、阅读完成、生成 Verified Claims、跨论文引用。

不要把点击直接等价于质量：标题党或热点论文会带来偏差。优先使用“完成阅读并形成经审阅知识”作为强信号。

## 15. 评测框架

### 离线基准

- 由领域专家为 30–50 个主题标注阅读包；
- 评估 Recall@K、nDCG、role precision、set diversity；
- 单独评估 Counterpoint precision 和 comparability；
- 对不同领域、年代、引用规模切片。

### 用户任务评测

对比普通搜索/相似论文列表：

- 建立领域结构所需操作数；
- 是否遗漏关键基石；
- 是否发现有效反方；
- 角色解释可信度；
- 用户替换率；
- 最终进入深读的比例。

### 线上护栏

- 角色错误反馈；
- 重复率；
- 无法获取全文比例；
- 单一作者/机构集中度；
- 反方硬凑率；
- 被撤稿论文未警示率必须接近零。
