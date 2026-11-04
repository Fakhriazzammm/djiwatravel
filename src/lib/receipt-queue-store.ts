/**
 * Keeps photos waiting to be read (no signal abroad, tab closed) in IndexedDB so they survive a
 * reload and are read when the phone is online again. Every call is best effort: if storage is
 * blocked the scanner still works in memory.
 */

const DB_NAME = "djiwa-receipts";
const STORE = "queue";

export type StoredReceipt = { id: string; tripId: string; blob: Blob; createdAt: number };

const open = () =>
  new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

const run = async <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) => {
  const db = await open();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    try {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

export const saveQueuedReceipt = (item: StoredReceipt) => run("readwrite", (s) => s.put(item));
export const removeQueuedReceipt = (id: string) => run("readwrite", (s) => s.delete(id));
export async function loadQueuedReceipts(tripId: string): Promise<StoredReceipt[]> {
  const all = (await run("readonly", (s) => s.getAll())) as StoredReceipt[] | null;
  return (all ?? [])
    .filter((item) => item.tripId === tripId)
    .sort((a, b) => a.createdAt - b.createdAt);
}
