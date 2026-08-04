# AI Reading Lab

一个面向 AI 算法工程师的长期论文阅读与知识综合仓库。这里保存可审阅、可演化的个人知识；论文元数据、附件和 PDF 由 Zotero 管理。

当前周期：[`2026-C01 · Agent & Post-Training`](cycles/2026-C01-agent-post-training/PLAN.md)
自动概览：[`DASHBOARD.md`](DASHBOARD.md)
长期目标：[`PROJECT_CHARTER.md`](PROJECT_CHARTER.md)

## 十分钟上手

1. 在 Zotero 的 `AI Reading Lab/00 Inbox` 收集候选论文，不把 PDF 放进仓库。
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
