# 12｜竞品格局与差异化策略

> 调研日期：2026-08-04。功能、定价和集成会变化；正式商业决策前应重新核验。资料入口见 `SOURCES.md`。

## 1. 市场能力地图

当前产品通常聚焦下列一至两个环节：

```text
Search / Discovery
  Semantic Scholar · Elicit · 通用学术搜索

Citation graph / Exploration
  Connected Papers · Litmaps · ResearchRabbit 类工具

Evidence / Citation context
  scite

PDF reading / Chat / Summary
  SciSpace · ChatPDF 类产品 · 阅读器内 AI

Reference management
  Zotero · EndNote · Mendeley

Notes / Knowledge
  Obsidian · Notion · Logseq · Markdown/Git
```

PaperWeave 不应以“每个环节功能更多”竞争，而应连接一个目前断裂的闭环：**平衡发现 → 原文证据 → 人工审阅 → 跨论文命题 → 开放工具链**。

## 2. 代表产品

### 2.1 Connected Papers

核心价值：从种子论文生成相似性图，帮助发现 prior work、derivative work 和相邻工作。

可借鉴：

- 以一篇种子快速建立领域视觉地图；
- Prior/Derivative 的认知入口；
- 图结构比搜索列表更适合探索。

空白：

- 图谱不等于阅读顺序；
- 不负责全文阅读与证据化笔记；
- “相似”不能自然覆盖方法学反方和负结果。

PaperWeave 策略：把图结构作为 Foundation/Bridge 等角色的证据之一，但输出可编辑的小型阅读路径。

### 2.2 Litmaps

核心价值：搜索、可视化引用网络、持续监控新论文，并提供 Zotero 同步能力。

可借鉴：

- 从静态检索升级到长期 Topic 追踪；
- 地图、Collection 和提醒结合；
- Zotero 互操作降低迁移成本。

空白：

- 主要价值仍在发现和监控；
- 阅读器内的证据审阅与跨论文认知不是核心。

PaperWeave 策略：不与其比“图更大”，而是把追踪结果转成角色化阅读队列，并进入 Claim/Anchor 生命周期。

### 2.3 Elicit

核心价值：面向研究问题的文献搜索、筛选、数据提取与系统综述工作流；强调支持性引文/证据和结构化表格。

可借鉴：

- 研究问题驱动，而非只用关键词；
- 结构化筛选/提取字段；
- 证据引用和 review workflow；
- Living review 的持续更新思路。

空白/差异：

- 系统综述与证据表是其强项；
- PaperWeave 首版更聚焦个人深度阅读、逐条审阅和本地研究记忆；
- Zotero/Git 的 Local-first 权威边界可形成不同楔子。

策略：避免在 v1 宣称“自动系统综述”。先把单篇证据账本和多篇命题可比性做到可信，再向严谨综述扩展。

### 2.4 SciSpace

核心价值：PDF 对话、解释、摘要、文献发现；已有 Zotero 导入、笔记/高亮和引用联动等阅读工作流能力。

可借鉴：

- 在 PDF 上下文中即时解释；
- 用户熟悉的 Chat-with-PDF 入口；
- 文献库导入减少摩擦。

风险：这是最接近用户表层认知的直接竞品。仅做“更好看的 PDF＋更长总结”难以建立壁垒。

PaperWeave 差异：

- AI 输出不是聊天历史，而是有 Schema、Anchor、provenance 和 review status 的对象；
- 首屏是阅读导引/证据账本，而不是空聊天框；
- 跨论文围绕 Proposition 比较，不把多份摘要拼接；
- 完整知识默认本地并输出 Git。

### 2.5 scite

核心价值：Smart Citations，区分某篇论文在引用语境中是 supporting、contrasting 或 mentioning，并提供 API/插件能力。

可借鉴：

- 引用数不是同质信号；
- 反方发现需要引用上下文；
- 撤稿/争议/支持结构可进入可信度层。

空白：

- 引用语境是外部证据信号，不等于用户已经理解论文；
- contrasting citation 也不必然真正反驳核心命题。

PaperWeave 策略：将 scite 类信号作为 Counterpoint candidate feature，最终仍需同命题、方法/设置可比性和用户审阅。

### 2.6 Zotero

核心价值：开源文献管理、附件、标注、Collection、引用格式和写作集成。其本地 API 已为独立桌面应用提供直接读写路径。

不可替代性：用户投入的书目、标签、附件和写作链路形成长期资产。

PaperWeave 原则：不复制完整文献管理功能；与 Zotero 共生，并保证断开 PaperWeave 后文献库仍完整。

### 2.7 Obsidian / Markdown / Git

核心价值：开放文件、链接、用户可控结构、插件生态和版本化。

可借鉴：

- 知识资产不被 SaaS 锁定；
- Markdown 适合长期审阅和团队 diff；
- 用户已有成熟的自定义工作流。

