# 11｜MVP 路线图、研发拆分与验收

## 1. 路线图原则

先证明一条完整、可信的垂直闭环，而不是并行铺开“搜索、聊天、知识图谱、协作、写作”五个半成品。每个里程碑都要能被真实研究任务验证。

## 2. 里程碑

### M0｜Discovery & Technical Spikes

目标：消除决定架构的未知项。

交付：

- 12–20 名 CS/ML 用户访谈与工作流观察；
- Zotero Local API 读写、附件、child note 技术 Spike；
- PDF.js 选区 → 稳定 Anchor → 重启回跳；
- 3 类 PDF 解析对比：数字原生、双栏复杂、扫描件；
- Tauri/sidecar/Keychain/Git 性能与打包验证；
- 3 个主题的手工 Gold Reading Pack；
- AI Claim JSON＋Anchor 校验原型；
- 风险/许可清单。

退出标准：核心闭环不存在不可接受的平台阻塞；Anchor 和 Zotero 写入方案通过技术评审。

### M1｜Local Reading Core（Internal Alpha）

范围：

- 工作区与本地数据库；
- 导入 PDF、打开 Zotero 现有附件；
- PDF 阅读器、目录、搜索、选区；
- Anchor 与手工结构化笔记；
- BYOK Profile、PaperWeave 本机持久化、替换/清除与连接测试；
- 局部 AI 解释/Claim draft；
- 接受/编辑/驳回；
- Markdown 本地导出；
- 任务中心和基础诊断。

刻意不做：云推荐、自动下载、GitHub push、跨论文综合。

退出标准：团队能用产品完整读 20 篇真实论文，无笔记丢失；Anchor 回跳和审阅闭环稳定。

### M2｜Balanced Discovery + Zotero/Git（Closed Alpha）

范围：

- TopicIntent；
- 多源元数据召回和 ID 对齐；
- Foundation/Frontier/Counterpoint/Bridge；
- 阅读包编辑和解释；
- OA Resolver；
- Zotero 创建/匹配/附件/child note；
- 本地 Git deterministic renderer/commit；
- 阅读前简报和结束收束；
- 推荐/笔记评测管线。

退出标准：20–50 名用户能从主题到 Verified Note，再到 Zotero/Git；推荐和反方达到内部质量门槛。

### M3｜Topic Knowledge + GitHub（Private Beta）

范围：

- Proposition 聚类与用户确认；
- 支持/反对/限定/不可比矩阵；
- 方法谱系和研究缺口；
- GitHub App、选择仓库、push/PR；
- 长期 Topic 更新提醒；
- 成本中心、模型路由；
- 工作区导出/恢复；
- 安全加固与自动更新。

退出标准：用户连续四周维护同一 Topic，并出现可测的 EKU 复用。

### M4｜Public Beta / v1

范围：

- macOS 稳定版；
- Windows 兼容；
- 自助 onboarding；
- 文档、隐私中心、崩溃恢复；
- 免费/Pro entitlement；
- Provider/API 降级；
- 可选账户与偏好同步；
- 支持渠道和安全响应。

不在 v1：多人实时协作、全自动系统综述、论文代写、机构代理全文、移动端完整编辑。

## 3. MVP 垂直切片

建议按可演示切片开发：

### Slice 1｜Local PDF → Anchor → User Note

用户导入 PDF，选择一段原文，创建 Anchor 和手工 Claim，重启后可回跳。

### Slice 2｜Anchor → AI Draft → Review

AI 基于选区生成原子 Claim，Schema 校验，用户接受/编辑/驳回，保留 provenance。

### Slice 3｜Paper → Zotero + Git

匹配/创建 Zotero，写 child note；渲染 Markdown，预览 diff，commit。

### Slice 4｜Topic → Reading Pack

输入主题，多源候选，生成 3/3/2＋桥梁，解释与替换。

### Slice 5｜Multi-paper → Proposition Matrix

两篇以上 Verified Claim，用户确认同义命题，查看支持/冲突/不可比。

