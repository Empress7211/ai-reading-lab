import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { DemoBanner } from '../../components/DemoBanner';
import { PageHeader } from '../../components/PageHeader';
import { messageFromUnknown } from '../../errorMessage';
import type {
  OpenAiCredentialStatus,
  OpenAiModel,
  WorkspaceRepository,
  WorkspaceSettings,
} from '../../services';

type SettingsTab = 'workspace' | 'models' | 'privacy' | 'pdf';

interface SettingsPageProps {
  runtimeLabel: string;
  repository: WorkspaceRepository;
  settings: WorkspaceSettings;
  onSettingsSaved: (settings: WorkspaceSettings) => void;
}

const labels: Array<[SettingsTab, string]> = [
  ['workspace', '本地工作区'],
  ['models', '模型与 API'],
  ['privacy', '隐私边界'],
  ['pdf', 'PDF 阅读器'],
];

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('Base URL 必须是完整的 http:// 或 https:// 地址。');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Base URL 仅支持 http:// 或 https://。');
  }
  const loopbackHost = url.hostname === 'localhost'
    || /^127(?:\.\d{1,3}){3}$/.test(url.hostname)
    || url.hostname === '[::1]';
  if (url.protocol === 'http:' && !loopbackHost) {
    throw new Error('远程模型服务必须使用 HTTPS；HTTP 仅允许 localhost 或回环 IP。');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Base URL 不能包含账号、密码、查询参数或片段。');
  }
  return normalized;
}

