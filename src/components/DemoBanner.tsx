import { Info } from 'lucide-react';

export function DemoBanner() {
  return (
    <aside className="demo-banner" aria-label="Internal Alpha 能力说明">
      <Info size={17} aria-hidden="true" />
      <p><strong>Internal Alpha · 本地运行。</strong> 只支持本地 PDF、Evidence Anchor、笔记与显式审阅 fixture；AI 尚未配置。</p>
    </aside>
  );
}
