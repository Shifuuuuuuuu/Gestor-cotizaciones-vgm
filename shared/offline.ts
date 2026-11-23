import {
  change,
  inputSchema,
  type Doc,
  type Command,
  type Event,
} from "./model";
import { reconcileStock, type Product, type StockMovement } from "./inventory";
export type Snapshot = {
  documents: Doc[];
  events: Event[];
  products: Product[];
  stockMovements: StockMovement[];
};
export type PendingSave = {
  id: string;
  command: Command;
  doc: Doc;
  event: Event;
  createdAt: string;
  error?: string;
};
export function projectSnapshot(
  base: Snapshot,
  queue: PendingSave[],
): Snapshot {
  const documents = [...base.documents],
    events = [...base.events];
  for (const pending of queue) {
    const index = documents.findIndex((d) => d.id === pending.doc.id);
    if (index < 0) documents.push(pending.doc);
    else documents[index] = pending.doc;
    if (!events.some((e) => e.id === pending.event.id))
      events.push(pending.event);
  }
  let products = base.products;
  try {
    if (queue.length)
      products = reconcileStock(base.products, base.documents, documents, {
        id: () => "local",
        document: queue.at(-1)!.doc,
        action: "save",
        actor: "local",
        at: queue.at(-1)!.createdAt,
      }).products;
  } catch {}
  return { ...base, documents, events, products };
}
export function preparePending(
  base: Snapshot,
  queue: PendingSave[],
  cmd: Command,
  actor: string,
  id: string,
  now: string,
): PendingSave {
  if (cmd.action !== "save") throw new Error("Esta acción requiere conexión.");
  const current = projectSnapshot(base, queue),
    data = inputSchema.parse(cmd.data),
    old = current.documents.find((d) => d.id === cmd.id) ?? null;
  const canonical = {
    ...cmd,
    requestId: id,
    data: {
      ...data,
      items: data.items.map((item) => {
        if (!item.productId) return item;
        const p = base.products.find((p) => p.id === item.productId);
        if (!p || p.deleted)
          throw new Error("El producto ya no está disponible.");
        return {
          ...item,
          productCode: p.code,
          productBrand: item.productBrand ?? p.brand,
          productType: p.type,
          imageUrl: p.imageUrl,
        };
      }),
    },
  };
  const result = change(
    old,
    canonical,
    actor,
    id,
    "PEND-" + id.slice(0, 8).toUpperCase(),
    now,
  );
  result.doc.pending = true;
  const projected = current.documents
    .filter((d) => d.id !== result.doc.id)
    .concat(result.doc);
  reconcileStock(base.products, base.documents, projected, {
    id: () => id,
    document: result.doc,
    action: "save",
    actor,
    at: now,
  });
  return {
    id,
    command: canonical,
    doc: result.doc,
    event: result.event,
    createdAt: now,
  };
}

export function mergeSnapshot(
  old: Snapshot | undefined,
  next: Snapshot,
): Snapshot {
  if (!old) return next;
  const versions = <T extends { id: string; version: number }>(
    before: T[],
    after: T[],
  ) => {
    const map = new Map(before.map((d) => [d.id, d]));
    for (const d of after)
      if (!map.has(d.id) || map.get(d.id)!.version <= d.version)
        map.set(d.id, d);
    return [...map.values()];
  };
  const unique = <T extends { id: string }>(a: T[], b: T[]) => [
    ...new Map([...a, ...b].map((d) => [d.id, d])).values(),
  ];
  return {
    ...next,
    documents: versions(old.documents, next.documents),
    products: versions(old.products, next.products),
    events: unique(old.events, next.events),
    stockMovements: unique(old.stockMovements, next.stockMovements),
  };
}
