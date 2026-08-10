import type { WorkspaceSnapshot } from './types';

const WORKSPACE_STORE = 'workspace';
const PDF_STORE = 'pdfs';
const SNAPSHOT_KEY = 'snapshot';

interface PersistedWorkspace {
  schemaVersion: 1 | 2;
  snapshot: WorkspaceSnapshot;
}

export interface PdfAssetRecord {
  paperId: string;
  bytes: ArrayBuffer;
  mimeType: string;
  fileName: string;
}

export interface BrowserStore {
  readonly runtime: 'browser-indexeddb';
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
    return record && (record.schemaVersion === 1 || record.schemaVersion === 2)
      ? cloneSnapshot(record.snapshot)
      : null;
  }

  async saveSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
    const record: PersistedWorkspace = {
      schemaVersion: 2,
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

export interface BrowserStoreOptions {
  indexedDB?: IDBFactory | null;
  databaseName?: string;
}

export function createBrowserStore(options: BrowserStoreOptions = {}): BrowserStore {
  const indexedDb = options.indexedDB === undefined ? window.indexedDB : options.indexedDB;

  if (!indexedDb) {
    throw new Error('PaperWeave browser development requires IndexedDB; no persistence fallback is used.');
  }

  return new IndexedDbBrowserStore(indexedDb, options.databaseName);
}
