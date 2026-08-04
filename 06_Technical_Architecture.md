# 06｜技术架构设计

## 1. 架构目标

PaperWeave 的技术架构必须同时满足五个约束：

1. **Local-first**：本地 PDF、批注、完整笔记和密钥在无账户、无网络时仍可使用；
2. **证据可追溯**：AI 输出必须能稳定回到 PDF 文本、页码、坐标、图表或公式；
3. **可插拔**：论文元数据、LLM、Embedding、OCR、Git 远端均可替换；
4. **不侵入现有工具**：Zotero 与 Git 保持各自权威边界；
5. **可恢复**：下载、解析、模型调用、同步均为可观察、可重试、幂等的后台任务。

## 2. 推荐总体形态

### 2.1 客户端

建议首版使用：

- **Tauri 桌面壳**：负责窗口、系统钥匙串、文件权限、深链和原生菜单；
- **React + TypeScript**：负责发现页、主题包、阅读器、审阅队列和设置；
- **Rust Local Core**：负责 SQLite、文件系统、Git、Zotero Local API、下载安全和任务调度；
- **PDF.js 阅读层**：负责 PDF 渲染、文本层、选择范围、页面坐标和基础批注；
- **文档解析 Worker**：首选本地 Docling worker，将 PDF 转换为结构化 JSON/Markdown；难例可选 OCR 或远端解析；
- **SQLite + FTS5**：保存领域对象、事件、全文索引和任务；向量索引做可替换模块。

### 2.2 轻量云端

云端不是阅读所必需，MVP 只承担：

- 多来源论文元数据聚合与去重；
- 引用图和推荐候选缓存；
- API 供应商密钥代理（仅平台自有数据源，不代理用户 LLM 密钥）；
- 可选账户、偏好和跨设备同步；
- 产品更新、匿名遥测和错误符号化。

默认不上传 PDF、全文、用户高亮或完整笔记。任何云端同步均需明确开关、字段说明与删除能力。

## 3. 组件分层

```text
Presentation
  App Shell / Discover / Topic Pack / Reader / Review Queue / Knowledge / Settings

Application
  Topic Orchestrator / Reading Session / Note Workflow / Sync Coordinator / Job Center

Domain
  Paper / Topic / ReadingPack / EvidenceAnchor / Claim / NoteBlock / ModelRun / SyncRecord

Local Infrastructure
  SQLite / FTS / Vector Index / File Vault / PDF Engine / Parser Worker / Git / Keychain

External Adapters
  Zotero / OpenAlex / Crossref / Semantic Scholar / Unpaywall / arXiv / LLM Providers

Optional Cloud
  Metadata Broker / Citation Graph Cache / Recommendation API / Account Sync
```

每层通过显式接口连接。UI 不得直接调用外部 API 或读写 Zotero/Git；所有副作用经 Application Service 和 Job Queue 进入。

## 4. 核心运行时

### 4.1 App Shell

职责：

- 生命周期与窗口；
- 原生文件选择；
- `paperweave://` 深链；
- 菜单、快捷键与系统通知；
- 受控 IPC；
- 更新与崩溃恢复。

安全原则：仅暴露白名单命令，不提供通用 shell、任意文件读写或任意网络代理接口。

### 4.2 Local Core

建议拆分为模块：

| 模块 | 主要职责 |
|---|---|
| `workspace` | 工作区、迁移、备份、恢复 |
| `catalog` | Paper/Author/Venue/ID 对齐与检索 |
| `pdf_vault` | 附件引用、哈希、权限、缓存 |
| `parser` | 文本块、结构、图表、公式和 OCR 状态 |
| `anchors` | 文本选择、坐标、上下文 hash、重定位 |
| `notes` | Claim、NoteBlock、审阅状态和关系 |
| `recommendation` | TopicIntent、候选、角色评分、配额优化 |
| `models` | Provider、路由、预算、结构化输出、重试 |
| `zotero` | 能力探测、授权、映射、写入和冲突 |
| `git_sync` | 渲染、diff、commit、push、冲突队列 |
| `jobs` | 任务状态、幂等键、日志、暂停与重试 |
| `telemetry` | 本地诊断和用户许可下的匿名事件 |

### 4.3 文档解析 Worker

