import { ArrowRight, CircleHelp, Network, Plus, Target, X } from 'lucide-react'
import { useState } from 'react'
import { cycle, papers, synthesisQuestions } from '../data.js'
import { Eyebrow, StatusPill } from '../components/Primitives.jsx'

const axes = [
  { name: '训练目标', description: '偏好代理、优化约束与能力保留', papers: ['InstructGPT', 'PPO', 'DPO', 'DeepSeek-R1'] },
  { name: '交互环境', description: '工具、记忆、轨迹与反馈信用分配', papers: ['ReAct', 'Toolformer', 'Reflexion', 'MemGPT'] },
  { name: '评测方式', description: '静态基准、多轮任务与外推边界', papers: ['AgentBench', 'τ-bench'] },
]

export default function SynthesisPage({ questions, setQuestions, onNavigate }) {
  const [adding, setAdding] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const addQuestion = () => {
    if (!newQuestion.trim()) return
    setQuestions((items) => [...items, newQuestion.trim()])
    setNewQuestion('')
    setAdding(false)
  }

  return (
    <div className="page synthesis-page">
      <section className="synthesis-hero">
        <Eyebrow>{cycle.id} · 周期综合</Eyebrow>
        <h1>{cycle.question}</h1>
        <div className="synthesis-meta"><span>{papers.length} 篇核心论文</span><span>10 周阅读周期</span><span>当前 W01</span><StatusPill tone="amber">尚无综合结论</StatusPill></div>
      </section>

      <section className="synthesis-section">
        <div className="section-heading"><div><Eyebrow>分析骨架</Eyebrow><h2>三个解释轴</h2></div><p>同一可靠性失败可能同时跨越模型、环境和评测边界。</p></div>
        <div className="axis-cards">
          {axes.map((axis, index) => (
            <article key={axis.name} className="axis-card">
              <span className="axis-number">0{index + 1}</span>
              <Target size={20} />
              <h3>{axis.name}</h3><p>{axis.description}</p>
              <div>{axis.papers.map((paper) => <span key={paper}>{paper}</span>)}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="synthesis-grid">
        <article className="panel open-questions">
          <div className="panel-heading"><div><Eyebrow>开放问题</Eyebrow><h2>需要周期证据回答</h2></div><CircleHelp size={20} /></div>
          <ol>
            {questions.map((question, index) => <li key={`${question}-${index}`}><span>{(index + 1).toString().padStart(2, '0')}</span><p>{question}</p><StatusPill tone="amber">待回答</StatusPill></li>)}
          </ol>
          {adding ? (
            <div className="add-question"><input autoFocus value={newQuestion} onChange={(event) => setNewQuestion(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addQuestion()} placeholder="输入新的可检验问题" /><button className="icon-button solid" onClick={addQuestion}><ArrowRight size={16} /></button><button className="icon-button" onClick={() => setAdding(false)}><X size={16} /></button></div>
          ) : <button className="text-button" onClick={() => setAdding(true)}><Plus size={15} />添加开放问题</button>}
        </article>

        <aside className="synthesis-side">
          <article className="panel evidence-readiness">
            <Eyebrow>综合就绪度</Eyebrow><div className="readiness-ring"><strong>0%</strong></div><p>完成至少 3 篇深读并建立跨论文连接后，再形成阶段性综合。</p>
          </article>
          <article className="panel map-legend"><Network size={19} /><h3>知识图谱规则</h3><p>候选连接 → 原文定位 → 原创解释 → 反例检查 → 已验证。</p><button className="text-button" onClick={() => onNavigate('evidence')}>前往证据画布 <ArrowRight size={14} /></button></article>
        </aside>
      </section>
    </div>
  )
}
