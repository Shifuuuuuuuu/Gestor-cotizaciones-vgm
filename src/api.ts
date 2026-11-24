import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import {
  session,
  rememberSession,
  forgetSession,
  cacheResponse,
  cached,
  enqueue,
  pendingItems,
  acknowledge,
  setPendingError,
} from "./offlineStore";
import type { Command } from "../shared/model";
import { accessState, setAccessUser } from "./accessState";
import { can } from "../shared/access";
function permittedCache(path: string, data: any) {
  const user = accessState.getSnapshot();
  if (path === "customers")
    return can(user, "customers")
      ? data.filter((c: any) => !c.deleted || can(user, "trash"))
      : [];
  if (path === "users" && user?.role !== "admin") return [];
  if (path === "products" && data)
    return {
      ...data,
      products: can(user, "products")
        ? data.products.filter((p: any) => !p.deleted || can(user, "trash"))
        : [],
      movements: can(user, "products") ? (data.movements ?? []) : [],
      stockMovements: can(user, "products") ? (data.stockMovements ?? []) : [],
    };
  if (path !== "data" || !data) return data;
  const documents = data.documents.filter(
    (d: any) =>
      can(user, d.kind === "quote" ? "quotes" : "invoices") &&
      (!d.deleted || can(user, "trash")),
  );
  const ids = new Set(documents.map((d: any) => d.id));
  return {
    ...data,
    documents,
    events: can(user, "history")
      ? data.events.filter((e: any) => ids.has(e.documentId))
      : [],
    products: can(user, "products")
      ? (data.products ?? []).filter(
          (p: any) => !p.deleted || can(user, "trash"),
        )
      : [],
    stockMovements: can(user, "products") ? (data.stockMovements ?? []) : [],
  };
}
export const auth = import.meta.env.VITE_FIREBASE_API_KEY
  ? getAuth(
      initializeApp({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      }),
    )
  : null;
let storageMode = "local";
export class ConnectionError extends Error {}
class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
const connection = (value: boolean) =>
  window.dispatchEvent(new CustomEvent("vgm-connection", { detail: value }));
async function request(path: string, body?: unknown) {
  if (
    path !== "logout" &&
    path !== "config" &&
    localStorage.getItem("vgm-logout-pending")
  ) {
    await request("logout", {});
    localStorage.removeItem("vgm-logout-pending");
  }
  let res: Response;
  try {
    const token = await auth?.currentUser?.getIdToken();
    res = await fetch("/api/" + path, {
      credentials: "same-origin",
      cache: "no-store",
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    connection(false);
    throw new ConnectionError("Sin conexión con el servidor.");
  }
  if (
    res.status >= 500 ||
    !res.headers.get("content-type")?.includes("application/json")
  ) {
    connection(false);
    throw new ConnectionError("El servidor no está disponible.");
  }
  connection(true);
  const data = await res.json();
  if (res.status === 401 && path !== "login") {
    setAccessUser(null);
    await forgetSession();
    window.dispatchEvent(new Event("vgm-session-expired"));
  }
  if (res.status === 403)
    window.dispatchEvent(new Event("vgm-permissions-changed"));
  if (!res.ok)
    throw new ApiError(
      data.error ?? "No se pudo completar la operación.",
      res.status,
    );
  return data;
}
let synchronizing: Promise<void> | null = null;
export async function synchronize() {
  if (synchronizing) return synchronizing;
  async function work() {
    const current = await session();
    if (!current) return;
    const queue = await pendingItems();
    if (!queue.length) return;
    try {
      const me = await request("me");
      setAccessUser(me);
      await rememberSession(me, storageMode);
      if (me.id !== current.profile.id)
        throw new Error(
          "La cuenta actual no coincide con los documentos pendientes.",
        );
    } catch {
      return;
    }
    const blocked = new Set<string>();
    for (const item of queue) {
      if (blocked.has(item.doc.id) || item.error) {
        blocked.add(item.doc.id);
        continue;
      }
      if ((await session())?.profile.id !== current.profile.id) return;
      try {
        await request("commands", item.command);
        const snapshot = await request("data");
        await acknowledge(current.profile.id, item.id, snapshot);
        const doc = snapshot.documents.find((d: any) => d.id === item.doc.id);
        if (doc)
          window.dispatchEvent(
            new CustomEvent("vgm-doc-synced", {
              detail: {
                doc,
                owner: current.profile.id,
                isNew: !item.command.id,
              },
            }),
          );
      } catch (e) {
        if (
          e instanceof ConnectionError ||
          (e instanceof ApiError && e.status === 401)
        )
          return;
        await setPendingError(
          current.profile.id,
          item.id,
          (e as Error).message,
        );
        blocked.add(item.doc.id);
        try {
          await cacheResponse("data", await request("data"));
        } catch {}
      }
    }
  }
  const locked = () =>
    navigator.locks
      ? navigator.locks.request("vgm-sync-documents", work)
      : work();
  synchronizing = locked().finally(() => {
    synchronizing = null;
  });
  return synchronizing;
}
export async function api(
  path: string,
  body?: any,
  options?: { onQueued?: (id: string) => void },
): Promise<any> {
  if (path === "commands" && body?.action === "save") {
    const me = await api("me");
    if (
      !can(
        me,
        body.data?.kind === "invoice" ? "invoices" : "quotes",
        body.id ? "edit" : "create",
      )
    )
      throw new Error("No tienes permiso para guardar este documento.");
    const pending = await enqueue(body as Command);
    options?.onQueued?.(pending.doc.id);
    await synchronize();
    const state = await cached("data");
    return (
      state?.documents.find((d: any) => d.id === pending.doc.id) ?? pending.doc
    );
  }
  if (
    path === "commands" &&
    body?.id &&
    (await pendingItems()).some((p) => p.doc.id === body.id)
  )
    throw new Error(
      "Sincroniza los cambios pendientes de este documento antes de cambiar su estado, eliminarlo o facturarlo.",
    );
  if (path === "logout") {
    setAccessUser(null);
    localStorage.setItem("vgm-logout-pending", "true");
    await forgetSession();
    localStorage.setItem("vgm-logout-event", String(Date.now()));
    try {
      await request(path, body);
      localStorage.removeItem("vgm-logout-pending");
    } catch (e) {
      if (!(e instanceof ConnectionError)) throw e;
    }
    await forgetSession();
    return { ok: true };
  }
  try {
    const data = await request(path, body);
    if (path === "config") storageMode = data.mode;
    if (path === "me") {
      setAccessUser(data);
      await rememberSession(data, storageMode);
    }
    if (
      body === undefined &&
      ["data", "customers", "products", "users"].includes(path)
    ) {
      await cacheResponse(path, data);
      return permittedCache(path, path === "data" ? await cached(path) : data);
    }
    return data;
  } catch (e) {
    if (e instanceof ConnectionError && body === undefined) {
      const fallback = await cached(path);
      if (fallback !== undefined) {
        if (path === "me") setAccessUser(fallback);
        if (path === "config") storageMode = fallback.mode;
        return permittedCache(path, fallback);
      }
    }
    if (e instanceof ConnectionError && body !== undefined)
      throw new Error(
        "Esta acción necesita conexión. Sin conexión puedes crear y editar cotizaciones y facturas en borrador.",
      );
    throw e;
  }
}
export const login = async (email: string, password: string) => {
  if (!auth) throw new Error("Configura Firebase en .env.");
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, email, password);
};
export const logout = () => auth && signOut(auth);
