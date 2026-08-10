export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorageAdapter implements StorageAdapter {
  readonly #values = new Map<string, string>();

  constructor(seed: Readonly<Record<string, string>> = {}) {
    Object.entries(seed).forEach(([key, value]) => this.#values.set(key, value));
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }
}

export function createDefaultStorageAdapter(): StorageAdapter {
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      return globalThis.localStorage;
    }
  } catch {
    // Access to localStorage can be denied by the host. The caller can still
    // replace this adapter with a Tauri-backed implementation later.
  }

  return new MemoryStorageAdapter();
}

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const SENSITIVE_KEY_SUFFIXES = [
  'apikey',
  'secret',
  'password',
  'credential',
  'authorization',
  'accesstoken',
  'refreshtoken',
  'privatetoken',
  'privatekey',
] as const;

export function isSensitivePersistenceKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized === 'token' || SENSITIVE_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/**
 * Produces JSON-safe data while dropping secret-shaped fields at every depth.
 * Runtime checks are intentional: callers can reach this boundary from JS,
 * imported workspaces, or future native IPC even when TypeScript forbids keys.
 */
export function sanitizeForPersistence(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeForPersistence(item))
      .filter((item): item is JsonValue => item !== undefined);
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, JsonValue> = {};
    Object.entries(value).forEach(([key, item]) => {
      if (isSensitivePersistenceKey(key)) {
        return;
      }
      const safeItem = sanitizeForPersistence(item);
      if (safeItem !== undefined) {
        sanitized[key] = safeItem;
      }
    });
    return sanitized;
  }

  return undefined;
}

export type ReviewDecision = 'accepted' | 'edited' | 'rejected' | 'stale';
export type ReviewObjectType = 'claim' | 'note_block';

export interface ReviewRecord {
  id: string;
  objectId: string;
  objectType: ReviewObjectType;
  decision: ReviewDecision;
  reviewedAt: string;
  reviewer: 'user';
  originalDraft?: string;
  editedContent?: string;
  reason?: string;
}

export type WorkspaceNoteType =
  | 'claim'
  | 'question'
  | 'method'
  | 'limitation'
  | 'action'
  | 'freeform';

