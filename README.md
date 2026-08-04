# AI Reading Lab

一个面向 AI 算法工程师的长期论文阅读与知识综合仓库。这里保存可审阅、可演化的个人知识；论文元数据、附件和 PDF 由 Zotero 管理。

当前周期：[`2026-C01 · Agent & Post-Training`](cycles/2026-C01-agent-post-training/PLAN.md)
自动概览：[`DASHBOARD.md`](DASHBOARD.md)
长期目标：[`PROJECT_CHARTER.md`](PROJECT_CHARTER.md)

## 十分钟上手

1. 让 Codex 推荐或收集论文；实际推荐的论文会自动进入 Zotero `AI Reading Lab/00 Inbox`，并自动尝试保存 PDF。
2. 周结时决定下周论文；新热点先留在 `90 Frontier-Watch`，不在周中改主线。
3. 将进入阅读队列的论文固定 Better BibTeX citation key，并确认它已出现在 `references/library.bib`。
4. 创建笔记：`python3 scripts/lab.py new-paper <citekey>`，补齐 Zotero item key 后开始阅读。
5. 按模板用自己的话写中文摘要和英文 Summary；精读必须记录假设、证据、局限和连接。
6. 周日前填写当前周结，依次运行生成、校验和测试命令，再以 `read:` 或 `synth:` 前缀提交。

## 稳定命令

```bash
python3 scripts/lab.py new-paper ouyang_training_2022
python3 scripts/lab.py new-week 2
python3 scripts/lab.py build
python3 scripts/lab.py check
python3 -m unittest discover -s tests -v
```

`new-paper` 会生成带 `TODO` Zotero key 的草稿；在补成真实的 8 位 Zotero item key、且对应 citekey 已进入 BibTeX 前，`check` 会有意失败。

## 智能收集默认行为

本项目把 Codex 作为阅读流程的协调器。每当用户要求推荐、收藏或纳入阅读队列时，Codex 默认完成：

```text
检索与筛选 → Zotero 全库去重 → 收入 AI Reading Lab
            → 自动查找合法可用 PDF → 验证附件
            → Better BibTeX 自动导出 → 创建/更新笔记
            → build + check + test → 小粒度提交并推送
```

- “找到”指最终实际推荐给用户或用户明确选择的论文，不包含检索过程中被淘汰的候选。
- 新候选默认进入 `00 Inbox`；热点观察进入 `90 Frontier-Watch`；确定阅读后才进入主题集合和 Git 笔记。
- 优先使用 DOI、arXiv、OpenReview 或出版方官方页面保存；不从未知镜像下载，不绕过付费墙或验证码。
- PDF 获取失败不会阻塞元数据入库，但必须明确报告失败原因；Git 中始终看不到 PDF，因为文件只由 Zotero 管理。
- Better BibTeX 的“不导出的字段”设置包含 `file`，防止公开 BibTeX 泄露本机 Zotero 附件路径。

## 信息边界

| 内容 | 唯一事实来源 |
|---|---|
| 论文标题、作者、出版信息、PDF、附件 | Zotero |
| citation key 与 BibTeX 导出 | Better BibTeX → `references/library.bib` |
| 阅读状态、个人理解、概念连接 | 本仓库 Markdown |
| 当前阅读主线和周计划 | `cycles/` |
| 研究想法和选择性复现 | `ideas/`、`reproductions/`、GitHub Issues |

Zotero item key（例如 `PXW99EKT`）用于定位 Zotero 条目；BibTeX citation key（例如 `ouyang_training_2022`）用于笔记文件名和引用。二者不可混用。

## 工作节奏

每周投入 5–6 小时：筛选与回忆 30 分钟、首读 90 分钟、精读 120 分钟、脱稿总结 60 分钟、概念连接与周结 60 分钟。首周用于系统初始化，末周用于周期综合。

复现不是默认任务。只有当关键结论无法仅靠阅读判断时才建立 `reproduction` Issue，单周最多投入一小时。

## 仓库规则

- 本仓库为 public；笔记不得包含私人信息、公司内部资料、密钥、未授权全文或本机绝对路径。
- 任一时刻最多一篇论文处于 `reading`，精读队列最多三篇。
- 摘要必须自行复述，禁止复制论文 Abstract 充当笔记。
- 任何付费 API、主题切换或治理规则变更，都必须得到明确授权并记录决策。
- GitHub Actions 只校验，不写回仓库，也不调用 Zotero 或模型 API。
- 详细约束见 [`AGENTS.md`](AGENTS.md) 和 [`PROJECT_CHARTER.md`](PROJECT_CHARTER.md)。

## Zotero 首次配置

1. 启用 Zotero Local API 并确认 `http://127.0.0.1:23119` 可读。
2. 安装 Better BibTeX。
3. 创建 `AI Reading Lab` 及约定子集合。
4. 对顶层集合启用递归、Keep Updated 的 Better BibTeX 导出，目标为本仓库 `references/library.bib`。
5. 导入首周期论文后固定 citation key，并运行 `python3 scripts/lab.py check` 验证引用链路。
