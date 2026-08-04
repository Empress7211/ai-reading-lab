# 09｜指标、埋点与质量评测

## 1. 测量原则

PaperWeave 不能用“摘要生成量、对话轮次、停留时长”作为主要成功指标。真正价值是：用户形成了多少 **有证据、经过审阅、之后再次被使用的知识单元**。

隐私原则：

- 默认仅本地计算可行的产品指标；
- 云遥测 opt-in/清晰 opt-out；
- 不上传 PDF 文本、原始笔记、查询全文或模型密钥；
- 主题/标题等敏感字段默认散列或只上传类别；
- 用户可查看、导出、关闭和清除遥测。

## 2. 北极星指标

### Evidence-backed Knowledge Unit Reuse（EKU-R）

> 每周被用户验证，并在 28 天内至少一次用于检索命中、跨论文综合、导出、链接、任务或再次审阅的独立知识单元数。

一个 EKU 满足：

- 类型为 Verified Claim、用户判断、Verified Method/Limitation；
- 事实性对象至少一个有效 Anchor；
- 有唯一 ID；
- 后续使用事件可归因；
- 同一对象一周内多次使用只计一个 active EKU，可另计使用次数。

北极星避免鼓励 AI 制造更多草稿，强调审阅和长期价值。

## 3. 指标树

### 3.1 Acquisition / Activation

- 安装 → 创建工作区；
- 连接 Zotero 成功率；
- 配置至少一个模型 Profile 成功率；
- 首次输入主题 → 生成阅读包；
- 首次生成阅读包 → 打开论文；
- 首次打开论文 → 创建/接受首个 EKU；
- Time to First Verified Evidence（TFVE）。

建议 Activation 定义：7 天内生成主题包、打开至少一篇全文、验证至少 3 个有 Anchor 的知识单元并完成一次本地导出/同步。

### 3.2 Discovery

- Topic Pack generation success；
- pack → paper open rate；
- role-level selection rate；
- 单篇替换率；
- 角色纠正率；
- “不相关/角色错误/过时/重复”反馈；
- Counterpoint coverage；
- 推荐解释展开率；
- 阅读包保存/追踪率。

### 3.3 Reading

- 论文可获取率，按来源与合法 OA/本地导入拆分；
- reader 首屏成功率；
- Anchor 创建成功率；
- Anchor 回跳成功率；
- 关键章节访问；
- pre-read 导引使用；
- reading session completion；
- 恢复阅读成功率。

“活跃秒数”只用于性能/交互诊断，不用于评价研究效率。

### 3.4 AI Notes

- draft 数；
- 接受/编辑/驳回率；
- time-to-review；
- 用户编辑距离；
- 无 Anchor 拦截率；
- Schema validation failure；
- citation mismatch；
- stale/orphaned rate；
- 用户主动创建笔记占比；
- 每篇 Verified Claim 数分布。

不能简单把高接受率视为好：过于保守、只提取显而易见句子也会提高接受率。因此必须与覆盖、编辑距离和人工质量集联合看。

### 3.5 Synthesis / Retention

- 至少两篇 Verified 后进入 Topic Knowledge 的比例；
- 命题合并确认率；
- 综合块接受/编辑/驳回；
- Proposition Matrix 使用；
- 从综合创建新 Topic/任务；
- EKU 7/28/90 天复用；
- W1/W4/W12 retained researchers；
- 每周回到同一长期 Topic 的用户比例。

### 3.6 Sync / Reliability

- Zotero probe/auth/write success；
- Git render/commit/push success；
- 外部写入 P50/P95；
- 冲突率和平均解决时间；
- Job retry/recovery；
- 数据恢复演练成功；
- crash-free sessions；
- 无数据丢失事件。

### 3.7 Cost

- 每个 Topic Pack 元数据/API 成本；
- 每篇读完论文模型成本；
- 每个 Verified EKU 模型成本；
- 缓存命中率；
- 任务模型分配；
- 用户预算触发和取消率。

## 4. 推荐系统离线评测

### 4.1 数据集

建立按主题分层的 Gold Set：

- CS/ML 首版至少 30 个主题；
- 每主题由 2–3 名有领域能力的标注者；
- 标注相关性、角色、阅读优先级、反方类型、不可比原因；
- 包含热门主题、冷门主题、新兴主题和有争议主题；
- 保存标注分歧，不强制虚假一致。

### 4.2 指标

#### 相关性

- Recall@CandidatePool；
- nDCG@K；
- Precision@K；
- seed coverage。

#### 角色

- macro F1；
- role confusion matrix；
- role confidence calibration；
- Foundation 原始贡献误判率；
- Counterpoint false positive rate。

#### 阅读包整体

- role quota fulfillment；
- subtopic coverage；
- author/venue/cluster diversity；
- temporal balance；
- redundancy；
- prerequisite violations；
- OA coverage；
- explanation faithfulness。

### 4.3 专项：反方质量

人工把 Counterpoint 分为：

1. direct contradiction；
2. failed/weak replication；
3. methodological critique；
4. boundary condition；
5. alternative explanation；
6. negative result；
7. incomparable but superficially different；
8. not a counterpoint。

发布门槛应优先压低第 8 类，而不是强行提高反方召回。

