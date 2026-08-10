import { useState, type ReactNode } from 'react';
import { DemoBanner } from '../../components/DemoBanner';
import { PageHeader } from '../../components/PageHeader';

type SettingsTab = 'workspace' | 'privacy' | 'pdf';

interface SettingsPageProps {
  runtimeLabel: string;
}

const labels: Array<[SettingsTab, string]> = [
  ['workspace', '本地工作区'],
  ['privacy', '隐私边界'],
  ['pdf', 'PDF 阅读器'],
];

export function SettingsPage({ runtimeLabel }: SettingsPageProps) {
  const [tab, setTab] = useState<SettingsTab>('workspace');

  return (
    <div className="page">
      <DemoBanner />
      <PageHeader title="设置" description="查看本地运行边界与当前可用能力。未接入的服务会明确标记，不会静默降级。" />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分类">
          {labels.map(([value, label]) => <button type="button" key={value} className={tab === value ? 'is-active' : ''} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)}>{label}</button>)}
        </nav>
        {tab === 'workspace' ? (
          <SettingsSection title="本地工作区" description="当前应用数据与 PDF 均保存在本机。">
            <StatusRow label="运行时" value={runtimeLabel} />
            <StatusRow label="论文来源" value="仅手动导入本地 PDF" />
            <StatusRow label="OpenAI Draft" value="接口已保留 · Keychain/API 适配待接入" />
          </SettingsSection>
        ) : tab === 'privacy' ? (
          <SettingsSection title="隐私边界" description="没有静默联网或外部同步。">
            <StatusRow label="PDF 上传" value="关闭" />
            <StatusRow label="网络请求" value="当前版本不发起；无模拟 AI" />
            <StatusRow label="本地数据" value="不会自动传出设备" />
          </SettingsSection>
        ) : (
          <SettingsSection title="PDF 阅读器" description="真实 PDF 由 PDF.js 渲染；Anchor 使用页码、归一化坐标与文本指纹定位。">
            <StatusRow label="渲染器" value="PDF.js 5.6" />
            <StatusRow label="Evidence Anchor" value="本机持久化" />
            <StatusRow label="OCR / Docling" value="尚未实现" />
          </SettingsSection>
        )}
      </div>
    </div>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="settings-section"><header><h2>{title}</h2><p>{description}</p></header><div className="settings-body">{children}</div></section>;
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return <div className="setting-row"><span><strong>{label}</strong><small>{value}</small></span></div>;
}
