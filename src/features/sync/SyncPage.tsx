import { CloudOff, GitBranch, Library, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/Button';
import { DemoBanner } from '../../components/DemoBanner';
import { PageHeader } from '../../components/PageHeader';

interface SyncPageProps {
  onOpenPreview: () => void;
  onMessage: (title: string, detail: string) => void;
}

export function SyncPage({ onOpenPreview, onMessage }: SyncPageProps) {
  const cards = [
    { name: 'Zotero', icon: Library, subtitle: 'Local API adapter', state: '未配置', scope: '无 Library 授权', action: '配置后可写 child note' },
    { name: 'Local Git', icon: GitBranch, subtitle: 'Repository adapter', state: '仅预览', scope: '未选择仓库', action: '不执行 commit' },
    { name: 'GitHub', icon: CloudOff, subtitle: 'Optional remote adapter', state: '未配置', scope: '无远端授权', action: '默认不 push' },
  ];
  return (
    <div className="page">
      <DemoBanner />
      <PageHeader
        title="同步中心"
        description="本地保存、Zotero 写入、Git commit 与 GitHub push 是四个独立状态；当前全部不会执行。"
        actions={<Button variant="primary" icon={<ShieldCheck size={17} />} onClick={onOpenPreview}>预览变更计划</Button>}
      />
      <div className="sync-grid">
        {cards.map((card) => {
          const Icon = card.icon;
          return <article className="sync-card" key={card.name}>
            <header><span className="service-icon"><Icon size={19} /></span><span><strong>{card.name}</strong><small>{card.subtitle}</small></span><span className="integration-state">{card.state}</span></header>
            <dl><div><dt>范围</dt><dd>{card.scope}</dd></div><div><dt>行为</dt><dd>{card.action}</dd></div><div><dt>最近活动</dt><dd>无</dd></div></dl>
            <div><Button size="small" icon={<RefreshCw size={14} />} onClick={() => onMessage(`${card.name} 未配置`, '没有发起连接检查或外部请求。')}>检查说明</Button><Button variant="ghost" size="small" onClick={onOpenPreview}>查看预览</Button></div>
          </article>;
        })}
      </div>
      <section className="panel">
        <header className="panel-header"><div><h2>任务与活动</h2><p>正式版的跨系统动作将使用幂等 Job 和诊断 ID</p></div></header>
        <div className="activity-list">
          {[
            ['验证模式启动', '所有外部适配器保持关闭', '本会话'],
            ['Fixture 数据加载', '未访问网络、文件系统或剪贴板', '本会话'],
            ['等待本地工作区', '配置后才会生成可执行计划', '未开始'],
          ].map(([title, detail, time]) => <article key={title}><span><ShieldCheck size={14} /></span><div><strong>{title}</strong><p>{detail}</p></div><time>{time}</time></article>)}
        </div>
      </section>
    </div>
  );
}

