# PaperWeave Prompt Contracts

这些文件不是“万能长提示词”，而是模型适配层的任务契约。生产实现应：

1. 把论文文本作为不可信数据放入明确边界；
2. 只提供任务所需的最小上下文；
3. 使用 `schemas/` 中的 JSON Schema 约束输出；
4. 在模型输出后执行 Anchor、引文、枚举和数值校验；
5. 所有生成对象保持 `draft`，不得由模型自行标为 Verified；
6. 记录 template ID/version、输入 manifest、模型和成本；
7. 对不同 Provider 做小规模回归测试，不假设 OpenAI-compatible 行为完全一致。

变量使用 `{{variable_name}}` 表示。正文可由程序按 `<UNTRUSTED_PAPER_CONTENT>` 等边界注入。
