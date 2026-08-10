import type { ReactNode } from 'react';
import {
  Bell,
  BookOpen,
  Boxes,
  Compass,
  GitCompareArrows,
  Library,
  RefreshCw,
  Search,
  Settings,
  Waypoints,
} from 'lucide-react';
import type { AppView } from '../data/demo';

interface AppShellProps {
  view: AppView;
  children: ReactNode;
  onNavigate: (view: AppView) => void;
  onOpenPalette: () => void;
  onOpenSync: () => void;
  runtimeLabel?: string;
}

const navigation = [
  ['discover', '发现', Compass, null],
  ['library', '文献库', Library, 9],
  ['reading', '阅读', BookOpen, 3],
  ['knowledge', '知识', Waypoints, 12],
  ['sync', '同步', GitCompareArrows, 2],
  ['settings', '设置', Settings, null],
] as const;

const titles: Record<AppView, [string, string]> = {
  discover: ['发现', '构建平衡的论文阅读路径'],
  library: ['文献库', '本地论文、队列与 Zotero 映射'],
  reading: ['阅读', '继续阅读与待审阅队列'],
  reader: ['论文阅读', '证据、审阅与认知更新'],
  knowledge: ['主题知识', '命题、分歧与研究缺口'],
  sync: ['同步中心', '预览、任务、冲突与恢复'],
  settings: ['设置', '工作区、模型、隐私与集成'],
};

export function AppShell({ view, children, onNavigate, onOpenPalette, onOpenSync, runtimeLabel = 'Web fallback · 仅本地状态' }: AppShellProps) {
  const [title, subtitle] = titles[view];
  return (
    <div className={`app-shell view-${view}`}>
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <span className="brand-mark"><Boxes size={17} /></span>
          <span><strong>PaperWeave</strong><small>论织 · Research workspace</small></span>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav className="main-nav">
          {navigation.map(([key, label, Icon, count]) => {
            const active = view === key || (view === 'reader' && key === 'reading');
            return (
              <button
                key={key}
                className={active ? 'active' : ''}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(key)}
              >
                <Icon size={17} />
                <span>{label}</span>
                {count !== null ? <span className="nav-count">{count}</span> : null}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="local-core-card">
          <span className="status-dot" />
          <div><strong>Local Core</strong><small>{runtimeLabel}</small></div>
        </div>
      </aside>

      <div className="app-main">
        {view !== 'reader' ? (
          <header className="topbar">
            <div className="topbar-title"><strong>{title}</strong><span>{subtitle}</span></div>
            <button className="global-search" onClick={onOpenPalette}>
              <Search size={16} /><span>搜索论文、Claim、主题或命令…</span><kbd>⌘ K</kbd>
            </button>
            <div className="top-actions">
              <button className="icon-button" onClick={onOpenSync} aria-label="打开同步预览"><RefreshCw size={16} /></button>
              <button className="icon-button" onClick={() => onNavigate('settings')} aria-label="打开设置"><Settings size={16} /></button>
              <button className="icon-button" aria-label="通知"><Bell size={16} /></button>
            </div>
          </header>
        ) : null}
        <div className="view-host">{children}</div>
      </div>

      {view !== 'reader' ? (
        <nav className="mobile-nav" aria-label="移动主导航">
          {navigation.slice(0, 5).map(([key, label, Icon]) => {
            const active = view === key;
            return <button key={key} className={active ? 'active' : ''} onClick={() => onNavigate(key)}><Icon size={18} /><span>{label}</span></button>;
          })}
        </nav>
      ) : null}
    </div>
  );
}

export function DemoBanner() {
  return (
    <div className="demo-banner" role="note">
      <CircleInfoIcon />
      <span><strong>交互式 Alpha · 本地演示数据。</strong> 不联网、不调用模型、不访问 Zotero，也不会执行 Git 写入。</span>
    </div>
  );
}

function CircleInfoIcon() {
  return <span className="info-icon" aria-hidden="true">i</span>;
}
