import {
  BookOpen,
  Compass,
  Database,
  Network,
  Search,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppView } from '../data/fixtures';

interface CommandDefinition {
  id: AppView;
  label: string;
  description: string;
  icon: LucideIcon;
}

const commands: CommandDefinition[] = [
  { id: 'discover', label: '创建平衡阅读包', description: '从研究问题开始', icon: Compass },
  { id: 'library', label: '打开文献库', description: '查看 fixture 与本地状态', icon: Database },
  { id: 'reading', label: '继续阅读', description: '恢复最近研究会话', icon: BookOpen },
  { id: 'knowledge', label: '查看命题矩阵', description: '比较支持、反对与限定', icon: Network },
  { id: 'settings', label: '模型与隐私设置', description: '外部能力当前未配置', icon: Settings },
];

interface CommandPaletteProps {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onNavigate: (view: AppView) => void;
}

export function CommandPalette({ open, initialQuery = '', onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState(initialQuery);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const filteredCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.description}`.toLowerCase().includes(normalized),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setActiveIndex(0);
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => previousFocusRef.current?.focus();
  }, [initialQuery, open]);

  if (!open) return null;

  const choose = (view: AppView) => {
    onNavigate(view);
    onClose();
  };

  return (
    <div className="command-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % Math.max(filteredCommands.length, 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => (index - 1 + Math.max(filteredCommands.length, 1)) % Math.max(filteredCommands.length, 1));
          } else if (event.key === 'Enter') {
            const command = filteredCommands[activeIndex];
            if (command) choose(command.id);
          }
        }}
      >
        <label className="command-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">搜索命令</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="搜索页面或操作…"
            aria-controls="command-results"
          />
          <kbd>Esc</kbd>
        </label>
        <div id="command-results" className="command-results" role="listbox" aria-label="命令结果">
          {filteredCommands.length ? filteredCommands.map((command, index) => {
            const Icon = command.icon;
            const active = index === activeIndex;
            return (
              <button
                key={command.id}
                type="button"
                className={`command-item ${active ? 'is-active' : ''}`}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(command.id)}
              >
                <Icon size={18} />
                <span><strong>{command.label}</strong><small>{command.description}</small></span>
              </button>
            );
          }) : <p className="command-empty">没有匹配命令</p>}
        </div>
      </section>
    </div>
  );
}
