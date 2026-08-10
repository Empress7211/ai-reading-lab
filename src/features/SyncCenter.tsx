import {
  CircleCheck,
  Cloud,
  GitBranch,
  Library,
  PlugZap,
  TriangleAlert,
} from 'lucide-react';

export type SyncTargetKind = 'zotero' | 'git' | 'github';
export type SyncTargetState = 'synced' | 'pending' | 'error' | 'paused' | 'unavailable';

export interface SyncTarget {
  id: string;
  kind: SyncTargetKind;
  name: string;
  connectionLabel: string;
  state: SyncTargetState;
  stateLabel: string;
  scope: string;
  pendingSummary: string;
  lastSuccess: string;
  nativeRequired: boolean;
}

export interface SyncActivity {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  tone: 'success' | 'warning' | 'error';
}

export interface SyncCenterProps {
  nativeAvailable: boolean;
  targets: readonly SyncTarget[];
  activities: readonly SyncActivity[];
  onCheckTarget: (target: SyncTarget) => void;
  onPreviewTarget: (target: SyncTarget) => void;
  onPreviewAll: () => void;
}

function TargetIcon({ kind }: { kind: SyncTargetKind }) {
  if (kind === 'zotero') return <Library aria-hidden="true" />;
  if (kind === 'git') return <GitBranch aria-hidden="true" />;
  return <Cloud aria-hidden="true" />;
}

export function SyncCenter({
  nativeAvailable,
  targets,
  activities,
  onCheckTarget,
  onPreviewTarget,
  onPreviewAll,
}: SyncCenterProps) {
  return (
    <div className="page sync-page">
      <div className="section-heading">
        <div>
          <h1>同步中心</h1>
          <p>本地保存、Zotero 写入、Git commit 与 GitHub push 是独立状态。</p>
        </div>
        <div className="actions">
          <button
            className="primary-button"
            type="button"
            onClick={onPreviewAll}
            disabled={!nativeAvailable}
          >
            预览全部变更
          </button>
        </div>
      </div>

      {!nativeAvailable ? (
        <div className="status-banner native-unavailable" role="alert">
          <PlugZap aria-hidden="true" />
          <div>
            <strong>原生执行器不可用</strong>
            <p>
              当前运行在浏览器预览中。不会访问 Zotero、Git、文件系统或系统凭据；请在 Tauri
              桌面应用中连接并生成真实同步计划。
            </p>
          </div>
        </div>
      ) : (
        <div className="status-banner preview-first" role="status">
          <CircleCheck aria-hidden="true" />
          <div>
            <strong>Preview-first 已启用</strong>
            <p>任何外部写入都必须先展示目标、文件、版本与 diff，再由用户确认执行。</p>
          </div>
        </div>
      )}

      <div className="sync-grid">
        {targets.map((target) => {
          const blocked = target.nativeRequired && !nativeAvailable;
          const effectiveState = blocked ? 'unavailable' : target.state;
          return (
            <article className="sync-card" key={target.id}>
              <div className="sync-card-head">
                <div className="service-mark">
                  <TargetIcon kind={target.kind} />
                </div>
                <div>
                  <h2>{target.name}</h2>
                  <span>{target.connectionLabel}</span>
                </div>
                <span className={`sync-state ${effectiveState}`}>
                  {blocked ? '原生端不可用' : target.stateLabel}
                </span>
              </div>
              <dl className="sync-card-body">
                <div className="sync-detail">
                  <dt>范围</dt>
                  <dd>{target.scope}</dd>
                </div>
                <div className="sync-detail">
                  <dt>待处理</dt>
                  <dd>{blocked ? '未读取' : target.pendingSummary}</dd>
                </div>
                <div className="sync-detail">
                  <dt>最近成功</dt>
                  <dd>{target.lastSuccess}</dd>
                </div>
              </dl>
              <div className="sync-card-actions">
                <button
                  className="secondary-button small-button"
                  type="button"
                  onClick={() => onCheckTarget(target)}
                  disabled={blocked}
                >
                  检查连接
                </button>
                <button
                  className="ghost-button small-button"
                  type="button"
                  onClick={() => onPreviewTarget(target)}
                  disabled={blocked}
                >
                  预览计划
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <section className="panel" aria-labelledby="sync-activity-title">
        <div className="panel-head">
          <strong id="sync-activity-title">任务与活动</strong>
          <span>外部副作用由幂等 Job 执行；此处不从模型输出直接触发写入。</span>
        </div>
        <div className="activity-list">
          {activities.map((activity) => (
            <article className="activity-row" key={activity.id}>
              <div className={`activity-icon ${activity.tone}`} aria-hidden="true">
                {activity.tone === 'success' ? <CircleCheck /> : <TriangleAlert />}
              </div>
              <div>
                <strong>{activity.title}</strong>
                <p>{activity.detail}</p>
              </div>
              <time>{activity.timestamp}</time>
            </article>
          ))}
          {activities.length === 0 ? (
            <div className="empty-state compact" role="status">
              <p>尚无同步任务。生成预览不会执行任何外部写入。</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
