import { describe, expect, it } from 'vitest';
import { isTauriRuntime } from '../runtime';

describe('isTauriRuntime', () => {
  it('detects the Tauri internals marker', () => {
    expect(isTauriRuntime({ __TAURI_INTERNALS__: {} })).toBe(true);
    expect(isTauriRuntime({ window: { __TAURI_INTERNALS__: {} } })).toBe(true);
  });

  it('returns false for an ordinary browser global', () => {
    expect(isTauriRuntime({ window: {} })).toBe(false);
    expect(isTauriRuntime(undefined)).toBe(false);
  });
});

