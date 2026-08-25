import {
  JUDGMENT_SECTION_KEYS,
  type Claim,
  type EvidenceAnchor,
  type JudgmentSectionKey,
  type PaperMarkdownExport,
  type PaperIdentifier,
} from "./types";
import { isVerified } from "./review";
import { assertValidClaim } from "./validation";

export const MARKDOWN_RENDERER_VERSION = 2;

const JUDGMENT_SECTION_LABELS: Record<JudgmentSectionKey, string> = {
  judgment: "核心判断",
  reasoning: "推理",
  supportingEvidence: "支持证据",
  counterEvidence: "反方证据",
  uncertainties: "仍不确定",
  nextValidation: "下一步验证",
};

export class MarkdownExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkdownExportError";
  }
}

function inline(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<!--/g, "&lt;!--")
    .replace(/\s+/g, " ")
    .trim();
}

function sorted<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right), "en"));
}

function identifierLine(identifier: PaperIdentifier): string {
  return `- ${inline(identifier.type)}: ${inline(identifier.value)}`;
}

function anchorLabel(anchor: EvidenceAnchor): string {
  const section = anchor.sectionPath.map(inline).filter(Boolean).join(" › ");
  const base = `p.${anchor.pageIndex + 1}`;
  return section.length > 0 ? `${base} · ${section}` : base;
}

function listLine(label: string, values: readonly string[]): string | null {
  const rendered = values.map(inline).filter(Boolean);
  return rendered.length > 0 ? `- ${label}: ${rendered.join("; ")}` : null;
}

function claimHeading(claim: Claim, exportData: PaperMarkdownExport): string {
  const normalizedClaim = inline(claim.claimText).toLocaleLowerCase();
  const duplicatesSourceText = claim.evidenceLinkIds.some((linkId) => {
    const item = exportData.evidenceLinks.get(linkId);
    if (!item) return false;
    const anchor = exportData.anchors.get(item.anchorId);
    return anchor !== undefined && inline(anchor.selectedText).toLocaleLowerCase() === normalizedClaim;
  });
  return duplicatesSourceText
    ? `Verified Claim ${inline(claim.id)} (open PaperWeave to view source-matching text)`
    : inline(claim.claimText);
}

function renderClaim(claim: Claim, exportData: PaperMarkdownExport): string[] {
  assertValidClaim(claim, exportData.anchors, exportData.evidenceLinks);

  const evidence = sorted(
    claim.evidenceLinkIds.map((linkId) => {
      const link = exportData.evidenceLinks.get(linkId);
      if (!link) throw new MarkdownExportError(`Missing EvidenceLink ${linkId} for Claim ${claim.id}.`);
      return link;
    }),
    (item) => `${item.ordinal}:${item.anchorId}`,
  ).map((item) => {
      const anchor = exportData.anchors.get(item.anchorId);
      if (!anchor) {
        throw new MarkdownExportError(`Missing Anchor ${item.anchorId} for Claim ${claim.id}.`);
      }
      return `${anchorLabel(anchor)} (${item.relation}; ${item.supportType})`;
    },
  );

  return [
    `### ${claimHeading(claim, exportData)}`,
    "",
    `- Claim ID: ${inline(claim.id)}`,
    `- Type: ${claim.claimType}`,
    `- Epistemic source: ${claim.epistemicSource}`,
    `- Review: ${claim.reviewStatus}`,
    `- Evidence: ${evidence.join("; ") || "No original-text evidence (user judgment)"}`,
    listLine("Assumptions", claim.assumptions),
    listLine("Scope conditions", claim.scopeConditions),
    listLine("Limitations", claim.limitations),
    claim.userComment ? `- User comment: ${inline(claim.userComment)}` : null,
    "",
  ].filter((line): line is string => line !== null);
}

function renderJudgment(exportData: PaperMarkdownExport): string[] {
  const lines = [
    "## 我的判断",
    "",
    `- 状态: ${exportData.judgment.status === "complete" ? "已完成" : "草稿"}`,
    "",
  ];

  for (const key of JUDGMENT_SECTION_KEYS) {
    const section = exportData.judgment.sections[key];
    const text = inline(section.text);
    const claimIds = sorted(section.verifiedClaimIds, (claimId) => claimId);
    lines.push(`### ${JUDGMENT_SECTION_LABELS[key]}`, "", text || "_未填写_", "");
    claimIds.forEach((claimId) => lines.push(`- 引用 Verified Claim ID: ${inline(claimId)}`));
    if (claimIds.length > 0) lines.push("");
  }

  return lines;
}

/**
 * Produces deterministic user judgment and reviewed knowledge. It intentionally
 * never renders PDF paths, attachment bytes, PDF hashes, selected text, or
 * parser caches. Evidence is represented by stable page/section metadata only.
 */
export function renderPaperMarkdown(exportData: PaperMarkdownExport): string {
  if (exportData.title.trim().length === 0) {
    throw new MarkdownExportError("Paper title is required for Markdown export.");
  }

  const claims = sorted(
    exportData.claims.filter((claim) => isVerified(claim)),
    (claim) => claim.id,
  );
  const identifiers = sorted(exportData.identifiers, (identifier) =>
    `${identifier.type}:${identifier.value}`,
  );

  const lines: string[] = [
    `# ${inline(exportData.title)}`,
    "",
    `- PaperWeave ID: ${inline(exportData.paperId)}`,
    `- Authors: ${exportData.authors.map(inline).filter(Boolean).join(", ")}`,
    ...(exportData.year === null ? [] : [`- Year: ${exportData.year}`]),
    `- Renderer version: ${MARKDOWN_RENDERER_VERSION}`,
    ...(identifiers.length === 0 ? [] : ["", "## Identifiers", "", ...identifiers.map(identifierLine)]),
    "",
    ...renderJudgment(exportData),
    "<!-- paperweave:begin verified-claims -->",
    "## Verified Claims",
    "",
  ];

  if (claims.length === 0) {
    lines.push("_No verified claims._", "");
  } else {
    claims.forEach((claim) => lines.push(...renderClaim(claim, exportData)));
  }

  lines.push("<!-- paperweave:end verified-claims -->", "");
  return lines.join("\n");
}
