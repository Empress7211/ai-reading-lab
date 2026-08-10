import { describe, expect, it } from 'vitest';

import { AuditStore } from '../../src/services/auditStore';
import { MemoryStorageAdapter } from '../../src/services/workspaceStore';

describe('AuditStore', () => {
  it('appends immutable, reloadable review events in order', () => {
    const adapter = new MemoryStorageAdapter();
    let nextId = 0;
    const store = new AuditStore(adapter, {
      now: () => '2026-08-04T02:00:00.000Z',
      idFactory: () => `audit-${++nextId}`,
    });

    const first = store.append({
      action: 'review.edited',
      entityType: 'claim',
      entityId: 'claim-1',
      details: { before: 'relative improvement', after: 'absolute improvement' },
    });
    store.append({
      action: 'note.verified',
      entityType: 'note',
      entityId: 'note-1',
      actor: 'system',
    });
    first.details.after = 'mutated outside the store';

    const events = new AuditStore(adapter).list();
    expect(events.map((event) => event.action)).toEqual(['review.edited', 'note.verified']);
    expect(events[0]?.details.after).toBe('absolute improvement');
  });

  it('never serializes credentials included in event details', () => {
    const adapter = new MemoryStorageAdapter();
    const store = new AuditStore(adapter, {
      now: () => '2026-08-04T02:00:00.000Z',
      idFactory: () => 'audit-secret-test',
    });

    store.append({
      action: 'settings.changed',
      entityType: 'workspace',
      entityId: 'local',
      details: {
        provider: 'example',
        apiKey: 'never-write-this',
        nested: { refresh_token: 'nor-this', model: 'model-a' },
      },
    });

    const raw = adapter.getItem('paperweave.audit.v1');
    expect(raw).toContain('model-a');
    expect(raw).not.toContain('never-write-this');
    expect(raw).not.toContain('nor-this');
  });
});
