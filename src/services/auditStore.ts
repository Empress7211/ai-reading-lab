import {
  createDefaultStorageAdapter,
  sanitizeForPersistence,
  type JsonValue,
  type StorageAdapter,
} from './workspaceStore';

export type AuditActor = 'user' | 'system' | 'ai';

export interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: AuditActor;
  occurredAt: string;
  details: Record<string, JsonValue>;
}

export interface AuditEventInput {
  action: string;
  entityType: string;
  entityId: string;
  actor?: AuditActor;
  details?: Record<string, unknown>;
}

export interface AuditStoreOptions {
  storageKey?: string;
  now?: () => string;
  idFactory?: () => string;
}

interface PersistedAuditLog {
  schemaVersion: 1;
  events: AuditEvent[];
}

const DEFAULT_STORAGE_KEY = 'paperweave.audit.v1';

function defaultIdFactory(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeEvent(value: unknown): AuditEvent | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.id !== 'string' ||
    typeof value.action !== 'string' ||
    typeof value.entityType !== 'string' ||
    typeof value.entityId !== 'string' ||
    !['user', 'system', 'ai'].includes(String(value.actor)) ||
    typeof value.occurredAt !== 'string'
  ) {
    return undefined;
  }
  const safeDetails = sanitizeForPersistence(value.details);
  return {
    id: value.id,
    action: value.action,
    entityType: value.entityType,
    entityId: value.entityId,
    actor: value.actor as AuditActor,
    occurredAt: value.occurredAt,
    details: isRecord(safeDetails) ? (safeDetails as Record<string, JsonValue>) : {},
  };
}

export class AuditStore {
  readonly #adapter: StorageAdapter;
  readonly #storageKey: string;
  readonly #now: () => string;
  readonly #idFactory: () => string;
  #events: AuditEvent[];

  constructor(adapter: StorageAdapter = createDefaultStorageAdapter(), options: AuditStoreOptions = {}) {
    this.#adapter = adapter;
    this.#storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#idFactory = options.idFactory ?? defaultIdFactory;
    this.#events = this.#load();
  }

  append(input: AuditEventInput): AuditEvent {
    const safeDetails = sanitizeForPersistence(input.details ?? {});
    const event: AuditEvent = {
      id: this.#idFactory(),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      actor: input.actor ?? 'user',
      occurredAt: this.#now(),
      details: isRecord(safeDetails) ? (safeDetails as Record<string, JsonValue>) : {},
    };
    this.#events = [...this.#events, event];
    this.#persist();
    return clone(event);
  }

  list(): AuditEvent[] {
    return clone(this.#events);
  }

  clear(): void {
    this.#events = [];
    this.#adapter.removeItem(this.#storageKey);
  }

  #load(): AuditEvent[] {
    const raw = this.#adapter.getItem(this.#storageKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed) || !Array.isArray(parsed.events)) return [];
      const events = parsed.events
        .map((event) => normalizeEvent(event))
        .filter((event): event is AuditEvent => event !== undefined);
      const sanitized = JSON.stringify({ schemaVersion: 1, events });
      if (sanitized !== raw) this.#adapter.setItem(this.#storageKey, sanitized);
      return events;
    } catch {
      this.#adapter.removeItem(this.#storageKey);
      return [];
    }
  }

  #persist(): void {
    const payload: PersistedAuditLog = { schemaVersion: 1, events: this.#events };
    this.#adapter.setItem(this.#storageKey, JSON.stringify(payload));
  }
}
