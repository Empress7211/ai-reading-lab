import type { DraftProposal, EvidenceAnchor, Paper } from '../domain';

const REVIEW_FIXTURE_KINDS = ['author', 'result', 'inference'] as const;

export function localReviewDraftIds(anchorId: string): string[] {
  return REVIEW_FIXTURE_KINDS.map((kind) => `${anchorId}:review-fixture:${kind}`);
}

/**
 * Creates explicit local fixtures for exercising the review state machine.
 * No model is called and the selected PDF text is never sent off-device.
 */
export function createLocalReviewDrafts(
  paper: Paper,
  anchor: EvidenceAnchor,
  createdAt: string,
): DraftProposal[] {
  if (!paper.currentVersionId || paper.currentVersionId !== anchor.paperVersionId) {
    throw new Error('无法为不属于当前 PDF 版本的 Anchor 创建审阅 Draft。');
  }

  const common = {
    paperId: paper.id,
    paperVersionId: paper.currentVersionId,
    assumptions: [],
    scopeConditions: ['本地审阅 fixture；必须由用户结合原文判断。'],
    limitations: ['没有调用 LLM、Docling 或 OCR。'],
    reviewStatus: 'draft' as const,
    createdBy: 'ai' as const,
    modelRunId: null,
    userComment: null,
    version: 1,
    createdAt,
    updatedAt: createdAt,
    reviewedBy: null,
    reviewedAt: null,
    originalAiDraft: null,
  };

  return [
    {
      ...common,
      id: `${anchor.id}:review-fixture:author`,
      claimText: `本地审阅 fixture：所选原文包含“${anchor.selectedText.slice(0, 120)}”。`,
      claimType: 'descriptive',
      epistemicSource: 'author_claim',
      evidence: [{
        anchorId: anchor.id,
        supportType: 'direct_statement',
        quotedFragment: anchor.selectedText,
        notes: '由用户选区创建；不是模型抽取结果。',
      }],
      confidence: 0.75,
      confidenceBasis: ['绑定用户创建的 PDF 文本 Anchor。'],
      needsHumanAttention: false,
    },
    {
      ...common,
      id: `${anchor.id}:review-fixture:result`,
      claimText: '本地审阅 fixture：该选区可能包含需要回到上下文核验的报告结果。',
      claimType: 'empirical',
      epistemicSource: 'reported_result',
      evidence: [{
        anchorId: anchor.id,
        supportType: 'reported_result',
        quotedFragment: null,
        notes: '仅用于验证审阅与持久化流程。',
      }],
      confidence: 0.55,
      confidenceBasis: ['这是显式 fixture，不代表已解析论文结果。'],
      needsHumanAttention: true,
    },
    {
      ...common,
      id: `${anchor.id}:review-fixture:inference`,
      claimText: 'AI fixture 推断：该选区可能影响论文结论的适用范围。',
      claimType: 'interpretive',
      epistemicSource: 'ai_inference',
      evidence: [{
        anchorId: anchor.id,
        supportType: 'context',
        quotedFragment: null,
        notes: '没有模型调用；只验证 AI inference 的人工审阅边界。',
      }],
      confidence: 0.4,
      confidenceBasis: ['固定本地 fixture。'],
      needsHumanAttention: true,
    },
  ];
}
