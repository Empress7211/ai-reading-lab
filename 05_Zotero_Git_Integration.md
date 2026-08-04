# 05｜Zotero、Git/GitHub 与 PDF 链路

## 1. 战略判断

### 为什么保留 Zotero

Zotero 已经承担了研究者最稳定、最难迁移的能力：书目元数据、附件、Collection、标签、引文格式和写作软件集成。PaperWeave 不应重造完整文献管理器，而应把 Zotero 当作 **Bibliographic Source of Truth**。

### 为什么使用 Git，而不是只做 GitHub

GitHub 是用户当前拥有的远端服务，但笔记层应基于开放 Git 仓库：

- 本地即可工作；
- 可连接 GitHub、GitLab、自建 Gitea 或只保留本地；
- Markdown/JSON 可版本化、可 diff、可迁移；
- 对研究代码团队自然。

GitHub 是首个集成，不是产品数据格式。

### 权威来源划分

| 数据 | 权威来源 |
|---|---|
| 书目信息、附件、Collection | Zotero |
| PDF 页级批注与证据锚点 | PaperWeave 本地数据库；可镜像到 PDF/Zotero |
| 结构化 Claim、审阅状态、模型 provenance | PaperWeave SQLite |
| 长期可读笔记与版本历史 | Git Markdown/JSON |
| 精简阅读结论与反向链接 | Zotero child note |

## 2. Zotero 接入方案

### 2.1 首选：Local API

Zotero 桌面客户端在 `localhost:23119/api/` 暴露本地 API。当前文档说明：读取无需网络且无速率限制；Zotero 10+ 支持经用户确认后的本地写入、文件上传和全文写入。产品应在启动时探测版本、Server ID 与能力，而不是写死版本假设。

能力探测：

1. `GET /api/`；
2. 读取 `Zotero-API-Version`、`Zotero-Server-ID`、`Zotero-Schema-Version`；
3. 检查写能力；
4. 需要写入时调用本地授权流程；
5. 将授权 key 保存到系统钥匙串；
6. 遇到 401/412/428 时按规范重新授权或清缓存。

安全要求：

- 绝不将本地端口暴露到网络；
- 不直接读写 Zotero SQLite；
- 本地 API 读取虽然无需认证，但 PaperWeave 自身要限制其他页面/插件访问其数据；
- 写入前显示具体动作与目标 Library。

官方资料：

- https://www.zotero.org/support/dev/web_api/v3/local_api
- https://www.zotero.org/support/dev/web_api/v3/

### 2.2 兼容回退

| 环境 | 回退方式 |
|---|---|
| Zotero 未启动 | 任务排队；允许继续阅读和本地笔记 |
| Local API 仅可读 | 使用 Zotero Web API 写入，或导出 RIS/BibTeX＋附件等待用户导入 |
| 用户不愿连接账号 | 仅本地文件和 Git；显示“未同步 Zotero” |
| 大量高级 UI 需求 | 后续可提供 Zotero 插件，但非 MVP 前置 |
| 企业禁用本地 API | Web API/机构策略适配 |

Zotero 插件具有本地高权限，只有在需要 Zotero 内嵌面板、选择事件或更细 UI 联动时再开发。安装插件前应明确风险和开源审计。

## 3. Zotero 数据映射

### 顶层 Item

- itemType；
- title；
- creators；
- abstractNote；
- publicationTitle/conferenceName；
- date；
- DOI；
- URL；
- extra（可放外部 ID，但避免破坏用户现有字段）；
- tags；
- collections。

### PDF Attachment

保存：

- 文件名：`<citekey> - <short-title>.pdf`；
- source URL；
- accessDate；
- license/version；
- local hash；
- attachment relation。

### PaperWeave Child Note

仅保存精简内容：

- 阅读状态；
- 主题角色；
- 3–5 条已验证结论；
- 主要局限；
- PaperWeave deep link；
- Git note link（如有）；
- 最后同步时间与 marker。

示意：

