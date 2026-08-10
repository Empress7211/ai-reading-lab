import { describe, expect, it } from 'vitest';
import type { DraftProposal, EvidenceAnchor, EvidenceLink, ReviewContext } from './types';
import { InvalidReviewTransitionError, reviewDraftProposal } from './review';
import { ClaimValidationError } from './validation';

const HASH = 'b'.repeat(64);
const anchor: EvidenceAnchor = {
  id: 'anchor-1', paperVersionId: 'version-1', pageIndex: 4,
  bboxNorm: [0.1, 0.1, 0.8, 0.2], selectedText: 'Model A 81.0 Model B 83.1',
  prefix: '', suffix: '', textHash: HASH, sectionPath: ['Results', 'Table 2'],
  semanticElementId: 'table-2', pdfSha256: HASH, parserVersion: 'test-parser-1',
  anchorType: 'table', relocationStatus: 'exact', createdBy: 'parser',
};
const link: EvidenceLink = {
  id: 'link-1', claimId: 'proposal-1', anchorId: anchor.id, relation: 'support',
  supportType: 'table', quotedFragment: null, note: null, ordinal: 0,
};
const draft: DraftProposal = {
  id: 'proposal-1', paperId: 'paper-1', paperVersionId: anchor.paperVersionId,
  claimText: 'Model B improves accuracy by 2.1 points.', claimType: 'empirical',
  epistemicSource: 'reported_result', evidenceLinkIds: [link.id], assumptions: [],
  scopeConditions: ['Reported Table 2 setup'], limitations: [], confidence: 0.8,
  confidenceBasis: ['Table 2 reports both values'], reviewStatus: 'draft', createdBy: 'ai',
  needsHumanAttention: false, modelRunId: 'model-run-1', userComment: null, version: 1,
  createdAt: '2026-08-04T00:00:00.000Z', updatedAt: '2026-08-04T00:00:00.000Z',
  reviewedBy: null, reviewedAt: null, originalAiDraft: null,
};
const context: ReviewContext = {
  auditId: 'review-1', actorId: 'user-1', occurredAt: '2026-08-04T01:00:00.000Z',
  anchors: new Map([[anchor.id, anchor]]), evidenceLinks: new Map([[link.id, link]]),
};

describe('Draft -> ReviewAction -> Verified state machine', () => {
  it('creates a distinct Verified Claim and never mutates Draft in place', () => {
    const frozenDraft = Object.freeze({ ...draft });
    const result = reviewDraftProposal(frozenDraft, { action: 'accept' }, context);
    expect(result.state).toBe('verified');
    if (result.state !== 'verified') throw new Error('Expected Verified');
    expect(result.verifiedClaim.reviewStatus).toBe('accepted');
    expect(frozenDraft.reviewStatus).toBe('draft');
    expect(result.verifiedClaim).not.toBe(frozenDraft);
  });

  it('preserves the original AI Draft when edited', () => {
    const result = reviewDraftProposal(draft, { action: 'edit_and_accept', patch: { claimText: 'Under Table 2, Model B reports 83.1 versus 81.0.' } }, context);
    if (result.state !== 'verified') throw new Error('Expected Verified');
    expect(result.verifiedClaim.originalAiDraft?.claimText).toBe(draft.claimText);
    expect(result.reviewAction.changedFields).toEqual(['claimText']);
  });

  it('rejects an object already marked Verified as a Draft', () => {
    const invalid = { ...draft, reviewStatus: 'accepted' } as unknown as DraftProposal;
    expect(() => reviewDraftProposal(invalid, { action: 'accept' }, context)).toThrow(InvalidReviewTransitionError);
  });

  it('revalidates edited content before verification', () => {
    expect(() => reviewDraftProposal(draft, { action: 'edit_and_accept', patch: { claimText: '' } }, context)).toThrow(ClaimValidationError);
  });
});
