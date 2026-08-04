import { BookOpen, Check, Clock3, FileText, LocateFixed, Pause, Play, RotateCcw, Save, Sparkles } from 'lucide-react'
import { checkpoints, currentPaper } from '../data.js'
import { Eyebrow, ProgressBar, StatusPill } from '../components/Primitives.jsx'

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainder = (seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remainder}`
}

export default function ReaderPage({ session, setSession, onSave, onOpenEvidence }) {
  const active = checkpoints.find((item) => item.id === session.activeCheckpoint)
  const update = (patch) => setSession((current) => ({ ...current, ...patch }))
  const toggleComplete = () => {
    setSession((current) => ({
      ...current,
      completed: current.completed.includes(active.id)
        ? current.completed.filter((id) => id !== active.id)
        : [...current.completed, active.id],
    }))
  }

  return (
    <div className="page reader-page">
      <section className="reader-titlebar">
        <div>
          <div className="reader-kicker"><StatusPill tone="amber">待验证</StatusPill><span>{currentPaper.depthLabel} · {currentPaper.scheduled}</span></div>
          <h1>{currentPaper.shortTitle}</h1>
          <p>{currentPaper.title}</p>
        </div>
        <div className="timer-card">
          <div><Clock3 size={17} /><span>{formatTime(session.seconds)}</span></div>
          <button className="icon-button solid" onClick={() => update({ running: !session.running })} aria-label={session.running ? '暂停计时' : '开始计时'}>
            {session.running ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
          </button>
          <button className="icon-button" onClick={() => update({ seconds: 0, running: false })} aria-label="重置计时"><RotateCcw size={16} /></button>
        </div>
      </section>

      <div className="reader-workspace">
        <aside className="checkpoint-rail panel">
          <Eyebrow>精读检查点</Eyebrow>
          <div className="checkpoint-progress"><strong>{session.completed.length}/5</strong><span>已完成</span></div>
          <ProgressBar value={session.completed.length} max={5} label="检查点进度" />
          <nav>
            {checkpoints.map((item, index) => (
              <button key={item.id} className={session.activeCheckpoint === item.id ? 'active' : ''} onClick={() => update({ activeCheckpoint: item.id })}>
                <span className={session.completed.includes(item.id) ? 'done' : ''}>{session.completed.includes(item.id) ? <Check size={13} /> : index + 1}</span>
                <span><strong>{item.label}</strong><small>{item.hint}</small></span>
              </button>
            ))}
          </nav>
          <div className="rail-note"><Sparkles size={17} /><p>Codex 辅助内容只作为候选。完成状态必须来自你的阅读与核对。</p></div>
        </aside>

        <article className="paper-stage">
          <div className="paper-toolbar"><span><FileText size={16} />论文定位区</span><span>示意内容 · 非论文原文</span></div>
          <div className="paper-sheet">
            <span className="paper-page-number">6</span>
            <p className="paper-journal">NEURIPS 2022 · READING VIEW</p>
            <h2>{currentPaper.title}</h2>
            <p className="paper-authors">{currentPaper.authors}</p>
            <div className="paper-columns">
              <div>
                <h3>3. Method overview</h3>
                <p>此区域用于阅读时定位论文段落。原型不嵌入论文全文，也不会生成替代摘要。</p>
                <p>打开真实 PDF 后，可把章节、图表与页码记录到右侧证据定位器。</p>
                <div className="paper-lines">{Array.from({ length: 8 }).map((_, index) => <i key={index} style={{ width: `${92 - (index % 3) * 8}%` }} />)}</div>
              </div>
              <figure className="method-figure">
                <figcaption>Figure 2 · 待读者核对</figcaption>
                <div className="pipeline"><span>SFT</span><b>→</b><span>RM</span><b>→</b><span>PPO</span></div>
                <div className="pipeline-sub"><span>demonstrations</span><span>preferences</span><span>policy</span></div>
              </figure>
            </div>
            <div className="paper-disclaimer"><BookOpen size={15} /> 原型仅展示阅读布局与定位流程，所有结论都保持“待验证”。</div>
          </div>
        </article>

        <aside className="note-panel panel">
          <div className="note-panel-head"><div><Eyebrow>当前检查点</Eyebrow><h2>{active.label}</h2></div><StatusPill tone="blue">草稿</StatusPill></div>
          <label className="field-label" htmlFor="reading-note">用自己的话记录</label>
          <textarea id="reading-note" value={session.note} onChange={(event) => update({ note: event.target.value })} placeholder="先关闭论文，用 3–5 句话写下你能重建的论证……" />

          <fieldset className="epistemic-field">
            <legend>认识状态</legend>
            {[
              ['author', '作者结论'],
              ['inference', '我的推断'],
              ['pending', '待验证'],
            ].map(([id, label]) => (
              <button key={id} className={session.mode === id ? 'active' : ''} onClick={() => update({ mode: id })}>{label}</button>
            ))}
          </fieldset>

          <div className="locator-block">
            <div className="field-label"><LocateFixed size={15} />证据定位</div>
            <div className="locator-grid">
              <label><span>章节</span><input value={session.locators.section} onChange={(event) => update({ locators: { ...session.locators, section: event.target.value } })} placeholder="如 3.5" /></label>
              <label><span>图 / 表</span><input value={session.locators.figure} onChange={(event) => update({ locators: { ...session.locators, figure: event.target.value } })} placeholder="如 Figure 2" /></label>
              <label><span>页码</span><input value={session.locators.page} onChange={(event) => update({ locators: { ...session.locators, page: event.target.value } })} placeholder="如 6" /></label>
            </div>
          </div>

          <button className={`completion-toggle ${session.completed.includes(active.id) ? 'active' : ''}`} onClick={toggleComplete}>
            <span>{session.completed.includes(active.id) ? <Check size={15} /> : null}</span>我已亲自完成这个检查点
          </button>
          <button className="button button-primary full" onClick={onSave}><Save size={16} />保存当前草稿</button>
          <button className="button button-secondary full" onClick={onOpenEvidence}>把候选连接送入证据画布</button>
        </aside>
      </div>
    </div>
  )
}
