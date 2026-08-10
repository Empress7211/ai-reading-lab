# PaperWeave（论织）产品交付包 v0.1

> 版本日期：2026-08-04  
> 状态：产品定义与交互验证版（可进入技术评审、视觉设计和 MVP 拆解）  
> 工作名称：PaperWeave / 论织（未进行商标与域名核验，不作为最终品牌名）

## 1. 产品一句话

PaperWeave 是一个 **Local-first、证据可追溯、面向深度论文阅读的研究工作台**：它为一个主题生成兼顾“基石—当前发展—反方视角”的阅读路径，在阅读过程中把 AI 输出约束为可审阅、可定位到原文、可跨论文复用的研究笔记，并与本地 Zotero 和 Git 仓库联动。

## 2. 本交付包包含什么

| 文件 | 用途 |
|---|---|
| `01_Product_Strategy.md` | 产品定位、目标用户、核心价值、边界与商业假设 |
| `02_PRD.md` | 完整产品需求、用户故事、功能规格与验收口径 |
| `03_AI_Notes_System.md` | 核心差异化：AI 笔记、证据账本、审阅与跨论文综合 |
| `04_Recommendation_Engine.md` | “基石 / 前沿 / 反方”论文推荐与解释算法 |
| `05_Zotero_Git_Integration.md` | Zotero、Git/GitHub、PDF 获取与同步策略 |
| `06_Technical_Architecture.md` | 桌面端、本地核心、云元数据服务、模型适配层架构 |
| `07_Data_Model_and_API.md` | 领域模型、状态机、内部 API 和文件结构 |
| `08_UX_IA_and_Flows.md` | 信息架构、关键页面、阅读器交互、快捷键与无障碍 |
| `09_Analytics_and_Evaluation.md` | 北极星指标、埋点、推荐/笔记质量评测与实验框架 |
| `10_Security_Legal_and_Risk.md` | 隐私、安全、版权、提示注入和风险清单 |
| `11_Roadmap_and_Acceptance.md` | MVP 范围、发布门槛、后续阶段与开发拆分 |
| `12_Competitive_Landscape.md` | 当前产品格局、可借鉴能力和差异化楔子 |
| `13_Decisions_and_Open_Questions.md` | 已做决策、假设和下一轮需要验证的问题 |
| `schemas/` | AI 输出与本地持久化的 JSON Schema |
| `prompts/` | 可直接用于模型适配层的提示词契约 |
| `diagrams/` | Mermaid 架构图、用户流和笔记生命周期 |
| `prototype/index.html` | 单文件交互原型，覆盖发现、主题包、阅读器、AI 笔记和同步 |
| `prototype/QA_REPORT.json` | 桌面端与移动端浏览器级回归结果 |
| `prototype/screenshots/` | 发现页、阅读器、证据审阅、同步预览与移动端截图 |
| `MANIFEST.json` | 文件清单、体积与 SHA-256 校验值 |

## 3. 推荐的产品形态

首版建议为 **Tauri 桌面应用（macOS 优先，Windows/Linux 随架构兼容）＋轻量云端元数据服务**：

- PDF、批注、完整笔记、模型密钥默认留在本机；
- 桌面端直接访问本地 Zotero、文件系统与 Git；
- 云端仅承担论文元数据聚合、引用图缓存、主题包候选召回和可选账户同步；
- 用户自行配置 LLM API，也可选择本地模型；
- 后续再提供 Web 协作端与移动阅读端。

## 4. MVP 的核心闭环

1. 用户输入一个主题或选择系统推荐主题。
2. 系统生成一个有解释的平衡阅读包：基石、当前发展、反方视角，必要时补充综述/桥梁论文。
3. 用户选择论文；系统优先解析开放获取来源，合法获取 PDF，并写入本地 Zotero。
4. 用户在三栏阅读器中阅读、划线、提问；AI 逐步生成带页码和坐标锚点的笔记草稿。
5. 用户对 AI 笔记逐条“接受 / 编辑 / 驳回”；只有通过审阅的内容进入正式知识库。
6. 结构化笔记写入本地数据库，并导出为 Markdown 到 Git 仓库；Zotero 保存条目、附件、精简笔记与反向链接。
7. 多篇论文阅读后，系统生成观点分歧矩阵、方法演化和下一步阅读建议。

## 5. 原型使用方法

直接双击 `prototype/index.html` 即可使用。为避免某些浏览器对本地脚本的限制，也可以在本目录运行：

```bash
python3 -m http.server 8000
```

然后在浏览器中打开 `http://localhost:8000/prototype/`。

原型使用演示数据，不会请求网络、读取 Zotero、调用模型或修改 Git 仓库。

## 6. 当前 React / Tauri 垂直切片