PaperWeave 策略：底层直接输出 Markdown/JSON/Git；Obsidian 只需把仓库作为 Vault 或使用后续轻量插件，不把其设为强依赖。GitHub 是可选 remote，不是唯一存储。

## 3. 能力对比

符号：● 核心能力；○ 有部分能力/依赖配置；— 非核心或不明确。

| 能力 | PaperWeave 目标 | Connected Papers | Litmaps | Elicit | SciSpace | scite | Zotero |
|---|---:|---:|---:|---:|---:|---:|---:|
| 语义/主题发现 | ● | ● | ● | ● | ● | ○ | ○ |
| 引用图探索 | ● | ● | ● | ○ | ○ | ● | ○ |
| 基石/前沿角色 | ● | ○ | ○ | ○ | ○ | ○ | — |
| 反方/负结果路径 | ● | — | — | ○ | ○ | ● | — |
| 可编辑阅读顺序 | ● | — | ○ | ○ | ○ | — | ○ |
| PDF 阅读/问答 | ● | — | — | ○ | ● | ○ | ● |
| 页/区域级证据锚点 | ● | — | — | ○ | ○ | ○ | ● |
| AI 草稿逐条审阅 | ● | — | — | ○ | ○ | — | — |
| AI/作者/用户来源区分 | ● | — | — | ○ | ○ | ○ | — |
| 跨论文命题矩阵 | ● | — | ○ | ● | ○ | ○ | — |
| Zotero 本地共生 | ● | — | ● | ○ | ○ | 插件 | ● |
| Git/Markdown 版本化 | ● | — | — | — | — | — | ○ |
| BYOK / 本地模型 | ● | — | — | —/○ | —/○ | API | — |
| PDF 默认留本地 | ● | N/A | N/A | 需核验 | 需核验 | N/A | ● |

该表用于产品定位，不代表完整功能审计或采购结论。

## 4. 真正的竞争替代品

最强竞品可能不是单一产品，而是研究者已经拼好的工作流：

```text
Google Scholar / Semantic Scholar
+ Connected Papers / Litmaps
+ Zotero
+ 浏览器或 PDF 阅读器
+ ChatGPT/Claude/Gemini 等
+ Obsidian/Notion
+ GitHub
```

这套组合功能强、可替换、用户已付出学习成本。PaperWeave 必须证明：

- 减少搬运，而不是要求迁移；
- 增加可信度，而不只是省几分钟；
- 输出能回到原工具；
- AI 审阅成本低于用户手工搭建结构的成本；
- 在连续数周的研究中比一次性对话更有价值。

## 5. 差异化楔子

### Wedge 1｜Counterpoint-by-design

每个主题默认寻找反证、复现失败、方法学批评和边界条件。空缺也诚实展示。

### Wedge 2｜Evidence Ledger + Review Queue

每条事实性输出都能回到原文；AI 草稿必须经过用户接受/编辑，形成可审计知识。

### Wedge 3｜Cognitive Delta

阅读后记录“这篇论文如何改变我的判断”，而不是只记录作者说了什么。

### Wedge 4｜Proposition-level synthesis

比较命题、定义、实验设置和证据，不拼接摘要。

### Wedge 5｜Local-first interoperability

Zotero 保留文献，Git/Markdown 保留知识，用户模型负责智能。退出产品后资产仍可用。

## 6. 不应作为主要卖点

- “支持很多模型”；容易复制；
- “一键总结 PDF”；高度同质化；
- “论文数量最多”；难与大型索引竞争；
- “知识图谱很炫”；若不能回到证据会沦为装饰；
- “全自动研究”；会放大信任与学术诚信问题；
- “全部功能都在一个 App”；用户不愿放弃 Zotero/Git 的既有资产。

## 7. 定位文案候选

### 研究可信度方向

> Read the evidence, not just the summary.  
> 不止总结论文，而是维护证据、争议和你的判断。

### 工作流方向

> From a research question to a versioned research memory.  
> 从一个问题，到可追溯、可版本化的研究记忆。

### 反方差异化方向

> Every topic deserves its foundations, frontier, and counterpoints.  
> 理解一个主题，也要读它的基石、前沿与反方。

首轮用户测试应比较“可信度”与“工作流整合”哪个更能驱动付费，而不是直接采用团队最喜欢的文案。

## 8. 战略防线

单个功能可被复制，组合式防线来自：

1. 高质量、可解释的角色化 Gold Set 与反馈数据；
2. Anchor/Claim/Proposition 的开放但成熟的数据协议；
3. 用户长期审阅形成的私有研究图谱；
4. Zotero/Git 的可靠同步与冲突经验；
5. 学科模板和评测集；
6. 在本地隐私与跨 Provider 上建立信任；
7. 用户可迁移反而降低尝试门槛，形成口碑。