```html
<div data-paperweave-note="v1" data-paper-id="uuid">
  <h2>PaperWeave Verified Note</h2>
  <p>Status: verified · Topic: emergent-abilities · Role: counterpoint</p>
  <ul>...</ul>
  <p><a href="paperweave://paper/uuid">Open full evidence ledger</a></p>
</div>
```

不覆盖不带 marker 的用户笔记。

## 4. PDF 获取与入库流程

### 4.1 去重

1. 在本地 PaperWeave 查 DOI/arXiv/PMID；
2. 在 Zotero Local API 查同 ID；
3. 若无 ID，按标题+作者+年份模糊匹配；
4. 发现多个候选时要求用户确认；
5. 预印本与正式版建立版本关系，不静默替换用户附件。

### 4.2 OA Resolver

顺序：

1. Zotero 本地附件；
2. 用户手工文件；
3. arXiv/PMC 等明确仓储；
4. Unpaywall `best_oa_location`；
5. OpenAlex `best_open_version`；
6. Semantic Scholar `openAccessPdf`；
7. Crossref full-text link 与 license；
8. 出版者页面。

Resolver 输出：

```json
{
  "url": "...",
  "host_type": "repository",
  "version": "acceptedVersion",
  "license": "cc-by",
  "is_direct_pdf": true,
  "source_provider": "unpaywall",
  "confidence": 0.92
}
```

### 4.3 下载验证

- 允许的协议与域名策略；
- 跟随有限次数重定向；
- 校验 Content-Type、magic bytes、文件大小；
- 计算 SHA-256；
- 防止压缩炸弹和超大文件；
- 临时目录下载完成后原子移动；
- 保存来源和 license；
- 失败时不反复轰炸远端。

### 4.4 写入 Zotero

1. 创建或更新顶层条目；
2. 创建 stored-file attachment；
3. 通过 Zotero 本地文件上传流程写入；
4. 添加 Collection/标签；
5. 读取返回版本；
6. 等待 Zotero 自身同步；
7. PaperWeave 使用 Zotero item key 作为外部引用，不替代内部 UUID。

### 4.5 在 PaperWeave 阅读

优先直接读取 Zotero 附件对应本地文件，避免复制。若安全模型或平台限制要求复制，应建立只读缓存并记录与 Zotero 源附件的 hash 关系。

## 5. Git 笔记格式

### 5.1 目录

```text
research-notes/
├── papers/
│   └── vaswani2017attention/
│       ├── index.md
│       └── claims.json
├── topics/
│   └── transformer-architecture/
│       ├── index.md
│       └── reading-pack.json
├── assets/
│   └── user-generated/       # 可选，默认不导出论文原图
└── .paperweave/
    ├── config.json
    └── schema-version
```

### 5.2 Markdown frontmatter

```yaml
---
paperweave_schema: 1
paper_id: 9a0c...
citekey: vaswani2017attention
title: Attention Is All You Need
doi: null
arxiv: "1706.03762"
zotero_item_key: ABCD1234
pdf_sha256: "..."
reading_status: verified
roles:
  - topic: transformer-architecture
    role: foundation
verified_at: 2026-08-04T10:00:00+08:00
last_synced_at: 2026-08-04T10:05:00+08:00
---
```

### 5.3 正文结构

```markdown
# Title

## Why this paper
<!-- paperweave:managed:start why -->
...
<!-- paperweave:managed:end why -->

## Verified claims
<!-- paperweave:managed:start claims -->
...
<!-- paperweave:managed:end claims -->

## Method card
...

## Limitations and counter-evidence
...

## My Notes
<!-- paperweave:user:start -->
用户可自由编辑；产品回读此区块。
<!-- paperweave:user:end -->

## Research actions
...
```

Managed 区块由产品生成；用户区块由用户控制。产品不得因重渲染改变用户区块。

## 6. Git 同步策略

### 6.1 稳定渲染

- 字段顺序固定；
- 列表排序有明确规则；
- 时间戳只在内容变化时更新；
- 不输出随机 ID 以外的波动；
- 每行合理换行，避免一处变更导致整段 diff；
- JSON 使用 canonical formatting。

