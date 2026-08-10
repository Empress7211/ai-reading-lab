import { Info } from 'lucide-react';

export function DemoBanner() {
  return (
    <aside className="demo-banner" aria-label="演示模式说明">
      <Info size={17} aria-hidden="true" />
      <p><strong>产品验证版 · fixture 数据。</strong> 不联网、不调用模型、不读取 Zotero、不写入 Git；所有外部能力均为未配置或只读预览。</p>
    </aside>
  );
}

