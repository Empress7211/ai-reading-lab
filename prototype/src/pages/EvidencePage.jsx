import { ArrowRight, CheckCircle2, Link2, LocateFixed, Network, ShieldCheck } from 'lucide-react'
import { proposedConnections } from '../data.js'
import { EmptyState, Eyebrow, StatusPill } from '../components/Primitives.jsx'

const lanes = ['训练目标', '交互环境', '评测方式']

export default function EvidencePage({ connections, setConnections, selectedId, setSelectedId, onPromote }) {
  const selected = connections.find((item) => item.id === selectedId) || connections[0]
  const updateSelected = (patch) => {
    setConnections((items) => items.map((item) => item.id === selected.id ? { ...item, ...patch } : item))
  }
  const verified = connections.filter((item) => item.status === 'verified').length

  return (
    <div className="page evidence-page">
      <section className="page-intro compact-intro">
        <div><Eyebrow>证据画布</Eyebrow><h1>让每条连接都能回到证据。</h1><p>先记录来源、定位与自己的解释，再把候选连接提升为“已验证”。</p></div>
        <div className="evidence-counter"><strong>{verified}</strong><span>已验证</span><small>{proposedConnections.length - verified} 条仍待核对</small></div>
      </section>

      <div className="evidence-layout">
        <section className="evidence-canvas">
          <div className="source-node">
            <span>当前论文</span><strong>InstructGPT</strong><small>Ouyang et al. · 2022</small>
          </div>
          <div className="connection-line" />
          <div className="lane-grid">
            {lanes.map((lane) => (
              <div className="evidence-lane" key={lane}>
                <div className="lane-title"><span />{lane}</div>
                {connections.filter((item) => item.lane === lane).map((item) => (
                  <button key={item.id} className={`evidence-node ${selected.id === item.id ? 'selected' : ''} ${item.status === 'verified' ? 'verified' : ''}`} onClick={() => setSelectedId(item.id)}>
                    <span className="node-icon">{item.status === 'verified' ? <CheckCircle2 size={16} /> : <Link2 size={16} />}</span>
                    <strong>{item.title}</strong>
                    <small><LocateFixed size={12} />{item.locator}</small>
                    <StatusPill tone={item.status === 'verified' ? 'green' : 'amber'}>{item.status === 'verified' ? '已验证' : '待验证'}</StatusPill>
                  </button>
                ))}
                {connections.filter((item) => item.lane === lane).length === 0 ? <EmptyState icon={Network} title="暂无线索" description="阅读后可从右侧添加。" /> : null}
              </div>
            ))}
          </div>
        </section>

        <aside className="evidence-inspector panel">
          <Eyebrow>候选连接</Eyebrow>
          <h2>{selected.title}</h2>
          <p className="inspector-prompt">{selected.prompt}</p>
          <label className="field-label" htmlFor="connection-note">你的解释</label>
          <textarea id="connection-note" value={selected.note} onChange={(event) => updateSelected({ note: event.target.value })} placeholder="这条连接为什么成立？可能在哪些条件下失效？" />
          <label className="field-label" htmlFor="connection-locator">证据定位</label>
          <div className="input-with-icon"><LocateFixed size={15} /><input id="connection-locator" value={selected.locator} onChange={(event) => updateSelected({ locator: event.target.value })} /></div>
          <div className="verification-rules">
            <strong><ShieldCheck size={16} />提升条件</strong>
            <span className={selected.note.trim().length >= 20 ? 'met' : ''}>至少 20 字的原创解释</span>
            <span className={selected.locator.trim() ? 'met' : ''}>可返回原文的章节 / 图表 / 页码</span>
          </div>
          <button className="button button-primary full" disabled={selected.note.trim().length < 20 || !selected.locator.trim() || selected.status === 'verified'} onClick={() => onPromote(selected.id)}>
            {selected.status === 'verified' ? '已提升为验证连接' : <>提升为已验证 <ArrowRight size={16} /></>}
          </button>
          <p className="helper-note">“已验证”只表示你完成了定位与解释，不代表结论可无条件外推。</p>
        </aside>
      </div>
    </div>
  )
}