export function SettingsPage({
  runtimeLabel,
  repository,
  settings,
  onSettingsSaved,
}: SettingsPageProps) {
  const [tab, setTab] = useState<SettingsTab>('workspace');
  const [baseUrl, setBaseUrl] = useState(settings.openAiBaseUrl);
  const [model, setModel] = useState(settings.openAiModel);
  const [apiKey, setApiKey] = useState('');
  const [credentialStatus, setCredentialStatus] = useState<OpenAiCredentialStatus | null>(null);
  const [models, setModels] = useState<OpenAiModel[]>([]);
  const [pendingAction, setPendingAction] = useState<'save' | 'models' | 'delete' | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const nativeRuntime = repository.runtime === 'tauri';

  useEffect(() => {
    setBaseUrl(settings.openAiBaseUrl);
    setModel(settings.openAiModel);
  }, [settings.openAiBaseUrl, settings.openAiModel]);

  useEffect(() => {
    let cancelled = false;
    void repository.openAiCredentialStatus()
      .then((status) => {
        if (!cancelled) setCredentialStatus(status);
      })
      .catch((reason) => {
        if (!cancelled) {
          setCredentialStatus({ configured: false, credentialRef: null });
          setFeedback({ kind: 'error', text: messageFromUnknown(reason, '无法读取本机 API Key 配置状态。') });
        }
      });
    return () => { cancelled = true; };
  }, [repository]);

  const saveConfiguration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    if (!nativeRuntime) {
      setFeedback({ kind: 'error', text: 'API Key 与模型调用仅在 PaperWeave macOS 应用中可用。' });
      return;
    }

    let normalizedBaseUrl: string;
    try {
      normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    } catch (reason) {
      setFeedback({ kind: 'error', text: messageFromUnknown(reason, 'Base URL 无效。') });
      return;
    }
    const normalizedModel = model.trim();
    if (!normalizedModel) {
      setFeedback({ kind: 'error', text: '请选择或填写模型 ID。' });
      return;
    }
    const normalizedKey = apiKey.trim();
    if (!normalizedKey && !credentialStatus?.configured) {
      setFeedback({ kind: 'error', text: '首次配置需要填写 API Key。' });
      return;
    }

    setPendingAction('save');
    let keySaved = false;
    try {
      const status = normalizedKey
        ? await repository.saveOpenAiApiKey(normalizedKey)
        : credentialStatus!;
      keySaved = normalizedKey.length > 0;
      setCredentialStatus(status);
      const saved = await repository.saveSettings({
        ...settings,
        openAiBaseUrl: normalizedBaseUrl,
        openAiModel: normalizedModel,
        openAiCredentialRef: status.credentialRef,
      });
      setBaseUrl(saved.openAiBaseUrl);
      setModel(saved.openAiModel);
      setApiKey('');
      onSettingsSaved(saved);
      setFeedback({ kind: 'success', text: '模型配置已保存；API Key 不会回显。' });
    } catch (reason) {
      const detail = messageFromUnknown(reason, '模型配置保存失败。');
      setFeedback({
        kind: 'error',
        text: keySaved ? `API Key 已保存到 PaperWeave，但模型设置保存失败：${detail}` : detail,
      });
    } finally {
      setPendingAction(null);
    }
  };

  const loadModels = async () => {
    setFeedback(null);
    if (!nativeRuntime) {
      setFeedback({ kind: 'error', text: '模型列表仅在 PaperWeave macOS 应用中可加载。' });
      return;
    }
    let normalizedBaseUrl: string;
    try {
      normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    } catch (reason) {
      setFeedback({ kind: 'error', text: messageFromUnknown(reason, 'Base URL 无效。') });
      return;
    }
    const normalizedKey = apiKey.trim();
    if (!normalizedKey && !credentialStatus?.configured) {
      setFeedback({ kind: 'error', text: '请先填写 API Key，或先保存模型配置。' });
      return;
    }

    setPendingAction('models');
    try {
      const available = await repository.listOpenAiModels({
        baseUrl: normalizedBaseUrl,
        ...(normalizedKey ? { apiKey: normalizedKey } : {}),
      });
      setModels(available);
      setFeedback({
        kind: 'success',
        text: available.length > 0
          ? `已加载 ${available.length} 个模型。`
          : '服务没有返回模型列表；仍可手动填写模型 ID。',
      });
    } catch (reason) {
      setModels([]);
      setFeedback({ kind: 'error', text: messageFromUnknown(reason, '模型列表加载失败。') });
    } finally {
      setPendingAction(null);
    }
  };

  const deleteCredential = async () => {
    setFeedback(null);
    setPendingAction('delete');
    let keyDeleted = false;
    try {
      const status = await repository.deleteOpenAiApiKey();
      keyDeleted = true;
      setCredentialStatus(status);
      const saved = await repository.saveSettings({ ...settings, openAiCredentialRef: null });
      setApiKey('');
      onSettingsSaved(saved);
      setFeedback({ kind: 'success', text: 'PaperWeave 中保存的 API Key 已清除；模型地址与 ID 保留。' });
    } catch (reason) {
      const detail = messageFromUnknown(reason, 'API Key 删除失败。');
      setFeedback({
        kind: 'error',
        text: keyDeleted ? `API Key 已删除，但本地引用更新失败：${detail}` : detail,
      });
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="page">
      <DemoBanner />
      <PageHeader title="设置" description="配置本地工作区，以及由你主动启用的 OpenAI-compatible AI 服务。" />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分类">
          {labels.map(([value, label]) => <button type="button" key={value} className={tab === value ? 'is-active' : ''} aria-current={tab === value ? 'page' : undefined} onClick={() => { setTab(value); setFeedback(null); }}>{label}</button>)}
        </nav>
        {tab === 'workspace' ? (
          <SettingsSection title="本地工作区" description="应用数据与 PDF 均保存在本机。">
            <StatusRow label="运行时" value={runtimeLabel} />
            <StatusRow label="论文来源" value="仅手动导入本地 PDF" />
            <StatusRow label="AI Draft" value={credentialStatus?.configured ? `已配置 · ${settings.openAiModel || '尚未选择模型'}` : '未配置 · 人工 Draft 仍可使用'} />
          </SettingsSection>
        ) : tab === 'models' ? (
          <SettingsSection title="模型与 API" description="支持 OpenAI-compatible Chat Completions；AI Draft 必须人工审阅，实验性 Paper Map 是未审阅导航。">
            <form className="model-settings-form" onSubmit={(event) => void saveConfiguration(event)}>
              <div className="field-grid">
                <label className="field-full" htmlFor="model-provider"><span>Provider</span><input id="model-provider" aria-label="Provider" value="OpenAI Compatible" disabled /></label>
                <label className="field-full" htmlFor="model-base-url"><span>Base URL</span><input id="model-base-url" aria-label="Base URL" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" disabled={!nativeRuntime || pendingAction !== null} /><small>请包含服务要求的版本路径，例如 /v1。只有点击“加载模型列表（可选）”时才请求 /models；生成 AI Draft 或逐篇确认 Paper Map 时才请求 /chat/completions。</small></label>
                <label className="field-full" htmlFor="model-api-key"><span>API Key</span><input id="model-api-key" aria-label="API Key" type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={credentialStatus?.configured ? '已保存在 PaperWeave；输入新值可替换' : '输入自己的 API Key'} disabled={!nativeRuntime || pendingAction !== null} /><small>首次保存后由 PaperWeave 在本机持续使用，不会在每次生成时询问；此处不回显密钥。</small></label>
                <label className="field-full" htmlFor="model-id"><span>模型 ID</span><input id="model-id" aria-label="模型 ID" list="openai-model-options" value={model} onChange={(event) => setModel(event.target.value)} placeholder="选择已加载模型，或手动填写模型 ID" disabled={!nativeRuntime || pendingAction !== null} /><small>/models 加载失败不代表 /chat/completions 不可用；可以直接手动填写模型 ID。</small></label>
                <datalist id="openai-model-options">{models.map((item) => <option key={item.id} value={item.id}>{item.ownedBy ?? ''}</option>)}</datalist>
              </div>
              <div className="credential-state"><strong>密钥状态</strong><span>{credentialStatus === null ? '正在读取…' : credentialStatus.configured ? '已保存在 PaperWeave' : '未配置'}</span></div>
              {feedback ? <p className={feedback.kind === 'error' ? 'inline-error' : 'inline-success'} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</p> : null}
              <div className="settings-actions">
                <Button type="submit" variant="primary" disabled={!nativeRuntime || credentialStatus === null || pendingAction !== null}>{pendingAction === 'save' ? '正在保存…' : '保存配置'}</Button>
                <Button disabled={!nativeRuntime || credentialStatus === null || pendingAction !== null} onClick={() => void loadModels()}>{pendingAction === 'models' ? '正在加载…' : '加载模型列表（可选）'}</Button>
                <Button variant="danger" disabled={!nativeRuntime || !credentialStatus?.configured || pendingAction !== null} onClick={() => void deleteCredential()}>{pendingAction === 'delete' ? '正在清除…' : '清除已保存的 API Key'}</Button>
              </div>
              {!nativeRuntime ? <p className="setting-note">浏览器开发模式不会接收或存储 API Key。请在 macOS 桌面应用中完成配置。</p> : null}
            </form>
          </SettingsSection>
        ) : tab === 'privacy' ? (
          <SettingsSection title="隐私边界" description="只有你主动发起并确认对应 AI 功能时，相关文本才会发送到已配置的模型服务。">
            <StatusRow label="AI Draft" value="仅发送所选 Anchor 文本和论文标题；结果必须人工审阅" />
            <StatusRow label="Paper Map（实验性）" value="逐篇确认后发送当前论文的结构化正文证据块；结果未审阅" />
            <StatusRow label="PDF 文件" value="不发送 PDF 二进制文件；Paper Map 会发送从 PDF 提取的结构化正文文本" />
            <StatusRow label="本地数据" value="不会自动同步或静默传出设备" />
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
