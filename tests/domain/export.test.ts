import { describe, expect, it } from "vitest";
import { MARKDOWN_RENDERER_VERSION, renderPaperMarkdown } from "../../src/domain/export";
import { acceptClaim, editAndAcceptClaim, rejectClaim } from "../../src/domain/review";
import type { JudgmentNote } from "../../src/domain/types";
import { anchor, anchors, draftClaim, evidenceLinkForClaim, evidenceLinks, reviewContext } from "./fixtures";

function judgment(paperId: string, paperVersionId: string): JudgmentNote {
  return {
    id: "judgment-1",
    paperId,
    paperVersionId,
    status: "complete",
    createdBy: "user",
    updatedAt: "2026-08-04T02:00:00.000Z",
    completedAt: "2026-08-04T02:00:00.000Z",
    sections: {
      judgment: { text: "核心结论由人工形成。", verifiedClaimIds: ["claim-z", "claim-a"] },
      reasoning: { text: "结果与实验设计共同支持该结论。", verifiedClaimIds: ["claim-z"] },
      supportingEvidence: { text: "已验证的主要结果构成支持。", verifiedClaimIds: ["claim-a"] },
      counterEvidence: { text: "尚未发现直接反证。", verifiedClaimIds: [] },
      uncertainties: { text: "跨数据集表现仍不确定。", verifiedClaimIds: [] },
      nextValidation: { text: "下一步复现实验。", verifiedClaimIds: ["claim-z"] },
    },
  };
}

describe("deterministic Markdown export", () => {
  it("exports only Verified claims in stable Claim-id order", () => {
    const contextFor = (claimId: string) => reviewContext({
      evidenceLinks: new Map([[evidenceLinkForClaim(claimId).id, evidenceLinkForClaim(claimId)]]),
    });
    const accepted = acceptClaim(
      draftClaim({ id: "claim-z", claimText: "Verified result Z is supported by the experiment." }),
      contextFor("claim-z"),
    ).claim;
    const edited = editAndAcceptClaim(
      draftClaim({ id: "claim-a" }),
      { claimText: "Verified result A reports a 2.1-point improvement." },
      contextFor("claim-a"),
    ).claim;
    const rejected = rejectClaim(
      draftClaim({ id: "claim-r", claimText: "Rejected result must never be exported." }),
      "inaccurate",
      contextFor("claim-r"),
    ).claim;
    const draft = draftClaim({ id: "claim-d", claimText: "Draft result must never be exported." });

    const exportData = {
      paperId: accepted.paperId,
      title: "A Reliable Paper",
      authors: ["Researcher A", "Researcher B"],
      year: 2026,
      identifiers: [
        { type: "arXiv", value: "2601.00001" },
        { type: "DOI", value: "10.0000/example" },
      ],
      judgment: judgment(accepted.paperId, accepted.paperVersionId),
      claims: [accepted, rejected, draft, edited],
      anchors,
      evidenceLinks: new Map([
        [evidenceLinkForClaim("claim-z").id, evidenceLinkForClaim("claim-z")],
        [evidenceLinkForClaim("claim-a").id, evidenceLinkForClaim("claim-a")],
        [evidenceLinkForClaim("claim-r").id, evidenceLinkForClaim("claim-r")],
        [evidenceLinkForClaim("claim-d").id, evidenceLinkForClaim("claim-d")],
      ]),
    } as const;

    const first = renderPaperMarkdown(exportData);
    const second = renderPaperMarkdown({ ...exportData, claims: [...exportData.claims].reverse() });

    expect(second).toBe(first);
    expect(first).toContain(`- Renderer version: ${MARKDOWN_RENDERER_VERSION}`);
    expect(first.indexOf("## 我的判断")).toBeLessThan(first.indexOf("## Verified Claims"));
    expect(first).toContain("- 状态: 已完成");
    expect(first).toContain("### 核心判断\n\n核心结论由人工形成。");
    expect(first).toContain("### 推理\n\n结果与实验设计共同支持该结论。");
    expect(first).toContain("### 支持证据\n\n已验证的主要结果构成支持。");
    expect(first).toContain("### 反方证据\n\n尚未发现直接反证。");
    expect(first).toContain("### 仍不确定\n\n跨数据集表现仍不确定。");
    expect(first).toContain("### 下一步验证\n\n下一步复现实验。");
    expect(first.indexOf("引用 Verified Claim ID: claim-a")).toBeLessThan(first.indexOf("引用 Verified Claim ID: claim-z"));
    expect(first.indexOf("Verified result A")).toBeLessThan(first.indexOf("Verified result Z"));
    expect(first).not.toContain("Rejected result");
    expect(first).not.toContain("Draft result");
  });

  it("never serializes PDF material or selected source text", () => {
    const claim = acceptClaim(draftClaim(), reviewContext()).claim;
    const exportData = {
      paperId: claim.paperId,
      title: "Local-first Research",
      authors: ["Researcher"],
      year: null,
      identifiers: [],
      judgment: {
        ...judgment(claim.paperId, claim.paperVersionId),
        status: "draft" as const,
        completedAt: null,
        sections: {
          judgment: { text: "", verifiedClaimIds: [] },
          reasoning: { text: "", verifiedClaimIds: [] },
          supportingEvidence: { text: "", verifiedClaimIds: [] },
          counterEvidence: { text: "", verifiedClaimIds: [] },
          uncertainties: { text: "", verifiedClaimIds: [] },
          nextValidation: { text: "", verifiedClaimIds: [] },
        },
      },
      claims: [claim],
      anchors,
      evidenceLinks,
      pdfPath: "/Users/example/licensed-paper.pdf",
      pdfBytes: "JVBERi0xLjQ=",
    };

    const markdown = renderPaperMarkdown(exportData);

    expect(markdown).not.toContain(exportData.pdfPath);
    expect(markdown).not.toContain(exportData.pdfBytes);
    expect(markdown).not.toContain(anchor.selectedText);
    expect(markdown).not.toContain(anchor.pdfSha256);
    expect(markdown.match(/_未填写_/g)).toHaveLength(6);
    expect(markdown).toContain("p.7 · 4 Experiments › 4.2 Main results");
  });
});
