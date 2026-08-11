import { describe, expect, it } from 'vitest';
import { validateAnchor, validateClaim } from '../../src/domain/validation';
import { anchor, anchors, draftClaim, evidenceLink, evidenceLinks } from './fixtures';

describe('domain validation', () => {
  it('accepts a stable normalized Evidence Anchor', () => {
    expect(validateAnchor(anchor)).toEqual({ valid: true, issues: [] });
  });

  it('requires evidence for every factual AI Claim', () => {
    const result = validateClaim(draftClaim({ evidenceLinkIds: [] }), anchors, evidenceLinks);
    expect(result.issues.map((issue) => issue.code)).toContain('EVIDENCE_REQUIRED');
  });

  it('rejects references to an Anchor that does not exist', () => {
    const result = validateClaim(draftClaim(), new Map(), evidenceLinks);
    expect(result.issues.map((issue) => issue.code)).toContain('ANCHOR_NOT_FOUND');
  });

  it('keeps AI inference visibly marked for review', () => {
    const result = validateClaim(draftClaim({ epistemicSource: 'ai_inference', needsHumanAttention: false }), anchors, evidenceLinks);
    expect(result.issues.map((issue) => issue.code)).toContain('AI_INFERENCE_REQUIRES_ATTENTION');
  });

  it('does not allow AI to author a user judgment', () => {
    const result = validateClaim(draftClaim({ epistemicSource: 'user_judgment', evidenceLinkIds: [] }), anchors, evidenceLinks);
    expect(result.issues.map((issue) => issue.code)).toContain('AI_CANNOT_ASSERT_USER_JUDGMENT');
  });

  it('requires reported results to cite result, table, figure, or equation evidence', () => {
    const contextLink = { ...evidenceLink, supportType: 'context' as const };
    const result = validateClaim(draftClaim(), anchors, new Map([[contextLink.id, contextLink]]));
    expect(result.issues.map((issue) => issue.code)).toContain('REPORTED_RESULT_SUPPORT_REQUIRED');
  });
});
