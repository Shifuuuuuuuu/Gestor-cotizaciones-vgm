import { randomUUID, createHash, randomBytes } from "node:crypto";
import {
  businessSchemas,
  recordsOf,
  invoicePaid,
  type BusinessKind,
  type BusinessRecord,
  type BusinessState,
} from "../shared/business";
import { cleanRut, type Customer } from "../shared/people";
import { type Doc } from "../shared/model";
import { listCustomers } from "./people";
import { transact, businessSnapshot, type State } from "./store";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function touch(
  state: State,
  old: BusinessRecord | null,
  after: BusinessRecord,
  actor: string,
  action: string,
  reason = "",
) {
  state.business.records = state.business.records
    .filter((r) => r.id !== after.id)
    .concat(after);
  state.business.events.push({
    id: randomUUID(),
    recordId: after.id,
    actor,
    action,
    at: after.updatedAt,
    reason,
    before: old,
    after,
  });
  return after;
}
function reference(
  state: State,
  id: string,
  kind?: BusinessKind,
  active = true,
) {
  const record = state.business.records.find(
    (r) => r.id === id && (!kind || r.kind === kind),
  );
  if (!record || (active && record.deleted))
    throw new Error("El registro relacionado no existe o está en la papelera.");
  return record;
}
function documentFor(state: State, id: string, kind: Doc["kind"], rut: string) {
  const doc = state.documents.find(
    (d) =>
      d.id === id && d.kind === kind && !d.deleted && d.status !== "Anulada",
  );
  if (!doc || !cleanRut(rut) || cleanRut(rut) !== cleanRut(doc.rut))
    throw new Error(
      "El documento debe estar vigente y pertenecer al mismo RUT del cliente.",
    );
  return doc;
}
function updateInvoice(state: State, invoiceId: string, actor: string) {
  const old = state.documents.find((d) => d.id === invoiceId);
  if (!old) return;
  const paid = invoicePaid(state.business, old);
  const status = paid >= old.total ? "Pagada" : "Emitida";
  if (old.status === status) return;
  const now = new Date().toISOString();
  const doc = { ...old, status, version: old.version + 1, updatedAt: now };
  state.documents = state.documents.map((d) => (d.id === doc.id ? doc : d));
  state.events.push({
    id: randomUUID(),
    documentId: doc.id,
    number: doc.number,
    action: status === "Pagada" ? "payment" : "payment_void",
    actor,
    at: now,
    before: old,
    after: doc,
    reason:
      status === "Pagada"
        ? "Saldo completado mediante pagos registrados."
        : "Pago anulado; saldo actualizado.",
  });
}
export type SaveBusiness = {
  kind: BusinessKind;
  data: unknown;
  id?: string;
  version?: number;
  createId?: string;
  actor: string;
  allowInternal?: boolean;
};
export async function saveBusiness(
  input: SaveBusiness,
): Promise<BusinessRecord> {
  if (["portal", "file"].includes(input.kind) && !input.allowInternal)
    throw new Error("Usa la operación específica para enlaces o archivos.");
  const parsed = businessSchemas[input.kind].parse(input.data) as any;
  const customers = await listCustomers();
  return transact((state) => saveInState(state, input, parsed, customers));
}
function saveInState(
  state: State,
  input: SaveBusiness,
  data: any,
  customers: Customer[],
): BusinessRecord {
  const old = input.id
    ? state.business.records.find((r) => r.id === input.id)
    : null;
  if (input.id && (!old || old.kind !== input.kind))
    throw new Error("Registro inexistente.");
  if (old && old.version !== input.version)
    throw new Error("CONFLICT: El registro cambió. Recarga antes de guardar.");
  if (old?.deleted)
    throw new Error("Recupera primero el registro de la papelera.");
  const requestHash = hash(JSON.stringify({ kind: input.kind, data }));
  if (!input.id && input.createId) {
    const previous = state.business.records.find(
      (r) => r.id === input.createId,
    ) as (BusinessRecord & { requestHash?: string }) | undefined;
    if (previous) {
      if (previous.requestHash !== requestHash)
        throw new Error("La solicitud ya se utilizó con otros datos.");
      return previous;
    }
  }
  let customerId: string = data.customerId;
  if (input.kind === "serviceDoc" || input.kind === "cost")
    customerId = reference(state, data.jobId, "job").customerId;
  if (input.kind === "billing") {
    if (!data.orderId && !data.jobId)
      throw new Error("Selecciona una OC o servicio para asociar la factura.");
    customerId = reference(
      state,
      data.orderId || data.jobId,
      data.orderId ? "order" : "job",
    ).customerId;
  }
  if (input.kind === "file") {
    const parent = state.business.records.find(
      (r) => r.id === data.parentId && !r.deleted,
    );
    if (parent) customerId = parent.customerId;
    else {
      const doc = state.documents.find(
        (d) => d.id === data.parentId && !d.deleted,
      );
      const customer = customers.find(
        (c) =>
          c.id === data.customerId &&
          doc &&
          cleanRut(c.rut) &&
          cleanRut(c.rut) === cleanRut(doc.rut),
      );
      if (!customer)
        throw new Error("El documento adjunto no pertenece al cliente.");
      customerId = customer.id;
    }
  }
  const customer = customers.find((c) => c.id === customerId);
  if (!customer || customer.deleted || !customer.active)
    throw new Error("Selecciona un cliente activo del directorio.");
  if (old && old.customerId !== customerId)
    throw new Error("No se puede cambiar el cliente de un registro existente.");
  for (const [field, kind] of [
    ["orderId", "order"],
    ["jobId", "job"],
  ] as const)
    if (data[field]) {
      const related = reference(state, data[field], kind);
      if (related.customerId !== customerId)
        throw new Error("Las referencias deben pertenecer al mismo cliente.");
      if (
        ["payment", "billing"].includes(input.kind) &&
        ((related.kind === "order" && related.data.status === "Cancelada") ||
          (related.kind === "job" && related.data.status === "Cancelado"))
      )
        throw new Error(
          "No se puede registrar este movimiento en una OC o servicio cancelado.",
        );
      if (
        input.kind === "billing" &&
        related.kind === "order" &&
        !["Aceptada", "Completada"].includes(related.data.status)
      )
        throw new Error("Acepta la OC antes de asignarle facturas.");
    }
  if (data.quoteId) documentFor(state, data.quoteId, "quote", customer.rut);
  if (data.jobId && data.orderId) {
    const job = reference(state, data.jobId, "job");
    if (
      job.kind === "job" &&
      job.data.orderId &&
      job.data.orderId !== data.orderId
    )
      throw new Error("El servicio está vinculado a otra orden de compra.");
  }
  if (data.invoiceId)
    documentFor(state, data.invoiceId, "invoice", customer.rut);
  if (input.kind === "order") {
    if (data.due && data.due < data.date)
      throw new Error("La fecha de entrega no puede ser anterior a la OC.");
    if (
      recordsOf(state.business.records, "order").some(
        (r) =>
          r.id !== old?.id &&
          r.customerId === customerId &&
          r.data.reference.toLowerCase() === data.reference.toLowerCase(),
      )
    )
      throw new Error(
        "Ese número de OC ya existe para este cliente, incluso en la papelera.",
      );
  }
  if (input.kind === "job") {
    if (
      old?.kind === "job" &&
      old.data.status === "Completado" &&
      data.status === "Completado" &&
      ["title", "scope", "exclusions", "location", "date", "end"].some(
        (key) => (old.data as any)[key] !== data[key],
      )
    )
      data.status = "Por recibir";
    if (data.end < data.date)
      throw new Error(
        "El término del servicio no puede ser anterior al inicio.",
      );
    if (data.previousJobId) {
      const previous = reference(state, data.previousJobId, "job");
      if (previous.customerId !== customerId || previous.id === old?.id)
        throw new Error("La recurrencia debe pertenecer al mismo cliente.");
      if (
        recordsOf(state.business.records, "job").some(
          (r) =>
            r.id !== old?.id && r.data.previousJobId === data.previousJobId,
        )
      )
        throw new Error("Ya se programó el siguiente servicio de esta orden.");
    }
  }
  if (input.kind === "payment") {
    if (old) {
      if (old.kind !== "payment" || old.data.invoiceId)
        throw new Error(
          "Los pagos son inmutables. Anula el pago y registra uno nuevo si necesitas corregirlo.",
        );
      if (
        JSON.stringify({ ...old.data, invoiceId: "" }) !==
          JSON.stringify({ ...data, invoiceId: "" }) ||
        !data.invoiceId
      )
        throw new Error(
          "Solo puedes asignar un anticipo a una factura sin modificar su importe o respaldo.",
        );
    }
    if (
      data.reference &&
      recordsOf(state.business.records, "payment").some(
        (r) =>
          !r.deleted &&
          r.id !== old?.id &&
          r.customerId === customerId &&
          r.data.method === data.method &&
          r.data.reference === data.reference,
      )
    )
      throw new Error(
        "Ese comprobante o referencia de pago ya fue registrado.",
      );
    if (data.invoiceId) {
      const invoice = documentFor(
        state,
        data.invoiceId,
        "invoice",
        customer.rut,
      );
      if (invoice.status !== "Emitida")
        throw new Error(
          "El pago requiere una factura emitida con saldo pendiente.",
        );
    }
    if (data.claimId) {
      const claim = reference(state, data.claimId, "paymentClaim");
      if (
        claim.kind !== "paymentClaim" ||
        claim.customerId !== customerId ||
        claim.data.amount !== data.amount ||
        claim.data.invoiceId !== data.invoiceId ||
        claim.data.orderId !== data.orderId
      )
        throw new Error(
          "El pago no coincide con el comprobante informado por el cliente.",
        );
      if (
        recordsOf(state.business.records, "payment").some(
          (p) =>
            p.id !== old?.id && !p.deleted && p.data.claimId === data.claimId,
        )
      )
        throw new Error("Ese comprobante ya tiene un pago registrado.");
      touch(
        state,
        claim,
        {
          ...claim,
          data: { ...claim.data, status: "Verificado" },
          version: claim.version + 1,
          updatedAt: new Date().toISOString(),
          actor: input.actor,
        },
        input.actor,
        "verified",
      );
    }
  }
  if (input.kind === "paymentClaim" && !data.invoiceId && !data.orderId)
    throw new Error("Vincula el comprobante a una factura u orden de compra.");
  if (
    input.kind === "paymentClaim" &&
    old?.kind === "paymentClaim" &&
    old.data.status === "Verificado"
  )
    throw new Error(
      "Un comprobante verificado se conserva como evidencia del pago; no se sobrescribe.",
    );
  if (
    input.kind === "paymentClaim" &&
    data.status === "Verificado" &&
    (!old || old.kind !== "paymentClaim" || old.data.status !== "Verificado")
  )
    throw new Error(
      "El comprobante se verifica al registrar su pago, no mediante una edición manual.",
    );
  if (input.kind === "serviceDoc") {
    const job = reference(state, data.jobId, "job");
    if (job.kind !== "job") throw new Error("Servicio inexistente.");
    if (data.periodEnd && data.periodEnd < data.date)
      throw new Error("Revisa el período del documento.");
    if (old?.kind === "serviceDoc" && old.data.category === "acceptance")
      throw new Error(
        "Una recepción conforme no se sobrescribe. Conserva su evidencia y registra un nuevo documento.",
      );
    if (data.category === "acceptance") {
      if (!["Por recibir", "Completado"].includes(job.data.status))
        throw new Error(
          "El servicio debe estar por recibir o completado para registrar conformidad.",
        );
      if (data.signer.trim().length < 2)
        throw new Error("Indica el nombre de quien recibe conforme.");
      if (data.acceptedVersion && data.acceptedVersion !== job.version)
        throw new Error(
          "CONFLICT: El servicio cambió. Revisa su versión actual antes de confirmar.",
        );
      data.acceptedVersion = job.version;
      if (
        recordsOf(state.business.records, "serviceDoc").some(
          (r) =>
            !r.deleted &&
            r.data.jobId === job.id &&
            r.data.category === "acceptance" &&
            r.data.acceptedVersion === job.version,
        )
      )
        throw new Error("Esta versión ya tiene una recepción conforme.");
      if (job.data.status === "Por recibir")
        touch(
          state,
          job,
          {
            ...job,
            data: { ...job.data, status: "Completado" },
            version: job.version + 1,
            updatedAt: new Date().toISOString(),
            actor: input.actor,
          },
          input.actor,
          "received",
        );
    }
  }
  const now = new Date().toISOString();
  const sequence = old ? 0 : (state.business.counters[input.kind] ?? 0) + 1;
  if (!old) state.business.counters[input.kind] = sequence;
  const prefix: Record<BusinessKind, string> = {
    order: "OC",
    job: "OT",
    serviceDoc: "DOC",
    payment: "PAG",
    paymentClaim: "COM",
    cost: "COS",
    billing: "VIN",
    file: "ADJ",
    portal: "POR",
  };
  const record = {
    id: old?.id ?? input.createId ?? randomUUID(),
    kind: input.kind,
    data,
    customerId,
    customerName: customer.name,
    customerRut: customer.rut,
    number:
      old?.number ??
      prefix[input.kind] + "-" + String(sequence).padStart(6, "0"),
    version: (old?.version ?? 0) + 1,
    deleted: false,
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
    actor: input.actor,
    requestHash: (old as any)?.requestHash ?? requestHash,
  } as BusinessRecord;
  touch(state, old ?? null, record, input.actor, old ? "edit" : "create");
  if (record.kind === "payment" && record.data.invoiceId)
    updateInvoice(state, record.data.invoiceId, input.actor);
  return record;
}
export async function archiveBusiness(
  id: string,
  version: number,
  deleted: boolean,
  reason: string,
  actor: string,
) {
  if (!reason.trim()) throw new Error("Indica el motivo del cambio.");
  return transact((state) => {
    const old = reference(state, id, undefined, false);
    if (old.version !== version)
      throw new Error(
        "CONFLICT: El registro cambió. Recarga antes de continuar.",
      );
    if (old.deleted === deleted)
      throw new Error("El registro ya tiene ese estado.");
    if (old.kind === "payment" && !deleted)
      throw new Error(
        "Un pago anulado no se reactiva. Registra un pago nuevo con su respaldo.",
      );
    if (old.kind === "portal" && !deleted)
      throw new Error(
        "Un enlace revocado no se reactiva. Genera un enlace nuevo.",
      );
    const after = {
      ...old,
      deleted,
      version: old.version + 1,
      updatedAt: new Date().toISOString(),
      actor,
    };
    touch(
      state,
      old,
      after,
      actor,
      old.kind === "payment" ? "void" : deleted ? "archive" : "restore",
      reason,
    );
    if (old.kind === "payment" && old.data.invoiceId)
      updateInvoice(state, old.data.invoiceId, actor);
    if (old.kind === "payment" && old.data.claimId) {
      const claim = reference(state, old.data.claimId, "paymentClaim", false);
      if (claim.kind === "paymentClaim")
        touch(
          state,
          claim,
          {
            ...claim,
            data: { ...claim.data, status: "Observado" },
            version: claim.version + 1,
            updatedAt: after.updatedAt,
            actor,
          },
          actor,
          "payment_void",
          reason,
        );
    }
    return after;
  });
}
export async function createPortal(
  customerId: string,
  days: number,
  actor: string,
) {
  const customer = (await listCustomers()).find(
    (c) => c.id === customerId && c.active && !c.deleted,
  );
  if (!customer || !cleanRut(customer.rut))
    throw new Error("El portal requiere un cliente activo con RUT.");
  const token = randomBytes(32).toString("base64url");
  const record = await saveBusiness({
    kind: "portal",
    data: {
      customerId,
      label: customer.name,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
    },
    actor,
    allowInternal: true,
  });
  return { record: publicRecord(record), path: "/portal/" + token };
}
export function publicRecord(record: BusinessRecord): BusinessRecord {
  const { requestHash, ...safe } = record as any;
  if (record.kind === "portal")
    return { ...safe, data: { ...record.data, tokenHash: "" } };
  return safe;
}
export async function shareBusinessFile(
  id: string,
  version: number,
  visible: boolean,
  actor: string,
) {
  return transact((state) => {
    const old = reference(state, id, "file");
    if (old.kind !== "file") throw new Error("Archivo inexistente.");
    if (old.version !== version)
      throw new Error(
        "CONFLICT: El archivo cambió. Recarga antes de continuar.",
      );
    return touch(
      state,
      old,
      {
        ...old,
        data: { ...old.data, visibleToClient: visible },
        version: old.version + 1,
        updatedAt: new Date().toISOString(),
        actor,
      },
      actor,
      "visibility",
    );
  });
}
export async function portalIdentity(token: string) {
  if (!/^[\w-]{43}$/.test(token))
    throw new Error("Enlace de cliente inválido o vencido.");
  const state = await businessSnapshot();
  const portal = recordsOf(state.records, "portal").find(
    (p) =>
      !p.deleted &&
      p.data.tokenHash === hash(token) &&
      p.data.expiresAt > new Date().toISOString(),
  );
  const customer =
    portal &&
    (await listCustomers()).find(
      (c) => c.id === portal.customerId && c.active && !c.deleted,
    );
  if (!portal || !customer)
    throw new Error("Enlace de cliente inválido, revocado o vencido.");
  return { customer, portal, state };
}
export function clientRecords(
  state: BusinessState,
  customerId: string,
  docs: Doc[] = [],
) {
  const own = state.records.filter(
    (r) => !r.deleted && r.customerId === customerId,
  );
  const visibleParents = new Set(
    own
      .filter(
        (r) =>
          ["order", "job", "payment", "paymentClaim"].includes(r.kind) ||
          (r.kind === "serviceDoc" &&
            r.data.visibleToClient &&
            own.some((j) => j.kind === "job" && j.id === r.data.jobId)),
      )
      .map((r) => r.id),
  );
  return own
    .filter(
      (r) =>
        ["order", "job", "payment", "paymentClaim"].includes(r.kind) ||
        (r.kind === "serviceDoc" &&
          r.data.visibleToClient &&
          own.some((j) => j.id === r.data.jobId && j.kind === "job")) ||
        (r.kind === "file" &&
          r.data.visibleToClient &&
          (visibleParents.has(r.data.parentId) ||
            docs.some((d) => !d.deleted && d.id === r.data.parentId))),
    )
    .map((r) => {
      const { requestHash, ...copy } = r as any;
      copy.actor = "Equipo VGM";
      if (r.kind === "serviceDoc" && r.data.category === "timesheet")
        copy.data = {
          ...copy.data,
          hourlyCost: 0,
          materials: copy.data.materials.map((m: any) => ({ ...m, cost: 0 })),
        };
      return copy as BusinessRecord;
    });
}
