/**
 * IndexedDB store for offline inspections.
 *
 * Images are held as Blobs in IndexedDB — never in localStorage — so a full
 * field inspection (several multi-megabyte photographs, declarations, notes)
 * survives a closed tab, a reload and a flat connection. Nothing is deleted
 * from here until the server has confirmed it.
 */

const DB_NAME = "scanova-offline";
const DB_VERSION = 1;

export const STORE_INSPECTIONS = "inspections";
export const STORE_IMAGES = "images";
export const STORE_QUEUE = "queue";
export const STORE_CACHE = "cache";
export const STORE_META = "meta";

export type LocalSyncState = "local" | "pending" | "processing" | "synced" | "failed";

export interface LocalInspection {
  clientRef: string;
  serverId: string | null;
  ownerId: string;
  productName: string;
  manufacturerName: string | null;
  category: string;
  barcode: string | null;
  barcodeFormat: string | null;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  /** Declarations typed by the inspector while offline. */
  manualFields: Record<string, string | null>;
  syncState: LocalSyncState;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LocalImage {
  id: string;
  clientRef: string;
  side: string;
  /** `original` is evidence and is never altered; `processed` is the OCR copy. */
  kind: "original" | "processed";
  blob: Blob;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  qualityScore: number | null;
  qualityNote: string | null;
  preprocessNote: string | null;
  syncState: LocalSyncState;
  createdAt: number;
}

export type QueueEntity = "inspection" | "image" | "processing" | "package_scan";

export interface QueueOp {
  id?: number;
  clientOpId: string;
  entity: QueueEntity;
  operation: string;
  /** JSON-serialisable payload; blobs live in the images store. */
  payload: Record<string, unknown>;
  attempts: number;
  status: "pending" | "processing" | "done" | "failed";
  lastError: string | null;
  nextAttemptAt: number;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function offlineSupported() {
  return typeof indexedDB !== "undefined";
}

function open(): Promise<IDBDatabase> {
  if (!offlineSupported()) return Promise.reject(new Error("Offline storage is unavailable."));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_INSPECTIONS)) {
          const s = db.createObjectStore(STORE_INSPECTIONS, { keyPath: "clientRef" });
          s.createIndex("syncState", "syncState");
          s.createIndex("ownerId", "ownerId");
        }
        if (!db.objectStoreNames.contains(STORE_IMAGES)) {
          const s = db.createObjectStore(STORE_IMAGES, { keyPath: "id" });
          s.createIndex("clientRef", "clientRef");
          s.createIndex("syncState", "syncState");
        }
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          const s = db.createObjectStore(STORE_QUEUE, { keyPath: "id", autoIncrement: true });
          s.createIndex("status", "status");
          s.createIndex("clientOpId", "clientOpId", { unique: true });
        }
        if (!db.objectStoreNames.contains(STORE_CACHE))
          db.createObjectStore(STORE_CACHE, { keyPath: "key" });
        if (!db.objectStoreNames.contains(STORE_META))
          db.createObjectStore(STORE_META, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Offline storage could not be opened."));
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Offline storage write failed."));
      }),
  );
}

export const put = <T>(store: string, value: T) => run<IDBValidKey>(store, "readwrite", (s) => s.put(value as never));
export const get = <T>(store: string, key: IDBValidKey) => run<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
export const del = (store: string, key: IDBValidKey) => run<undefined>(store, "readwrite", (s) => s.delete(key));
export const all = <T>(store: string) => run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);

export async function allByIndex<T>(store: string, index: string, value: IDBValidKey): Promise<T[]> {
  const db = await open();
  return new Promise<T[]>((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).index(index).getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error ?? new Error("Offline storage read failed."));
  });
}

