import type { Profile } from "../shared/people";
import type { PendingSave, Snapshot } from "../shared/offline";
import {
  preparePending,
  projectSnapshot,
  mergeSnapshot,
} from "../shared/offline";
import type { Command } from "../shared/model";
type Session = { profile: Profile; mode: string };
export type OfflineState = {
  session: Session | null;
  accounts: Record<
    string,
    { cache: Record<string, any>; queue: PendingSave[]; archive: PendingSave[] }
  >;
};
let dbPromise: Promise<IDBDatabase> | undefined;
function db() {
  return (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("vgm-offline", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("state");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
export async function storage<R>(
  fn: (state: OfflineState) => R,
  write = false,
): Promise<R> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("state", write ? "readwrite" : "readonly"),
      store = tx.objectStore("state");
    let result: R;
    const request = store.get("app");
    request.onsuccess = () => {
      try {
        const state: OfflineState = request.result ?? {
          session: null,
          accounts: {},
        };
        result = fn(state);
        if (write) store.put(state, "app");
      } catch (e) {
        tx.abort();
        reject(e);
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(
        tx.error ??
          new Error(
            "No se pudo guardar la copia local. Revisa el espacio disponible.",
          ),
      );
  });
}
export const session = () => storage((s) => s.session);
export async function rememberSession(profile: Profile, mode: string) {
  await storage((s) => {
    s.session = { profile, mode };
    s.accounts[profile.id] ??= { cache: {}, queue: [], archive: [] };
  }, true);
}
export const forgetSession = () =>
  storage((s) => {
    s.session = null;
  }, true);
export async function cacheResponse(path: string, data: any) {
  await storage((s) => {
    if (s.session) {
      const cache = s.accounts[s.session.profile.id].cache;
      cache[path] = path === "data" ? mergeSnapshot(cache.data, data) : data;
    }
  }, true);
}
export const pendingItems = () =>
  storage((s) =>
    s.session ? (s.accounts[s.session.profile.id]?.queue ?? []) : [],
  );
export const baseSnapshot = () =>
  storage((s) =>
    s.session
      ? (s.accounts[s.session.profile.id]?.cache.data as Snapshot | undefined)
      : undefined,
  );
export const changed = () =>
  window.dispatchEvent(new Event("vgm-offline-updated"));
export async function cached(path: string) {
  return storage((s) => {
    if (path === "config" && s.session) return { mode: s.session.mode };
    if (!s.session) return undefined;
    if (path === "me") return s.session.profile;
    const a = s.accounts[s.session.profile.id];
    if (path === "data" && a.cache.data)
      return projectSnapshot(a.cache.data, a.queue);
    return a.cache[path];
  });
}
export async function enqueue(cmd: Command) {
  const result = await storage((s) => {
    if (!s.session)
      throw new Error(
        "Inicia sesión con conexión antes de trabajar sin conexión.",
      );
    const a = s.accounts[s.session.profile.id];
    if (!a.cache.data)
      throw new Error("Espera a que termine la primera carga de documentos.");
    const pending = preparePending(
      a.cache.data,
      a.queue,
      cmd,
      s.session.profile.name,
      crypto.randomUUID(),
      new Date().toISOString(),
    );
    a.queue.push(pending);
    return pending;
  }, true);
  changed();
  return result;
}
export async function acknowledge(
  owner: string,
  id: string,
  snapshot: Snapshot,
) {
  await storage((s) => {
    const a = s.accounts[owner];
    a.cache.data = mergeSnapshot(a.cache.data, snapshot);
    a.queue = a.queue.filter((p) => p.id !== id);
  }, true);
  changed();
}
export async function setPendingError(
  owner: string,
  id: string,
  error: string,
) {
  await storage((s) => {
    const item = s.accounts[owner]?.queue.find((p) => p.id === id);
    if (item) item.error = error;
  }, true);
  changed();
}
export async function retryPending() {
  await storage((s) => {
    if (s.session)
      for (const p of s.accounts[s.session.profile.id].queue) delete p.error;
  }, true);
  changed();
}
export async function resolvePending(docId: string, keepLocal: boolean) {
  await storage((s) => {
    if (!s.session) throw new Error("Inicia sesión.");
    const a = s.accounts[s.session.profile.id],
      items = a.queue.filter((p) => p.doc.id === docId),
      latest = items.at(-1);
    if (!latest) return;
    const remaining = a.queue.filter((p) => p.doc.id !== docId);
    if (keepLocal) {
      const server = (a.cache.data as Snapshot).documents.find(
        (d) => d.id === docId,
      );
      const cmd: Command = {
        action: "save",
        data: latest.doc,
        ...(server ? { id: server.id, version: server.version } : {}),
      };
      const replacement = preparePending(
        a.cache.data,
        remaining,
        cmd,
        s.session.profile.name,
        crypto.randomUUID(),
        new Date().toISOString(),
      );
      remaining.push(replacement);
    }
    a.archive.push(...items);
    a.queue = remaining;
  }, true);
  changed();
}
