import { z } from "zod";
export const statuses = {
  quote: ["Borrador", "Enviada", "Aceptada", "Rechazada"],
  invoice: ["Borrador", "Emitida", "Pagada", "Anulada"],
} as const;
export const transitions: Record<
  "quote" | "invoice",
  Record<string, string[]>
> = {
  quote: {
    Borrador: ["Enviada"],
    Enviada: ["Aceptada", "Rechazada", "Borrador"],
    Aceptada: [],
    Rechazada: ["Borrador"],
  },
  invoice: {
    Borrador: ["Emitida"],
    Emitida: ["Pagada", "Anulada"],
    Pagada: [],
    Anulada: [],
  },
};
export const inputSchema = z
  .object({
    kind: z.enum(["quote", "invoice"]),
    client: z.string().trim().min(1).max(160),
    rut: z.string().max(30),
    email: z.union([z.email(), z.literal("")]),
    address: z.string().max(300),
    date: z.iso.date(),
    due: z.iso.date(),
    notes: z.string().max(4000),
    tax: z.number().min(0).max(100),
    items: z
      .array(
        z.object({
          description: z.string().trim().min(1).max(500),
          productId: z.uuid().optional(),
          productCode: z.string().max(60).optional(),
          productBrand: z.string().max(100).optional(),
          productType: z.enum(["product", "service"]).optional(),
          imageUrl: z
            .string()
            .max(100)
            .regex(/^$|^\/api\/images\/[0-9a-f-]{36}$/)
            .optional(),
          quantity: z
            .number()
            .positive()
            .max(100000)
            .refine(
              (n) => Math.abs(Math.round(n * 1000) / 1000 - n) < 0.000001,
              "Usa hasta 3 decimales en cantidad.",
            ),
          price: z.number().min(0).max(100000000),
          discount: z.number().min(0).max(100),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (d) => d.due >= d.date,
    "El vencimiento debe ser posterior o igual a la fecha",
  );
export type Input = z.infer<typeof inputSchema>;
export type Doc = Input & {
  pending?: boolean;
  id: string;
  number: string;
  status: string;
  version: number;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  sourceId: string | null;
  net: number;
  taxAmount: number;
  total: number;
};
export type Event = {
  id: string;
  documentId: string;
  number: string;
  action: string;
  actor: string;
  at: string;
  before: Doc | null;
  after: Doc;
  reason: string;
};
export function totals(d: Pick<Input, "items" | "tax">) {
  const net = d.items.reduce(
    (sum, i) => sum + Math.round(i.quantity * i.price * (1 - i.discount / 100)),
    0,
  );
  const taxAmount = Math.round((net * d.tax) / 100);
  return { net, taxAmount, total: net + taxAmount };
}
export const money = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
export const blank = (): Input => ({
  kind: "quote",
  client: "",
  rut: "",
  email: "",
  address: "",
  date: new Date().toISOString().slice(0, 10),
  due: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  notes: "Validez de la oferta: 30 días. Valores expresados en pesos chilenos.",
  tax: 19,
  items: [{ description: "", quantity: 1, price: 0, discount: 0 }],
});
export type Command = {
  requestId?: string;
  action: "save" | "status" | "delete" | "restore" | "version" | "convert";
  id?: string;
  version?: number;
  data?: Input;
  status?: string;
  reason?: string;
  eventId?: string;
};
export function change(
  old: Doc | null,
  cmd: Command,
  actor: string,
  eventId: string,
  number: string,
  now: string,
  previous?: Event,
): { doc: Doc; event: Event } {
  if (cmd.id && !old) throw new Error("Documento inexistente.");
  if (old && old.version !== cmd.version)
    throw new Error(
      "CONFLICT: El documento cambió. Recarga antes de continuar.",
    );
  if (old?.deleted && cmd.action !== "restore")
    throw new Error("Restaura primero el documento de la papelera.");
  let doc: Doc;
  if (cmd.action === "save") {
    const data = inputSchema.parse(cmd.data);
    if (old && (data.kind !== old.kind || old.status !== "Borrador"))
      throw new Error("Solo se puede editar un borrador.");
    doc = {
      ...data,
      ...totals(data),
      id: old?.id ?? eventId,
      number: old?.number ?? number,
      status: old?.status ?? "Borrador",
      version: (old?.version ?? 0) + 1,
      deleted: false,
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
      sourceId: old?.sourceId ?? null,
    };
  } else {
    if (!old) throw new Error("Documento inexistente.");
    doc = { ...old, version: old.version + 1, updatedAt: now };
    if (cmd.action === "delete") {
      if (!cmd.reason?.trim())
        throw new Error("Indica el motivo de eliminación.");
      doc.deleted = true;
    }
    if (cmd.action === "restore") {
      if (!old.deleted) throw new Error("El documento no está eliminado.");
      doc.deleted = false;
    }
    if (cmd.action === "status") {
      const flows = transitions[old.kind];
      if (!cmd.status || !flows[old.status]?.includes(cmd.status))
        throw new Error("Transición de estado no permitida.");
      doc.status = cmd.status;
    }
    if (cmd.action === "version") {
      if (
        old.status !== "Borrador" ||
        !previous ||
        previous.documentId !== old.id
      )
        throw new Error(
          "Solo puedes recuperar versiones del mismo documento en borrador.",
        );
      const data = inputSchema.parse(previous.after);
      doc = { ...doc, ...data, ...totals(data) };
    }
    if (cmd.action === "convert") {
      if (old.kind !== "quote" || old.status !== "Aceptada")
        throw new Error("Solo se puede facturar una cotización aceptada.");
      doc = {
        ...old,
        id: eventId,
        number,
        kind: "invoice",
        status: "Borrador",
        version: 1,
        sourceId: old.id,
        createdAt: now,
        updatedAt: now,
      };
    }
  }
  return {
    doc,
    event: {
      id: eventId,
      documentId: doc.id,
      number: doc.number,
      action: cmd.action,
      actor,
      at: now,
      before: old,
      after: doc,
      reason: cmd.reason ?? "",
    },
  };
}