export interface WorkspaceNote {
  id: string;
  paperId: string;
  content: string;
  noteType: WorkspaceNoteType;
  createdBy: 'user' | 'ai';
  reviewStatus: 'draft' | 'verified' | 'stale';
  anchorIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSettings {
  interfaceLanguage?: string;
  noteLanguage?: string;
  defaultReadingMode?: string;
  selectedModelProfileId?: string | null;
  cloudMetadataEnabled?: boolean;
  anonymousAnalyticsEnabled?: boolean;
  reducedMotion?: boolean;
  extensions?: Record<string, JsonValue>;
}

export interface WorkspaceSnapshot {
  schemaVersion: 1;
  selectedTopicId: string | null;
  notes: Record<string, WorkspaceNote>;
  reviews: Record<string, ReviewRecord>;
  settings: WorkspaceSettings;
}

export interface WorkspaceStoreOptions {
  storageKey?: string;
}

// Deliberately separate from the repository snapshot key: this focused store
// persists UI/review state and must not overwrite a future SQLite/IndexedDB
// workspace repository payload.
const DEFAULT_STORAGE_KEY = 'paperweave.workspace-state.v1';

function initialSnapshot(): WorkspaceSnapshot {
  return {
    schemaVersion: 1,
    selectedTopicId: null,
    notes: {},
    reviews: {},
    settings: {},
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeNote(id: string, value: unknown): WorkspaceNote | undefined {
  if (!isRecord(value)) return undefined;
  const paperId = readString(value.paperId);
  const content = readString(value.content);
  const noteType = readString(value.noteType);
  const createdBy = readString(value.createdBy);
  const reviewStatus = readString(value.reviewStatus);
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);
  const validNoteTypes: WorkspaceNoteType[] = ['claim', 'question', 'method', 'limitation', 'action', 'freeform'];

  if (
    !paperId ||
    content === undefined ||
    !noteType ||
    !validNoteTypes.includes(noteType as WorkspaceNoteType) ||
    (createdBy !== 'user' && createdBy !== 'ai') ||
    !reviewStatus ||
    !['draft', 'verified', 'stale'].includes(reviewStatus) ||
    !createdAt ||
    !updatedAt
  ) {
    return undefined;
  }

  return {
    id,
    paperId,
    content,
    noteType: noteType as WorkspaceNoteType,
    createdBy,
    reviewStatus: reviewStatus as WorkspaceNote['reviewStatus'],
    anchorIds: Array.isArray(value.anchorIds)
      ? value.anchorIds.filter((anchorId): anchorId is string => typeof anchorId === 'string')
      : [],
    createdAt,
    updatedAt,
  };
}

function normalizeReview(id: string, value: unknown): ReviewRecord | undefined {
  if (!isRecord(value)) return undefined;
  const objectId = readString(value.objectId);
  const objectType = readString(value.objectType);
  const decision = readString(value.decision);
  const reviewedAt = readString(value.reviewedAt);
  if (
    !objectId ||
    (objectType !== 'claim' && objectType !== 'note_block') ||
    !decision ||
    !['accepted', 'edited', 'rejected', 'stale'].includes(decision) ||
    !reviewedAt
  ) {
    return undefined;
  }

  const record: ReviewRecord = {
    id,
    objectId,
    objectType,
    decision: decision as ReviewDecision,
    reviewedAt,
    reviewer: 'user',
  };
  const originalDraft = readString(value.originalDraft);
  const editedContent = readString(value.editedContent);
  const reason = readString(value.reason);
  if (originalDraft !== undefined) record.originalDraft = originalDraft;
  if (editedContent !== undefined) record.editedContent = editedContent;
  if (reason !== undefined) record.reason = reason;
  return record;
}

function normalizeSettings(value: unknown): WorkspaceSettings {
  if (!isRecord(value)) return {};
  const sanitized = sanitizeForPersistence(value);
  return isRecord(sanitized) ? (sanitized as WorkspaceSettings) : {};
}

function normalizeSnapshot(value: unknown): WorkspaceSnapshot {
  if (!isRecord(value)) return initialSnapshot();
  const notes: Record<string, WorkspaceNote> = {};
  const reviews: Record<string, ReviewRecord> = {};

  if (isRecord(value.notes)) {
    Object.entries(value.notes).forEach(([id, note]) => {
      const normalized = normalizeNote(id, note);
      if (normalized) notes[id] = normalized;
    });
  }

  if (isRecord(value.reviews)) {
    Object.entries(value.reviews).forEach(([id, review]) => {
      const normalized = normalizeReview(id, review);
      if (normalized) reviews[id] = normalized;
    });
  }

  return {
    schemaVersion: 1,
    selectedTopicId: typeof value.selectedTopicId === 'string' ? value.selectedTopicId : null,
    notes,
    reviews,
    settings: normalizeSettings(value.settings),
  };
}

export class WorkspaceStore {
  readonly #adapter: StorageAdapter;
  readonly #storageKey: string;
  #snapshot: WorkspaceSnapshot;

  constructor(adapter: StorageAdapter = createDefaultStorageAdapter(), options: WorkspaceStoreOptions = {}) {
    this.#adapter = adapter;
    this.#storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.#snapshot = this.#load();
  }

  getSnapshot(): WorkspaceSnapshot {
    return clone(this.#snapshot);
  }

  setSelectedTopic(topicId: string | null): WorkspaceSnapshot {
    this.#snapshot.selectedTopicId = topicId;
    return this.#persist();
  }

  saveNote(note: WorkspaceNote): WorkspaceSnapshot {
    this.#snapshot.notes[note.id] = clone(note);
    return this.#persist();
  }

  removeNote(noteId: string): WorkspaceSnapshot {
    delete this.#snapshot.notes[noteId];
    return this.#persist();
  }

  saveReview(review: ReviewRecord): WorkspaceSnapshot {
    this.#snapshot.reviews[review.id] = clone(review);
    return this.#persist();
  }

  updateSettings(patch: Partial<WorkspaceSettings>): WorkspaceSnapshot {
    const sanitized = normalizeSettings(patch);
    this.#snapshot.settings = { ...this.#snapshot.settings, ...sanitized };
    return this.#persist();
  }

  clear(): WorkspaceSnapshot {
    this.#adapter.removeItem(this.#storageKey);
    this.#snapshot = initialSnapshot();
    return this.getSnapshot();
  }

  #load(): WorkspaceSnapshot {
    const raw = this.#adapter.getItem(this.#storageKey);
    if (!raw) return initialSnapshot();

    try {
      const snapshot = normalizeSnapshot(JSON.parse(raw) as unknown);
      const sanitizedRaw = JSON.stringify(snapshot);
      if (sanitizedRaw !== raw) {
        this.#adapter.setItem(this.#storageKey, sanitizedRaw);
      }
      return snapshot;
    } catch {
      this.#adapter.removeItem(this.#storageKey);
      return initialSnapshot();
    }
  }

  #persist(): WorkspaceSnapshot {
    const safeSnapshot = normalizeSnapshot(sanitizeForPersistence(this.#snapshot));
    this.#adapter.setItem(this.#storageKey, JSON.stringify(safeSnapshot));
    this.#snapshot = safeSnapshot;
    return this.getSnapshot();
  }
}
