import type { NormalizedBoundingBox, UUID } from './types';

export const DOCUMENT_BLOCK_PARSER_VERSION = 'paperweave-blocks-v1-pdfjs-5.6.205';

export const DOCUMENT_BLOCK_KINDS = [
  'front_matter',
  'title',
  'author',
  'email',
  'abstract',
  'section_heading',
  'paragraph',
  'list',
  'figure_caption',
  'table_caption',
  'equation',
  'reference',
] as const;

export type DocumentBlockKind = (typeof DOCUMENT_BLOCK_KINDS)[number];

export interface DocumentBlock {
  readonly id: string;
  /** One-based PDF page number. */
  readonly page: number;
  readonly bbox: NormalizedBoundingBox;
  readonly kind: DocumentBlockKind;
  readonly sectionPath: readonly string[];
  readonly text: string;
}

export interface LocalDocumentIndex {
  readonly pdfSha256: string;
  readonly parserVersion: typeof DOCUMENT_BLOCK_PARSER_VERSION;
  readonly pageCount: number;
  readonly blocks: readonly DocumentBlock[];
}

export interface PageTextRun {
  readonly text: string;
  readonly bbox: NormalizedBoundingBox;
  readonly fontSize: number;
  readonly hasEol: boolean;
}

export interface PageTextLine {
  readonly page: number;
  readonly text: string;
  readonly bbox: NormalizedBoundingBox;
  readonly fontSize: number;
}

export const PAPER_MAP_NODE_KINDS = [
  'problem',
  'background',
  'method',
  'result',
  'limitation',
  'conclusion',
] as const;

export type PaperMapNodeKind = (typeof PAPER_MAP_NODE_KINDS)[number];

export interface PaperMapEvidenceGroup {
  readonly id: UUID;
  readonly label: string;
  readonly blockIds: readonly string[];
}

export interface PaperMapNode {
  readonly id: UUID;
  readonly title: string;
  readonly summary: string;
  readonly kind: PaperMapNodeKind;
  readonly evidenceGroups: readonly PaperMapEvidenceGroup[];
}

export interface PaperMapArtifact {
  readonly id: UUID;
  readonly schemaVersion: 'paper_map.v1';
  readonly paperId: UUID;
  readonly paperVersionId: UUID;
  readonly pdfSha256: string;
  readonly parserVersion: typeof DOCUMENT_BLOCK_PARSER_VERSION;
  readonly pageCount: number;
  readonly blockCount: number;
  readonly modelRunId: UUID;
  readonly model: string;
  readonly generatedAt: string;
  readonly nodes: readonly PaperMapNode[];
}

export const READING_GOALS = [
  'triage',
  'understand_method',
  'verify_evidence',
  'reproduce',
  'literature_review',
] as const;

export type ReadingGoal = (typeof READING_GOALS)[number];

const EVIDENCE_BLOCK_KINDS = new Set<DocumentBlockKind>([
  'abstract',
  'paragraph',
  'list',
  'figure_caption',
  'table_caption',
  'equation',
]);

export function isEvidenceDocumentBlock(block: DocumentBlock): boolean {
  return EVIDENCE_BLOCK_KINDS.has(block.kind);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizedBox(box: NormalizedBoundingBox): NormalizedBoundingBox {
  const x0 = Math.min(0.9999, clamp(Math.min(box[0], box[2])));
  const y0 = Math.min(0.9999, clamp(Math.min(box[1], box[3])));
  const x1 = clamp(Math.max(box[0], box[2]));
  const y1 = clamp(Math.max(box[1], box[3]));
  return [
    x0,
    y0,
    Math.min(1, Math.max(x0 + 0.0001, x1)),
    Math.min(1, Math.max(y0 + 0.0001, y1)),
  ];
}

function unionBox(
  left: NormalizedBoundingBox,
  right: NormalizedBoundingBox,
): NormalizedBoundingBox {
  return normalizedBox([
    Math.min(left[0], right[0]),
    Math.min(left[1], right[1]),
    Math.max(left[2], right[2]),
    Math.max(left[3], right[3]),
  ]);
}

function normalizeRunText(value: string): string {
  return value.replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ');
}

function shouldInsertSpace(previous: string, next: string, gap: number, height: number): boolean {
  if (/\s$/.test(previous) || /^\s/.test(next)) return false;
  if (/[-‐‑–—]$/.test(previous) || /^[,.;:!?%\])}，。；：！？、）】》]/.test(next)) return false;
  if (/\p{Script=Han}$/u.test(previous) && /^\p{Script=Han}/u.test(next)) return false;
  return gap > Math.max(0.0015, height * 0.12);
}

