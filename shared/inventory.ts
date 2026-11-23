import { z } from "zod";
import type { Doc } from "./model";
export const roundQty = (n: number) => Math.round(n * 1000) / 1000;
export const imageSchema = z
  .string()
  .regex(/^$|^\/api\/images\/[0-9a-f-]{36}$/);
export const productSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(
        /^[A-Za-z0-9._-]+$/,
        "Código: usa letras, números, punto, guion o guion bajo.",
      )
      .transform((s) => s.toUpperCase()),
    description: z.string().trim().min(2).max(500),
    type: z.enum(["product", "service"]),
    category: z.string().trim().max(100),
    brand: z.string().trim().max(100),
    price: z.number().finite().min(0).max(100000000),
    stock: z
      .number()
      .finite()
      .min(0)
      .max(100000000)
      .refine(
        (n) => Math.abs(roundQty(n) - n) < 0.000001,
        "Usa hasta 3 decimales en stock.",
      ),
    imageUrl: imageSchema.default(""),
  })
  .refine(
    (p) => p.type !== "service" || p.stock === 0,
    "Los servicios no tienen stock físico.",
  );
export type ProductInput = z.infer<typeof productSchema>;
export type Product = ProductInput & {
  id: string;
  reserved: number;
  deleted: boolean;
  archived?: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type StockMovement = {
  id: string;
  productId: string;
  code: string;
  documentId: string | null;
  documentNumber: string;
  action: string;
  actor: string;
  at: string;
  stockBefore: number;
  stockAfter: number;
  reservedBefore: number;
  reservedAfter: number;
  reason: string;
};
export const available = (p: Product) => roundQty(p.stock - p.reserved);
export const blankProduct = (): ProductInput => ({
  code: "",
  description: "",
  type: "product",
  category: "",
  brand: "",
  price: 0,
  stock: 0,
  imageUrl: "",
});
export type Effect = { reserved: number; consumed: number };
export function documentEffects(
  doc: Doc,
  documents: Doc[],
): Record<string, Effect> {
  const result: Record<string, Effect> = {};
  if (doc.deleted || doc.status === "Rechazada" || doc.status === "Anulada")
    return result;
  if (
    doc.kind === "quote" &&
    documents.some((d) => d.kind === "invoice" && d.sourceId === doc.id)
  )
    return result;
  const consumed =
    doc.kind === "invoice" && ["Emitida", "Pagada"].includes(doc.status);
  for (const item of doc.items) {
    if (!item.productId || item.productType === "service") continue;
    const e = result[item.productId] ?? { reserved: 0, consumed: 0 };
    e[consumed ? "consumed" : "reserved"] = roundQty(
      e[consumed ? "consumed" : "reserved"] + item.quantity,
    );
    result[item.productId] = e;
  }
  return result;
}
export function inventoryEffects(documents: Doc[]) {
  const result: Record<string, Effect> = {};
  for (const d of documents)
    for (const [id, e] of Object.entries(documentEffects(d, documents))) {
      const old = result[id] ?? { reserved: 0, consumed: 0 };
      result[id] = {
        reserved: roundQty(old.reserved + e.reserved),
        consumed: roundQty(old.consumed + e.consumed),
      };
    }
  return result;
}
export function reconcileStock(
  products: Product[],
  before: Doc[],
  after: Doc[],
  context: {
    id: () => string;
    document: Doc;
    action: string;
    actor: string;
    at: string;
  },
) {
  const old = inventoryEffects(before),
    next = inventoryEffects(after),
    movements: StockMovement[] = [];
  const changed = products.map((p) => {
    if (p.type === "service") return p;
    const a = old[p.id] ?? { reserved: 0, consumed: 0 },
      b = next[p.id] ?? { reserved: 0, consumed: 0 };
    const stock = roundQty(p.stock - (b.consumed - a.consumed)),
      reserved = b.reserved;
    if (p.deleted && (b.reserved > a.reserved || b.consumed > a.consumed))
      throw new Error(
        "Recupera el producto " + p.code + " antes de volver a utilizarlo.",
      );
    if (stock < 0 || roundQty(stock - reserved) < 0)
      throw new Error(
        "Stock insuficiente para " +
          p.code +
          ". Disponible actual: " +
          available(p) +
          ". Recarga el catálogo o reduce la cantidad.",
      );
    if (stock === p.stock && reserved === p.reserved) return p;
    movements.push({
      id: context.id(),
      productId: p.id,
      code: p.code,
      documentId: context.document.id,
      documentNumber: context.document.number,
      action: context.action,
      actor: context.actor,
      at: context.at,
      stockBefore: p.stock,
      stockAfter: stock,
      reservedBefore: p.reserved,
      reservedAfter: reserved,
      reason: "Movimiento automático del documento",
    });
    return {
      ...p,
      stock,
      reserved,
      version: p.version + 1,
      updatedAt: context.at,
    };
  });
  return { products: changed, movements };
}
