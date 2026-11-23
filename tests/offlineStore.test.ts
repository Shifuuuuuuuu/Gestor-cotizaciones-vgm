import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { blank } from "../shared/model";
import type { Profile } from "../shared/people";
import {
  rememberSession,
  cacheResponse,
  enqueue,
  pendingItems,
  cached,
  forgetSession,
  storage,
  resolvePending,
} from "../src/offlineStore";
test("IndexedDB: borradores duraderos, aislamiento por cuenta y archivo de conflictos", async () => {
  const events = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    value: events,
    configurable: true,
  });
  const profile: Profile = {
    id: "account-a",
    name: "Usuario A",
    email: "a@example.com",
    phone: "",
    position: "",
    role: "member",
    active: true,
    createdAt: new Date().toISOString(),
  };
  await rememberSession(profile, "local");
  await cacheResponse("data", {
    documents: [],
    events: [],
    products: [],
    stockMovements: [],
  });
  const p = await enqueue({
    action: "save",
    data: {
      ...blank(),
      client: "Cliente persistido",
      items: [{ description: "Servicio", quantity: 1, price: 10, discount: 0 }],
    },
  });
  assert.equal((await pendingItems()).length, 1);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("vgm-offline", 1);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const persisted: any = await new Promise((resolve, reject) => {
    const r = db.transaction("state").objectStore("state").get("app");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  db.close();
  assert.equal(
    persisted.accounts["account-a"].queue[0].doc.client,
    "Cliente persistido",
  );
  await forgetSession();
  assert.equal(await cached("data"), undefined);
  await rememberSession(
    { ...profile, id: "account-b", name: "Usuario B" },
    "local",
  );
  assert.equal((await pendingItems()).length, 0);
  assert.equal(await cached("data"), undefined);
  await rememberSession(profile, "local");
  assert.equal((await pendingItems())[0].id, p.id);
  await resolvePending(p.doc.id, false);
  assert.equal((await pendingItems()).length, 0);
  assert.equal(await storage((s) => s.accounts["account-a"].archive.length), 1);
});
