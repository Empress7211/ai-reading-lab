# PaperWeave 交互原型

## 打开方式

通常可直接双击 `index.html`。若浏览器或组织安全策略禁止打开本地 `file://` 页面，可在交付包根目录运行：

```bash
python3 -m http.server 8000
```

然后访问本地服务中的 `/prototype/` 路径。

## 已覆盖的演示流程

- 选择、输入或随机切换研究主题；
- 生成“基石 / 当前发展 / 反方视角”的平衡阅读包；
- 固定、替换并打开论文卡片；
- 使用三栏研究型阅读器；
- 从 AI 阅读导引与 Claim 回跳到合成 PDF 的证据锚点；
- 接受、编辑或驳回原子化 Claim 提案；
- 编写明确归属于用户的个人笔记；
- 进行有证据引用的演示问答；
- 在执行前预览 Zotero 与 Git 变更；
- 查看命题级跨论文观点矩阵；
- 配置 BYOK 模型路由与隐私开关；
- 使用 `⌘ K` / `Ctrl K` 打开命令面板。

## 验证状态

`QA_REPORT.json` 记录了浏览器级回归结果。已验证桌面端 `1440×1000` 与移动端 `390×844`，覆盖发现页、阅读器、证据账本、审阅状态、同步预览、主导航、命令面板、横向溢出和运行时错误检查。

参考截图：

- `screenshots/discover.png`
- `screenshots/reader.png`
- `screenshots/ledger-reviewed.png`
- `screenshots/sync-preview.png`
- `screenshots/discover-mobile.png`

## 重要限制

- 所有数据均为静态演示数据；
- 部分较新的论文条目明确标注为 `Demo corpus`；
- 阅读器内可见的论文正文是合成文本，并非从所选论文复制；
- 不会发生网络请求、模型调用、Zotero 访问、PDF 下载、Git 操作或凭据保存；
- 这是信息架构与交互验证原型，不是最终视觉稿或生产代码；
- “PaperWeave / 论织”是工作名称，尚未进行商标与域名核验。
