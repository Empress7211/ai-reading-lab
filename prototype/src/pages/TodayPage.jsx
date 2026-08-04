import { ArrowRight, BookOpen, CalendarDays, CircleHelp, Clock3, Target } from 'lucide-react'
import { currentPaper, cycle, readingPlan, weeklyCommitments } from '../data.js'
import { Eyebrow, Metric, ProgressBar, StatusPill, StepRow } from '../components/Primitives.jsx'

export default function TodayPage({ onNavigate }) {
  const finishedCommitments = weeklyCommitments.filter((item) => item.done).length

  return (
    <div className="page today-page">
      <section className="page-intro split-intro">
        <div>
          <Eyebrow>今日工作台</Eyebrow>
          <h1>先把问题读清楚，<br />再决定相信什么。</h1>
          <p>本周是基础设施周。阅读状态保持为空，直到你亲自完成笔记、证据定位与闭卷复述。</p>
        </div>
        <div className="day-score" aria-label="今日完成度 0%">
          <div className="score-ring"><span>0<small>%</small></span></div>
          <div><strong>今日完成度</strong><small>预计投入 1.5 小时</small></div>
        </div>
      </section>

      <section className="today-grid">
        <article className="focus-card dark-card">
          <div className="focus-card-top">
            <div><Eyebrow>下一篇精读</Eyebrow><StatusPill tone="amber">待开始</StatusPill></div>
            <span className="paper-index">01</span>
          </div>
          <h2>{currentPaper.title}</h2>
          <p>{currentPaper.authors} · {currentPaper.venue} {currentPaper.year}</p>
          <div className="paper-tags">
            {currentPaper.topics.map((topic) => <span key={topic}>{topic}</span>)}
          </div>
          <div className="focus-meta">
            <span><BookOpen size={16} />{currentPaper.depthLabel}</span>
            <span><Clock3 size={16} />预计 90 分钟</span>
            <span><CalendarDays size={16} />复习 {currentPaper.nextReview}</span>
          </div>
          <button className="button button-invert" onClick={() => onNavigate('reader')}>进入专注研读 <ArrowRight size={17} /></button>
        </article>

        <article className="panel session-plan">
          <div className="panel-heading"><div><Eyebrow>一次精读</Eyebrow><h2>90 分钟阅读协议</h2></div><Clock3 size={20} /></div>
          <div className="timeline">
            {readingPlan.map((item, index) => (
              <div className="timeline-item" key={item.duration}>
                <span>{index + 1}</span>
                <div><strong>{item.title}</strong><small>{item.detail}</small></div>
                <b>{item.duration}</b>
              </div>
            ))}
          </div>
          <p className="helper-note">计时、检查点和草稿只保存在本地原型；不会将论文标记为已读。</p>
        </article>
      </section>

      <section className="metrics-row">
        <Metric value="0h" label="本周阅读" detail="目标 5–6h" />
        <Metric value="0/3" label="深读队列" detail="WIP 上限 1" />
        <Metric value="0" label="已验证连接" detail="候选 4 条" />
        <Metric value={`${finishedCommitments}/4`} label="基础设施" detail="本周承诺" />
      </section>

      <section className="two-column-section">
        <article className="panel research-question">
          <div className="panel-heading"><div><Eyebrow>{cycle.id}</Eyebrow><h2>周期核心问题</h2></div><CircleHelp size={20} /></div>
          <blockquote>{cycle.question}</blockquote>
          <div className="axis-list">
            <span><i />训练目标</span><span><i />交互环境</span><span><i />评测方式</span>
          </div>
          <button className="text-button" onClick={() => onNavigate('synthesis')}>打开周期综合 <ArrowRight size={15} /></button>
        </article>

        <article className="panel weekly-setup">
          <div className="panel-heading"><div><Eyebrow>{cycle.week}</Eyebrow><h2>本周承诺</h2></div><Target size={20} /></div>
          <div className="step-list">
            {weeklyCommitments.map((item) => <StepRow key={item.id} checked={item.done} title={item.label} />)}
          </div>
          <ProgressBar value={finishedCommitments} max={weeklyCommitments.length} label="本周承诺进度" />
          <button className="text-button" onClick={() => onNavigate('weekly')}>填写 W01 周结 <ArrowRight size={15} /></button>
        </article>
      </section>
    </div>
  )
}
