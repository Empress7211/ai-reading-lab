# 2026-08-04 · Public Repository

## 背景

GitHub 连接器对新建 private 仓库没有安装范围内的访问权限，且本项目的 Git 内容本身定位为可公开审阅的原创知识资产。

## 决定

- 将 `Empress7211/ai-reading-lab` 设为 public。
- 公开范围仅包括原创笔记、计划、知识地图、BibTeX、治理规则和少量复现代码。
- PDF、附件、私人信息、公司内部资料、密钥、未授权全文和本机路径继续禁止提交。

本决定取代 Foundation 中关于 private 可见性的决定，不改变 Zotero 作为 PDF 唯一事实来源的边界。

## 备选方案

保持 private，并单独扩展 GitHub App 的仓库访问范围。

## 后果

GitHub 连接器可直接读取仓库，知识资产也更方便跨设备访问与分享；相应地，每次提交前必须把公开性当作数据边界检查的一部分。
