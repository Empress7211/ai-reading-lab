import { describe, expect, it } from 'vitest';
import type { Claim, DraftProposal, EvidenceAnchor, EvidenceLink } from './types';
import { validateAnchor, validateClaim } from './validation';

const HASH = 'a'.repeat(64);
const anchor: EvidenceAnchor = {
  id: 'anchor-1', paperVersionId: 'version-1', pageIndex: 0,
  bboxNorm: [0.1, 0.1, 0.8, 0.2], selectedText: 'Accuracy improves by 2.1 percentage points on the held-out split.',
  prefix: '', suffix: '', textHash: HASH, sectionPath: ['Results'], semanticElementId: 'paragraph-1',
  pdfSha256: HASH, parserVersion: 'test-parser-1', anchorType: 'text', relocationStatus: 'exact', createdBy: 'parser',
};
const link: EvidenceLink = {
  id: 'link-1', claimId: 'proposal-1', anchorId: anchor.id, relation: 'support',
  supportType: 'reported_result', quotedFragment: null, note: null, ordinal: 0,
};
const anchors = new Map([[anchor.id, anchor]]);
const links = new Map([[link.id, link]]);

function draft(overrides: Partial<Claim> = {}): DraftProposal {
  return {
    id: 'proposal-1', paperId: 'paper-1', paperVersionId: anchor.paperVersionId,
    claimText: 'Accuracy improves on the held-out split.', claimType: 'empirical',
    epistemicSource: 'reported_result', evidenceLinkIds: [link.id], assumptions: [],
    scopeConditions: ['Held-out split'], limitations: [], confidence: 0.8,
    confidenceBasis: ['Explicitly reported result'], reviewStatus: 'draft', createdBy: 'ai',
    needsHumanAttention: false, modelRunId: 'model-run-1', userComment: null, version: 1,
    createdAt: '2026-08-04T00:00:00.000Z', updatedAt: '2026-08-04T00:00:00.000Z',
    reviewedBy: null, reviewedAt: null, originalAiDraft: null, ...overrides,
  } as DraftProposal;
}

describe('Claim and Anchor domain policy', () => {
  it('accepts precise Anchor fragments and rejects malformed fragment geometry', () => {
    expect(validateAnchor({
      ...anchor,
      rectsNorm: [[0.1, 0.1, 0.5, 0.12], [0.1, 0.14, 0.4, 0.16]],
    })).toEqual({ valid: true, issues: [] });

    const result = validateAnchor({
      ...anchor,
      rectsNorm: [[0.6, 0.1, 0.2, 0.12]],
    });
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'ANCHOR_RECTS_INVALID' }));
  });

  it.each(['direct_quote', 'author_claim', 'reported_result', 'external_metadata'] as const)('rejects an unanchored factual %s Claim', (epistemicSource) => {
    const result = validateClaim(draft({ epistemicSource, evidenceLinkIds: [] }), anchors, links);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'EVIDENCE_REQUIRED' }));
  });

  it('requires AI inference to remain visibly marked and anchored', () => {
    const result = validateClaim(draft({ epistemicSource: 'ai_inference', needsHumanAttention: false }), anchors, links);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'AI_INFERENCE_REQUIRES_ATTENTION' }));
  });

  it('accepts a clearly marked anchored AI inference', () => {
    expect(validateClaim(draft({ epistemicSource: 'ai_inference', needsHumanAttention: true }), anchors, links)).toEqual({ valid: true, issues: [] });
  });

  it('allows a user Claim to omit confidence and keeps historical user numbers valid', () => {
    const userClaim = {
      createdBy: 'user',
      epistemicSource: 'user_judgment',
      confidenceBasis: [],
      modelRunId: null,
    } as const;
    expect(validateClaim(draft({ ...userClaim, confidence: null }), anchors, links)).toEqual({ valid: true, issues: [] });
    expect(validateClaim(draft({ ...userClaim, confidence: 1 }), anchors, links)).toEqual({ valid: true, issues: [] });
  });

  it('rejects an AI Claim without numeric confidence', () => {
    const result = validateClaim(draft({ confidence: null }), anchors, links);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'CLAIM_CONFIDENCE_INVALID' }));
  });

  it('rejects missing and cross-version Anchors', () => {
    const wrongAnchor = { ...anchor, id: 'anchor-2', paperVersionId: 'version-2' };
    const wrongLink = { ...link, id: 'link-2', anchorId: wrongAnchor.id };
    const result = validateClaim(draft({ evidenceLinkIds: [wrongLink.id] }), new Map([[wrongAnchor.id, wrongAnchor]]), new Map([[wrongLink.id, wrongLink]]));
    expect(result.issues.map((issue) => issue.code)).toContain('ANCHOR_PAPER_VERSION_MISMATCH');
  });
});
