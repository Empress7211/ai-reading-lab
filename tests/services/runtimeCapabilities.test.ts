import { describe, expect, it } from 'vitest';

import {
  detectRuntimeKind,
  getRuntimeCapabilities,
  getTaskCapability,
} from '../../src/services/runtimeCapabilities';

describe('runtime capabilities', () => {
  it('distinguishes a browser from a Tauri webview without claiming native integrations', () => {
    expect(detectRuntimeKind({})).toBe('browser');
    expect(detectRuntimeKind({ __TAURI_INTERNALS__: {} })).toBe('tauri-webview');

    const capabilities = getRuntimeCapabilities('tauri-webview');
    expect(capabilities.runtime).toBe('tauri-webview');
    expect(capabilities.tasks['workspace.storage'].state).toBe('demo');
    expect(capabilities.tasks['zotero.write'].state).toBe('native-unavailable');
    expect(capabilities.tasks['git.commit'].state).toBe('native-unavailable');
    expect(capabilities.tasks['keychain.secrets'].state).toBe('native-unavailable');
  });

  it('exposes demo and unavailable states per task', () => {
    expect(getTaskCapability('sync.preview', 'browser').state).toBe('demo');
    expect(getTaskCapability('github.push', 'browser')).toMatchObject({
      state: 'native-unavailable',
      id: 'github.push',
    });
  });
});
