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
      credentialRef: 'keychain://com.paperweave.desktop/openai-compatible',
    }),
    deleteOpenAiApiKey: vi.fn().mockResolvedValue({ configured: false, credentialRef: null }),
    listOpenAiModels: vi.fn().mockResolvedValue([{ id: 'model-a', ownedBy: 'provider' }]),
    saveSettings: vi.fn().mockImplementation(async (settings: WorkspaceSettings) => settings),
    ...overrides,
  } as WorkspaceRepository;
}

describe('SettingsPage model configuration', () => {
  it('saves Base URL, model and a new Keychain credential without echoing the key', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: '测试连接并加载模型' }));
    await screen.findByText('连接成功，已加载 1 个模型。');
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
      openAiCredentialRef: 'keychain://com.paperweave.desktop/openai-compatible',
    }));
    expect(screen.getByLabelText('API Key')).toHaveValue('');
    expect(screen.queryByDisplayValue('test-secret-key')).not.toBeInTheDocument();
    expect(onSettingsSaved).toHaveBeenCalledTimes(1);
  });

  it('loads the existing Keychain status and rejects a missing model ID', async () => {
    const saveSettings = vi.fn();
    const repository = nativeRepository({
      openAiCredentialStatus: vi.fn().mockResolvedValue({
        configured: true,
        credentialRef: 'keychain://com.paperweave.desktop/openai-compatible',
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
    await screen.findByText('已配置于 Keychain');
    expect(screen.getByLabelText('API Key')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('请选择或填写模型 ID。');
    await waitFor(() => expect(saveSettings).not.toHaveBeenCalled());
  });
});
