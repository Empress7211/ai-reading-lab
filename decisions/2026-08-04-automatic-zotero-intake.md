# 2026-08-04 · Automatic Zotero Intake

## 背景

本项目的常见使用方式是让 Codex 根据研究问题推荐论文，随后进入阅读、笔记、校验和 GitHub 推送。仅导入 BibTeX 元数据会留下没有 PDF 的 Zotero 条目，并增加手工补附件的负担。

## 决定

- 用户授权本项目对最终实际推荐或明确选择的论文自动写入 Zotero，无需逐篇重复确认。
- 自动收集必须先全库去重，再保存元数据，并自动尝试获取合法可访问的 PDF。
- 已有条目优先复用；缺少 PDF 时使用 Zotero 的“查找全文”。
- 新候选默认进入 `AI Reading Lab/00 Inbox`，搜索过程中被淘汰的候选不入库。
- 每次收集后通过 Zotero children 接口验证 PDF 附件；失败时保留元数据并报告原因。
- Better BibTeX 全局忽略 `file` 字段，避免自动导出泄露本机附件绝对路径。
- 进入正式阅读队列后，等待 Better BibTeX 自动导出，再创建对应 Git 笔记。
- 产生 Git 变更后默认完成 build、check、test、小粒度提交和 `main` 推送。

## 备选方案

- 继续只导入 BibTeX，由用户手动补 PDF。
- 直接把 PDF 下载到 Git 仓库。
- 接入第三方付费文献 API。

## 后果

收集到阅读的链路更自动化，但仍受开放获取状态、出版方访问控制、验证码和 Zotero 可用性的约束。PDF 始终由 Zotero 管理，不进入 Git；当前也不新增付费 API。
