import { DemoBanner } from '../../components/DemoBanner';
import { PageHeader } from '../../components/PageHeader';
import { PaperCard } from '../../components/PaperCard';
import type { PaperFixture } from '../../data/fixtures';

interface ReadingHomeProps {
  papers: PaperFixture[];
  onOpenPaper: (paperId: string) => void;
}

export function ReadingHome({ papers, onOpenPaper }: ReadingHomeProps) {
  return (
    <div className="page">
      <DemoBanner />
      <PageHeader title="继续阅读" description="恢复最近的页面、主题上下文和待审阅队列；当前进度为 fixture。" />
      <div className="reading-home-grid">
        {papers.slice(0, 3).map((paper, index) => (
          <div className="reading-session" key={paper.id}>
            <div className="reading-progress"><span style={{ width: `${[42, 68, 19][index] ?? 25}%` }} /></div>
            <PaperCard paper={paper} onOpen={onOpenPaper} compact />
            <p><strong>下一步：</strong>{[
              '核验 Table 2 的指标变化是否改变结论。',
              '完成作者局限并确认外推范围。',
              '阅读方法节并记录最强证据。',
            ][index]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