解析应是独立进程，原因是 OCR/版面模型资源占用大、依赖复杂、崩溃隔离重要。

输入：PDF 路径、哈希、页码范围、语言、解析级别。  
输出：

- 页面尺寸与旋转；
- reading order；
- 章节树；
- 文本 span 与 bbox；
- 图、表、公式、脚注、参考文献；
- 每个元素的解析置信度；
- Markdown/JSON 表达；
- OCR provenance。

解析结果按 `pdf_sha256 + parser_version + options_hash` 缓存。PDF 未变化时不得重复解析。

## 5. PDF 阅读与证据锚定

### 5.1 双表示

每篇论文保留两套互相映射的表示：

1. **视觉表示**：PDF 页、坐标和渲染层；
2. **语义表示**：章节、段落、句子、图表、公式和引用。

AI 使用语义表示；用户跳转和校验使用视觉表示。任一表示失败时仍应允许阅读和手工笔记。

### 5.2 Anchor 组成

```text
page_index
bbox_norm = [x0, y0, x1, y1]       # 归一化坐标
selected_text
prefix / suffix
text_hash
section_path
semantic_element_id
pdf_sha256
parser_version
```

重定位优先级：

1. 同 PDF hash 的 element ID；
2. 页码＋坐标；
3. selected text 精确匹配；
4. prefix/suffix 模糊匹配；
5. 章节＋语义相似匹配；
6. 标记为 `orphaned` 并请求用户修复。

### 5.3 版本变更

预印本升级到正式版时不覆盖旧附件。系统创建新 `PaperVersion`，尝试迁移 Anchor，并展示：成功、低置信度、失效三种状态。

## 6. 模型适配层

### 6.1 Provider 抽象

```ts
interface ModelProvider {
  testConnection(profile: ModelProfile): Promise<CapabilityReport>;
  generate(request: GenerationRequest): AsyncIterable<ModelEvent>;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  cancel(runId: string): Promise<void>;
}
```

首版支持：

- OpenAI-compatible endpoint；
- 若干原生 Provider Adapter；
- 本地 OpenAI-compatible server；
- “无模型模式”：阅读、手工笔记和导出仍可用。

### 6.2 任务路由

| 任务 | 默认能力要求 |
|---|---|
| 主题归一化、角色分类 | 低成本文本模型＋JSON |
| 局部 Claim 提取 | 长上下文文本模型＋结构化输出 |
| 图表解释 | 视觉模型；失败时提示人工 |
| 跨论文综合 | 推理模型＋仅 Verified 输入 |
| 去重/召回 | Embedding；可降级 BM25 |
| 翻译/术语解释 | 快速文本模型 |

用户可针对任务设置模型、预算上限、并发数和“仅本地模型”。

### 6.3 上下文编排

禁止把整份工作区无差别塞入提示词。上下文由下列最小集合组成：

- 当前问题；
- 当前页面/章节；
- 必要的上游定义；
- 与问题相关的 Verified Claims；
- 明确标记的不可信论文内容；
- 输出 JSON Schema 与 provenance 规则。

每次调用保存 `input_manifest`、模型、参数、token、成本、耗时和结果 hash；默认不保存密钥，原始 prompt 可由用户配置保留期限。

## 7. 推荐服务架构

### 7.1 云端候选召回

```text
TopicIntent
  → Provider fan-out
  → Raw records
  → Identifier normalization
  → Entity resolution
  → Citation graph expansion
  → Feature snapshot
  → Candidate response
```

云端输出候选与可解释特征，不输出最终“真理”。客户端结合本地 Zotero、已读历史、排除规则和用户反馈执行最终重排。

### 7.2 客户端最终编排

- 角色配额；
- MMR/作者与聚类多样性；
- 已读去重；
- OA 偏好；
- 本地库提升；
- 角色 LLM 复核；
- 阅读顺序。

由此避免将用户私有库完整上传云端。

## 8. 后台任务系统

所有外部副作用都建模为 Job：

```text
queued → running → waiting_user | retry_scheduled | succeeded | failed | canceled
```

Job 字段：

- `type`；
- `idempotency_key`；
- `payload_ref`；
- `attempt` / `max_attempts`；
- `progress`；
- `error_code` / `user_message`；
- `next_retry_at`；
- `depends_on`；
- `created_at` / `updated_at`。

