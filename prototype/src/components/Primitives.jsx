import { Check, ChevronRight } from 'lucide-react'

export function Eyebrow({ children }) {
  return <p className="eyebrow">{children}</p>
}

export function StatusPill({ tone = 'neutral', children }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>
}

export function ProgressBar({ value, max = 100, label }) {
  const percentage = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="progress-block" aria-label={label}>
      <div className="progress-track">
        <span style={{ width: `${percentage}%` }} />
      </div>
      {label ? <span className="sr-only">{label}：{percentage}%</span> : null}
    </div>
  )
}

export function Metric({ label, value, detail }) {
  return (
    <div className="metric">
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
      {detail ? <span className="metric-detail">{detail}</span> : null}
    </div>
  )
}

export function StepRow({ checked, title, detail, meta, onClick }) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper className={`step-row ${checked ? 'is-done' : ''}`} onClick={onClick}>
      <span className="step-check">{checked ? <Check size={14} strokeWidth={2.6} /> : null}</span>
      <span className="step-copy">
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {meta ? <span className="step-meta">{meta}</span> : null}
      {onClick ? <ChevronRight size={16} /> : null}
    </Wrapper>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty-state">
      {Icon ? <Icon size={22} /> : null}
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  )
}
