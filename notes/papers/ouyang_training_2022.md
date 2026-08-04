---
zotero_key: "AQQPLG9Z"
citekey: "ouyang_training_2022"
status: "queued"
depth: "deep"
topics: [post-training, rlhf, alignment]
cycle: "2026-C01"
created: "2026-08-04"
updated: "2026-08-04"
next_review: "2026-08-05"
---

# Training Language Models to Follow Instructions with Human Feedback

## 一句话结论

TODO

## 中文摘要

<!-- 用自己的话写 150–300 字，不复制 Abstract。 -->

TODO

## English Summary

<!-- Write 100–180 words in your own words. Do not copy the abstract. -->

TODO

## 研究问题

TODO

## 假设与适用边界

- [作者结论] TODO
- [我的推断] TODO
- [待验证] TODO

## 核心方法与推导

TODO

## 实验与证据

<!-- 尽量标出 Section / Figure / Table / Page。 -->

TODO

## 局限与反例

TODO

## 知识连接

- 前置工作：TODO
- 相似或后续工作：TODO
- 相反观点：TODO
- 相关概念：TODO

## 工程意义

TODO

## 疑问与新想法

TODO

## 主动回忆

<!-- 合上论文后回答：问题、方法、关键证据、最大局限分别是什么？ -->

TODO

## 复习记录

| 日期 | 间隔 | 回忆结果 | 下次行动 |
|---|---:|---|---|
| | | | |

## 预读导引（Codex 辅助，待本人验证）

> 本节不是个人阅读完成证明，不据此把状态改为 `read`。阅读后应独立完成上面的中英文总结与主动回忆，并逐条确认或修正以下判断。

### 最小证据链

1. **问题定义：** 预训练的 next-token objective 与“按用户意图提供有帮助、真实、无害的回答”并不等价（Section 1, pp. 1–2）。
2. **三阶段方法：** 先用示范数据做 SFT；再让标注者排序同一 prompt 的 4–9 个回答并训练标量 reward model；最后把 prompt–response 看成单步 bandit，用 PPO 最大化 RM 分数（Figure 2; Sections 3.1, 3.5, pp. 6–9）。
3. **两个约束项：** PPO 对 SFT policy 加逐 token KL penalty，抑制对 RM 的过度优化；PPO-ptx 额外混入预训练 log-likelihood 梯度，缓解部分公共 NLP 任务退化（Equation 2, p. 9; Figures 28–34, Appendix E）。
4. **主要证据：** 在 held-out customer prompts 上，175B InstructGPT 相对 175B GPT-3 的人工偏好胜率为 `85 ± 3%`，相对 few-shot prompted GPT-3 为 `71 ± 4%`；1.3B InstructGPT 也优于 175B GPT-3（Section 1, p. 3; Figure 1）。闭域任务的幻觉率为 `21%` 对 `41%`（Section 1, p. 3; Figure 4）。
5. **不能推出的结论：** 这些结果不能证明模型已普遍“对齐人类价值”。训练数据超过 96% 为英语，约 40 名标注者主要来自美国和东南亚；多数比较只由一名标注者完成，且训练时的偏好规则由研究者设定（Sections 3.3–3.4, 5.2–5.3, pp. 7, 18–19）。

### 阅读时重点质疑

- [作者结论] 人类反馈微调在其 API prompt 分布上，比单纯扩大参数量更能改善指令遵循与标注者偏好（Figure 1; Section 4.1）。
- [作者结论] 预训练混合项能显著缓解、但不能完全消除 PPO 带来的能力退化（Section 4.2; Figures 28–34; Section 5.4）。
- [待验证] RM、checkpoint selection 和最终人工评测在多大程度上共享同一套偏好规范，从而把“规范一致性”误读成更广义的可靠性？
- [待验证] held-out labelers 与训练标注者来自相同供应渠道；其结果支持的是同一抽样框内的泛化，不是跨文化或跨利益相关方泛化（Figure 3; Section 5.2）。
- [待验证] 论文把交互压缩为单步 bandit；这与本周期后半段多轮 Agent 的状态、工具反馈和 credit assignment 有何根本差异？
- [待验证] “更好地服从指令”与“更安全”不是同义词：要求模型生成有害内容时，InstructGPT 可能比 GPT-3 更有毒（Section 5.3, p. 19; Figure 39）。

### 读后闭卷检查

1. 不看 Figure 2，画出 SFT 数据、comparison 数据、RM 和 PPO policy 的依赖关系。
2. 用自己的话解释 Equation 1 为什么只约束奖励差值，以及奖励平移为何不改变 loss。
3. 对 Equation 2 分别去掉 KL 项和 pretraining 项，预测会出现什么失败，并指出论文证据。
4. 说出三个主结果及其评测分布，再说出一个不能从这些结果外推的结论。
5. 回答：InstructGPT 主要改善的是 capability、alignment，还是 evaluator agreement？给出自己的判据。
