import { z } from "zod";
import type { Doc } from "./model";
import { cleanRut } from "./people";
const ref = z.union([z.uuid(), z.literal("")]).default("");
const text = z.string().trim().max(6000).default("");
const amount = z.number().int().min(0).max(1_000_000_000_000);
const optionalDate = z.union([z.iso.date(), z.literal("")]).default("");
export const serviceCategories = {
  contract: "Contrato y alcance",
  report: "Informe técnico",
  timesheet: "Horas y materiales",
  checklist: "Checklist",
  acceptance: "Recepción conforme",
  milestone: "Estado de pago",
  warranty: "Garantía",
  hes: "HES",
  compliance: "Certificado F30-1 / respaldo laboral",
} as const;
export const businessSchemas = {
  order: z.object({
    customerId: z.uuid(),
    reference: z.string().trim().min(1).max(100),
    date: z.iso.date(),
    due: optionalDate,
    amount,
    tax: z.number().min(0).max(100).default(19),
    items: z
      .array(
        z.object({
          description: z.string().trim().min(1).max(500),
          quantity: z.number().positive().max(100000),
          price: z.number().min(0).max(100000000),
          discount: z.number().min(0).max(100).default(0),
        }),
      )
      .max(100)
      .default([]),
    status: z.enum([
      "Recibida",
      "En revisión",
      "Observada",
      "Aceptada",
      "Completada",
      "Cancelada",
    ]),
    quoteId: ref,
    notes: text,
  }),
  job: z.object({
    customerId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    date: z.iso.date(),
    end: z.iso.date(),
    location: z.string().max(300).default(""),
    assignee: z.string().max(160).default(""),
    scope: text,
    exclusions: text,
    status: z.enum([
      "Borrador",
      "Programado",
      "En ejecución",
      "Por recibir",
      "Completado",
      "Cancelado",
    ]),
    orderId: ref,
    quoteId: ref,
    nextServiceDate: optionalDate,
    warrantyUntil: optionalDate,
    recurrenceMonths: z.number().int().min(0).max(120).default(0),
    previousJobId: ref,
  }),
  serviceDoc: z.object({
    jobId: z.uuid(),
    category: z.enum(
      Object.keys(serviceCategories) as [
        keyof typeof serviceCategories,
        ...(keyof typeof serviceCategories)[],
      ],
    ),
    title: z.string().trim().min(1).max(200),
    date: z.iso.date(),
    periodEnd: optionalDate,
    content: text,
    signer: z.string().max(160).default(""),
    acceptedVersion: z.number().int().min(0).default(0),
    visibleToClient: z.boolean().default(false),
    amount,
    hours: z.number().min(0).max(100000).default(0),
    hourlyCost: amount.default(0),
    checklist: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(300),
          done: z.boolean(),
        }),
      )
      .max(100)
      .default([]),
    materials: z
      .array(
        z.object({
          description: z.string().trim().min(1).max(300),
          quantity: z.number().positive().max(100000),
          cost: amount,
        }),
      )
      .max(100)
      .default([]),
  }),
  paymentClaim: z.object({
    customerId: z.uuid(),
    invoiceId: ref,
    orderId: ref,
    amount: amount.refine((n) => n > 0),
    date: z.iso.date(),
    reference: z.string().trim().max(160),
    notes: text,
    status: z.enum(["En revisión", "Observado", "Verificado"]),
  }),
  payment: z.object({
    customerId: z.uuid(),
    invoiceId: ref,
    orderId: ref,
    jobId: ref,
    claimId: ref,
    amount: amount.refine((n) => n > 0, "El pago debe ser mayor que cero."),
    date: z.iso.date(),
    method: z.enum(["Transferencia", "Efectivo", "Tarjeta", "Cheque", "Otro"]),
    reference: z.string().trim().max(160),
    notes: text,
  }),
  cost: z.object({
    jobId: z.uuid(),
    date: z.iso.date(),
    category: z.enum([
      "Materiales",
      "Mano de obra",
      "Traslado",
      "Subcontrato",
      "Otro",
    ]),
    description: z.string().trim().min(1).max(300),
    amount: amount.refine((n) => n > 0),
  }),
  billing: z.object({
    invoiceId: z.uuid(),
    orderId: ref,
    jobId: ref,
    amount: amount.refine((n) => n > 0),
  }),
  file: z.object({
    parentId: z.uuid(),
    customerId: z.uuid(),
    name: z.string().min(1).max(200),
    mime: z.string().max(100),
    size: z
      .number()
      .int()
      .positive()
      .max(5 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    visibleToClient: z.boolean(),
  }),
  portal: z.object({
    customerId: z.uuid(),
    label: z.string().max(100),
    tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.iso.datetime(),
  }),
};
export type BusinessKind = keyof typeof businessSchemas;
export type DataFor<K extends BusinessKind> = z.infer<
  (typeof businessSchemas)[K]
