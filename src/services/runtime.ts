declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauriRuntime(candidate: unknown = globalThis): boolean {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  const maybeWindow = candidate as { window?: unknown; __TAURI_INTERNALS__?: unknown };
  const runtimeWindow =
    maybeWindow.window && typeof maybeWindow.window === 'object'
      ? (maybeWindow.window as { __TAURI_INTERNALS__?: unknown })
      : maybeWindow;

  return runtimeWindow.__TAURI_INTERNALS__ !== undefined;
}

