# AGENTS.md

本文件约束所有在该仓库工作的 Codex/Agent。

## 开始工作前

1. 阅读 `PROJECT_CHARTER.md`。
2. 读取 `config/project.yaml`，确认唯一的 `active_cycle`。
3. 阅读该周期的 `PLAN.md` 和最近一份周结。
4. 运行 `git status --short --branch`，保护用户已有改动。

## 允许的辅助

- 解释公式和相关概念，但标明推导依据和不确定之处。
- 质疑实验设计、基线、指标、因果解释和外推范围。
- 帮助用户把已有理解整理为清晰的原创笔记。
- 生成模板、索引、校验器和机械性元数据。
- 在用户明确要求时进行选择性复现。

## Zotero 自动收集

用户已授权本项目对实际推荐或明确选择的论文执行项目范围内的自动收集，无需逐篇再次确认：

1. 先按 DOI、arXiv ID、OpenReview ID 和规范化标题搜索整个 Zotero 文库，复用已有条目，禁止盲目重复导入。
2. 新论文先加入 `AI Reading Lab/00 Inbox`；已确定主题的论文可直接加入对应子集合。
3. 优先从论文的官方页面、DOI、arXiv 或 OpenReview 使用 Zotero Connector / Add by Identifier 保存元数据，并自动保存可合法访问的 PDF。
4. 若条目已存在但没有 PDF，执行 Zotero 的“查找全文 / Find Available PDF”。
5. 保存后必须读取条目 children，确认存在 `application/pdf` 附件；若因付费墙、验证码或来源失效无法获取，只保留元数据并明确报告，不绕过访问控制。
6. 仅对最终呈现给用户的推荐或用户明确要求收藏的论文执行收集；搜索时被淘汰的候选不写入 Zotero。
7. PDF、附件路径和 Zotero 数据库始终不得进入 Git。
8. Better BibTeX 必须忽略 `file` 字段；若自动导出出现本机绝对路径，先修正导出设置，不得手工修改生成文件掩盖问题。

## 禁止事项

- 不得擅自宣称用户已经阅读或理解某篇论文。
- 不得批量生成论文摘要并将状态设为 `read` 或 `synthesized`。
- 不得复制论文 Abstract 作为中文摘要或 English Summary。
- 不得向仓库加入 PDF、Zotero 数据库、附件、密钥或大文件。
- 不得擅自改变活跃周期、核心问题、阅读配比或成功标准。
- 不得新增付费 API、创建 API key 或在 CI 中调用模型。
- 不得为了通过检查而删除用户内容或弱化校验规则。

## 编辑规则

- 论文笔记文件名必须等于 `<citekey>.md`，并同时记录真实 Zotero item key 和 citekey。
- `scan` 只要求快速判断；`normal` 必须覆盖方法、证据、局限和连接；`deep` 必须完成完整模板。
- 自动生成的 `DASHBOARD.md` 和 `notes/INDEX.md` 只能由 `python3 scripts/lab.py build` 更新。
- 修改治理规则时新增 `decisions/YYYY-MM-DD-<slug>.md`，记录背景、决定、替代方案和后果。
- 提交前运行 `python3 scripts/lab.py build`、`python3 scripts/lab.py check` 和 `python3 -m unittest discover -s tests -v`。
- 提交前缀只使用 `read:`、`synth:`、`meta:`、`repro:`。
- 项目范围内产生受跟踪文件变更时，完成校验后默认创建小粒度提交并推送 `main`；若用户要求仅审阅、存在无关脏改动或校验失败，则不得自动推送。
- 仓库为 public；写入笔记前检查私人信息、公司内部内容、密钥、未授权全文和本机绝对路径。

## 输出标准

- 区分 `[作者结论]`、`[我的推断]` 和 `[待验证]`。
- 引用关键结论时标出章节、图、表或页码。
- 无法验证的信息明确标注，不以措辞确定性代替证据。
- 若复现超出单周一小时预算，先创建 Issue 并由用户决定是否扩大范围。
