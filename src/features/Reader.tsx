import { useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  FileText,
  GitBranch,
  Highlighter,
  Import,
  Link2,
  Save,
  Undo2,
} from 'lucide-react';
import {
  claims,
  defaultUserNote,
  outline,
  type DemoClaim,
  type DemoPaper,
} from '../data/demo';
import { LocalPdfViewer, type LocalPdfAnchor } from './LocalPdfViewer';

export type ReviewStatus = 'draft' | 'accepted' | 'edited' | 'rejected' | 'stale';

interface ReaderProps {
  paper: DemoPaper;
  review: Record<string, ReviewStatus>;
  editedClaims: Record<string, string>;
  note: string;
  localFile: File | null;
  localAnchors: LocalPdfAnchor[];
  onBack: () => void;
  onOpenSync: () => void;
  onReview: (claimId: string, status: ReviewStatus, text?: string) => void;
  onNoteChange: (value: string) => void;
  onImportFile: (file: File) => void;
  onAnchorCreate: (anchor: LocalPdfAnchor) => void;
}

type ReaderTab = 'guide' | 'ledger' | 'notes' | 'ask';

const sourceLabels: Record<DemoClaim['source'], string> = {
  author_claim: '作者主张',
  reported_result: '报告结果',
  ai_inference: 'AI 推断',
};

