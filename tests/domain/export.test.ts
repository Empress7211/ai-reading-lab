import { describe, expect, it } from "vitest";
import { renderPaperMarkdown } from "../../src/domain/export";
import { acceptClaim, editAndAcceptClaim, rejectClaim } from "../../src/domain/review";
import { anchor, anchors, draftClaim, evidenceLinkForClaim, evidenceLinks, reviewContext } from "./fixtures";

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
    expect(markdown).toContain("p.7 · 4 Experiments › 4.2 Main results");
  });
});