典型链路：

```text
Resolve PDF
  → Download
  → Verify
  → Attach Zotero
  → Parse
  → Index
  → Generate pre-read brief
```

每步成功可独立保留，失败后从断点继续。用户可在任务中心查看来源、动作和重试结果。

## 9. 本地数据库与搜索

### 9.1 SQLite

建议开启：

- WAL；
- foreign keys；
- schema migration；
- FTS5；
- 定期 integrity check；
- 自动备份保留策略。

领域表与全文/向量索引分离。模型输出先存 immutable `model_run`，再由解析器转换为 draft 对象，便于审计与重放。

### 9.2 混合检索

本地检索分数：

```text
HybridScore = w1 * BM25 + w2 * VectorSimilarity + w3 * Recency + w4 * UserVerifiedBoost
```

所有命中应展示命中位置和对象类型。默认只让 Verified 内容参与跨论文事实综合；Draft 可被搜索但有明显标识。

## 10. Zotero 与 Git 同步协调

同步采用 Outbox/Inbox 模式：

- 领域对象变更写入同一 SQLite 事务；
- Outbox 记录待写 Zotero/Git 的意图；
- Worker 幂等执行；
- 远端版本写入 SyncRecord；
- 冲突进入用户队列，不静默覆盖。

Git 渲染应是确定性的：同一领域对象在同一 renderer 版本下产生稳定 Markdown，避免无意义 diff。

## 11. 可选云端服务

建议分为三个边界清晰的服务：

1. `metadata-broker`：聚合外部学术 API、缓存与归一化；
2. `recommendation-api`：图扩展、特征与候选；
3. `account-sync`：偏好、主题定义、可选 E2EE 数据包。

MVP 可以先合并部署为模块化单体，避免过早微服务化。每个外部 Provider 都应有：速率限制、熔断、缓存、归属字段和许可配置。

## 12. 架构方案比较

| 方案 | 优点 | 主要问题 | 结论 |
|---|---|---|---|
| 纯 Web | 发布快、跨平台 | 难安全访问本地 Zotero/Git/PDF/钥匙串；需本地桥 | 不作为主形态 |
| Web＋本地 Agent | Web UI 灵活 | 两个进程、授权和升级复杂；攻击面更大 | 可作后续企业模式 |
| Electron | 生态成熟、Node 能力强 | 包体和内存较高；需严格收缩 Node 权限 | 可行备选 |
| Tauri＋Web UI | 本地能力与前端效率平衡 | Rust/sidecar 工程复杂度较高 | 首选 |
| Zotero 插件 | 深度联动 | 生命周期受 Zotero 约束；插件权限高；难承载完整产品 | 后续增强件 |

## 13. 关键 ADR

- **ADR-001**：桌面端为首版主客户端；
- **ADR-002**：Zotero 管书目与附件，PaperWeave 管理解，Git 管开放出口；
- **ADR-003**：PDF 默认不上传产品云；
- **ADR-004**：所有 AI 事实块必须有 provenance 与 Anchor；
- **ADR-005**：AI 草稿与 Verified 知识分表/分状态；
- **ADR-006**：推荐最终重排在本地，以使用私有偏好而不上传完整库；
- **ADR-007**：使用后台任务与 Outbox，禁止 UI 直接执行跨系统写入；
- **ADR-008**：解析器可替换，PDF 坐标为不可由 LLM 修改的事实层。

## 14. 非功能指标

| 指标 | MVP 目标 |
|---|---|
| 冷启动到可阅读 | 本地已有 PDF：P95 < 3 秒 |
| 普通 PDF 首屏 | P95 < 1.5 秒 |
| 文本 PDF 全文解析 | 30 页典型论文 P95 < 60 秒（设备相关，后台执行） |
| 页面切换 | P95 < 120 ms 感知反馈 |
| 本地搜索 | 10 万 NoteBlock/Claim，P95 < 300 ms |
| 崩溃恢复 | 不丢失已接受笔记；未完成编辑可恢复 |
| 离线能力 | 阅读、批注、笔记、检索、Git 本地提交可用 |
| 可观测性 | 每个跨系统动作可定位到 Job 和错误码 |

性能目标应在真实设备基准测试后校准，不作为未经验证的市场承诺。