### 6.2 分支与提交

默认：

- branch：`paperweave/<topic-or-date>`；
- commit：`notes(paper): verify <citekey>`、`notes(topic): update <topic>`；
- 不自动 push，或由用户开启自动 push；
- 不直接写 main；
- GitHub 连接后可创建 Draft PR；
- 所有 Git 命令显示目标仓库和分支。

### 6.3 回读

MVP 回读范围：

- `My Notes`；
- 用户标签；
- 用户定义的 summary override；
- 明确允许的 frontmatter 字段。

`claims.json` 外部修改进入 Import Review，不直接覆写本地 Verified Claims。

### 6.4 冲突

- 读取 base/local/remote 三方版本；
- managed 区块以 PaperWeave 为主，但若远端有编辑则生成 conflict block；
- user 区块优先进行三方 merge；
- 无法合并时创建 `.conflict.md`，不强制提交；
- UI 展示 diff、来源和时间。

## 7. GitHub 集成

推荐 GitHub App 而非宽权限 OAuth App/PAT：

- 用户选择具体仓库；
- 只请求 Contents read/write；
- 如需 PR，再请求 Pull requests read/write；
- 短期 token；
- 默认不请求 Issues、Actions、Administration；
- 对组织仓库尊重 SSO 和管理员策略。

GitHub 官方建议 GitHub Apps 使用细粒度权限、可限制仓库并采用短期 token。写文件可使用 Contents API，但连续更新应串行处理，或直接通过本地 Git 生成 commit 后 push。

官方资料：

- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- https://docs.github.com/en/rest/repos/contents

### 本地 Git 优先于 Contents API

桌面应用首选调用本地 Git：

- 用户能看到完整 diff；
- 支持分支、merge、签名和现有 hook；
- 不受逐文件 API 的并发限制；
- 离线可提交。

GitHub API 主要用于安装授权、仓库选择、创建 PR 和状态展示。

## 8. 为什么暂不把 Obsidian 设为核心依赖

Obsidian 很适合作为 Markdown 查看与扩展工具，但产品不应要求用户额外安装。只要 PaperWeave 输出标准 Markdown、稳定 Wiki/Markdown 链接和 frontmatter，Obsidian、VS Code、Typora 等都能消费。

后续可提供：

- Obsidian URI deep link；
- Vault 模板；
- Dataview 字段；
- 双向同步适配器。

Zotero Better Notes 已能进行 Markdown 双向同步和多格式导出，可作为用户现有工作流的参考或兼容对象，但 PaperWeave 的结构化 Claim、证据锚点与审阅历史仍需自己的 schema。

参考：

- https://github.com/windingwind/zotero-better-notes

## 9. 同步状态与 UI

每个 Paper 显示三类状态：

- Local：saved / dirty / parsing / error；
- Zotero：not-linked / linked / pending / synced / conflict；
- Git：untracked / modified / committed / pushed / PR-open / conflict。

同步中心必须支持：重试、查看日志、撤销最近写入（可行时）、打开目标文件/条目/PR。

## 10. 验收用例

1. Zotero 已有条目和 PDF：PaperWeave 不创建重复项；
2. 只有条目无 PDF：找到 OA 文件后附加到原条目；
3. 有预印本和正式版：用户可选择保留两者，且建立版本关系；
4. Zotero 关闭：阅读完成后写入任务不会丢失；
5. Git 仓库 dirty：不覆盖未提交更改，提示并创建独立分支；
6. 用户编辑 `My Notes`：下一次导出保留修改；
7. 用户编辑 managed 区块：产品展示冲突，不静默覆盖；
8. PDF 非 OA：产品不下载，清晰给出合法获取/导入路径；
9. API key/授权 token 不出现在日志、Markdown、崩溃报告或 Git history；
10. 删除 PaperWeave 后，Zotero 条目、PDF 和 Git Markdown 仍可独立使用。
