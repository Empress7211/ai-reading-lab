import { createBrowserWorkspaceRepository, type BrowserWorkspaceRepositoryOptions } from './browserWorkspaceRepository';
import { isTauriRuntime } from './runtime';
import type { Invoke } from './tauriCommands';
import { TauriWorkspaceRepository } from './tauriWorkspaceRepository';
import type { WorkspaceRepository } from './types';

export interface CreateWorkspaceRepositoryOptions extends BrowserWorkspaceRepositoryOptions {
  global?: unknown;
  invoke?: Invoke;
}

export function createWorkspaceRepository(
  options: CreateWorkspaceRepositoryOptions = {},
): WorkspaceRepository {
  if (isTauriRuntime(options.global)) {
    return new TauriWorkspaceRepository(options.invoke);
  }
  return createBrowserWorkspaceRepository(options);
}

