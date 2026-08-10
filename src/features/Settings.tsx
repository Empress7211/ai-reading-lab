import { KeyRound, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react';
import { useRef, type FormEvent } from 'react';

export type SettingsSection =
  | 'models'
  | 'workspace'
  | 'zotero'
  | 'git'
  | 'privacy'
  | 'parsing';

export type ModelProfileField =
  | 'name'
  | 'providerType'
  | 'baseUrl'
  | 'claimModel'
  | 'synthesisModel'
  | 'visionModel'
  | 'embeddingModel';

export type SettingsToggle =
  | 'sendFullText'
  | 'retainRawResponses'
  | 'localOnlyDocuments'
  | 'anonymousAnalytics'
  | 'cloudTopicTracking'
  | 'autoCleanModelResponses';

export interface ModelProfileDraft {
  name: string;
  providerType: 'openai-compatible' | 'local-compatible';
  baseUrl: string;
  claimModel: string;
  synthesisModel: string;
  visionModel: string;
  embeddingModel: string;
  hasStoredCredential: boolean;
}

export interface ConnectionPanelState {
  title: string;
  description: string;
  currentValue: string;
  statusLabel: string;
  statusDetail: string;
}

export interface SettingsProps {
  activeSection: SettingsSection;
  modelProfile: ModelProfileDraft;
  toggles: Readonly<Record<SettingsToggle, boolean>>;
  connectionPanels: Readonly<
    Record<Exclude<SettingsSection, 'models' | 'privacy'>, ConnectionPanelState>
  >;
  onSectionChange: (section: SettingsSection) => void;
  onModelProfileChange: (field: ModelProfileField, value: string) => void;
  onToggle: (setting: SettingsToggle, nextValue: boolean) => void;
  onTestModel: (credentialReplacement: string | null) => void;
  onSaveModelProfile: (credentialReplacement: string | null) => void;
  onDeleteStoredCredential: () => void;
  onCheckConnection: (section: Exclude<SettingsSection, 'models' | 'privacy'>) => void;
  onEditConnection: (section: Exclude<SettingsSection, 'models' | 'privacy'>) => void;
}

const SETTINGS_LABELS: Record<SettingsSection, string> = {
  models: '模型与路由',
  workspace: '工作区',
  zotero: 'Zotero',
  git: 'Git / GitHub',
  privacy: '隐私与云端',
  parsing: 'PDF 与解析',
};

interface SettingSwitchProps {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function SettingSwitch({
  id,
  title,
  description,
  checked,
  onChange,
}: SettingSwitchProps) {
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;

  return (
    <div className="setting-row">
      <div>
        <strong id={labelId}>{title}</strong>
        <span id={descriptionId}>{description}</span>
      </div>
      <button
        className={`switch ${checked ? 'on' : ''}`}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        onClick={() => onChange(!checked)}
      >
        <span className="sr-only">{checked ? '已启用' : '已停用'}</span>
      </button>
    </div>
  );
}

interface ModelsPanelProps {
  profile: ModelProfileDraft;
  toggles: SettingsProps['toggles'];
  onModelProfileChange: SettingsProps['onModelProfileChange'];
  onToggle: SettingsProps['onToggle'];
  onTestModel: SettingsProps['onTestModel'];
  onSaveModelProfile: SettingsProps['onSaveModelProfile'];
  onDeleteStoredCredential: SettingsProps['onDeleteStoredCredential'];
}

function ModelsPanel({
  profile,
  toggles,
  onModelProfileChange,
  onToggle,
  onTestModel,
  onSaveModelProfile,
  onDeleteStoredCredential,
}: ModelsPanelProps) {
  const credentialInputRef = useRef<HTMLInputElement>(null);

  const readCredentialReplacement = () => {
    const replacement = credentialInputRef.current?.value.trim() ?? '';
    return replacement.length > 0 ? replacement : null;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSaveModelProfile(readCredentialReplacement());
    if (credentialInputRef.current) credentialInputRef.current.value = '';
  };

  return (
    <section className="settings-section" aria-labelledby="models-settings-title">
      <div className="settings-section-head">
        <h2 id="models-settings-title">模型 Provider</h2>
        <p>按任务路由模型；密钥只进入系统 Keychain，不进入 React 状态、数据库或日志。</p>
      </div>
      <form className="settings-body" onSubmit={handleSubmit}>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="model-profile-name">Profile 名称</label>
            <input
              id="model-profile-name"
              value={profile.name}
              onChange={(event) => onModelProfileChange('name', event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="model-provider-type">Provider 类型</label>
            <select
              id="model-provider-type"
              value={profile.providerType}
              onChange={(event) => onModelProfileChange('providerType', event.target.value)}
            >
              <option value="openai-compatible">OpenAI-compatible</option>
              <option value="local-compatible">Local compatible server</option>
            </select>
          </div>
          <div className="field full">
            <label htmlFor="model-base-url">Base URL</label>
            <input
              id="model-base-url"
              inputMode="url"
              value={profile.baseUrl}
              onChange={(event) => onModelProfileChange('baseUrl', event.target.value)}
            />
          </div>
          <div className="field full credential-field">
            <label htmlFor="model-api-key">API Key</label>
            <div className="credential-input-row">
              <KeyRound aria-hidden="true" />
              <input
                id="model-api-key"
                name="model-api-key"
                type="password"
                defaultValue=""
                ref={credentialInputRef}
                autoComplete="new-password"
                placeholder={
                  profile.hasStoredCredential
                    ? '输入新 Key 以替换现有凭据'
                    : '输入新的 API Key'
                }
                aria-describedby="model-api-key-help"
              />
            </div>
            <div className="field-note" id="model-api-key-help">
              {profile.hasStoredCredential
                ? '已有凭据保存在系统 Keychain。PaperWeave 不会回显、预填或导出它。'
                : '初始为空；保存后只保留 Keychain 引用，不保留明文。'}
            </div>
            {profile.hasStoredCredential ? (
              <button
                className="ghost-button credential-delete"
                type="button"
                onClick={onDeleteStoredCredential}
              >
                <Trash2 aria-hidden="true" /> 删除已存凭据
              </button>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="claim-model">Claim 提取</label>
            <input
              id="claim-model"
              value={profile.claimModel}
              onChange={(event) => onModelProfileChange('claimModel', event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="synthesis-model">跨论文综合</label>
            <input
              id="synthesis-model"
              value={profile.synthesisModel}
              onChange={(event) => onModelProfileChange('synthesisModel', event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="vision-model">视觉与图表</label>
            <input
              id="vision-model"
              value={profile.visionModel}
              onChange={(event) => onModelProfileChange('visionModel', event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="embedding-model">Embedding</label>
            <input
              id="embedding-model"
              value={profile.embeddingModel}
              onChange={(event) => onModelProfileChange('embeddingModel', event.target.value)}
            />
          </div>
        </div>

        <SettingSwitch
          id="send-full-text"
          title="允许发送整篇全文"
          description="默认关闭；优先发送当前选区、章节与必要的 Verified context。"
          checked={toggles.sendFullText}
          onChange={(checked) => onToggle('sendFullText', checked)}
        />
        <SettingSwitch
          id="retain-raw-responses"
          title="保留模型原始响应 7 天"
          description="仅用于诊断；可随时删除，不包含凭据。"
          checked={toggles.retainRawResponses}
          onChange={(checked) => onToggle('retainRawResponses', checked)}
        />

        <div className="settings-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => onTestModel(readCredentialReplacement())}
          >
            测试连接
          </button>
          <button className="primary-button" type="submit">
            保存 Profile
          </button>
        </div>
      </form>
    </section>
  );
}

interface PrivacyPanelProps {
  toggles: SettingsProps['toggles'];
  onToggle: SettingsProps['onToggle'];
}

function PrivacyPanel({ toggles, onToggle }: PrivacyPanelProps) {
  return (
    <section className="settings-section" aria-labelledby="privacy-settings-title">
      <div className="settings-section-head">
        <h2 id="privacy-settings-title">隐私与数据流</h2>
        <p>按数据类别控制本地、模型 Provider 与可选 PaperWeave Cloud。</p>
      </div>
      <div className="settings-body">
        <div className="privacy-principle">
          <ShieldCheck aria-hidden="true" />
          <p>完整 PDF、批注与笔记默认留在本机；任何云同步都需要明确开关。</p>
        </div>
        <SettingSwitch
          id="local-only-documents"
          title="PDF 与完整笔记只保留本地"
          description="关闭此项仍不会自动上传；必须在具体同步计划中再次确认。"
          checked={toggles.localOnlyDocuments}
          onChange={(checked) => onToggle('localOnlyDocuments', checked)}
        />
        <SettingSwitch
          id="anonymous-analytics"
          title="匿名产品分析"
          description="不包含标题、查询、正文、Anchor、笔记或模型密钥。"
          checked={toggles.anonymousAnalytics}
          onChange={(checked) => onToggle('anonymousAnalytics', checked)}
        />
        <SettingSwitch
          id="cloud-topic-tracking"
          title="云端主题追踪"
          description="仅同步 Topic 定义与公开元数据 ID。"
          checked={toggles.cloudTopicTracking}
          onChange={(checked) => onToggle('cloudTopicTracking', checked)}
        />
        <SettingSwitch
          id="auto-clean-model-responses"
          title="自动清理原始模型响应"
          description="按保留策略删除响应正文，同时保留最小审计元数据。"
          checked={toggles.autoCleanModelResponses}
          onChange={(checked) => onToggle('autoCleanModelResponses', checked)}
        />
      </div>
    </section>
  );
}

interface ConnectionPanelProps {
  section: Exclude<SettingsSection, 'models' | 'privacy'>;
  panel: ConnectionPanelState;
  onCheckConnection: SettingsProps['onCheckConnection'];
  onEditConnection: SettingsProps['onEditConnection'];
}

function ConnectionPanel({
  section,
  panel,
  onCheckConnection,
  onEditConnection,
}: ConnectionPanelProps) {
  const valueId = `${section}-current-config`;

  return (
    <section className="settings-section" aria-labelledby={`${section}-settings-title`}>
      <div className="settings-section-head">
        <h2 id={`${section}-settings-title`}>{panel.title}</h2>
        <p>{panel.description}</p>
      </div>
      <div className="settings-body">
        <div className="connection-status" role="status">
          <LockKeyhole aria-hidden="true" />
          <div>
            <strong>{panel.statusLabel}</strong>
            <span>{panel.statusDetail}</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor={valueId}>当前配置</label>
          <input id={valueId} value={panel.currentValue} readOnly />
        </div>
        <div className="settings-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => onCheckConnection(section)}
          >
            检查连接
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => onEditConnection(section)}
          >
            更改配置
          </button>
        </div>
      </div>
    </section>
  );
}

export function Settings({
  activeSection,
  modelProfile,
  toggles,
  connectionPanels,
  onSectionChange,
  onModelProfileChange,
  onToggle,
  onTestModel,
  onSaveModelProfile,
  onDeleteStoredCredential,
  onCheckConnection,
  onEditConnection,
}: SettingsProps) {
  const content =
    activeSection === 'models' ? (
      <ModelsPanel
        profile={modelProfile}
        toggles={toggles}
        onModelProfileChange={onModelProfileChange}
        onToggle={onToggle}
        onTestModel={onTestModel}
        onSaveModelProfile={onSaveModelProfile}
        onDeleteStoredCredential={onDeleteStoredCredential}
      />
    ) : activeSection === 'privacy' ? (
      <PrivacyPanel toggles={toggles} onToggle={onToggle} />
    ) : (
      <ConnectionPanel
        section={activeSection}
        panel={connectionPanels[activeSection]}
        onCheckConnection={onCheckConnection}
        onEditConnection={onEditConnection}
      />
    );

  return (
    <div className="page settings-page">
      <div className="section-heading">
        <div>
          <h1>设置</h1>
          <p>本地工作区、模型路由、外部连接与数据流边界。</p>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分区">
          {(Object.keys(SETTINGS_LABELS) as SettingsSection[]).map((section) => (
            <button
              className={activeSection === section ? 'active' : ''}
              type="button"
              aria-current={activeSection === section ? 'page' : undefined}
              key={section}
              onClick={() => onSectionChange(section)}
            >
              {SETTINGS_LABELS[section]}
            </button>
          ))}
        </nav>
        {content}
      </div>
    </div>
  );
}
