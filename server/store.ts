import { randomUUID, createHash } from "node:crypto";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { change, type Doc, type Event, type Command } from "../shared/model";
import {
  productSchema,
  reconcileStock,
  roundQty,
  type Product,
  type ProductInput,
  type StockMovement,
} from "../shared/inventory";
import { jsonFile } from "./jsonFile";
import {
  blankBusiness,
  assertBusinessConsistency,
  type BusinessState,
} from "../shared/business";
export const cloud = process.env.STORAGE_MODE === "firebase";
if (cloud)
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
type Receipt = { hash: string; owner: string; doc: Doc };
export type State = {
  business: BusinessState;
  receipts?: Record<string, Receipt>;
  documents: Doc[];
  events: Event[];
  counters?: Partial<Record<Doc["kind"], number>>;
  counter?: number;
  products: Product[];
  stockMovements: StockMovement[];
  importBatches: Record<string, { hash: string; ids: string[] }>;
};
const local = jsonFile<State>("store.json", () => ({
  business: blankBusiness(),
  documents: [],
  events: [],
  counters: { quote: 0, invoice: 0 },
  products: [],
  stockMovements: [],
  importBatches: {},
}));
function normalize(s: State) {
  s.business ??= blankBusiness();
  s.products ??= [];
  s.stockMovements ??= [];
  s.importBatches ??= {};
  return s;
}
const maximum = (docs: Doc[], kind: Doc["kind"]) =>
  docs
    .filter((d) => d.kind === kind)
    .reduce(
      (n, d) => Math.max(n, Number(d.number.match(/-(\d+)$/)?.[1] ?? 0)),
      0,
    );
