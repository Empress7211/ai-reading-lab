import { Check, Clock3, Lightbulb, RotateCcw, Save, ShieldAlert } from 'lucide-react'
import { cycle, weeklyCommitments } from '../data.js'
import { Eyebrow, ProgressBar, StatusPill } from '../components/Primitives.jsx'

const prompts = [
  { key: 'insight', label: '本周最重要的发现', placeholder: '用自己的话写出一个改变了你判断的发现……' },
  { key: 'recall', label: '闭卷复述', placeholder: '不查资料，重建本周阅读或搭建过程中的关键逻辑……' },
  { key: 'unresolved', label: '仍未解决的问题', placeholder: '哪些地方证据不足、概念模糊或存在冲突？' },
  { key: 'difference', label: '辅助内容与我的理解有何差异', placeholder: '记录 Codex 建议中你不同意、修正或仍待验证的部分……' },
]

export default function WeeklyPage({ draft, setDraft, onSave }) {
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const completed = prompts.filter((item) => draft[item.key].trim()).length

  return (
    <div className="page weekly-page">
      <section className="page-intro compact-intro">
        <div><Eyebrow>{cycle.week} · {cycle.weekRange}</Eyebrow><h1>周结不是汇报，是校准。</h1><p>用事实回看投入，用闭卷复述检查理解，再决定下周是否调整。</p></div>
        <div className="weekly-status"><StatusPill tone="amber">草稿未提交</StatusPill><strong>{completed}/4</strong><small>反思项已填写</small></div>
      </section>

      <div className="weekly-layout">
        <section className="weekly-form panel">
          <div className="panel-heading"><div><Eyebrow>投入事实</Eyebrow><h2>本周实际投入</h2></div><Clock3 size={20} /></div>
          <label className="hours-input"><input type="number" min="0" max="20" step="0.5" value={draft.hours} onChange={(event) => update('hours', event.target.value)} /><span>小时</span><small>计划 {cycle.hours}</small></label>
          <div className="commitment-review">
            {weeklyCommitments.map((item) => <div key={item.id} className={item.done ? 'done' : ''}><span>{item.done ? <Check size={13} /> : null}</span><p>{item.label}</p><small>{item.done ? '完成' : '未完成'}</small></div>)}
          </div>

          <div className="reflection-grid">
            {prompts.map((item) => (
              <label key={item.key}><span>{item.label}</span><textarea value={draft[item.key]} onChange={(event) => update(item.key, event.target.value)} placeholder={item.placeholder} /></label>
            ))}
          </div>

          <label className="adjust-toggle"><input type="checkbox" checked={draft.adjust} onChange={(event) => update('adjust', event.target.checked)} /><span><strong>建议调整下周计划</strong><small>这只是建议；不会自动改变活跃周期、核心问题或成功标准。</small></span></label>
          <button className="button button-primary" onClick={onSave}><Save size={16} />保存周结草稿</button>
        </section>

        <aside className="weekly-aside">
          <article className="panel confidence-card">
            <Eyebrow>证据完整度</Eyebrow><strong>尚不可评估</strong><p>当前没有完成的论文笔记，因此不生成理解分数。</p>
            <ProgressBar value={0} max={4} label="证据完整度" />
          </article>
          <article className="panel guardrail-card"><ShieldAlert size={20} /><div><strong>诚实状态护栏</strong><p>辅助生成的文字、未定位的连接和空白复述都不会计入“已读”。</p></div></article>
          <article className="panel reset-card"><Lightbulb size={20} /><div><strong>下周建议</strong><p>完成基线自测后，再开始第一篇深读；维持 WIP = 1。</p></div><button className="text-button"><RotateCcw size={14} />查看基线模板</button></article>
        </aside>
      </div>
    </div>
  )
}