>;
export type BusinessRecord = {
  [K in BusinessKind]: {
    id: string;
    kind: K;
    data: DataFor<K>;
    number: string;
    customerId: string;
    customerName: string;
    customerRut: string;
    version: number;
    deleted: boolean;
    createdAt: string;
    updatedAt: string;
    actor: string;
  };
}[BusinessKind];
export type BusinessEvent = {
  id: string;
  recordId: string;
  action: string;
  actor: string;
  at: string;
  reason: string;
  before: BusinessRecord | null;
  after: BusinessRecord;
};
export type BusinessState = {
  records: BusinessRecord[];
  events: BusinessEvent[];
  counters: Record<string, number>;
};
export const blankBusiness = (): BusinessState => ({
  records: [],
  events: [],
  counters: {},
});
export function recordsOf<K extends BusinessKind>(
  records: BusinessRecord[],
  kind: K,
) {
  return records.filter(
    (r): r is Extract<BusinessRecord, { kind: K }> => r.kind === kind,
  );
}
export const activeRecords = (state: BusinessState) =>
  state.records.filter((r) => !r.deleted);
export function invoicePaid(state: BusinessState, invoice: Doc) {
  const payments = recordsOf(state.records, "payment").filter(
    (p) => !p.deleted && p.data.invoiceId === invoice.id,
  );
  const sum = payments.reduce((n, p) => n + p.data.amount, 0);
  const everRecorded = recordsOf(state.records, "payment").some(
    (p) => p.data.invoiceId === invoice.id,
  );
  return !everRecorded && invoice.status === "Pagada" ? invoice.total : sum;
}
export function assertBusinessConsistency(state: BusinessState, docs: Doc[]) {
  const active = activeRecords(state);
  const payments = recordsOf(active, "payment"),
    links = recordsOf(active, "billing");
  for (const p of payments) {
    if (!p.data.invoiceId && !p.data.orderId && !p.data.jobId)
      throw new Error(
        "Vincula el anticipo a una OC o servicio, o selecciona una factura.",
      );
    if (p.data.invoiceId) {
      const invoice = docs.find(
        (d) => d.id === p.data.invoiceId && d.kind === "invoice",
      );
      if (
        !invoice ||
        invoice.deleted ||
        !["Emitida", "Pagada"].includes(invoice.status)
      )
        throw new Error(
          "No se pueden mantener pagos en una factura eliminada, anulada o en borrador. Anula primero sus pagos.",
        );
      if (
        !cleanRut(invoice.rut) ||
        cleanRut(invoice.rut) !== cleanRut(p.customerRut)
      )
        throw new Error("El pago y la factura deben pertenecer al mismo RUT.");
    }
  }
  for (const invoice of docs.filter((d) => d.kind === "invoice")) {
    const paid = payments
      .filter((p) => p.data.invoiceId === invoice.id)
      .reduce((n, p) => n + p.data.amount, 0);
    if (paid > invoice.total)
      throw new Error("El pago supera el saldo de la factura.");
    if (paid > 0 && paid < invoice.total && invoice.status === "Pagada")
      throw new Error(
        "La factura tiene saldo pendiente. Registra el pago completo antes de marcarla pagada.",
      );
    const allocated = links
      .filter((l) => l.data.invoiceId === invoice.id)
      .reduce((n, l) => n + l.data.amount, 0);
    if (allocated > invoice.total)
      throw new Error("Las asignaciones superan el total de la factura.");
  }
  for (const order of recordsOf(state.records, "order")) {
    const advances = payments
      .filter((p) => p.data.orderId === order.id)
      .reduce((n, p) => n + p.data.amount, 0);
    if (advances > order.data.amount)
      throw new Error(
        "Los pagos asociados superan el monto autorizado de la OC.",
      );
    const allocated = links
      .filter((l) => l.data.orderId === order.id)
      .filter((l) =>
        docs.some(
          (d) =>
            d.id === l.data.invoiceId && !d.deleted && d.status !== "Anulada",
        ),
      )
      .reduce((n, l) => n + l.data.amount, 0);
    if (allocated > order.data.amount)
      throw new Error(
        "La facturación asignada supera el monto autorizado de la orden de compra.",
      );
  }
  for (const link of links) {
    const invoice = docs.find(
      (d) => d.id === link.data.invoiceId && d.kind === "invoice",
    );
    if (
      !invoice ||
      !cleanRut(invoice.rut) ||
      cleanRut(invoice.rut) !== cleanRut(link.customerRut)
    )
      throw new Error(
        "La factura y su OC o servicio deben pertenecer al mismo cliente.",
      );
  }
}
export function shiftMonths(date: string, months: number) {
  const d = new Date(date + "T12:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function compareOrderLines(order: DataFor<"order">, quote: Doc) {
  return (order.items ?? []).map((item) => {
    const matches = quote.items.filter(
      (q) =>
        q.description.trim().toLocaleLowerCase("es") ===
        item.description.trim().toLocaleLowerCase("es"),
    );
    const match = matches.length === 1 ? matches[0] : null;
    return {
      ...item,
      comparison: !matches.length
        ? "No está en la cotización"
        : matches.length > 1
          ? "Descripción repetida: revisar manualmente"
          : item.quantity === match!.quantity &&
              item.price === match!.price &&
              item.discount === match!.discount
            ? "Coincide"
            : "Cantidad, precio o descuento diferente",
    };
  });
}
export function businessTotals(
  state: BusinessState,
  docs: Doc[],
  recordId: string,
) {
  const records = activeRecords(state);
  const links = recordsOf(records, "billing").filter(
    (r) => r.data.orderId === recordId || r.data.jobId === recordId,
  );
  let committed = 0,
    billed = 0,
    billedNet = 0,
    paid = 0;
  for (const link of links) {
    const invoice = docs.find(
      (d) =>
        d.id === link.data.invoiceId && !d.deleted && d.status !== "Anulada",
    );
    if (!invoice) continue;
    committed += link.data.amount;
    if (invoice.status === "Emitida" || invoice.status === "Pagada") {
      billed += link.data.amount;
      billedNet += invoice.total
        ? Math.round((invoice.net * link.data.amount) / invoice.total)
        : 0;
      paid += invoice.total
        ? Math.round(
            (invoicePaid(state, invoice) * link.data.amount) / invoice.total,
          )
        : 0;
    }
  }
  const advances = recordsOf(records, "payment")
    .filter(
      (r) =>
        !r.data.invoiceId &&
        (r.data.orderId === recordId || r.data.jobId === recordId),
    )
    .reduce((n, r) => n + r.data.amount, 0);
  const directCosts = recordsOf(records, "cost")
    .filter((r) => r.data.jobId === recordId)
    .reduce((n, r) => n + r.data.amount, 0);
  const timeCosts = recordsOf(records, "serviceDoc")
    .filter((r) => r.data.jobId === recordId && r.data.category === "timesheet")
    .reduce(
      (n, r) =>
        n +
        Math.round(r.data.hours * r.data.hourlyCost) +
        r.data.materials.reduce(
          (sum, m) => sum + Math.round(m.cost * m.quantity),
          0,
        ),
      0,
    );
  return {
    committed,
    billed,
    billedNet,
    paid,
    advances,
    costs: directCosts + timeCosts,
    margin: billedNet - directCosts - timeCosts,
    outstanding: Math.max(0, billed - paid),
  };
}