仓库根目录现包含可运行的 React/Vite/TypeScript + Tauri/Rust/SQLite 本地实现：

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri dev
pnpm run release:build:macos
pnpm run release:verify:macos
```

- 浏览器使用 IndexedDB 保存 PDF、Evidence Anchor、DraftProposal、ReviewAction、VerifiedClaim 与用户笔记；Tauri 使用本机内容寻址 PDF vault 和 SQLite JSON 实体仓库。
- Reader 会列出已保存 Anchor，在刷新或重启后重绘可见区域，并可点击回到对应 PDF 页；孤立、损坏、PDF 指纹不匹配、PDF 缺失和页码失效都会保留记录并显示明确恢复提示。
- 本地审阅界面保存并恢复 `DraftProposal → ReviewAction → VerifiedClaim`。所有接受、编辑与驳回均先经过纯函数 `reviewDraftProposal`；Rejected 不产生 VerifiedClaim，Edited 保留原始 Draft，用户笔记独立存储。
- 当前三条本地审阅内容是明确标记的固定 fixture，只用于验证状态机与持久化；没有接入真实 LLM、BYOK/Keychain、Docling/OCR、Zotero、Git 或 GitHub 写入执行器。
- 同步功能仍是 preview-only：不会执行 Zotero、Git 或 GitHub 写入。
- 本地打包可生成 macOS `.app` 与 DMG；当前没有 Developer ID 签名或公证流程，`--no-sign` 产物只用于本机验收与开发交付。
- `MANIFEST.json` 是原始交付包的历史基线，开发实现加入后不再与当前工作树逐项匹配。

### macOS 发布验证

`release:verify:macos` 会挂载 DMG，并检查版本、bundle identifier、最低系统版本、`.icns`、`PaperWeave.app` 与 `/Applications` 链接、镜像校验，以及 `codesign` / Gatekeeper 的真实结果。默认模式针对本地 `--no-sign` RC，只有在 app 和 DMG **未被 Gatekeeper 接受**、且没有 Developer ID TeamIdentifier 时才通过；这不表示产物已签名或公证。

拿到 Developer ID Application 证书和 App Store Connect API 凭据后，在本机 Keychain 安装证书，通过环境变量提供 Tauri 所需的凭据，再执行不带 `--no-sign` 的构建：

```bash
export APPLE_SIGNING_IDENTITY='Developer ID Application: <name> (<team-id>)'
export APPLE_API_ISSUER='<issuer-id>'
export APPLE_API_KEY='<key-id>'
export APPLE_API_KEY_PATH='/absolute/path/to/AuthKey_<key-id>.p8'

pnpm tauri build --bundles app,dmg
PAPERWEAVE_REQUIRE_SIGNED=1 pnpm run release:verify:macos
```

占位值必须在本地或 CI secret 中替换，不得提交证书、私钥或凭据。signed 模式要求 Developer ID 签名、Gatekeeper 接受，以及 app/DMG 的公证票据验证全部通过；具体凭据格式见 [Tauri macOS signing 文档](https://v2.tauri.app/distribute/sign/macos/)。

## 7. 验证状态

原型已完成静态解析、JavaScript 语法、JSON Schema 与浏览器交互回归：

- Chromium 桌面视口：`1440 × 1000`；
- 移动视口：`390 × 844`；
- 已覆盖发现页角色数量、三栏阅读器、Claim 接受流程、同步预览、主导航、命令面板、横向溢出与运行时错误；
- 详细结果见 `prototype/QA_REPORT.json`，参考画面见 `prototype/screenshots/`。

除原型回归外，React/Tauri 切片已覆盖本地 PDF 导入、Anchor 创建/恢复/回跳、三种审阅动作持久化、用户笔记恢复、无效 PDF 失败路径，以及桌面和移动端无横向溢出与无 console warning/error。真实 macOS `.app` 还完成了完全退出并重启后的 SQLite/PDF vault 恢复，以及 PDF 缺失、PDF 损坏、Anchor 损坏/孤立和页码失效回归；这些失败均保留已有元数据与审阅记录，并显示明确状态。

## 8. 当前明确不做

- 不绕过付费墙、登录或机构访问控制；
- 不把“一键生成整篇总结”作为核心体验；
- 不在 MVP 中做多人实时协作、论文写作代笔或投稿管理；
- 不默认把 PDF 上传到 PaperWeave 云端；
- 不将 GitHub 设为唯一笔记后端：底层抽象为本地 Git 仓库，GitHub 只是首个远端适配器；
- 不让未经用户审阅的 AI 草稿自动成为“事实”。

## 9. 本版最重要的产品判断

PaperWeave 的壁垒不应是“模型回答得更长”，而应是：

- **平衡阅读路径**：推荐的是观点结构，不只是相似论文列表；
- **证据账本**：每条结论都能回到页、段、图、表或公式；
- **人机共写协议**：AI 草稿与用户判断永久区分，并保留审阅痕迹；
- **跨论文认知演化**：最终产物不是多份摘要，而是用户研究观点如何被支持、修正或推翻；
- **工具链不劫持**：Zotero 继续管理文献，Git 继续管理可迁移知识，产品负责把两者连成研究闭环。
