import { Info } from 'lucide-react';

export function DemoBanner() {
  return (
    <aside className="demo-banner" aria-label="本地能力说明">
      <Info size={17} aria-hidden="true" />
      <p><strong>PaperWeave v0.1 · 本地运行。</strong> PDF、证据、审阅与“我的判断”保存在当前设备；只有主动生成 AI Draft 时才发送所选 Anchor。</p>
    </aside>
  );
}
