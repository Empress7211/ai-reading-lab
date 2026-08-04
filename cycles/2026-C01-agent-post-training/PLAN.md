# 2026-C01 · Agent & Post-Training

- 周期：2026-08-04 至 2026-10-25
- 每周投入：5–6 小时
- 状态：active

## 核心问题

> 后训练、工具调用、记忆与反馈机制如何共同塑造 LLM Agent 的可靠行为，其主要瓶颈来自训练目标、交互环境还是评测方式？

## 成功标准

目标：10 篇精读、12–20 篇扫描/通读、4 篇概念笔记、1 张主题地图、1 篇周期综合。

最低合格线：8 篇精读、8 篇扫描、3 篇概念笔记、至少 9 次周结，以及一篇真正回答核心问题的周期综合。

## 12 周主线

| 周次 | 日期 | 精读主线 | 辅助任务 |
|---|---|---|---|
| W01 | 08/04–08/09 | 系统初始化，无强制精读 | 建知识地图、Zotero 集合、候选队列和基线自测 |
| W02 | 08/10–08/16 | [InstructGPT](https://arxiv.org/abs/2203.02155) | 扫描 [PPO](https://arxiv.org/abs/1707.06347)，画出 SFT→RM→RLHF 数据流 |
| W03 | 08/17–08/23 | [Direct Preference Optimization](https://arxiv.org/abs/2305.18290) | 对比 PPO/RLHF；扫描 [DPO 与 PPO 的系统比较](https://proceedings.mlr.press/v235/xu24h.html) |
| W04 | 08/24–08/30 | [DeepSeek-R1](https://arxiv.org/abs/2501.12948) | 扫描 [DeepSeekMath/GRPO](https://arxiv.org/abs/2402.03300)，整理 outcome reward 的限制 |
| W05 | 08/31–09/06 | [ReAct](https://openreview.net/forum?id=WE_vluYUL-X) | 建立 Observation–Thought–Action–Feedback 概念模型 |
| W06 | 09/07–09/13 | [Toolformer](https://arxiv.org/abs/2302.04761) | 比较 prompting、SFT 与自监督工具学习 |
| W07 | 09/14–09/20 | [Reflexion](https://openreview.net/forum?id=vAElhFcKW6) | 区分参数更新、上下文更新和外部记忆 |
| W08 | 09/21–09/27 | [MemGPT](https://arxiv.org/abs/2310.08560) | 建立工作记忆、情景记忆、长期记忆概念笔记 |
| W09 | 09/28–10/04 | [AgentBench](https://arxiv.org/abs/2308.03688) | 分析 Agent benchmark 的环境、指标和可复现性 |
| W10 | 10/05–10/11 | [τ-bench](https://arxiv.org/abs/2406.12045) | 研究多轮用户—工具交互及 pass^k 可靠性 |
| W11 | 10/12–10/18 | [Agent Lightning](https://arxiv.org/abs/2508.03680) | 扫描 [ARIA](https://openreview.net/forum?id=eumRwpgdMU)，比较 credit assignment |
| W12 | 10/19–10/25 | 不新增精读 | 完成知识地图和《从偏好对齐到可学习 Agent》周期综合 |

## 必须形成的概念笔记

- [`RLHF-DPO-GRPO.md`](../../notes/concepts/RLHF-DPO-GRPO.md)
- [`Agent-as-MDP.md`](../../notes/concepts/Agent-as-MDP.md)
- [`Agent-Memory.md`](../../notes/concepts/Agent-Memory.md)
- [`Agent-Evaluation-and-Reliability.md`](../../notes/concepts/Agent-Evaluation-and-Reliability.md)

## 周度约束

- W02–W11 每周目标为一篇精读和一至两篇扫描；W01/W12 例外。
- 每周日之前完成周结和主动回忆。
- 周中不替换主线；变化留到周结记录原因。
- 复现仅在阅读无法判断关键结论时进入 Issue，且单周最多一小时。

## 最终综合题目

《从偏好对齐到可学习 Agent：训练目标、交互环境与可靠性评测》

综合必须给出至少三条跨论文共识、三处方法或证据冲突、五个未解决问题，以及下一周期的三个候选方向与取舍依据。
