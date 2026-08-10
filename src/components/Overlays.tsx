import { useEffect, useRef } from 'react';
import {
  BookOpen,
  Check,
  Command,
  Compass,
  FileJson,
  GitBranch,
  Search,
  Settings,
  Waypoints,
  X,
} from 'lucide-react';
import type { AppView } from '../data/demo';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: AppView) => void;
}

export function CommandPalette({ open, onClose, onNavigate }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);
  if (!open) return null;

  const items = [
    ['discover', '创建平衡阅读包', '从研究问题构建基石、前沿与反方路径', Compass],
    ['reading', '继续最近阅读', '回到证据账本和待审阅队列', BookOpen],
    ['knowledge', '打开 Proposition Matrix', '只使用 Verified Claim', Waypoints],
    ['settings', '配置本地工作区', '模型、隐私与原生适配器', Settings],
  ] as const;
  return (
    <div className="command-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="全局命令面板">
        <div className="command-input-wrap"><Search size={17} /><input ref={inputRef} placeholder="搜索论文、命令或主题…" aria-label="搜索命令" /><kbd>ESC</kbd></div>
        <div className="command-results">
          {items.map(([view, title, subtitle, Icon], index) => (
            <button key={view} className={index === 0 ? 'active' : ''} onClick={() => { onNavigate(view); onClose(); }}>
              <Icon size={17} /><span><strong>{title}</strong><small>{subtitle}</small></span><Command size={13} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface SyncPreviewDialogProps {
  open: boolean;
  verifiedCount: number;
  anchorCount: number;
  onClose: () => void;
  onExportMarkdown: () => void;
}

export function SyncPreviewDialog({ open, verifiedCount, anchorCount, onClose, onExportMarkdown }: SyncPreviewDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) window.setTimeout(() => closeRef.current?.focus(), 0);
  }, [open]);
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sync-preview-title">
        <header className="modal-head">
          <div><h2 id="sync-preview-title">导出与同步预览</h2><p>本轮只允许确定性 Markdown 下载；Zotero 与 Git 执行器尚未启用。</p></div>
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label="关闭同步预览"><X size={17} /></button>
        </header>
        <div className="modal-body">
          <section className="plan-group unavailable">
            <div className="plan-group-head"><span className="service-mark">Z</span><strong>Zotero · Native adapter 未连接</strong><span>只预览</span></div>
            <div className="plan-row"><Check size={15} /><div><strong>计划：关联现有顶层条目</strong><span>必须先进行 Local API 能力探测与用户授权；当前不会写入。</span></div></div>
            <div className="plan-row"><Check size={15} /><div><strong>计划：创建 PaperWeave child note</strong><span>只管理 marker 区块；用户原有 Note 不在变更范围。</span></div></div>
          </section>
          <section className="plan-group">
            <div className="plan-group-head"><FileJson size={16} /><strong>Local export · research-notes/</strong><span>可下载 2 个文件</span></div>
            <div className="plan-row"><Check size={15} /><div><strong>papers/schaeffer2023mirage/index.md</strong><span>{verifiedCount} 条 Verified Claim、{anchorCount} 个证据 Anchor</span></div></div>
            <div className="plan-row"><Check size={15} /><div><strong>papers/schaeffer2023mirage/claims.json</strong><span>含 provenance、review status 与 schema version；不含 PDF。</span></div></div>
          </section>
          <section className="diff-preview" aria-label="导出摘要">
            <code>preview: paperweave export --no-pdf</code>
            <span>+ {verifiedCount} verified claims</span>
            <span>+ {anchorCount} evidence anchors</span>
            <span>Git commit: OFF · GitHub push: OFF</span>
          </section>
          <div className="policy-note"><GitBranch size={15} /><span>模型输出不能触发此计划。只有本对话框中的用户操作能下载本地导出文件。</span></div>
        </div>
        <footer className="modal-foot">
          <button className="secondary-button" onClick={onClose}>取消</button>
          <button className="primary-button" onClick={onExportMarkdown}>下载 Markdown 预览</button>
        </footer>
      </div>
    </div>
  );
}
