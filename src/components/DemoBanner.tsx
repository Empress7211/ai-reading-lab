import { Info } from 'lucide-react';

export function DemoBanner() {
  return (
    <aside className="demo-banner" aria-label="本地能力说明">
      <Info size={17} aria-hidden="true" />
      <p><strong>PaperWeave 0.1.0 RC · Internal Alpha · 本地运行。</strong> PDF、证据、审阅与“我的判断”保存在当前设备；AI Draft 仅发送所选 Anchor 与论文标题，实验性 Paper Map 仅在逐篇确认后发送当前单篇的结构化正文文本，结果未审阅。</p>
    </aside>
  );
}
