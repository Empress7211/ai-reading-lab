import { useState } from 'react';
import { Button } from '../../components/Button';
import { DemoBanner } from '../../components/DemoBanner';
import { PageHeader } from '../../components/PageHeader';

type SettingsTab = 'models' | 'workspace' | 'zotero' | 'git' | 'privacy' | 'parsing';

interface SettingsPageProps {
  onMessage: (title: string, detail: string) => void;
}

function SwitchRow({ title, detail, initialValue = false }: { title: string; detail: string; initialValue?: boolean }) {
  const [checked, setChecked] = useState(initialValue);
  return <div className="setting-row"><span><strong>{title}</strong><small>{detail}</small></span><button type="button" role="switch" aria-checked={checked} aria-label={title} className={`switch ${checked ? 'is-on' : ''}`} onClick={() => setChecked((value) => !value)}><span /></button></div>;
}

export function SettingsPage({ onMessage }: SettingsPageProps) {
  const [tab, setTab] = useState<SettingsTab>('models');
  const labels: Array<[SettingsTab, string]> = [
    ['models', '模型与路由'], ['workspace', '工作区'], ['zotero', 'Zotero'], ['git', 'Git / GitHub'], ['privacy', '隐私与云端'], ['parsing', 'PDF 与解析'],
  ];

  return (
    <div className="page">
      <DemoBanner />
      <PageHeader title="设置" description="所有字段均为未保存的 UI fixture；不会保存密钥或连接外部系统。" />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分类">{labels.map(([value, label]) => <button type="button" key={value} className={tab === value ? 'is-active' : ''} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)}>{label}</button>)}</nav>
        {tab === 'models' ? (
          <section className="settings-section">
            <header><h2>模型 Provider</h2><p>BYOK 配置占位；正式版密钥必须进入系统 Keychain。</p></header>
            <div className="settings-body">
              <div className="field-grid">
                <label>Profile 名称<input defaultValue="未配置的研究 Profile" /></label>
                <label>Provider 类型<select defaultValue="none"><option value="none">未配置</option><option value="openai-compatible">OpenAI-compatible</option><option value="local">Local compatible server</option></select></label>
                <label className="field-full">Base URL<input placeholder="尚未配置" /></label>
                <label className="field-full">API Key<input type="password" placeholder="不会在验证版中保存" autoComplete="off" /><small>正式版保存后不可回读明文，只能替换或删除。</small></label>
                <label>Claim 提取<select disabled><option>等待 Provider</option></select></label>
                <label>跨论文综合<select disabled><option>等待 Provider</option></select></label>
              </div>
              <SwitchRow title="允许发送整篇全文" detail="默认关闭；建议仅发送当前选区、章节和必要 Verified context。" />
              <SwitchRow title="自动清理原始模型响应" detail="正式版默认保留 7 天后删除。" initialValue />
              <div className="settings-actions"><Button onClick={() => onMessage('模型未配置', '没有发送连接测试。')}>测试说明</Button><Button variant="primary" onClick={() => onMessage('设置未保存', '验证版不会写入 Keychain 或数据库。')}>预览保存</Button></div>
            </div>
          </section>
        ) : tab === 'privacy' ? (
          <section className="settings-section"><header><h2>隐私与数据流</h2><p>按数据类别控制本地、模型 Provider 和可选云端。</p></header><div className="settings-body">
            <SwitchRow title="PDF 与完整笔记只保留本地" detail="Local-first 默认值。" initialValue />
            <SwitchRow title="匿名产品分析" detail="当前关闭；不得包含标题、正文、Anchor 或笔记。" />
            <SwitchRow title="云端主题追踪" detail="仅允许主题定义与元数据 ID；当前未配置。" />
            <SwitchRow title="自动清理模型响应" detail="配置模型后按保留策略执行。" initialValue />
          </div></section>
        ) : (
          <IntegrationSettings tab={tab} onMessage={onMessage} />
        )}
      </div>
    </div>
  );
}

function IntegrationSettings({ tab, onMessage }: { tab: Exclude<SettingsTab, 'models' | 'privacy'>; onMessage: SettingsPageProps['onMessage'] }) {
  const copy = {
    workspace: ['工作区', 'SQLite、解析缓存、备份与导出', '未选择本地目录'],
    zotero: ['Zotero', 'Local API、Library 与写入授权', '未配置 Local API'],
    git: ['Git / GitHub', '本地仓库、分支与可选远端权限', '未选择仓库'],
    parsing: ['PDF 与解析', 'PDF.js、Docling worker、OCR 与解析缓存', '未配置解析 Worker'],
  } as const;
  const [title, description, value] = copy[tab];
  return <section className="settings-section"><header><h2>{title}</h2><p>{description}</p></header><div className="settings-body">
    <label className="standalone-field">当前配置<input value={value} readOnly /></label>
    <SwitchRow title="启动时检查连接" detail="失败不会阻止本地阅读。" />
    <SwitchRow title="外部写入前显示预览" detail="首次和冲突场景不可关闭。" initialValue />
    <div className="settings-actions"><Button onClick={() => onMessage(`${title} 未配置`, '没有执行连接检查。')}>检查说明</Button><Button variant="primary" onClick={() => onMessage('设置未保存', '当前只保留界面预览。')}>预览保存</Button></div>
  </div></section>;
}

