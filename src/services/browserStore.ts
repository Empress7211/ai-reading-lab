import type { WorkspaceSnapshot } from './types';

const WORKSPACE_STORE = 'workspace';
const PDF_STORE = 'pdfs';
const SNAPSHOT_KEY = 'snapshot';

interface PersistedWorkspace {
  schemaVersion: 1;
  snapshot: WorkspaceSnapshot;
}

export interface PdfAssetRecord {
  paperId: string;
  bytes: ArrayBuffer;
  mimeType: string;
  fileName: string;
}

export interface BrowserStore {
  readonly runtime: 'browser-indexeddb' | 'browser-localstorage';
  loadSnapshot(): Promise<WorkspaceSnapshot | null>;
  saveSnapshot(snapshot: WorkspaceSnapshot): Promise<void>;
  savePdf(asset: PdfAssetRecord): Promise<void>;
  loadPdf(paperId: string): Promise<ArrayBuffer | null>;
}

function cloneSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  if (typeof structuredClone === 'function') {
    return structuredClone(snapshot);
  }
  return JSON.parse(JSON.stringify(snapshot)) as WorkspaceSnapshot;
}

export class LocalStorageBrowserStore implements BrowserStore {
  readonly runtime = 'browser-localstorage' as const;
  readonly #pdfBytes = new Map<string, ArrayBuffer>();

  constructor(
    private readonly storage: Storage,
    private readonly storageKey = 'paperweave.workspace.v1',
  ) {}

  async loadSnapshot(): Promise<WorkspaceSnapshot | null> {
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) {
      return null;
    }

    try {
      const persisted = JSON.parse(raw) as PersistedWorkspace;
      if (persisted.schemaVersion !== 1 || !persisted.snapshot) {
        return null;
      }
      return cloneSnapshot(persisted.snapshot);
    } catch {
      return null;
    }
  }

  async saveSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
    const persisted: PersistedWorkspace = {
      schemaVersion: 1,
      snapshot: cloneSnapshot(snapshot),
    };
    this.storage.setItem(this.storageKey, JSON.stringify(persisted));
  }

  async savePdf(asset: PdfAssetRecord): Promise<void> {
    this.#pdfBytes.set(asset.paperId, asset.bytes.slice(0));
  }

  async loadPdf(paperId: string): Promise<ArrayBuffer | null> {
    return this.#pdfBytes.get(paperId)?.slice(0) ?? null;
  }
}

export class IndexedDbBrowserStore implements BrowserStore {
  readonly runtime = 'browser-indexeddb' as const;
  readonly #database: Promise<IDBDatabase>;

  constructor(
    indexedDb: IDBFactory,
    databaseName = 'paperweave-workspace',
  ) {
    this.#database = new Promise((resolve, reject) => {
      const request = indexedDb.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(WORKSPACE_STORE)) {
          database.createObjectStore(WORKSPACE_STORE);
        }
        if (!database.objectStoreNames.contains(PDF_STORE)) {
          database.createObjectStore(PDF_STORE, { keyPath: 'paperId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'));
      request.onblocked = () => reject(new Error('IndexedDB upgrade was blocked'));
    });
  }

  async loadSnapshot(): Promise<WorkspaceSnapshot | null> {
    const record = await this.#request<PersistedWorkspace | undefined>(
      WORKSPACE_STORE,
      'readonly',
      (store) => store.get(SNAPSHOT_KEY),
    );
    return record?.schemaVersion === 1 ? cloneSnapshot(record.snapshot) : null;
  }

  async saveSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
    const record: PersistedWorkspace = {
      schemaVersion: 1,
      snapshot: cloneSnapshot(snapshot),
    };
    await this.#request(WORKSPACE_STORE, 'readwrite', (store) =>
      store.put(record, SNAPSHOT_KEY),
    );
  }

  async savePdf(asset: PdfAssetRecord): Promise<void> {
    await this.#request(PDF_STORE, 'readwrite', (store) =>
      store.put({ ...asset, bytes: asset.bytes.slice(0) }),
    );
  }

  async loadPdf(paperId: string): Promise<ArrayBuffer | null> {
    const record = await this.#request<PdfAssetRecord | undefined>(
      PDF_STORE,
      'readonly',
      (store) => store.get(paperId),
    );
    return record?.bytes.slice(0) ?? null;
  }

  async #request<T = IDBValidKey>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const database = await this.#database;
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
  }
}

class FallbackBrowserStore implements BrowserStore {
  #primaryFailed = false;

  constructor(
    private readonly primary: BrowserStore,
    private readonly fallback: BrowserStore,
  ) {}

  get runtime(): BrowserStore['runtime'] {
    return this.#primaryFailed ? this.fallback.runtime : this.primary.runtime;
  }

  loadSnapshot(): Promise<WorkspaceSnapshot | null> {
    return this.#run((store) => store.loadSnapshot());
  }

  saveSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
    return this.#run((store) => store.saveSnapshot(snapshot));
  }

  savePdf(asset: PdfAssetRecord): Promise<void> {
    return this.#run((store) => store.savePdf(asset));
  }

  loadPdf(paperId: string): Promise<ArrayBuffer | null> {
    return this.#run((store) => store.loadPdf(paperId));
  }

  async #run<T>(operation: (store: BrowserStore) => Promise<T>): Promise<T> {
    if (this.#primaryFailed) {
      return operation(this.fallback);
    }

    try {
      return await operation(this.primary);
    } catch {
      this.#primaryFailed = true;
      return operation(this.fallback);
    }
  }
}

export interface BrowserStoreOptions {
  indexedDB?: IDBFactory | null;
  localStorage?: Storage;
  databaseName?: string;
  storageKey?: string;
}

export function createBrowserStore(options: BrowserStoreOptions = {}): BrowserStore {
  const localStorage = options.localStorage ?? window.localStorage;
  const fallback = new LocalStorageBrowserStore(localStorage, options.storageKey);
  const indexedDb = options.indexedDB === undefined ? window.indexedDB : options.indexedDB;

  if (!indexedDb) {
    return fallback;
  }

  return new FallbackBrowserStore(
    new IndexedDbBrowserStore(indexedDb, options.databaseName),
    fallback,
  );
}