每一 Slice 都含错误状态、日志、测试和基础可访问性，避免最后集中补齐。

## 4. 研发工作流拆分

### Workstream A｜Desktop Foundation

- Tauri shell；
- IPC contract；
- updater；
- keychain；
- workspace permissions；
- crash recovery。

### Workstream B｜Reader & Parsing

- PDF.js integration；
- text selection；
- Anchor；
- parser worker；
- figure/table/equation；
- OCR；
- version migration。

### Workstream C｜AI Notes

- prompt registry；
- provider adapters；
- model routing；
- Schema validator；
- Review Queue；
- claim relationships；
- evaluation harness。

### Workstream D｜Discovery

- metadata providers；
- entity resolution；
- citation graph；
- role scoring；
- diversity optimizer；
- explanations；
- feedback loop。

### Workstream E｜Integrations

- Zotero adapter；
- OA resolver/downloader；
- Git renderer；
- GitHub App；
- conflict UX；
- sync jobs。

### Workstream F｜Product Quality

- analytics/privacy；
- security；
- accessibility；
- docs/onboarding；
- support/diagnostics；
- release engineering。

## 5. 发布范围 MoSCoW

### Must

- 本地导入/打开 PDF；
- Zotero 本地读取与可靠匹配；
- PDF 阅读、Anchor、搜索；
- AI pre-read 和选区 Claim；
- Review Queue；
- Topic Pack 五角色中的前三类，桥梁可规则化；
- OA 合法获取/手工导入；
- Zotero 精简写回；
- 本地 Git Markdown；
- BYOK/PaperWeave 本机持久化；
- 离线阅读；
- 任务/错误/恢复；
- 工作区导出。

### Should

- 图表理解；
- Proposition Matrix；
- GitHub App push/PR；
- 长期 Topic 提醒；
- 本地向量检索；
- 版本 Anchor 迁移；
- Windows。

### Could

- Zotero 插件；
- Obsidian 深链/插件；
- 团队共享；
- 浏览器 Companion；
- 代码仓库关联与复现任务；
- 语音笔记；
- 移动只读端。

### Won't for v1

- 付费墙绕过；
- 自动执行任意论文代码；
- 实时协作；
- 自动代写论文；
- 全学科模板一次性覆盖；
- 产品云端保存所有 PDF。

## 6. Epic 级验收

### A｜Topic Pack

给定明确主题和至少一个可用元数据源：

- 返回 8–12 篇去重论文；
- 每篇只有一个主要角色，可有次级标签；
- 每个角色有解释和置信度；
- 替换单篇不改变已固定项；
- 找不到可靠反方时明确空缺；
- 用户角色纠正持久化；
- API 失败时显示来源级降级，不丢失已有候选。

### B｜PDF / Reader

- 已有 Zotero PDF 优先打开，不重复下载；
- 非 PDF/HTML 登录页不被当作 PDF；
- 文本选区可创建 Anchor；
- 重启/缩放/旋转后 Anchor 可回跳；
- 扫描件明确 OCR 状态；
- 解析失败仍可阅读；
- 同论文两个版本不静默覆盖。

### C｜AI Notes

- 所有事实性 Draft 至少一条 Anchor；
- AI 推断有明确标签；
- Schema 或证据校验失败不进入审阅队列；
- 接受/编辑/驳回有撤销和审计；
- 用户编辑后保留 AI 起草来源；
- 未 Verified Draft 不进入正式跨论文综合；
- 模型取消/失败不损坏本地笔记。

### D｜Zotero

- 探测未启动/只读/可写；
- 写入前授权；
- DOI/ID 匹配避免重复；
- 不覆盖用户 child notes；
- Attachment 写入失败可重试；
- PaperWeave 与 Zotero Item Key 关联可恢复；
- 用户解除连接后本地阅读不受影响。

### E｜Git

- 用户选择仓库和目录；
- renderer 输出稳定；
- 不修改 marker 外手写内容；
- 首次写入预览；
- commit 失败可重试；
- 默认不 push；
- 冲突停止并进入队列；
- PDF 默认不进入 Git。

