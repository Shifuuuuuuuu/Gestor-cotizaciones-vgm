import { usePermissions } from "./usePermissions";
import { kindModules } from "../shared/access";
import { useState } from "react";
import { Modal, Spinner } from "./ui";
import { businessLabels, today } from "./businessClient";
import {
  serviceCategories,
  recordsOf,
  type BusinessRecord,
  type BusinessKind,
} from "../shared/business";
import { cleanRut, type Customer } from "../shared/people";
import type { Doc } from "../shared/model";
type EditKind = Exclude<BusinessKind, "file" | "portal">;
export type BusinessForm = {
  kind: EditKind;
  record?: BusinessRecord;
  initial?: Record<string, any>;
};
export function BusinessEditor({
  form,
  records,
  customers,
  documents,
  busy,
  onClose,
  onSave,
}: {
  form: BusinessForm;
  records: BusinessRecord[];
  customers: Customer[];
  documents: Doc[];
  busy: boolean;
  onClose: () => void;
  onSave: (kind: EditKind, data: unknown, createId: string) => Promise<boolean>;
}) {
  const { has } = usePermissions();
  const scope = kindModules[form.kind];
  const [data, setData] = useState<any>(() => ({
    customerId: "",
    title: "",
    reference: "",
    date: today(),
    due: "",
    end: today(),
    amount: 0,
    tax: 19,
    items: [],
    quoteId: "",
    orderId: "",
    invoiceId: "",
    jobId: "",
    claimId: "",
    location: "",
    assignee: "",
    scope: "",
    exclusions: "",
    notes: "",
    content: "",
    category: form.kind === "cost" ? "Materiales" : "report",
    periodEnd: "",
    signer: "",
    acceptedVersion: 0,
    recurrenceMonths: 0,
    previousJobId: "",
    nextServiceDate: "",
    warrantyUntil: "",
    hours: 0,
    hourlyCost: 0,
    checklist: [],
    materials: [],
    visibleToClient: false,
    status:
      form.kind === "job"
        ? "Borrador"
        : form.kind === "paymentClaim"
          ? "En revisión"
          : "Recibida",
    method: "Transferencia",
    ...form.record?.data,
    ...form.initial,
  }));
  const [requestId] = useState(() => crypto.randomUUID());
  const set = (key: string, value: any) =>
    setData((old: any) => ({ ...old, [key]: value }));
  const allocating = form.kind === "payment" && !!form.record;
  const customer = customers.find((c) => c.id === data.customerId);
  const selectedInvoice = documents.find((d) => d.id === data.invoiceId);
  const rut = customer?.rut || selectedInvoice?.rut;
  const own = records.filter(
    (r) => !r.deleted && (!rut || cleanRut(r.customerRut) === cleanRut(rut)),
  );
  const field = (
    label: string,
    key: string,
    type = "text",
    required = false,
  ) => (
    <label key={key}>
      {label}
      <input
        type={type}
        required={required}
        disabled={
          (allocating && key !== "invoiceId") ||
          (key === "status" && !has(scope, "approve"))
        }
        value={data[key] ?? ""}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        onChange={(e) =>
          set(key, type === "number" ? Number(e.target.value) : e.target.value)
        }
      />
    </label>
  );
  const area = (label: string, key: string) => (
    <label key={key}>
      {label}
      <textarea
        rows={3}
        maxLength={6000}
        value={data[key]}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  const select = (
    label: string,
    key: string,
    options: [string, string][],
    required = false,
  ) => (
    <label key={key}>
      {label}
      <select
        required={required}
        disabled={
          (allocating && key !== "invoiceId") ||
          (key === "status" && !has(scope, "approve"))
        }
        value={data[key]}
        onChange={(e) => set(key, e.target.value)}
      >
        <option value="">Selecciona…</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  const choices = (label: string, key: string, values: string[]) =>
    select(
      label,
      key,
      values.map((v) => [v, v]),
      true,
    );
  const customerField = select(
    "Cliente",
    "customerId",
    customers.filter((c) => !c.deleted && c.active).map((c) => [c.id, c.name]),
    true,
  );
  const orderField = select(
    "Orden de compra (opcional)",
    "orderId",
    recordsOf(own, "order").map((r) => [
      r.id,
      r.data.reference + " · " + r.customerName,
    ]),
  );
  const jobField = select(
    "Servicio / OT",
    "jobId",
    recordsOf(own, "job").map((r) => [r.id, r.number + " · " + r.data.title]),
    ["cost", "serviceDoc"].includes(form.kind),
  );
  const invoiceField = select(
    form.kind === "billing"
      ? "Factura a vincular"
      : "Factura (vacío para anticipo)",
    "invoiceId",
    documents
      .filter(
        (d) =>
          d.kind === "invoice" &&
          !d.deleted &&
          (form.kind === "billing"
            ? ["Borrador", "Emitida", "Pagada"].includes(d.status)
            : form.kind === "paymentClaim"
              ? ["Emitida", "Pagada"].includes(d.status)
              : d.status === "Emitida") &&
          (!rut || cleanRut(d.rut) === cleanRut(rut)),
      )
      .map((d) => [d.id, d.number + " · " + d.client]),
    form.kind === "billing" || allocating,
  );
  return (
    <Modal
      title={(form.record ? "Editar " : "Crear ") + businessLabels[form.kind]}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onSave(form.kind, data, requestId)) onClose();
        }}
      >
        <div className="modal-body business-form">
          {allocating && (
            <p className="business-note">
              Asigna este anticipo a una factura emitida del mismo cliente. Sus
              datos y monto originales se conservarán.
            </p>
          )}
          <div className="form-grid">
            {["order", "job", "payment", "paymentClaim"].includes(form.kind) &&
              customerField}
            {form.kind === "order" && (
              <>
                {field("Número de OC del cliente", "reference", "text", true)}
                {field("Fecha", "date", "date", true)}
                {field("Entrega / vencimiento", "due", "date")}
                {field(
                  "Monto total autorizado CLP (IVA incluido)",
                  "amount",
                  "number",
                  true,
                )}
                {choices("Estado", "status", [
                  "Recibida",
                  "En revisión",
                  "Observada",
                  "Aceptada",
                  "Completada",
                  "Cancelada",
                ])}
                {select(
                  "Cotización relacionada",
                  "quoteId",
                  documents
                    .filter(
                      (d) =>
                        d.kind === "quote" &&
                        !d.deleted &&
                        (!rut || cleanRut(d.rut) === cleanRut(rut)),
                    )
                    .map((d) => [d.id, d.number + " · " + d.client]),
                )}
              </>
            )}
            {form.kind === "job" && (
              <>
                {field("Nombre del servicio", "title", "text", true)}
                {field("Inicio", "date", "date", true)}
                {field("Término previsto", "end", "date", true)}
                {field("Lugar de trabajo", "location")}
                {field("Responsable / técnico", "assignee")}
                {choices("Estado", "status", [
                  "Borrador",
                  "Programado",
                  "En ejecución",
                  "Por recibir",
                  "Completado",
                  "Cancelado",
                ])}
                {orderField}
                {select(
                  "Cotización relacionada",
                  "quoteId",
                  documents
                    .filter(
                      (d) =>
                        d.kind === "quote" &&
                        !d.deleted &&
                        (!rut || cleanRut(d.rut) === cleanRut(rut)),
                    )
                    .map((d) => [d.id, d.number]),
                )}
                {field("Próxima mantención", "nextServiceDate", "date")}
                {field(
                  "Repetir cada N meses (0: no recurrente)",
                  "recurrenceMonths",
                  "number",
                )}
                {field("Garantía hasta", "warrantyUntil", "date")}
              </>
            )}
            {form.kind === "serviceDoc" && (
              <>
                {jobField}
                {select(
                  "Tipo de documento",
                  "category",
                  Object.entries(serviceCategories),
                  true,
                )}
                {field("Título", "title", "text", true)}
                {field("Fecha", "date", "date", true)}
                {field("Vigencia / período hasta", "periodEnd", "date")}
                {field(
                  "Monto del estado de pago / respaldo CLP",
                  "amount",
                  "number",
                )}
                {data.category === "acceptance" &&
                  field(
                    "Nombre de quien recibe conforme",
                    "signer",
                    "text",
                    true,
                  )}
                {data.category === "timesheet" && (
                  <>
                    {field("Horas trabajadas", "hours", "number")}
                    {field(
                      "Costo interno neto por hora CLP",
                      "hourlyCost",
                      "number",
                    )}
                  </>
                )}
              </>
            )}
            {["payment", "paymentClaim"].includes(form.kind) && (
              <>
                {invoiceField}
                {orderField}
                {form.kind === "payment" && jobField}
                {field("Monto CLP", "amount", "number", true)}
                {field("Fecha del pago", "date", "date", true)}
                {form.kind === "payment" &&
                  choices("Medio de pago", "method", [
                    "Transferencia",
                    "Efectivo",
                    "Tarjeta",
                    "Cheque",
                    "Otro",
                  ])}
                {field("Referencia / comprobante", "reference")}
                {form.kind === "paymentClaim" &&
                  choices("Revisión", "status", ["En revisión", "Observado"])}
              </>
            )}
            {form.kind === "cost" && (
              <>
                {jobField}
                {field("Fecha", "date", "date", true)}
                {choices("Categoría", "category", [
                  "Materiales",
                  "Mano de obra",
                  "Traslado",
                  "Subcontrato",
                  "Otro",
                ])}
                {field("Descripción", "description", "text", true)}
                {field("Costo neto CLP", "amount", "number", true)}
              </>
            )}
            {form.kind === "billing" && (
              <>
                {invoiceField}
                {orderField}
                {jobField}
                {field(
                  "Monto total de esta factura asignado a OC / servicio",
                  "amount",
                  "number",
                  true,
                )}
              </>
            )}
          </div>
          {form.kind === "order" && (
            <section className="business-subsection">
              <h3>Detalle de la OC (opcional)</h3>
              <p className="hint">
                Captura las líneas del respaldo para comparar cantidades,
                precios netos y descuentos con la cotización.
              </p>
              {data.quoteId && (
                <button
                  type="button"
                  onClick={() => {
                    const quote = documents.find((d) => d.id === data.quoteId);
                    if (quote) {
                      set(
                        "items",
                        quote.items.map((i) => ({
                          description: i.description,
                          quantity: i.quantity,
                          price: i.price,
                          discount: i.discount,
                        })),
                      );
                      set("tax", quote.tax);
                      if (!data.amount) set("amount", quote.total);
                    }
                  }}
                >
                  Copiar líneas de la cotización
                </button>
              )}
              {data.items.map((item: any, index: number) => (
                <div className="form-grid business-material" key={index}>
                  {(
                    [
                      ["description", "Descripción"],
                      ["quantity", "Cantidad"],
                      ["price", "Precio neto CLP"],
                      ["discount", "Descuento %"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        required
                        type={key === "description" ? "text" : "number"}
                        min={key === "quantity" ? 0.001 : 0}
                        max={key === "discount" ? 100 : undefined}
                        step="any"
                        value={item[key]}
                        onChange={(e) =>
                          set(
                            "items",
                            data.items.map((v: any, i: number) =>
                              i === index
                                ? {
                                    ...v,
                                    [key]:
                                      key === "description"
                                        ? e.target.value
                                        : Number(e.target.value),
                                  }
                                : v,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      set(
                        "items",
                        data.items.filter((_: any, i: number) => i !== index),
                      )
                    }
                  >
                    Quitar línea
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={data.items.length >= 100}
                onClick={() =>
                  set("items", [
                    ...data.items,
                    { description: "", quantity: 1, price: 0, discount: 0 },
                  ])
                }
              >
                Agregar línea OC
              </button>
            </section>
          )}
          {form.kind === "job" && (
            <div className="form-grid bottom-form">
              {area("Alcance y entregables", "scope")}
              {area("Exclusiones y condiciones", "exclusions")}
            </div>
          )}
          {form.kind === "serviceDoc" ? (
            <>
              <div className="bottom-form">
                {area(
                  "Contenido, resultados, observaciones y condiciones",
                  "content",
                )}
              </div>
              {data.category === "checklist" && (
                <section className="business-subsection">
                  <h3>Lista de verificación</h3>
                  {data.checklist.map((item: any, index: number) => (
                    <div className="business-check-row" key={index}>
                      <input
                        type="checkbox"
                        aria-label={"Completado " + (index + 1)}
                        checked={item.done}
                        onChange={(e) =>
                          set(
                            "checklist",
                            data.checklist.map((v: any, i: number) =>
                              i === index
                                ? { ...v, done: e.target.checked }
                                : v,
                            ),
                          )
                        }
                      />
                      <input
                        aria-label={"Punto " + (index + 1)}
                        required
                        value={item.label}
                        onChange={(e) =>
                          set(
                            "checklist",
                            data.checklist.map((v: any, i: number) =>
                              i === index ? { ...v, label: e.target.value } : v,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          set(
                            "checklist",
                            data.checklist.filter(
                              (_: any, i: number) => i !== index,
                            ),
                          )
                        }
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      set("checklist", [
                        ...data.checklist,
                        { label: "", done: false },
                      ])
                    }
                  >
                    Agregar punto
                  </button>
                </section>
              )}
              {data.category === "timesheet" && (
                <section className="business-subsection">
                  <h3>Materiales utilizados</h3>
                  <p className="hint">
                    Estos costos se suman a la rentabilidad del servicio. Evita
                    registrarlos otra vez como costo manual. No descuentan stock
                    por sí mismos.
                  </p>
                  {data.materials.map((item: any, index: number) => (
                    <div className="form-grid business-material" key={index}>
                      {(
                        [
                          ["description", "Material"],
                          ["quantity", "Cantidad"],
                          ["cost", "Costo unitario neto CLP"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <input
                            type={key === "description" ? "text" : "number"}
                            required
                            min={key === "quantity" ? 0.001 : 0}
                            step="any"
                            value={item[key]}
                            onChange={(e) =>
                              set(
                                "materials",
                                data.materials.map((v: any, i: number) =>
                                  i === index
                                    ? {
                                        ...v,
                                        [key]:
                                          key === "description"
                                            ? e.target.value
                                            : Number(e.target.value),
                                      }
                                    : v,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          set(
                            "materials",
                            data.materials.filter(
                              (_: any, i: number) => i !== index,
                            ),
                          )
                        }
                      >
                        Quitar material
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      set("materials", [
                        ...data.materials,
                        { description: "", quantity: 1, cost: 0 },
                      ])
                    }
                  >
                    Agregar material
                  </button>
                </section>
              )}
              <label className="business-checkbox">
                <input
                  type="checkbox"
                  disabled={!has(scope, "share")}
                  checked={data.visibleToClient}
                  onChange={(e) => set("visibleToClient", e.target.checked)}
                />
                Compartir este documento con el cliente en su portal (los costos
                internos no se muestran).
              </label>
            </>
          ) : (
            !["cost", "billing"].includes(form.kind) && (
              <div className="bottom-form">
                {area("Observaciones", "notes")}
              </div>
            )
          )}
          {form.kind === "payment" && !data.invoiceId && (
            <p className="hint">
              Se registrará como anticipo. Selecciona una OC o un servicio;
              después podrás asignarlo a una factura.
            </p>
          )}
        </div>
        <div className="modal-actions modal-footer">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              !has(scope, form.record ? "edit" : "create") ||
              (form.kind === "payment" && !has(scope, "approve")) ||
              (form.kind === "serviceDoc" &&
                data.category === "acceptance" &&
                !has(scope, "approve"))
            }
          >
            {busy ? <Spinner /> : null}
            {allocating ? "Asignar anticipo" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