/** Combines deterministic PDF.js text runs into visual lines without using DOM geometry. */
export function extractPageTextLines(page: number, runs: readonly PageTextRun[]): PageTextLine[] {
  const lines: PageTextLine[] = [];
  let current: PageTextLine | null = null;

  const flush = () => {
    if (current && current.text.trim()) {
      lines.push({ ...current, text: current.text.trim() });
    }
    current = null;
  };

  for (const run of runs) {
    const text = normalizeRunText(run.text);
    if (!text.trim()) {
      if (run.hasEol) flush();
      continue;
    }
    const bbox = normalizedBox(run.bbox);
    const runCenter = (bbox[1] + bbox[3]) / 2;
    const runHeight = bbox[3] - bbox[1];
    const currentCenter = current ? (current.bbox[1] + current.bbox[3]) / 2 : 0;
    const currentHeight = current ? current.bbox[3] - current.bbox[1] : 0;
    const sameBaseline = current
      ? Math.abs(runCenter - currentCenter) <= Math.max(runHeight, currentHeight) * 0.65
      : false;
    const continuesForward = current ? bbox[0] >= current.bbox[0] - 0.03 : false;

    if (!current || !sameBaseline || !continuesForward) {
      flush();
      current = { page, text, bbox, fontSize: run.fontSize };
    } else {
      const gap = bbox[0] - current.bbox[2];
      const separator: string = shouldInsertSpace(current.text, text, gap, Math.max(runHeight, currentHeight))
        ? ' '
        : '';
      current = {
        page,
        text: `${current.text}${separator}${text}`,
        bbox: unionBox(current.bbox, bbox),
        fontSize: Math.max(current.fontSize, run.fontSize),
      };
    }

    if (run.hasEol) flush();
  }
  flush();
  return lines;
}

const headingPattern = /^(?:\d+(?:\.\d+)*\s+)?(?:abstract|introduction|background|related work|method(?:ology)?|approach|experiments?|results?|discussion|limitations?|conclusion|acknowledg(?:e)?ments?|references|bibliography|摘要|引言|背景|相关工作|方法|实验|结果|讨论|局限|结论|参考文献)\b/i;
const referenceHeadingPattern = /^(?:\d+(?:\.\d+)*\s+)?(?:references|bibliography|参考文献)\s*$/i;
const abstractPrefixPattern = /^(?:abstract|摘要)\s*[:—–-]\s*(.+)$/i;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const figureCaptionPattern = /^(?:fig(?:ure)?\.?|图)\s*\d+[.:：]?\s*/i;
const tableCaptionPattern = /^(?:table|表)\s*\d+[.:：]?\s*/i;
const listPattern = /^(?:[-•·]|\(?\d+[.)]|\(?[a-z][.)])\s+/i;

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function looksLikeHeading(line: PageTextLine, pageMedianFont: number): boolean {
  const text = line.text.trim();
  if (headingPattern.test(text)) return true;
  if (text.length > 150 || /[.!?。！？]$/.test(text)) return false;
  return pageMedianFont > 0 && line.fontSize >= pageMedianFont * 1.18;
}

function looksLikeEquation(text: string): boolean {
  if (text.length > 180) return false;
  const mathCharacters = (text.match(/[=+−×÷∑∫√≤≥≈<>^_{}\[\]]/g) ?? []).length;
  return mathCharacters >= 2 && mathCharacters / Math.max(text.length, 1) >= 0.05;
}

