import { ArrowRight, BookOpenCheck } from 'lucide-react';

import { roleLabels, type DemoPaper } from '../data/demo';

export interface ReadingResumeItem {
  paper: DemoPaper;
  lastPage: number;
  pendingReviews: number;
  visitedKeySections: number;
  totalKeySections: number;
  nextStep: string;
}

export interface ReadingHomeProps {
  items: readonly ReadingResumeItem[];
  onResume: (paper: DemoPaper) => void;
  onOpenReviewQueue?: (paper: DemoPaper) => void;
  onImportPdf?: () => void;
}

export function ReadingHome({
  items,
  onResume,
  onOpenReviewQueue,
  onImportPdf,
}: ReadingHomeProps) {
  return (
    <div className="page reading-home-page">
      <div className="section-heading">
        <div>
          <h1>继续阅读</h1>
          <p>恢复最近页面、主题上下文和待审阅队列；不使用伪精确阅读百分比。</p>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="paper-grid reading-session-grid">
          {items.map((item) => {
            const { paper } = item;
            return (
              <article className={`paper-card reading-session-card ${paper.role}`} key={paper.id}>
                <div className="paper-topline">
                  <span className="role-badge">{roleLabels[paper.role]}</span>
                  <span className="confidence">
                    已访问 {item.visitedKeySections}/{item.totalKeySections} 个关键章节
                  </span>
                </div>
                <h2 className="paper-title">{paper.title}</h2>
                <p className="paper-meta">
                  {paper.authors} · 上次停在第 {item.lastPage} 页
                </p>
                <div className="reason">
                  <strong>下一步：</strong>
                  {item.nextStep}
                </div>
                <div className="session-actions">
                  <button
                    className="primary-button small-button"
                    type="button"
                    onClick={() => onResume(paper)}
                  >
                    继续阅读 <ArrowRight aria-hidden="true" />
                  </button>
                  {onOpenReviewQueue && item.pendingReviews > 0 ? (
                    <button
                      className="secondary-button small-button"
                      type="button"
                      onClick={() => onOpenReviewQueue(paper)}
                    >
                      {item.pendingReviews} 条待审阅
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="empty-state" aria-labelledby="reading-empty-title">
          <div className="empty-icon" aria-hidden="true">
            <BookOpenCheck />
          </div>
          <h2 id="reading-empty-title">还没有可恢复的阅读会话</h2>
          <p>导入本地 PDF 后即可手工阅读、创建证据锚点和笔记，不需要连接模型。</p>
          {onImportPdf ? (
            <button className="primary-button" type="button" onClick={onImportPdf}>
              导入 PDF
            </button>
          ) : null}
        </section>
      )}
    </div>
  );
}
