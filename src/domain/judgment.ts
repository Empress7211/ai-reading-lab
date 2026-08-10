import {
  JUDGMENT_SECTION_KEYS,
  type JudgmentNote,
  type JudgmentSection,
  type JudgmentSectionKey,
  type UUID,
  type VerifiedClaim,
} from './types';

export const EMPTY_JUDGMENT_SECTIONS: Readonly<Record<JudgmentSectionKey, JudgmentSection>> = {
  judgment: { text: '', verifiedClaimIds: [] },
  reasoning: { text: '', verifiedClaimIds: [] },
  supportingEvidence: { text: '', verifiedClaimIds: [] },
  counterEvidence: { text: '', verifiedClaimIds: [] },
  uncertainties: { text: '', verifiedClaimIds: [] },
  nextValidation: { text: '', verifiedClaimIds: [] },
};

export function createEmptyJudgmentSections(): Record<JudgmentSectionKey, JudgmentSection> {
  return {
    judgment: { text: '', verifiedClaimIds: [] },
    reasoning: { text: '', verifiedClaimIds: [] },
    supportingEvidence: { text: '', verifiedClaimIds: [] },
    counterEvidence: { text: '', verifiedClaimIds: [] },
    uncertainties: { text: '', verifiedClaimIds: [] },
    nextValidation: { text: '', verifiedClaimIds: [] },
  };
}

export function judgmentReferencedClaimIds(judgment: JudgmentNote): UUID[] {
  return [...new Set(
    JUDGMENT_SECTION_KEYS.flatMap((key) => judgment.sections[key].verifiedClaimIds),
  )];
}

export function assertValidJudgment(
  judgment: JudgmentNote,
  verifiedClaims: ReadonlyMap<UUID, VerifiedClaim>,
): void {
  if (judgment.createdBy !== 'user') {
    throw new Error('“我的判断”只能由用户创建。');
  }
  if (!judgment.paperId || !judgment.paperVersionId) {
    throw new Error('“我的判断”必须绑定论文及其版本。');
  }

  for (const claimId of judgmentReferencedClaimIds(judgment)) {
    const claim = verifiedClaims.get(claimId);
    if (!claim) {
      throw new Error(`“我的判断”只能引用已审阅通过的 Claim：${claimId}`);
    }
    if (claim.paperId !== judgment.paperId || claim.paperVersionId !== judgment.paperVersionId) {
      throw new Error(`“我的判断”不能引用其他论文版本的 Claim：${claimId}`);
    }
  }

  if (judgment.status === 'complete') {
    if (!judgment.sections.judgment.text.trim()) {
      throw new Error('完成“我的判断”前必须写明核心判断。');
    }
    if (judgmentReferencedClaimIds(judgment).length === 0) {
      throw new Error('完成“我的判断”前必须引用至少一条 Verified Claim。');
    }
    if (!judgment.completedAt) {
      throw new Error('完成的“我的判断”必须记录完成时间。');
    }
  } else if (judgment.completedAt !== null) {
    throw new Error('草稿状态不能带有完成时间。');
  }
}
