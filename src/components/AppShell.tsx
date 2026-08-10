import type { ReactNode } from 'react';
import { BookOpen, Boxes, Library, Search, Settings } from 'lucide-react';

export type AppView = 'library' | 'reader' | 'settings';

interface AppShellProps {
  view: AppView;
  children: ReactNode;
  onNavigate: (view: AppView) => void;
  onOpenPalette: () => void;
  runtimeLabel?: string;
}

const navigation = [
  ['library', '文献库', Library],
  ['reader', '阅读器', BookOpen],
  ['settings', '设置', Settings],
] as const;

const titles: Record<AppView, [string, string]> = {
  library: ['文献库', '导入并打开本地论文'],
  reader: ['论文阅读', '证据、审阅与个人判断'],
  settings: ['设置', '本地运行状态与能力边界'],
};

export function AppShell({
  view,
  children,
  onNavigate,
  onOpenPalette,
  runtimeLabel = 'Web fallback · 仅本地状态',
}: AppShellProps) {
  const [title, subtitle] = titles[view];
  return (
    <div className={`app-shell view-${view}`}>
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <span className="brand-mark"><Boxes size={17} /></span>
          <span><strong>PaperWeave</strong><small>Evidence-first PDF Reader</small></span>
        </div>
        <span className="nav-label">LOCAL WORKSPACE</span>
        <nav className="main-nav">
          {navigation.map(([key, label, Icon]) => {
            const active = view === key;
            return (
              <button
                key={key}
                className={active ? 'active' : ''}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(key)}
              >
                <Icon size={17} />
                <span>{label}</span>
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
              <Search size={16} /><span>搜索本地页面或命令…</span><kbd>⌘ K</kbd>
            </button>
            <div className="top-actions">
              <button className="icon-button" onClick={() => onNavigate('settings')} aria-label="打开设置"><Settings size={16} /></button>
            </div>
          </header>
        ) : null}
        <div className="view-host">{children}</div>
      </div>

      {view !== 'reader' ? (
        <nav className="mobile-nav" aria-label="移动主导航">
          {navigation.map(([key, label, Icon]) => {
            const active = view === key;
            return <button key={key} className={active ? 'active' : ''} onClick={() => onNavigate(key)}><Icon size={18} /><span>{label}</span></button>;
          })}
        </nav>
      ) : null}
    </div>
  );
}
