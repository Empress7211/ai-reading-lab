import { describe, expect, it, vi } from 'vitest';
import { TauriWorkspaceRepository } from '../tauriWorkspaceRepository';

describe('TauriWorkspaceRepository', () => {
  it('loads PDF bytes by paper id without accepting a path', async () => {
    const invoke = vi.fn().mockResolvedValue([37, 80, 68, 70]);
    const repository = new TauriWorkspaceRepository(invoke);

    const bytes = await repository.loadPdfBytes('paper-1');

    expect(new Uint8Array(bytes ?? new ArrayBuffer(0))).toEqual(
      Uint8Array.from([37, 80, 68, 70]),
    );
    expect(invoke).toHaveBeenCalledWith('load_pdf_bytes', { paperId: 'paper-1' });
  });

  it('rejects browser File imports before invoking native code', async () => {
    const invoke = vi.fn();
    const repository = new TauriWorkspaceRepository(invoke);

    await expect(
      repository.importPdf({ kind: 'browser-file', file: {} as File }),
    ).rejects.toThrow('native file dialog');
    expect(invoke).not.toHaveBeenCalled();
  });
});

