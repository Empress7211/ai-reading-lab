import { BookOpen, Eye, Library, Pin, PinOff } from 'lucide-react';
import type { PaperFixture } from '../data/fixtures';
import { roleLabels } from '../data/fixtures';
import { Button } from './Button';

interface PaperCardProps {
  paper: PaperFixture;
  pinned?: boolean;
  onOpen: (paperId: string) => void;
  onTogglePin?: (paperId: string) => void;
  onReplace?: (paperId: string) => void;
  compact?: boolean;
}

export function PaperCard({
  paper,
  pinned = false,
  onOpen,
  onTogglePin,
  onReplace,
  compact = false,
}: PaperCardProps) {
  return (
    <article className={`paper-card role-${paper.role} ${compact ? 'paper-card--compact' : ''}`}>
      <div className="paper-card__topline">
        <span className={`role-badge role-badge--${paper.role}`}>{roleLabels[paper.role]}</span>
        <span className="confidence">角色置信度 {paper.confidence}%</span>
        {paper.demoRecord ? <span className="fixture-badge">Fixture</span> : null}
        {onTogglePin ? (
          <Button
            variant="ghost"
            className={`pin-button icon-button ${pinned ? 'is-active' : ''}`}
            aria-label={pinned ? `取消固定 ${paper.title}` : `固定 ${paper.title}`}
            aria-pressed={pinned}
            onClick={() => onTogglePin(paper.id)}
          >
            {pinned ? <PinOff size={16} /> : <Pin size={16} />}
          </Button>
        ) : null}
      </div>
      <button type="button" className="paper-card__open" onClick={() => onOpen(paper.id)}>
        <span className="paper-card__title">{paper.title}</span>
        <span className="paper-card__meta">{paper.authors} · {paper.year} · {paper.venue}</span>
        <span className="paper-card__reason"><strong>为什么读：</strong>{paper.rationale}</span>
      </button>
      <div className="paper-card__footer">
        <span><BookOpen size={13} />{paper.access}</span>
        <span><Library size={13} />{paper.libraryState}</span>
        <span><Eye size={13} />{paper.readMode} · {paper.pages}p</span>
        <span className="paper-card__actions">
          {onReplace ? <Button variant="ghost" size="small" onClick={() => onReplace(paper.id)}>替换</Button> : null}
          <Button variant="ghost" size="small" onClick={() => onOpen(paper.id)}>开始阅读</Button>
        </span>
      </div>
    </article>
  );
}

