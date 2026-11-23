import type { Doc } from "./model";
import { statuses } from "./model";
import { cleanRut, type Customer } from "./people";
import { available, type Product } from "./inventory";
export const localDate = (d = new Date()) =>
  [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
export function analytics(
  documents: Doc[],
  customers: Customer[],
  products: Product[],
  from = "",
  to = "",
  today = localDate(),
) {
  const inRange = (d: Doc) =>
    (!from || d.date >= from) && (!to || d.date <= to);
  const docs = documents.filter((d) => !d.deleted && !d.pending && inRange(d));
  const quotes = docs.filter((d) => d.kind === "quote");
  const invoices = docs.filter((d) => d.kind === "invoice");
  const billed = invoices.filter((d) =>
    ["Emitida", "Pagada"].includes(d.status),
  );
  const sum = (ds: Doc[]) => ds.reduce((n, d) => n + d.total, 0);
  const monthly = new Map<
    string,
    { month: string; cotizado: number; facturado: number }
  >();
  for (const d of docs) {
    const month = d.date.slice(0, 7);
    const row = monthly.get(month) ?? { month, cotizado: 0, facturado: 0 };
    if (d.kind === "quote") row.cotizado += d.total;
    else if (["Emitida", "Pagada"].includes(d.status)) row.facturado += d.total;
    monthly.set(month, row);
  }
  const clients = new Map<
    string,
    { name: string; total: number; count: number }
  >();
  const items = new Map<
    string,
    { name: string; code: string; quantity: number; net: number }
  >();
  for (const d of billed) {
    const key = cleanRut(d.rut) || (d.email || d.client).trim().toLowerCase();
    const c = clients.get(key) ?? { name: d.client, total: 0, count: 0 };
    c.total += d.total;
    c.count++;
    clients.set(key, c);
    for (const i of d.items) {
      const key =
        i.productId ||
        i.productCode ||
        [
          i.productType ?? "manual",
          i.description.trim().toLowerCase(),
          i.productBrand ?? "",
        ].join("|");
      const row = items.get(key) ?? {
        name: i.description,
        code: i.productCode ?? "Sin código",
        quantity: 0,
        net: 0,
      };
      row.quantity += i.quantity;
      row.net += Math.round(i.quantity * i.price * (1 - i.discount / 100));
      items.set(key, row);
    }
  }
  const decided = quotes.filter((d) =>
    ["Aceptada", "Rechazada"].includes(d.status),
  );
  const catalog = products.filter((p) => !p.deleted);
  const physical = catalog.filter((p) => p.type === "product");
  return {
    count: docs.length,
    pending: documents.filter((d) => !d.deleted && d.pending && inRange(d))
      .length,
    quotes: quotes.length,
    invoices: invoices.length,
    quoted: sum(quotes),
    billed: sum(billed),
    paid: sum(billed.filter((d) => d.status === "Pagada")),
    receivable: sum(billed.filter((d) => d.status === "Emitida")),
    overdue: billed.filter((d) => d.status === "Emitida" && d.due < today),
    acceptance: decided.length
      ? (100 * quotes.filter((d) => d.status === "Aceptada").length) /
        decided.length
      : null,
    monthly: [...monthly.values()].sort((a, b) =>
      a.month.localeCompare(b.month),
    ),
    quoteStates: statuses.quote.map((name) => ({
      name,
      count: quotes.filter((d) => d.status === name).length,
    })),
    invoiceStates: statuses.invoice.map((name) => ({
      name,
      count: invoices.filter((d) => d.status === name).length,
    })),
    clients: [...clients.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5),
    items: [...items.values()].sort((a, b) => b.net - a.net).slice(0, 5),
    activeCustomers: customers.filter((c) => !c.deleted && c.active).length,
    blockedCustomers: customers.filter((c) => !c.deleted && !c.active).length,
    products: physical.length,
    services: catalog.filter((p) => p.type === "service").length,
    unavailable: physical.filter((p) => available(p) <= 0).length,
    reserved: physical.reduce((n, p) => n + p.reserved, 0),
  };
}