export async function list() {
  if (!cloud) {
    const { receipts, business, ...state } = normalize(await local.read());
    return state;
  }
  const db = getFirestore();
  const [d, e, p, m] = await Promise.all(
    ["documents", "events", "products", "stockMovements"].map((c) =>
      db.collection(c).get(),
    ),
  );
  return {
    documents: d.docs.map((x) => x.data() as Doc),
    events: e.docs.map((x) => x.data() as Event),
    products: p.docs.map((x) => x.data() as Product),
    stockMovements: m.docs.map((x) => x.data() as StockMovement),
  };
}
export async function transact<R>(
  fn: (s: State) => R,
  options: { eventId?: string; importId?: string; requestId?: string } = {},
): Promise<R> {
  if (!cloud)
    return local.update((s) => {
      const state = normalize(s);
      const result = fn(state);
      assertBusinessConsistency(state.business, state.documents);
      return result;
    });
  const db = getFirestore();
  return db.runTransaction(async (t) => {
    const lock = db.doc("metadata/commerce-lock");
    const generation = await t.get(lock);
    const [docs, products, businessRecords, businessCounters] =
      await Promise.all([
        t.get(db.collection("documents")),
        t.get(db.collection("products")),
        t.get(db.collection("businessRecords")),
        t.get(db.doc("metadata/business-counters")),
      ]);
    const event = options.eventId
      ? await t.get(db.doc("events/" + options.eventId))
      : null;
    const imported = options.importId
      ? await t.get(db.doc("inventoryImports/" + options.importId))
      : null;
    const receipt = options.requestId
      ? await t.get(db.doc("commandReceipts/" + options.requestId))
      : null;
    const state: State = {
      business: {
        records: businessRecords.docs.map(
          (d) => d.data() as BusinessState["records"][number],
        ),
        events: [],
        counters: businessCounters.data()?.values ?? {},
      },
      receipts: receipt?.exists
        ? { [options.requestId!]: receipt.data() as Receipt }
        : {},
      documents: docs.docs.map((d) => d.data() as Doc),
      events: event?.exists ? [event.data() as Event] : [],
      products: products.docs.map((p) => p.data() as Product),
      stockMovements: [],
      importBatches: imported?.exists
        ? {
            [options.importId!]: imported.data() as {
              hash: string;
              ids: string[];
            },
          }
        : {},
    };
    const originalDocs = new Map(
        state.documents.map((d) => [d.id, JSON.stringify(d)]),
      ),
      originalProducts = new Map(
        state.products.map((p) => [p.id, JSON.stringify(p)]),
      ),
      oldEvents = state.events.length;
    const originalBusiness = new Map(
      state.business.records.map((r) => [r.id, JSON.stringify(r)]),
    );
    const result = fn(state);
    assertBusinessConsistency(state.business, state.documents);
    for (const record of state.business.records)
      if (originalBusiness.get(record.id) !== JSON.stringify(record))
        t.set(db.doc("businessRecords/" + record.id), record);
    for (const event of state.business.events)
      t.create(db.doc("businessEvents/" + event.id), event);
    t.set(db.doc("metadata/business-counters"), {
      values: state.business.counters,
    });
    for (const d of state.documents)
      if (originalDocs.get(d.id) !== JSON.stringify(d))
        t.set(db.doc("documents/" + d.id), d);
    for (const p of state.products)
      if (originalProducts.get(p.id) !== JSON.stringify(p))
        t.set(db.doc("products/" + p.id), p);
    for (const e of state.events.slice(oldEvents))
      t.create(db.doc("events/" + e.id), e);
    for (const m of state.stockMovements)
      t.create(db.doc("stockMovements/" + m.id), m);
    if (
      options.importId &&
      state.importBatches[options.importId] &&
      !imported?.exists
    )
      t.create(
        db.doc("inventoryImports/" + options.importId),
        state.importBatches[options.importId],
      );
    if (
      options.requestId &&
      state.receipts?.[options.requestId] &&
      !receipt?.exists
    )
      t.create(
        db.doc("commandReceipts/" + options.requestId),
        state.receipts[options.requestId],
      );
    if (state.counters)
      for (const [kind, value] of Object.entries(state.counters))
        t.set(db.doc("metadata/sequence-" + kind), { value });
    t.set(lock, { version: (generation.data()?.version ?? 0) + 1 });
    return result;
  });
}
export async function businessSnapshot(): Promise<BusinessState> {
  if (!cloud) return normalize(await local.read()).business;
  const db = getFirestore();
  const [records, events, counters] = await Promise.all([
    db.collection("businessRecords").get(),
    db.collection("businessEvents").get(),
    db.doc("metadata/business-counters").get(),
  ]);
  return {
    records: records.docs.map(
      (d) => d.data() as BusinessState["records"][number],
    ),
    events: events.docs.map((d) => d.data() as BusinessState["events"][number]),
    counters: counters.data()?.values ?? {},
  };
}
export async function completeLocalSnapshot() {
  const {receipts,...state}=normalize(await local.read());
  return state;
}
export async function mutate(cmd: Command, actor: string, owner = actor) {
  const hash = createHash("sha256").update(JSON.stringify(cmd)).digest("hex");
  const id = cmd.requestId ?? randomUUID(),
    now = new Date().toISOString();
  return transact(
    (state) => {
      const receipt = cmd.requestId ? state.receipts?.[cmd.requestId] : null;
      if (receipt) {
        if (receipt.hash !== hash || receipt.owner !== owner)
          throw new Error(
            "El identificador de sincronización ya se utilizó con otros datos.",
          );
        return receipt.doc;
      }
      if (
        cmd.action === "save" &&
        !cmd.id &&
        state.documents.some((d) => d.id === id)
      )
        throw new Error("El identificador del documento ya existe.");
      const old = state.documents.find((d) => d.id === cmd.id) ?? null;
      if (
        cmd.action === "convert" &&
        state.documents.some((d) => d.sourceId === cmd.id)
      )
        throw new Error("Esta cotización ya tiene una factura.");
      const creating =
          (cmd.action === "save" && !cmd.id) || cmd.action === "convert",
        kind =
          cmd.action === "convert" ? "invoice" : (cmd.data?.kind ?? "quote");
      const count = creating
        ? Math.max(
            state.counters?.[kind] ?? 0,
            maximum(state.documents, kind),
          ) + 1
        : 0;
      const result = change(
        old,
        cmd,
        actor,
        id,
        (kind === "invoice" ? "FAC" : "COT") +
          "-" +
          String(count).padStart(6, "0"),
        now,
        state.events.find((e) => e.id === cmd.eventId),
      );
      result.doc.items = result.doc.items.map((item) => {
        if (!item.productId) return item;
        const p = state.products.find((p) => p.id === item.productId);
        if (!p) throw new Error("El producto asociado ya no existe.");
        if (
          p.archived &&
          cmd.action === "save" &&
          !old?.items.some((i) => i.productId === p.id)
        )
          throw new Error(
            "El producto " +
              p.code +
              " está archivado. Desarchívalo antes de agregarlo.",
          );
        if (p.deleted && ["save", "version", "convert"].includes(cmd.action))
          throw new Error(
            "El producto " +
              p.code +
              " está eliminado. Recupéralo o quita la línea.",
          );
        if (cmd.action === "save")
          return {
            ...item,
            productCode: p.code,
            productBrand: item.productBrand ?? p.brand,
            productType: p.type,
            imageUrl: p.imageUrl,
          };
        return item;
      });
      const after = state.documents
        .filter((d) => d.id !== result.doc.id)
        .concat(result.doc);
      const stock = reconcileStock(state.products, state.documents, after, {
        id: randomUUID,
        document: result.doc,
        action: cmd.action,
        actor,
        at: now,
      });
      state.products = stock.products;
      state.stockMovements.push(...stock.movements);
      if (creating) state.counters = { ...state.counters, [kind]: count };
      state.documents = after;
      state.events.push(result.event);
      if (cmd.requestId) {
        state.receipts ??= {};
        state.receipts[cmd.requestId] = { hash, owner, doc: result.doc };
      }
      return result.doc;
    },
    { eventId: cmd.eventId, requestId: cmd.requestId },
  );
}
function productMovement(
  p: Product,
  old: Product | null,
  actor: string,
  action: string,
  reason: string,
): StockMovement {
  return {
    id: randomUUID(),
    productId: p.id,
    code: p.code,
    documentId: null,
    documentNumber: "Catálogo",
    action,
    actor,
    at: p.updatedAt,
    stockBefore: old?.stock ?? 0,
    stockAfter: p.stock,
    reservedBefore: old?.reserved ?? 0,
    reservedAfter: p.reserved,
    reason,
  };
}
function insertProduct(s: State, input: ProductInput, actor: string) {
  const data = productSchema.parse(input);
  if (s.products.some((p) => p.code === data.code))
    throw new Error(
      "El código " + data.code + " ya existe (incluye papelera).",
    );
  const now = new Date().toISOString();
  const p: Product = {
    ...data,
    id: randomUUID(),
    version: 1,
    reserved: 0,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };
  s.products.push(p);
  s.stockMovements.push(
    productMovement(p, null, actor, "create", "Alta en catálogo"),
  );
  return p;
}
export async function saveProduct(
  input: unknown,
  actor: string,
  id?: string,
  version?: number,
  reason = "",
) {
  const data = productSchema.parse(input);
  return transact((s) => {
    if (!id) return insertProduct(s, data, actor);
    const old = s.products.find((p) => p.id === id);
    if (!old) throw new Error("Producto inexistente.");
    if (old.version !== version)
      throw new Error(
        "CONFLICT: El producto o su stock cambió. Actualiza antes de editar.",
      );
    if (old.deleted) throw new Error("Recupera el producto antes de editarlo.");
    if (
      data.type !== old.type &&
      s.documents.some((d) => d.items.some((i) => i.productId === id))
    )
      throw new Error(
        "No se puede cambiar el tipo de un producto con documentos asociados.",
      );
    if (s.products.some((p) => p.id !== id && p.code === data.code))
      throw new Error("Ese código ya existe.");
    if (data.stock < old.reserved)
      throw new Error(
        "El stock físico no puede ser menor a la cantidad reservada (" +
          old.reserved +
          ").",
      );
    if (data.stock !== old.stock && !reason.trim())
      throw new Error("Indica el motivo del ajuste de stock.");
    const p = {
      ...old,
      ...data,
      version: old.version + 1,
      updatedAt: new Date().toISOString(),
    };
    s.products = s.products.map((x) => (x.id === id ? p : x));
    s.stockMovements.push(
      productMovement(
        p,
        old,
        actor,
        "update",
        reason || "Datos del producto actualizados",
      ),
    );
    return p;
  });
}
export async function productAccess(
  id: string,
  version: number,
  deleted: boolean,
  actor: string,
) {
  return transact((s) => {
    const old = s.products.find((p) => p.id === id);
    if (!old) throw new Error("Producto inexistente.");
    if (old.version !== version)
      throw new Error("CONFLICT: Actualiza el catálogo antes de continuar.");
    if (deleted && old.reserved > 0)
      throw new Error(
        "El producto tiene " +
          old.reserved +
          " unidades reservadas. Libera esas reservas antes de eliminarlo.",
      );
    const p = {
      ...old,
      deleted,
      version: old.version + 1,
      updatedAt: new Date().toISOString(),
    };
    s.products = s.products.map((x) => (x.id === id ? p : x));
    s.stockMovements.push(
      productMovement(
        p,
        old,
        actor,
        deleted ? "delete" : "restore",
        deleted ? "Eliminación recuperable" : "Recuperación de catálogo",
      ),
    );
    return p;
  });
}
export async function importProducts(
  rows: unknown[],
  batchId: string,
  actor: string,
) {
  const parsed = rows.map((r) => productSchema.parse(r)),
    hash = createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
  return transact(
    (s) => {
      const existing = s.importBatches[batchId];
      if (existing) {
        if (existing.hash !== hash)
          throw new Error(
            "El contenido del lote no coincide con el intento anterior.",
          );
        return existing.ids.map((id) => s.products.find((p) => p.id === id)!);
      }
      const result = parsed.map((row) => insertProduct(s, row, actor));
      s.importBatches[batchId] = { hash, ids: result.map((p) => p.id) };
      return result;
    },
    { importId: batchId },
  );
}

export async function archiveProduct(
  id: string,
  version: number,
  archived: boolean,
  actor: string,
) {
  return transact((s) => {
    const old = s.products.find((p) => p.id === id);
    if (!old || old.deleted)
      throw new Error("Recupera el producto antes de archivarlo.");
    if (old.version !== version)
      throw new Error("CONFLICT: Actualiza el catálogo antes de continuar.");
    const p = {
      ...old,
      archived,
      version: old.version + 1,
      updatedAt: new Date().toISOString(),
    };
    s.products = s.products.map((x) => (x.id === id ? p : x));
    s.stockMovements.push(
      productMovement(
        p,
        old,
        actor,
        archived ? "archive" : "unarchive",
        archived
          ? "Producto archivado; stock conservado"
          : "Producto devuelto al catálogo",
      ),
    );
    return p;
  });
}
