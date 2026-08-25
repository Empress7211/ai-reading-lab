import {
  AlertTriangle,
  Check,
  ChevronRight,
  LoaderCircle,
  Map as MapIcon,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { messageFromUnknown } from '../../errorMessage';
import type {
  DocumentBlock,
  EvidenceAnchor,
  LocalDocumentIndex,
  PaperMapArtifact,
  ReadingGoal,
} from '../../domain';
import {
  isEvidenceDocumentBlock,
  orderPaperMapNodes,
  paperMapMatchesIndex,
} from '../../domain';

interface PaperMapPanelProps {
  paperId: string;
  paperVersionId: string;
  model: string;
  documentIndex: LocalDocumentIndex | null;
  paperMap: PaperMapArtifact | null;
  stalePaperMap: boolean;
  anchors: readonly EvidenceAnchor[];
  onGenerate: (documentIndex: LocalDocumentIndex, confirmedFullTextUpload: true) => Promise<void>;
  onJumpBlock: (block: DocumentBlock) => void;
  onIncludeBlock: (block: DocumentBlock, documentIndex: LocalDocumentIndex) => Promise<void>;
}

const goalLabels: Record<ReadingGoal, string> = {
  triage: '快速判断',
  understand_method: '理解方法',
  verify_evidence: '核验证据',
  reproduce: '尝试复现',
  literature_review: '文献综述',
};

const nodeKindLabels: Record<PaperMapArtifact['nodes'][number]['kind'], string> = {
  problem: '问题',
  background: '背景',
  method: '方法',
  result: '结果',
  limitation: '局限',
  conclusion: '结论',
};

function sameBox(left: EvidenceAnchor['bboxNorm'], right: DocumentBlock['bbox']): boolean {
  return left.every((value, index) => Math.abs(value - right[index]!) < 0.0001);
}

function ConsentCard({
  paperVersionId,
  model,
  documentIndex,
  pending,
  error,
  onGenerate,
}: {
  paperVersionId: string;
  model: string;
  documentIndex: LocalDocumentIndex;
  pending: boolean;
  error: string | null;
  onGenerate: (confirmed: true) => Promise<void>;
}) {
  const [confirmedVersionId, setConfirmedVersionId] = useState<string | null>(null);
  useEffect(() => setConfirmedVersionId(null), [paperVersionId]);
  const confirmed = confirmedVersionId === paperVersionId;
  const sentBlocks = documentIndex.blocks.filter(isEvidenceDocumentBlock);
  const sentChars = sentBlocks.reduce((sum, block) => sum + block.text.length, 0);

  return <section className="paper-map-consent">
    <div className="paper-map-consent__summary">
      <Sparkles size={16} />
      <p><strong>由 AI 建立第一条阅读路线</strong><span>本地索引共 {documentIndex.blocks.length} 块；本次发送 {sentBlocks.length} 个正文证据块（携带章节路径），约 {sentChars.toLocaleString()} 字符。</span></p>
    </div>
    <p>目标模型：{model.trim() || '未配置'}。不会发送 API Key、本地路径、标题、作者、邮箱或参考文献，也不会后台自动上传。</p>
    <label className="paper-map-consent__check">
      <input
        type="checkbox"
        checked={confirmed}
        disabled={pending}
        onChange={(event) => setConfirmedVersionId(event.target.checked ? paperVersionId : null)}
      />
      <span>我确认本次发送这篇论文的结构化全文文本</span>
    </label>
    <Button
      variant="primary"
      className="full-width"
      icon={pending ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
      disabled={pending || !confirmed || !model.trim()}
      onClick={() => void onGenerate(true)}
    >{pending ? '正在生成论证地图…' : '生成论证地图'}</Button>
    {!model.trim() ? <p className="inline-error">请先在设置中填写模型 ID。</p> : null}
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
  </section>;
}

export function PaperMapPanel({
  paperId,
  paperVersionId,
  model,
  documentIndex,
  paperMap,
  stalePaperMap,
  anchors,
  onGenerate,
  onJumpBlock,
  onIncludeBlock,
}: PaperMapPanelProps) {
  const [goal, setGoal] = useState<ReadingGoal>('triage');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [includingBlockId, setIncludingBlockId] = useState<string | null>(null);
  useEffect(() => {
    setGoal('triage');
    setError(null);
    setRegenerateOpen(false);
  }, [paperId, paperVersionId]);

  const blockById = useMemo(
    () => new Map((documentIndex?.blocks ?? []).map((block) => [block.id, block])),
    [documentIndex],
  );
  const stale = Boolean(
    paperMap
    && documentIndex
    && (!paperMapMatchesIndex(paperMap, paperVersionId, documentIndex) || stalePaperMap),
  ) || Boolean(paperMap && stalePaperMap);
  const orderedNodes = useMemo(
    () => paperMap && !stale ? orderPaperMapNodes(paperMap.nodes, goal) : [],
    [goal, paperMap, stale],
  );

  const generate = async (confirmed: true) => {
    if (!documentIndex) return;
    setPending(true);
    setError(null);
    try {
      await onGenerate(documentIndex, confirmed);
      setRegenerateOpen(false);
    } catch (reason) {
      setError(messageFromUnknown(reason, '论证地图生成失败。'));
    } finally {
      setPending(false);
    }
  };

  const includeBlock = async (block: DocumentBlock) => {
    if (!documentIndex) return;
    setIncludingBlockId(block.id);
    setError(null);
    try {
      await onIncludeBlock(block, documentIndex);
    } catch (reason) {
      setError(messageFromUnknown(reason, '证据未能纳入 Anchor。'));
    } finally {
      setIncludingBlockId(null);
    }
  };

  return <>
    <header className="panel-intro">
      <small>AI argument map · evidence bound</small>
      <h2>先看懂论证，再决定怎么读。</h2>
      <p>AI 负责铺出结构；每条证据仍由本地 Block 解析原文、页码与坐标，只有你点击时才回到 PDF。</p>
    </header>

    {!documentIndex ? <div className="paper-map-state" role="status"><LoaderCircle className="spin" size={18} /><div><strong>正在本地建立可回跳的全文索引…</strong><p>索引完成前不会连接模型，也不会发送部分论文。</p></div></div> : null}

    {documentIndex && stale ? <div className="paper-map-state is-stale" role="alert"><AlertTriangle size={18} /><div><strong>论证地图已过期</strong><p>PDF 版本、解析器或 Block 引用已经变化；旧地图不能回跳或纳入证据，请重新生成。</p></div></div> : null}

    {documentIndex && (!paperMap || stale || regenerateOpen) ? <ConsentCard
      paperVersionId={paperVersionId}
      model={model}
      documentIndex={documentIndex}
      pending={pending}
      error={error}
      onGenerate={generate}
    /> : null}

    {documentIndex && paperMap && !stale && !regenerateOpen ? <>
      <div className="paper-map-ready">
        <span><Check size={14} />地图已生成 · {paperMap.nodes.length} 个节点</span>
        <button type="button" onClick={() => { setRegenerateOpen(true); setError(null); }}>重新生成</button>
      </div>
      <label className="paper-map-goal">
        <span>这次阅读的目标</span>
        <select aria-label="这次阅读的目标" value={goal} onChange={(event) => setGoal(event.target.value as ReadingGoal)}>
          {Object.entries(goalLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
        <small>只在本地重排路线，不会再次调用模型。</small>
      </label>
      <div className="paper-map-list">
        {orderedNodes.map((node, nodeIndex) => {
          const firstBlock = node.evidenceGroups
            .flatMap((group) => group.blockIds)
            .map((blockId) => blockById.get(blockId))
            .find((block): block is DocumentBlock => Boolean(block));
          return <article className={`paper-map-node is-${node.kind}`} key={node.id}>
            <header><span>{String(nodeIndex + 1).padStart(2, '0')} · {nodeKindLabels[node.kind]}</span><button type="button" disabled={!firstBlock} onClick={() => firstBlock && onJumpBlock(firstBlock)}>回到首条证据 <ChevronRight size={13} /></button></header>
            <h3>{node.title}</h3>
            <p>{node.summary}</p>
            <div className="paper-map-evidence-groups">
              {node.evidenceGroups.map((group) => <section className="paper-map-evidence" key={group.id}>
                <strong>{group.label}</strong>
                {group.blockIds.map((blockId) => {
                  const block = blockById.get(blockId);
                  if (!block) return <p className="inline-error" key={blockId}>Block 缺失：{blockId}</p>;
                  const included = anchors.some((anchor) =>
                    anchor.semanticElementId === block.id
                    || (anchor.pageIndex === block.page - 1 && anchor.selectedText === block.text && sameBox(anchor.bboxNorm, block.bbox)),
                  );
                  return <div className="paper-map-evidence__block" key={block.id}>
                    <p>{block.text}</p>
                    <div><button type="button" onClick={() => onJumpBlock(block)}>查看 p.{block.page}</button><button type="button" disabled={included || includingBlockId === block.id} onClick={() => void includeBlock(block)}>{included ? '已纳入证据' : includingBlockId === block.id ? '正在纳入…' : '纳入证据'}</button></div>
                  </div>;
                })}
              </section>)}
            </div>
          </article>;
        })}
      </div>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      <p className="paper-map-provenance"><MapIcon size={13} />{paperMap.model} · {new Date(paperMap.generatedAt).toLocaleString()}</p>
    </> : null}
  </>;
}
