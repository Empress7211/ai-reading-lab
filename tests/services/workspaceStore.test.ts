import { describe, expect, it } from 'vitest';

import {
  MemoryStorageAdapter,
  WorkspaceStore,
  type ReviewRecord,
  type WorkspaceNote,
} from '../../src/services/workspaceStore';

const note: WorkspaceNote = {
  id: 'note-1',
  paperId: 'paper-1',
  content: 'The result is bounded to Dataset A.',
  noteType: 'claim',
  createdBy: 'ai',
  reviewStatus: 'verified',
  anchorIds: ['anchor-1'],
  createdAt: '2026-08-04T00:00:00.000Z',
  updatedAt: '2026-08-04T00:01:00.000Z',
};

const review: ReviewRecord = {
  id: 'review-1',
  objectId: 'note-1',
  objectType: 'claim',
  decision: 'edited',
  reviewer: 'user',
  reviewedAt: '2026-08-04T00:01:00.000Z',
  originalDraft: 'The method always improves results.',
  editedContent: note.content,
};

describe('WorkspaceStore', () => {
  it('uses browser localStorage by default while keeping the adapter replaceable', () => {
    localStorage.removeItem('paperweave.workspace-state.v1');
    const store = new WorkspaceStore();

    store.setSelectedTopic('topic-local');

    expect(localStorage.getItem('paperweave.workspace-state.v1')).toContain('topic-local');
    localStorage.removeItem('paperweave.workspace-state.v1');
  });

  it('persists notes, reviews, safe settings, and the selected topic through an adapter', () => {
    const adapter = new MemoryStorageAdapter();
    const store = new WorkspaceStore(adapter);

    store.saveNote(note);
    store.saveReview(review);
    store.updateSettings({ interfaceLanguage: 'zh-CN', cloudMetadataEnabled: false });
    store.setSelectedTopic('topic-rag-evaluation');

    const reloaded = new WorkspaceStore(adapter).getSnapshot();
    expect(reloaded.notes['note-1']).toEqual(note);
    expect(reloaded.reviews['review-1']).toEqual(review);
    expect(reloaded.settings).toMatchObject({
      interfaceLanguage: 'zh-CN',
      cloudMetadataEnabled: false,
    });
    expect(reloaded.selectedTopicId).toBe('topic-rag-evaluation');
  });

  it('drops secret-shaped settings recursively before persistence', () => {
    const adapter = new MemoryStorageAdapter();
    const store = new WorkspaceStore(adapter);

    store.updateSettings({
      interfaceLanguage: 'en',
      extensions: {
        baseUrl: 'https://models.example.test',
        providerApiKey: 'must-never-persist',
        nested: {
          access_token: 'also-secret',
          model: 'example-model',
        },
      },
    } as never);

    const raw = adapter.getItem('paperweave.workspace-state.v1');
    expect(raw).toContain('example-model');
    expect(raw).not.toContain('must-never-persist');
    expect(raw).not.toContain('also-secret');
    expect(new WorkspaceStore(adapter).getSnapshot().settings.extensions).toEqual({
      baseUrl: 'https://models.example.test',
      nested: { model: 'example-model' },
    });
  });

  it('recovers safely from corrupt persisted state', () => {
    const adapter = new MemoryStorageAdapter({ 'paperweave.workspace-state.v1': '{bad json' });
    const snapshot = new WorkspaceStore(adapter).getSnapshot();

    expect(snapshot).toEqual({
      schemaVersion: 1,
      selectedTopicId: null,
      notes: {},
      reviews: {},
      settings: {},
    });
    expect(adapter.getItem('paperweave.workspace-state.v1')).toBeNull();
  });
});
