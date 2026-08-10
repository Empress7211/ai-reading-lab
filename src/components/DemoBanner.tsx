import { Info } from 'lucide-react';

export function DemoBanner() {
  return (
    <aside className="demo-banner" aria-label="本地能力说明">
      <Info size={17} aria-hidden="true" />
      <p><strong>PaperWeave v0.1 · 本地运行。</strong> PDF、证据、审阅与“我的判断”保存在当前设备；OpenAI 接口尚未接入。</p>
    </aside>
  );
}