/** Builds the complete document index in one pass so section and References state cross pages. */
export function buildDocumentBlocks(pages: readonly (readonly PageTextLine[])[]): DocumentBlock[] {
  const firstPage = pages[0] ?? [];
  const firstPageMaxFont = Math.max(0, ...firstPage.map((line) => line.fontSize));
  const titleLineIndexes = new Set(
    firstPage
      .map((line, index) => ({ line, index }))
      .filter(({ line }) =>
        line.bbox[1] < 0.34
        && line.text.trim().length >= 4
        && !emailPattern.test(line.text)
        && line.fontSize >= firstPageMaxFont * 0.82,
      )
      .map(({ index }) => index),
  );

  let sectionPath: string[] = [];
  let frontMatter = true;
  let abstractSection = false;
  let references = false;
  const blocks: DocumentBlock[] = [];

  pages.forEach((lines, pageIndex) => {
    const page = pageIndex + 1;
    const pageMedianFont = median(lines.map((line) => line.fontSize).filter((size) => size > 0));
    lines.forEach((line, lineIndex) => {
      const text = line.text.trim();
      if (!text) return;
      let kind: DocumentBlockKind;

      if (references) {
        kind = 'reference';
      } else if (page === 1 && titleLineIndexes.has(lineIndex)) {
        kind = 'title';
      } else if (emailPattern.test(text)) {
        kind = 'email';
      } else if (referenceHeadingPattern.test(text)) {
        references = true;
        frontMatter = false;
        abstractSection = false;
        sectionPath = [text];
        kind = 'section_heading';
      } else {
        const abstractMatch = text.match(abstractPrefixPattern);
        if (abstractMatch) {
          frontMatter = false;
          abstractSection = true;
          sectionPath = ['Abstract'];
          kind = 'abstract';
        } else if (looksLikeHeading(line, pageMedianFont)) {
          frontMatter = false;
          abstractSection = /^(?:abstract|摘要)\s*$/i.test(text);
          sectionPath = [text];
          kind = 'section_heading';
        } else if (page === 1 && frontMatter) {
          kind = 'front_matter';
        } else if (figureCaptionPattern.test(text)) {
          kind = 'figure_caption';
        } else if (tableCaptionPattern.test(text)) {
          kind = 'table_caption';
        } else if (looksLikeEquation(text)) {
          kind = 'equation';
        } else if (listPattern.test(text)) {
          kind = 'list';
        } else {
          kind = abstractSection ? 'abstract' : 'paragraph';
        }
      }

      blocks.push({
        id: `p${String(page).padStart(4, '0')}-b${String(lineIndex + 1).padStart(4, '0')}`,
        page,
        bbox: normalizedBox(line.bbox),
        kind,
        sectionPath: [...sectionPath],
        text,
      });
    });
  });

  return blocks;
}

const goalPriority: Record<ReadingGoal, readonly PaperMapNodeKind[]> = {
  triage: ['problem', 'result', 'conclusion', 'limitation', 'method', 'background'],
  understand_method: ['problem', 'method', 'result', 'limitation', 'conclusion', 'background'],
  verify_evidence: ['result', 'limitation', 'method', 'conclusion', 'problem', 'background'],
  reproduce: ['method', 'result', 'limitation', 'problem', 'conclusion', 'background'],
  literature_review: ['problem', 'background', 'method', 'result', 'limitation', 'conclusion'],
};

/** Reading-goal changes are a local, deterministic reorder and never require a model call. */
export function orderPaperMapNodes(
  nodes: readonly PaperMapNode[],
  goal: ReadingGoal,
): PaperMapNode[] {
  const priority = goalPriority[goal];
  const rank = new Map(priority.map((kind, index) => [kind, index]));
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((left, right) =>
      (rank.get(left.node.kind) ?? priority.length) - (rank.get(right.node.kind) ?? priority.length)
      || left.index - right.index,
    )
    .map(({ node }) => node);
}

export function paperMapMatchesIndex(
  map: PaperMapArtifact,
  paperVersionId: string,
  index: LocalDocumentIndex,
): boolean {
  if (
    map.paperVersionId !== paperVersionId
    || map.pdfSha256.replace(/^sha256:/i, '') !== index.pdfSha256.replace(/^sha256:/i, '')
    || map.parserVersion !== index.parserVersion
    || map.pageCount !== index.pageCount
  ) {
    return false;
  }
  const blocks = new Map(index.blocks.map((block) => [block.id, block]));
  return map.nodes.every((node) => node.evidenceGroups.every((group) =>
    group.blockIds.length > 0
    && group.blockIds.every((blockId) => {
      const block = blocks.get(blockId);
      return block ? isEvidenceDocumentBlock(block) : false;
    }),
  ));
}