## 5. AI 笔记离线评测

### 5.1 评测单元

不是评整篇“总结好不好”，而是评每个 Claim/字段：

- atomicity；
- entailment；
- Anchor precision；
- Anchor completeness；
- claim type；
- epistemic source；
- scope/limitation coverage；
- numerical accuracy；
- uncertainty calibration；
- no unsupported synthesis。

### 5.2 Grounding 指标

- **Anchor Validity**：Anchor 可打开且文本/区域存在；
- **Quote Fidelity**：短引文与原文一致；
- **Entailment**：Claim 是否由绑定证据支持；
- **Evidence Sufficiency**：证据是否足以支持完整 Claim；
- **Scope Preservation**：数据集、设置、条件和统计限定是否保留；
- **Attribution Accuracy**：作者主张、实验结果、AI 推断是否正确区分。

### 5.3 算法论文专项

- baseline 名称与版本；
- dataset split；
- metric direction；
- 绝对值/相对提升；
- best vs average；
- statistical uncertainty；
- compute/hardware；
- ablation conclusion；
- code/data availability；
- limitation 是否来自作者或 AI 推断。

任何数字、公式和 SOTA 声明应进入高风险评测集。

### 5.4 人类评审

采用双层：

- 研究助理做证据与字段准确性；
- 领域专家做主张含义、可比性和重要性。

盲测比较：

- PaperWeave Evidence Ledger；
- 普通全文摘要；
- 用户手工笔记；
- 竞品输出（在许可允许的前提下）。

任务指标：完成特定判断的准确率、耗时、回查次数和信心校准，而不仅是主观喜好。

## 6. 在线质量信号

在线信号只能作为弱监督：

- 用户接受：正向但可能是懒惰；
- 用户编辑：内容有价值但需要修正；
- 用户驳回并给原因：高价值负样本；
- 用户点击 Anchor 后接受：较可信；
- 后续引用/复用：强正向；
- 长期未处理：不可简单算负向；
- 用户角色修正：推荐标签训练信号。

所有学习默认在本地或使用去标识、明确许可的数据。不得把私有论文正文和笔记隐式用于训练公共模型。

## 7. 事件规范

事件命名：`domain.object.action`，例如：

```text
discovery.topic_submitted
discovery.pack_generated
discovery.item_role_corrected
reader.paper_opened
reader.anchor_created
notes.draft_generated
notes.draft_accepted
notes.draft_edited
notes.draft_rejected
knowledge.proposition_confirmed
sync.preview_opened
sync.job_succeeded
```

通用字段：

- app/version/platform；
- workspace anonymous ID；
- session ID；
- event timestamp；
- feature flag；
- duration bucket；
- error code；
- privacy tier。

禁止字段：API Key、PDF 文本、Anchor 引文、用户笔记正文、完整查询、完整论文标题（默认）。

## 8. 产品实验框架

### 8.1 可实验项

- 阅读包默认配比；
- 路径视图 vs 角色列；
- pre-read 导引长度；
- AI 建议触发方式；
- Claim 卡信息密度；
- 审阅快捷操作；
- 完成阅读收束流程；
- 推荐解释层级。

### 8.2 不应只做 A/B 的高风险项

- 是否显示来源；
- 是否允许无 Anchor Claim；
- 是否自动把 Draft 写入 Verified；
- 是否默认上传 PDF；
- 是否绕过用户确认写外部系统。

这些属于信任与安全底线，不应因短期转化指标降低。

### 8.3 Guardrails

每个实验至少监控：

- Anchor validity；
- draft rejection；
- 错误/崩溃；
- 外部写入误操作；
- 成本；
- 关闭功能/退出率；
- 用户报告的错误引用。

## 9. MVP 发布质量门槛

建议最低门槛：

- Gold Set 主题包 Top-10 相关性经专家评审达到可用阈值；
- Counterpoint “非反方”误报 < 10%（在内部目标集上）；
- 事实性 Draft 的 Anchor 可定位率 ≥ 98%；
- 高风险数字 Claim 的证据一致率 ≥ 95%；
- 用户接受/编辑后的对象不因重启或失败同步丢失；
- Zotero/Git 测试矩阵的核心链路成功率 ≥ 99%；
- 模型不可用、Zotero 未运行、Git 冲突时仍可继续本地阅读；
- 所有云遥测与上传均有可测试的关闭路径。

这些是首轮工程目标，必须通过真实标注和 Beta 数据重新标定。

## 10. 研究计划

### Phase 0｜问题验证

访谈 12–20 名 CS/ML 用户，观察真实阅读，不只问偏好。采集：

- 如何找基石/争议；
- 阅读时如何记证据；
- Zotero/Git 的真实用法；
- 对 AI 草稿的审阅成本；
- 何时愿意付费。

### Phase 1｜可用性测试

用交互原型完成 5 个任务：创建主题包、替换反方、打开论文、审阅 Claim、预览同步。重点记录误解和信息负担。

### Phase 2｜技术 Alpha

20–50 位技术用户，本地日志＋周访谈；验证稳定性、Anchor 和工具链。

### Phase 3｜Closed Beta

200–500 位用户，验证 W4 留存、EKU 复用、成本与推荐冷启动。
