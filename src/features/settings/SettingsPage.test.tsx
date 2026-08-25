import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WORKSPACE_SETTINGS,
  type WorkspaceRepository,
  type WorkspaceSettings,
} from '../../services';
import { SettingsPage } from './SettingsPage';

afterEach(cleanup);

function nativeRepository(overrides: Partial<WorkspaceRepository> = {}): WorkspaceRepository {
  return {
    runtime: 'tauri',
    openAiCredentialStatus: vi.fn().mockResolvedValue({ configured: false, credentialRef: null }),
    saveOpenAiApiKey: vi.fn().mockResolvedValue({
      configured: true,
      credentialRef: 'paperweave-local://openai-compatible',
    }),
    deleteOpenAiApiKey: vi.fn().mockResolvedValue({ configured: false, credentialRef: null }),
    listOpenAiModels: vi.fn().mockResolvedValue([{ id: 'model-a', ownedBy: 'provider' }]),
    saveSettings: vi.fn().mockImplementation(async (settings: WorkspaceSettings) => settings),
    ...overrides,
  } as WorkspaceRepository;
}

describe('SettingsPage model configuration', () => {
  it('saves Base URL, model and a persistent PaperWeave credential without echoing the key', async () => {
    const repository = nativeRepository();
    const onSettingsSaved = vi.fn();
    render(<SettingsPage
      runtimeLabel="Tauri + SQLite · 本机"
      repository={repository}
      settings={DEFAULT_WORKSPACE_SETTINGS}
      onSettingsSaved={onSettingsSaved}
    />);

    fireEvent.click(screen.getByRole('button', { name: '模型与 API' }));
    await screen.findByText('未配置');
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://provider.example/v1/' },
    });
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'test-secret-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: '加载模型列表（可选）' }));
    await screen.findByText('已加载 1 个模型。');
    expect(repository.listOpenAiModels).toHaveBeenCalledWith({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'test-secret-key',
    });
    fireEvent.change(screen.getByLabelText('模型 ID'), {
      target: { value: 'model-a' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await screen.findByText('模型配置已保存；API Key 不会回显。');
    expect(repository.saveOpenAiApiKey).toHaveBeenCalledWith('test-secret-key');
    expect(repository.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      openAiBaseUrl: 'https://provider.example/v1',
      openAiModel: 'model-a',
      openAiCredentialRef: 'paperweave-local://openai-compatible',
    }));
    expect(screen.getByLabelText('API Key')).toHaveValue('');
    expect(screen.queryByDisplayValue('test-secret-key')).not.toBeInTheDocument();
    expect(onSettingsSaved).toHaveBeenCalledTimes(1);
  });

  it('explains optional model loading and exposes its pending state', async () => {
    let finish!: (models: { id: string; ownedBy: string }[]) => void;
    const listOpenAiModels = vi.fn(() => new Promise<{ id: string; ownedBy: string }[]>((resolve) => { finish = resolve; }));
    const repository = nativeRepository({ listOpenAiModels });
    render(<SettingsPage
      runtimeLabel="Tauri + SQLite · 本机"
      repository={repository}
      settings={DEFAULT_WORKSPACE_SETTINGS}
      onSettingsSaved={() => undefined}
    />);

    fireEvent.click(screen.getByRole('button', { name: '模型与 API' }));
    await screen.findByText('未配置');
    expect(screen.getByText(/只有点击“加载模型列表（可选）”时才请求 \/models/)).toBeInTheDocument();
    expect(screen.getByText(/加载失败不代表 \/chat\/completions 不可用/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'test-key' } });
    fireEvent.click(screen.getByRole('button', { name: '加载模型列表（可选）' }));

    expect(screen.getByRole('button', { name: '正在加载…' })).toBeDisabled();
    expect(listOpenAiModels).toHaveBeenCalledTimes(1);
    finish([{ id: 'model-a', ownedBy: 'provider' }]);
    await screen.findByText('已加载 1 个模型。');
  });

  it('loads the existing PaperWeave credential status and rejects a missing model ID', async () => {
    const saveSettings = vi.fn();
    const repository = nativeRepository({
      openAiCredentialStatus: vi.fn().mockResolvedValue({
        configured: true,
        credentialRef: 'paperweave-local://openai-compatible',
      }),
      saveSettings,
    });
    render(<SettingsPage
      runtimeLabel="Tauri + SQLite · 本机"
      repository={repository}
      settings={DEFAULT_WORKSPACE_SETTINGS}
      onSettingsSaved={() => undefined}
    />);

    fireEvent.click(screen.getByRole('button', { name: '模型与 API' }));
    await screen.findByText('已保存在 PaperWeave');
    expect(screen.getByLabelText('API Key')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('请选择或填写模型 ID。');
    await waitFor(() => expect(saveSettings).not.toHaveBeenCalled());
  });

  it('shows a Tauri string model-list error unchanged', async () => {
    const error = 'OPENAI_MODELS_REQUEST_FAILED: provider returned 401 Unauthorized';
    const repository = nativeRepository({
      openAiCredentialStatus: vi.fn().mockResolvedValue({
        configured: true,
        credentialRef: 'paperweave-local://openai-compatible',
      }),
      listOpenAiModels: vi.fn().mockRejectedValue(error),
    });
    render(<SettingsPage
      runtimeLabel="Tauri + SQLite · 本机"
      repository={repository}
      settings={DEFAULT_WORKSPACE_SETTINGS}
      onSettingsSaved={() => undefined}
    />);

    fireEvent.click(screen.getByRole('button', { name: '模型与 API' }));
    await screen.findByText('已保存在 PaperWeave');
    fireEvent.click(screen.getByRole('button', { name: '加载模型列表（可选）' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(error);
  });
});
