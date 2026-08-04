import {
  BookOpen,
  CalendarCheck,
  ChevronDown,
  Library,
  Menu,
  Network,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { currentDate, cycle } from '../data.js'
import { ProgressBar } from './Primitives.jsx'

const items = [
  { id: 'today', label: '今日阅读', icon: CalendarCheck },
  { id: 'reader', label: '专注研读', icon: BookOpen },
  { id: 'evidence', label: '证据画布', icon: Network },
  { id: 'library', label: '论文库', icon: Library },
  { id: 'weekly', label: '周结', icon: Sparkles },
  { id: 'synthesis', label: '周期综合', icon: Search },
]

function Navigation({ route, onNavigate, onClose }) {
  return (
    <nav className="primary-nav" aria-label="主要导航">
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={route === id ? 'active' : ''}
          onClick={() => {
            onNavigate(id)
            onClose?.()
          }}
        >
          <Icon size={18} strokeWidth={1.8} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

export default function AppShell({ route, onNavigate, children }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">研</span>
          <span><strong>Reading Lab</strong><small>可靠性研究工作台</small></span>
        </div>
        <Navigation route={route} onNavigate={onNavigate} />
        <div className="cycle-mini">
          <div className="cycle-mini-head"><span>{cycle.id}</span><strong>{cycle.week}</strong></div>
          <p>{cycle.title}</p>
          <ProgressBar value={0} max={10} label="本周期精读进度" />
          <small>精读 0 / 10 · 尚未开始</small>
        </div>
        <button className="profile-button" aria-label="打开个人菜单">
          <span className="avatar">S</span>
          <span><strong>个人研究空间</strong><small>Asia/Singapore</small></span>
          <ChevronDown size={15} />
        </button>
      </aside>

      <div className="mobile-topbar">
        <div className="brand compact"><span className="brand-mark">研</span><strong>Reading Lab</strong></div>
        <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="打开导航"><Menu size={20} /></button>
      </div>

      {menuOpen ? (
        <div className="mobile-menu-backdrop" onClick={() => setMenuOpen(false)}>
          <aside className="mobile-menu" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-menu-head"><strong>导航</strong><button className="icon-button" onClick={() => setMenuOpen(false)}><X size={20} /></button></div>
            <Navigation route={route} onNavigate={onNavigate} onClose={() => setMenuOpen(false)} />
          </aside>
        </div>
      ) : null}

      <main className="main-area">
        <header className="workspace-header">
          <div>
            <span className="workspace-date">{currentDate.display} · {currentDate.weekday}</span>
            <span className="workspace-cycle">{cycle.id} / {cycle.week}</span>
          </div>
          <div className="header-actions">
            <button className="search-trigger" onClick={() => onNavigate('library')}><Search size={16} /><span>搜索论文</span><kbd>⌘ K</kbd></button>
            <span className="sync-state"><span />本地原型</span>
          </div>
        </header>
        <div className="page-container">{children}</div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="移动端主要导航">
        {items.slice(0, 5).map(({ id, label, icon: Icon }) => (
          <button key={id} className={route === id ? 'active' : ''} onClick={() => onNavigate(id)}>
            <Icon size={19} /><span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