export function newClientRef(prefix = "loc") {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

// ---------------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------------

export async function saveLocalInspection(record: LocalInspection) {
  await put(STORE_INSPECTIONS, { ...record, updatedAt: Date.now() });
  return record;
}

export const localInspection = (clientRef: string) =>
  get<LocalInspection>(STORE_INSPECTIONS, clientRef);

export async function localInspections(ownerId?: string) {
  const rows = await all<LocalInspection>(STORE_INSPECTIONS);
  return rows
    .filter((r) => !ownerId || r.ownerId === ownerId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function markInspectionSynced(clientRef: string, serverId: string) {
  const row = await localInspection(clientRef);
  if (!row) return;
  await put(STORE_INSPECTIONS, { ...row, serverId, syncState: "synced", lastError: null, updatedAt: Date.now() });
}

export async function markInspectionState(
  clientRef: string,
  syncState: LocalSyncState,
  lastError: string | null = null,
) {
  const row = await localInspection(clientRef);
  if (!row) return;
  await put(STORE_INSPECTIONS, { ...row, syncState, lastError, updatedAt: Date.now() });
}

export async function discardLocalInspection(clientRef: string) {
  const images = await allByIndex<LocalImage>(STORE_IMAGES, "clientRef", clientRef);
  await Promise.all(images.map((i) => del(STORE_IMAGES, i.id)));
  const ops = await all<QueueOp>(STORE_QUEUE);
  await Promise.all(
    ops.filter((o) => o.payload["clientRef"] === clientRef && o.id != null).map((o) => del(STORE_QUEUE, o.id!)),
  );
  await del(STORE_INSPECTIONS, clientRef);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export const saveLocalImage = (image: LocalImage) => put(STORE_IMAGES, image);
export const localImages = (clientRef: string) =>
  allByIndex<LocalImage>(STORE_IMAGES, "clientRef", clientRef);
export const localImage = (id: string) => get<LocalImage>(STORE_IMAGES, id);
export const deleteLocalImage = (id: string) => del(STORE_IMAGES, id);

export async function markImageSynced(id: string) {
  const row = await localImage(id);
  if (row) await put(STORE_IMAGES, { ...row, syncState: "synced" });
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export async function enqueue(op: Omit<QueueOp, "id" | "attempts" | "status" | "lastError" | "nextAttemptAt" | "createdAt"> & Partial<Pick<QueueOp, "nextAttemptAt">>) {
  const existing = await all<QueueOp>(STORE_QUEUE);
  // Idempotency: the same client operation id is never queued twice.
  const dup = existing.find((o) => o.clientOpId === op.clientOpId && o.status !== "done");
  if (dup) return dup;
  const record: QueueOp = {
    clientOpId: op.clientOpId,
    entity: op.entity,
    operation: op.operation,
    payload: op.payload,
    attempts: 0,
    status: "pending",
    lastError: null,
    nextAttemptAt: op.nextAttemptAt ?? Date.now(),
    createdAt: Date.now(),
  };
  const id = await put(STORE_QUEUE, record);
  return { ...record, id: Number(id) };
}

export async function queueOps() {
  const rows = await all<QueueOp>(STORE_QUEUE);
  return rows.filter((r) => r.status !== "done").sort((a, b) => a.createdAt - b.createdAt);
}

export async function updateOp(op: QueueOp) {
  await put(STORE_QUEUE, op);
}

export async function completeOp(op: QueueOp) {
  if (op.id != null) await del(STORE_QUEUE, op.id);
}

export async function retryFailedOps() {
  const rows = await queueOps();
  await Promise.all(
    rows
      .filter((r) => r.status === "failed")
      .map((r) => updateOp({ ...r, status: "pending", attempts: 0, nextAttemptAt: Date.now(), lastError: null })),
  );
}

// ---------------------------------------------------------------------------
// Read-through cache (registry lookups, dashboards, rule library)
// ---------------------------------------------------------------------------

export async function cacheSet(key: string, value: unknown) {
  try {
    await put(STORE_CACHE, { key, value, ts: Date.now() });
  } catch {
    /* cache is best-effort */
  }
}

export async function cacheGet<T>(key: string, maxAgeMs = 7 * 24 * 3600 * 1000) {
  try {
    const row = await get<{ key: string; value: T; ts: number }>(STORE_CACHE, key);
    if (!row) return null;
    if (Date.now() - row.ts > maxAgeMs) return null;
    return { value: row.value, ts: row.ts };
  } catch {
    return null;
  }
}

export async function metaSet(key: string, value: unknown) {
  await put(STORE_META, { key, value });
}

export async function metaGet<T>(key: string) {
  const row = await get<{ key: string; value: T }>(STORE_META, key);
  return row?.value ?? null;
}

export async function storageEstimate() {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return null;
  }
}