export function Reader({
  paper,
  review,
  editedClaims,
  note,
  localFile,
  localAnchors,
  onBack,
  onOpenSync,
  onReview,
  onNoteChange,
  onImportFile,
  onAnchorCreate,
}: ReaderProps) {
  const [tab, setTab] = useState<ReaderTab>('guide');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const verified = claims.filter((claim) => {
    const status = review[claim.id] ?? 'draft';
    return status === 'accepted' || status === 'edited';
  }).length;
  const pending = claims.filter((claim) => (review[claim.id] ?? 'draft') === 'draft').length;

  function jumpToAnchor(anchorId: string) {
    const target = document.getElementById(anchorId);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.classList.add('anchor-flash');
    window.setTimeout(() => target?.classList.remove('anchor-flash'), 1200);
  }

  function submitQuestion() {
    if (!question.trim()) return;
    setAnswer(
      '演示回答：这篇论文直接限定的是“观察指标能否证明离散相变”，而不是证明所有能力变化都必然平滑。此回答来自合成阅读样例，不是模型调用或论文原文。',
    );
  }

  return (
    <div className="reader-shell">
      <header className="reader-toolbar">
        <button className="icon-button" onClick={onBack} aria-label="返回阅读路径">
          <ArrowLeft size={17} />
        </button>
        <div className="reader-title">
          <strong>{localFile?.name ?? paper.title}</strong>
          <span>
            {localFile
              ? '本地 PDF · 未上传 · 浏览器会话'
              : `${paper.authors} · ${paper.year} · ${paper.venue} · published version`}
          </span>
        </div>
        <div className="reader-toolbar-status">
          <span className="save-state"><span className="status-dot" /> 本地已保存</span>
          <span>{verified} Verified · {pending} 待审阅</span>
        </div>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImportFile(file);
            event.target.value = '';
          }}
        />
        <button className="secondary-button small-button" onClick={() => fileInputRef.current?.click()}>
          <Import size={15} /> 导入本地 PDF
        </button>
        <button className="primary-button small-button" onClick={onOpenSync}>
          <GitBranch size={15} /> 导出预览
        </button>
      </header>

      <div className="reader-grid">
        <aside className="reader-left" aria-label="论文导航">
          <div className="left-tabs" role="tablist" aria-label="论文导航视图">
            <button className="active" role="tab" aria-selected="true">目录</button>
            <button role="tab" aria-selected="false">缩略图</button>
            <button role="tab" aria-selected="false">搜索</button>
          </div>
          <div className="reader-context">
            <span>当前阅读路径</span>
            <strong>LLM 涌现能力争议 · 反方视角</strong>
            <p>论证部分涌现曲线可能由评测指标产生。</p>
          </div>
          <nav className="outline" aria-label="论文目录">
            {localFile ? (
              <div className="local-outline-note">
                <FileText size={18} />
                <strong>本地 PDF</strong>
                <span>本轮技术切片使用 PDF.js 文本层；Docling 章节树尚未接入。</span>
              </div>
            ) : (
              outline.map(([label, anchorId, page], index) => (
                <button
                  key={`${label}-${anchorId}`}
                  className={`outline-item ${index === 0 ? 'active' : ''} ${label.includes('.') ? 'level-2' : ''}`}
                  onClick={() => jumpToAnchor(anchorId)}
                >
                  <span>{label}</span><span className="page-num">{page}</span>
                </button>
              ))
            )}
          </nav>
        </aside>

        <main className="paper-stage" aria-label="论文阅读区">
          {localFile ? (
            <LocalPdfViewer file={localFile} onAnchorCreate={onAnchorCreate} />
          ) : (
            <SyntheticPaper />
          )}
        </main>

        <aside className="research-panel" aria-label="研究工作区">
          <div className="research-tabs" role="tablist" aria-label="研究工具">
            {([
              ['guide', '阅读导引'],
              ['ledger', '证据账本'],
              ['notes', '我的笔记'],
              ['ask', '提问'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                className={tab === key ? 'active' : ''}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
              >
                {label}
                {key === 'ledger' && pending ? <span className="tab-count">{pending}</span> : null}
              </button>
            ))}
          </div>
          <div className="research-content">
            {tab === 'guide' ? (
              <GuidePanel pending={pending} onOpenLedger={() => setTab('ledger')} onJump={jumpToAnchor} />
            ) : null}
            {tab === 'ledger' ? (
              <LedgerPanel
                review={review}
                editedClaims={editedClaims}
                editingId={editingId}
                setEditingId={setEditingId}
                onReview={onReview}
                onJump={jumpToAnchor}
              />
            ) : null}
            {tab === 'notes' ? (
              <NotesPanel
                note={note || defaultUserNote}
                localAnchors={localAnchors}
                onChange={onNoteChange}
              />
            ) : null}
            {tab === 'ask' ? (
              <AskPanel
                question={question}
                answer={answer}
                onQuestion={setQuestion}
                onSubmit={submitQuestion}
                onJump={jumpToAnchor}
              />
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function SyntheticPaper() {
  return (
    <div className="paper-pages">
      <article className="paper-page" aria-label="合成论文第 1 页">
        <header className="paper-header">
          <h1>Are Emergent Abilities of Large<br />Language Models a Mirage?</h1>
          <p>Schaeffer, Miranda &amp; Koyejo</p>
          <small>Interactive prototype paper view · synthetic text, not the original publication</small>
        </header>
        <section id="anchor-abstract" className="paper-abstract">
          <h2>Abstract</h2>
          <p>
            <mark>We investigate how claims about LLM 涌现能力争议 depend on the relationship between an underlying capability and the metric used to observe it.</mark>{' '}
            Using controlled comparisons and re-analysis, the paper separates direct empirical observations from interpretations about qualitative transitions.
          </p>
        </section>
        <div className="paper-columns">
          <div>
            <section id="anchor-introduction">
              <h2>1 Introduction</h2>
              <p>Large models often exhibit performance changes that attract strong interpretations. Yet a plotted discontinuity can reflect a change in the system, a threshold in the metric, or an interaction between data, prompting and evaluation.</p>
              <p id="anchor-background"><mark>The central question is not merely whether a score changes rapidly, but whether the evidence supports a distinct underlying transition under comparable conditions.</mark></p>
            </section>
            <section><h2>2 Background</h2><p>Prior work characterizes scaling with empirical curves and task-level evaluations. A binary exact-match metric, for example, may remain at zero until performance crosses a threshold.</p></section>
          </div>
          <div>
            <figure className="paper-figure">
              <div className="figure-flow"><span>Model scale</span><ChevronRight size={14} /><span>Latent capability</span><ChevronRight size={14} /><span>Observed metric</span></div>
              <figcaption>Figure 1. Conceptual separation between scale, latent capability and the reported evaluation metric.</figcaption>
            </figure>
            <section id="anchor-method"><h2>3 Method</h2><p>We compare multiple transformations of the same underlying performance signal and retain task definition, model checkpoints and evaluation examples where possible.</p></section>
            <p id="anchor-measurement" className="paper-formula">m(x) = g(c(x)) + ε</p>
          </div>
        </div>
      </article>
      <article className="paper-page second-page" aria-label="合成论文第 2 页">
        <h2 id="anchor-results">4 Experiments</h2>
        <p><mark>Across controlled metric transformations, several apparent discontinuities become smoother without changing the underlying model outputs.</mark> This observation is limited to evaluated tasks and does not establish universal smoothness.</p>
        <div id="anchor-table" className="paper-table">
          <div><strong>Metric</strong><strong>Observed transition</strong><strong>Interpretation</strong></div>
          <div><span>Exact match</span><span>Abrupt</span><span>Threshold-sensitive</span></div>
          <div><span>Continuous score</span><span>Gradual</span><span>More predictable</span></div>
        </div>
        <h2 id="anchor-limitations">5 Limitations</h2>
        <p>The analysis cannot prove that every capability changes smoothly. Different model families, training data and prompting strategies remain incompletely comparable.</p>
        <h2 id="anchor-references">References</h2>
        <p className="paper-references">[1] Synthetic reference list retained solely for interaction verification.</p>
      </article>
    </div>
  );
}

function GuidePanel({
  pending,
  onOpenLedger,
  onJump,
}: {
  pending: number;
  onOpenLedger: () => void;
  onJump: (anchor: string) => void;
}) {
  const steps = [
    ['anchor-abstract', '摘要', '确认研究问题与证据范围'],
    ['anchor-table', 'Table 2', '比较离散指标与连续指标'],
    ['anchor-results', '主实验', '检查“部分任务”是否被过度泛化'],
    ['anchor-limitations', '局限', '区分作者承认与 AI 推断'],
  ] as const;
  return (
    <>
      <div className="panel-intro">
        <small>PRE-READ · SYNTHETIC SAMPLE</small>
        <h2>先形成阅读假设，再去核验证据。</h2>
        <p>这不是最终总结。以下导引使用合成文本验证交互，真实模型与解析器尚未配置。</p>
      </div>
      <section className="guide-card">
        <div className="guide-card-title"><CircleAlert size={16} /><strong>为什么在当前路径中</strong></div>
        <p>这篇论文审查“观察指标是否足以证明离散相变”，是平衡阅读包中的方法学反方。</p>
      </section>
      <section className="guide-card">
        <div className="guide-card-title"><Link2 size={16} /><strong>推荐阅读路径</strong></div>
        <div className="guide-steps">
          {steps.map(([anchor, title, detail], index) => (
            <button key={anchor} className="guide-step" onClick={() => onJump(anchor)}>
              <span className="step-num">{index + 1}</span>
              <span><strong>{title}</strong><span>{detail}</span></span>
            </button>
          ))}
        </div>
      </section>
      <button className="primary-button full-button" onClick={onOpenLedger}>
        查看 {pending} 条待审阅 Claim <ChevronRight size={15} />
      </button>
    </>
  );
}

interface LedgerPanelProps {
  review: Record<string, ReviewStatus>;
  editedClaims: Record<string, string>;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onReview: (claimId: string, status: ReviewStatus, text?: string) => void;
  onJump: (anchor: string) => void;
}

function LedgerPanel({ review, editedClaims, editingId, setEditingId, onReview, onJump }: LedgerPanelProps) {
  const verified = claims.filter((claim) => ['accepted', 'edited'].includes(review[claim.id] ?? 'draft')).length;
  return (
    <>
      <div className="panel-intro">
        <small>EVIDENCE LEDGER</small>
        <h2>AI 提案不是你的知识。</h2>
        <p>逐条核查原文、范围和认知来源；只有接受或编辑后的内容进入知识库。</p>
      </div>
      <div className="review-summary" aria-label={`${verified} / ${claims.length} 已验证`}>
        <div><strong>{verified} / {claims.length} 已验证</strong><span>事实与 AI 推断不支持批量接受</span></div>
        <span>{Math.round((verified / claims.length) * 100)}%</span>
      </div>
      <div className="claim-list">
        {claims.map((claim) => {
          const status = review[claim.id] ?? 'draft';
          const text = editedClaims[claim.id] ?? claim.claimText;
          const isEditing = editingId === claim.id;
          return (
            <article key={claim.id} className={`claim-card ${status}`}>
              <div className="claim-meta">
                <span>{sourceLabels[claim.source]} · {claim.claimType.toUpperCase()} · {Math.round(claim.confidence * 100)}%</span>
                <span className={`review-badge ${status}`}>{status === 'accepted' ? 'Verified' : status === 'edited' ? 'Verified · edited' : status}</span>
              </div>
              {isEditing ? (
                <textarea id={`claim-edit-${claim.id}`} className="claim-editor" defaultValue={text} aria-label="编辑 Claim" />
              ) : (
                <p className="claim-text">{text}</p>
              )}
              <div className="anchor-row">
                {claim.anchorIds.map((anchorId) => (
                  <button key={anchorId} className="anchor-chip" onClick={() => onJump(anchorId)}>
                    {anchorId === 'anchor-table' ? 'p.2 · table' : anchorId === 'anchor-limitations' ? 'p.2 · limitations' : anchorId === 'anchor-results' ? 'p.2 · results' : 'p.1 · abstract'}
                  </button>
                ))}
              </div>
              <div className="scope-note">范围：{claim.scope}</div>
              <div className="claim-actions">
                {isEditing ? (
                  <>
                    <button className="accept" onClick={() => {
                      const input = document.getElementById(`claim-edit-${claim.id}`) as HTMLTextAreaElement | null;
                      onReview(claim.id, 'edited', input?.value.trim() || text);
                      setEditingId(null);
                    }}><Save size={13} /> 保存并验证</button>
                    <button onClick={() => setEditingId(null)}>取消</button>
                  </>
                ) : status === 'draft' || status === 'stale' ? (
                  <>
                    <button className="accept" onClick={() => onReview(claim.id, 'accepted')}><Check size={13} />接受</button>
                    <button onClick={() => setEditingId(claim.id)}>编辑</button>
                    <button className="reject" onClick={() => onReview(claim.id, 'rejected')}>驳回</button>
                  </>
                ) : (
                  <>
                    <span className="reviewed-note">{status === 'rejected' ? '已驳回，不进入知识库' : '已进入 Verified 知识'}</span>
                    <button onClick={() => onReview(claim.id, 'draft')}><Undo2 size={13} />撤销</button>
                  </>
                )}
                <span className="spacer" />
                <button onClick={() => onJump(claim.anchorIds[0] ?? '')}>查看原文</button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function NotesPanel({ note, localAnchors, onChange }: { note: string; localAnchors: LocalPdfAnchor[]; onChange: (value: string) => void }) {
  return (
    <>
      <div className="panel-intro">
        <small>USER-OWNED NOTES</small>
        <h2>你的解释与 AI 草稿永久区分。</h2>
        <p>内容保存在本机浏览器工作区；正式桌面版将由 SQLite 管理。</p>
      </div>
      {localAnchors.length ? (
        <section className="local-anchor-list">
          <strong><Highlighter size={14} /> 本轮创建的 Anchor</strong>
          {localAnchors.map((anchor) => (
            <div key={anchor.id}><span>p.{anchor.pageIndex + 1}</span><p>{anchor.selectedText}</p></div>
          ))}
        </section>
      ) : null}
      <div className="editor-toolbar"><span>Markdown</span><span className="autosave">本地自动保存</span></div>
      <textarea className="notes-editor" value={note} onChange={(event) => onChange(event.target.value)} aria-label="我的论文笔记" />
    </>
  );
}

function AskPanel({
  question,
  answer,
  onQuestion,
  onSubmit,
  onJump,
}: {
  question: string;
  answer: string | null;
  onQuestion: (value: string) => void;
  onSubmit: () => void;
  onJump: (anchor: string) => void;
}) {
  return (
    <>
      <div className="panel-intro">
        <small>ASK · NO MODEL CONNECTED</small>
        <h2>问题范围要先于回答。</h2>
        <p>当前回答为显式演示文案；配置 BYOK 前不会向外部 Provider 发送任何内容。</p>
      </div>
      <div className="suggested-questions">
        {['这篇真正反驳了什么？', 'Table 2 的结论能否外推？', '与基石论文的定义有何不同？'].map((value) => (
          <button key={value} onClick={() => onQuestion(value)}>{value}</button>
        ))}
      </div>
      {answer ? (
        <div className="chat-message ai">
          {answer}
          <div className="chat-citations">
            <button className="anchor-chip" onClick={() => onJump('anchor-results')}>p.2 · results</button>
            <button className="anchor-chip" onClick={() => onJump('anchor-limitations')}>p.2 · limitations</button>
          </div>
        </div>
      ) : null}
      <div className="ask-box">
        <textarea value={question} onChange={(event) => onQuestion(event.target.value)} placeholder="询问方法、证据、范围或与已读论文的差异…" aria-label="向阅读工作区提问" />
        <div className="ask-actions">
          <select aria-label="问题证据范围"><option>当前论文＋Verified 主题</option><option>当前章节</option><option>当前选区</option></select>
          <button className="primary-button small-button" onClick={onSubmit}>生成演示回答</button>
        </div>
      </div>
    </>
  );
}