### F｜Local-first / Privacy

- 无账户、断网、Zotero 关闭、模型不可用时仍可打开本地 PDF 与手工记笔记；
- 密钥不出现在数据库导出/日志/Git；
- 用户可查看模型数据范围；
- 云开关关闭后无业务数据请求，仅允许用户明确的模型/元数据动作；
- 工作区可导出恢复；
- 删除模型日志和本地缓存有效。

## 7. End-to-End 验收场景

### E2E-01 新主题

输入“LLM emergent abilities 是否真的是离散涌现”，生成阅读包，至少包含提出涌现观点的工作、后续发展和度量导致假象的反方；用户替换一篇反方，固定其他项。

### E2E-02 已有 Zotero

论文已在 Zotero 且有 PDF。PaperWeave 识别并直接打开，阅读后只新增带 marker 的 child note，不重复创建顶层条目。

### E2E-03 无开放 PDF

系统找到元数据但无合法 PDF；不得伪装下载成功。展示 DOI/来源并允许用户手工导入，之后继续解析与阅读。

### E2E-04 Claim 审阅

用户选择实验段落；AI 生成含数字的 Claim，绑定表格和正文。用户修正“相对提升”为“绝对提升”，系统保存编辑历史，跨论文综合使用修正版。

### E2E-05 Git 冲突

用户在外部编辑管理区块。PaperWeave 同步时检测 hash 不一致，展示 diff，不覆盖，允许重新导入、保留文件或重渲染。

### E2E-06 Provider 失败

模型限流发生在生成第 4 个 Draft；已生成并验证的 3 个保留，Job 可切换 Profile 重试，不重复计入或覆盖。

### E2E-07 Paper 版本升级

已有 arXiv v1 笔记，导入正式版。系统保留两个版本，迁移 Anchor 并将低置信度项进入复核。

## 8. 测试矩阵

### 平台

- macOS Apple Silicon/Intel（视最低支持）；
- Windows 11；
- 常见屏幕缩放和 13/14/16 英寸；
- 深色/浅色；
- 中英文 UI/论文混合。

### PDF corpus

- 单栏/双栏；
- arXiv/ACM/IEEE/Springer 常见版式；
- 可选文本/扫描；
- 大表格、跨页表、公式密集；
- 旋转页；
- 损坏/加密/超大；
- 预印本与正式版。

### Zotero

- 当前稳定版与最低支持版；
- 个人库/Group Library；
- 已有重复/已有附件/多附件；
- 未启动/授权撤销/版本冲突；
- 用户手写 child note。

### Git

- 空仓库/已有仓库；
- dirty working tree；
- detached HEAD；
- 分支保护；
- 无 remote/认证失败；
- CRLF/LF；
- symlink/submodule；
- merge conflict。

### 模型

- OpenAI-compatible 标准与非标准差异；
- JSON 不完整；
- 上下文超限；
- 限流/超时；
- 视觉不支持；
- 本地模型慢；
- 返回 prompt injection 内容。

## 9. Definition of Done

一个功能只有在下列全部满足时完成：

- 正常、空、加载、离线、失败、权限和冲突状态；
- 键盘与基本无障碍；
- 领域事件/必要本地诊断；
- 不含敏感遥测；
- 单元、集成和至少一个 E2E；
- 可恢复/幂等；
- 用户文档/错误文案；
- 安全与数据流评审；
- 性能没有超过预算；
- 对已有工作区 migration 测试。

## 10. 团队建议

最小高效核心团队：

- 1 产品/研究工作流负责人；
- 1 产品设计师；
- 2 桌面/前端工程师；
- 1 Rust/本地系统工程师；
- 1 后端/推荐工程师；
- 1 Applied AI/评测工程师；
- 兼职安全、法务、学术顾问和 QA。

若团队更小，优先合并角色，但不可省略 Anchor/评测和同步可靠性；宁可缩小推荐来源与视觉范围。
