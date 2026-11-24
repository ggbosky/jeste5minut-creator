// IndexedDB — sdílené mezi stránkou a service workerem.
const NAME = "j5m-studio";
const VERSION = 1;
export const STORES = {
  users: "id", settings: "key", api_keys: "id", voice_profiles: "id", chapters: "n", topics: "id", videos: "id",
  script_versions: "id", audio_takes: "id", renders: "id", revisions: "id", poses: "key", assets: "key",
  activity: "id", api_usage: "id", kv: "key", blobs: "key",
} as const;
export type Store = keyof typeof STORES;

let dbp: Promise<IDBDatabase> | null = null;
export function openDb(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const [name, key] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: key, autoIncrement: key === "id" });
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function store(name: Store, mode: IDBTransactionMode = "readonly") {
  return (await openDb()).transaction(name, mode).objectStore(name);
}

export async function all<T>(name: Store): Promise<T[]> {
  return req((await store(name)).getAll()) as Promise<T[]>;
}
export async function get<T>(name: Store, key: IDBValidKey): Promise<T | undefined> {
  return req((await store(name)).get(key)) as Promise<T | undefined>;
}
/** Vloží nebo přepíše; vrací klíč. */
export async function put<T>(name: Store, value: T): Promise<number> {
  return req((await store(name, "readwrite")).put(value as unknown)) as Promise<number>;
}
export async function add<T extends object>(name: Store, value: T): Promise<number> {
  const v = { ...value } as Record<string, unknown>;
  if (v.id === undefined) delete v.id;
  return req((await store(name, "readwrite")).add(v)) as Promise<number>;
}
export async function del(name: Store, key: IDBValidKey) {
  await req((await store(name, "readwrite")).delete(key));
}
export async function patch<T extends object>(name: Store, key: IDBValidKey, p: Partial<T>): Promise<T | undefined> {
  const cur = await get<T>(name, key);
  if (!cur) return undefined;
  const next = { ...cur, ...p };
  await put(name, next);
  return next;
}
export async function count(name: Store) {
  return req((await store(name)).count());
}

// velké soubory zvlášť
export async function putBlob(key: string, blob: Blob) {
  await put("blobs", { key, blob });
}
export async function getBlob(key: string): Promise<Blob | null> {
  return (await get<{ blob: Blob }>("blobs", key))?.blob ?? null;
}
export async function delBlob(key: string) {
  await del("blobs", key);
}

export const nowIso = () => new Date().toISOString();
