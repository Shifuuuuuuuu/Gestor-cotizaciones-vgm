import { usePermissions } from "./usePermissions";
import { kindModules } from "../shared/access";
import { useEffect, useState } from "react";
import {
  Plus,
  RotateCcw,
  Search,
  CalendarDays,
  ClipboardList,
  Wallet,
  Globe,
  Wrench,
} from "lucide-react";
import { api } from "./api";
import { beginFeedback } from "./feedback";
import type { NoticeKind } from "./feedback";
import { ConfirmationDialog } from "./ui";
import {
  blankBusiness,
  recordsOf,
  invoicePaid,
  type BusinessRecord,
  type BusinessState,
} from "../shared/business";
import { money, type Doc } from "../shared/model";
import type { Customer, Profile } from "../shared/people";
import { BusinessEditor, type BusinessForm } from "./BusinessEditor";
import { BusinessDetail } from "./BusinessDetail";
import { BusinessFiles } from "./BusinessFiles";
import { businessLabels, today } from "./businessClient";
export type BusinessSection =
  "orders" | "jobs" | "payments" | "agenda" | "portal";
export function BusinessPanel({
  section,
  customers,
  documents,
  user,
  onRefresh,
  onDocument,
  onNewInvoice,
  focusId,
}: {
  section: BusinessSection;
  customers: Customer[];
  documents: Doc[];
  user: Profile;
  onRefresh: () => Promise<void>;
  onDocument: (doc: Doc) => void;
  onNewInvoice: (record: BusinessRecord) => void;
  focusId?: string | null;
}) {
  const { has } = usePermissions();
  const [state, setState] = useState<BusinessState>(blankBusiness),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [trash, setTrash] = useState(false),
    [form, setForm] = useState<BusinessForm | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [archiving, setArchiving] = useState<BusinessRecord | null>(null),
    [reason, setReason] = useState("");
  const [portalCustomer, setPortalCustomer] = useState(""),
    [portalDays, setPortalDays] = useState(7),
    [portalLink, setPortalLink] = useState("");
  const [invoiceFiles, setInvoiceFiles] = useState<string | null>(null);
  useEffect(() => {
    setForm(null);
    setSelected(null);
    setInvoiceFiles(null);
  }, [user.permissionsVersion]);
  async function reload() {
    const result = await api("business");
    setState(result);
    await onRefresh();
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setSelected(focusId ?? null);
    setQuery("");
    setTrash(false);
    api("business")
      .then((data) => {
        if (active) setState(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [section, focusId, user.permissionsVersion]);
  const active = state.records.filter((r) => !r.deleted);
  const match = (r: BusinessRecord) =>
    [r.number, r.customerName, JSON.stringify(r.data)]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase());
  const show = (r: BusinessRecord) => r.deleted === trash && match(r);
  const selectedRecord = state.records.find((r) => r.id === selected);
  function archive(record: BusinessRecord) {
    setReason("");
    setArchiving(record);
  }
  async function execute(
    work: () => Promise<any>,
    title: string,
    editing: boolean | NoticeKind = false,
  ) {
    setBusy(true);
    const operation = beginFeedback(
      "Procesando operación",
      "Guardando información",
    );
    try {
      const result = await work();
      operation.step("Actualizando registros");
      try {
        await reload();
        operation.success(
          title,
          undefined,
          typeof editing === "string" ? editing : editing ? "edit" : "success",
        );
      } catch (e) {
        operation.success(
          "Cambio guardado; actualización pendiente",
          (e as Error).message,
          "warning",
        );
      }
      return result;
    } catch (e) {
      operation.error(e);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const invoices = documents.filter(
    (d) =>
      d.kind === "invoice" &&
      !d.deleted &&
      ["Emitida", "Pagada"].includes(d.status),
  );
  const outstanding = invoices.reduce(
    (sum, d) => sum + Math.max(0, d.total - invoicePaid(state, d)),
    0,
  );
  const claims = recordsOf(active, "paymentClaim").filter(
    (r) => r.data.status !== "Verificado",
  );
  const title = {
    orders: "Órdenes de compra",
    jobs: "Servicios y órdenes de trabajo",
    payments: "Pagos, anticipos y cobranza",
    agenda: "Agenda comercial",
    portal: "Portal de clientes",
  }[section];
  const Icon = {
    orders: ClipboardList,
    jobs: Wrench,
    payments: Wallet,
    agenda: CalendarDays,
    portal: Globe,
  }[section];
  const table = (rows: BusinessRecord[]) =>
    rows.length ? (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Registro</th>
              <th>Cliente</th>
              <th>Detalle</th>
              <th>Estado / monto</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <button onClick={() => setSelected(r.id)}>{r.number}</button>
                </td>
                <td>{r.customerName}</td>
                <td>
                  {(r.data as any).title ||
                    (r.data as any).reference ||
                    (r.data as any).description ||
                    businessLabels[r.kind]}
                </td>
                <td>
                  {(r.data as any).status && (
                    <span className="badge">{(r.data as any).status}</span>
                  )}
                  {typeof (r.data as any).amount === "number" && (
                    <strong>{money((r.data as any).amount)}</strong>
                  )}
                </td>
                <td>
                  <button
                    className={r.deleted ? "" : "danger"}
                    disabled={
                      busy ||
                      (r.kind === "portal" && user.role !== "admin") ||
                      (r.kind === "payment" && r.deleted)
                    }
                    hidden={
                      !has(kindModules[r.kind], "delete") ||
                      (r.deleted && !has("trash")) ||
                      (r.kind === "payment" && !has("collections", "approve"))
                    }
                    onClick={() => archive(r)}
                  >
                    {r.deleted
                      ? "Recuperar"
                      : r.kind === "payment"
                        ? "Anular"
                        : r.kind === "portal"
                          ? "Revocar"
                          : "Eliminar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="empty">
        <Icon size={28} />
        <h3>
          {query
            ? "Sin coincidencias"
            : trash
              ? "Sin registros en papelera"
              : "Aún no hay registros"}
        </h3>
        <p>Los registros de esta sección aparecerán aquí.</p>
      </div>
    );
  const agenda: {
    date: string;
    title: string;
    detail: string;
    record?: BusinessRecord;
    doc?: Doc;
  }[] = [];
  for (const d of documents.filter((d) => !d.deleted)) {
    if (d.kind === "quote" && ["Borrador", "Enviada"].includes(d.status))
      agenda.push({
        date: d.due,
        title: "Vence cotización " + d.number,
        detail: d.client,
        doc: d,
      });
    if (
      d.kind === "invoice" &&
      d.status === "Emitida" &&
      invoicePaid(state, d) < d.total
    )
      agenda.push({
        date: d.due,
        title: "Pago pendiente " + d.number,
        detail: d.client + " · " + money(d.total - invoicePaid(state, d)),
        doc: d,
      });
  }
  for (const r of active) {
    if (
      r.kind === "order" &&
      r.data.due &&
      !["Completada", "Cancelada"].includes(r.data.status)
    )
      agenda.push({
        date: r.data.due,
        title: "Entrega OC " + r.data.reference,
        detail: r.customerName,
        record: r,
      });
    if (r.kind === "job") {
      if (!["Completado", "Cancelado"].includes(r.data.status))
        agenda.push({
          date: r.data.end,
          title: "Servicio " + r.number,
          detail: r.data.title + " · " + r.data.assignee,
          record: r,
        });
      if (r.data.nextServiceDate)
        agenda.push({
          date: r.data.nextServiceDate,
          title: "Próxima mantención " + r.number,
          detail: r.customerName,
          record: r,
        });
      if (r.data.warrantyUntil)
        agenda.push({
          date: r.data.warrantyUntil,
          title: "Vence garantía " + r.number,
          detail: r.customerName,
          record: r,
        });
    }
    if (
      r.kind === "serviceDoc" &&
      r.data.periodEnd &&
      ["compliance", "warranty", "contract"].includes(r.data.category)
    )
      agenda.push({
        date: r.data.periodEnd,
        title: "Vence respaldo " + r.number,
        detail: r.data.title,
        record: r,
      });
  }
  const due = agenda.filter((a) => a.date <= today()).length;
  return (
    <div className="business-page">
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>
              <Icon size={20} />
              {title}
            </h2>
            <p>
              {section === "orders"
                ? "Vincula la OC del cliente con cotizaciones, servicios, facturas y respaldos."
                : section === "jobs"
                  ? "Planifica el trabajo y conserva contratos, informes, recepción, garantías y costos."
                  : section === "payments"
                    ? "Registra dinero recibido, asigna anticipos y revisa comprobantes de clientes."
                    : section === "agenda"
                      ? "Vencimientos y pendientes. Los recordatorios se consultan aquí; no se envían correos automáticos."
                      : "Acceso por enlace privado, con vencimiento y revocación, limitado a un cliente."}
            </p>
          </div>
          <div className="catalog-actions">
            <button
              disabled={busy}
              onClick={() => execute(reload, "Información actualizada", true)}
            >
              <RotateCcw size={16} />
              Actualizar
            </button>
            {section === "orders" && (
              <button
                hidden={!has("orders", "create")}
                className="primary"
                onClick={() => setForm({ kind: "order" })}
              >
                <Plus size={16} />
                Nueva OC
              </button>
            )}
            {section === "jobs" && (
              <button
                hidden={!has("services", "create")}
                className="primary"
                onClick={() => setForm({ kind: "job" })}
              >
                <Plus size={16} />
                Nuevo servicio
              </button>
            )}
            {section === "payments" && (
              <button
                hidden={
                  !has("collections", "create") ||
                  !has("collections", "approve")
                }
                className="primary"
                onClick={() => setForm({ kind: "payment" })}
              >
                <Plus size={16} />
                Registrar pago / anticipo
              </button>
            )}
          </div>
        </div>
        {loading ? (
          <div className="empty">Cargando operaciones…</div>
        ) : error ? (
          <div className="inline-error" role="alert">
            {error}
          </div>
        ) : (
          <>
            {section !== "agenda" && section !== "portal" && (
              <div className="toolbar">
                <label className="search">
                  <Search size={16} />
                  <input
                    placeholder="Buscar cliente, referencia o documento…"
                    aria-label="Buscar operaciones"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label className="business-checkbox">
                  <input
                    type="checkbox"
                    hidden={!has("trash")}
                    checked={trash}
                    onChange={(e) => setTrash(e.target.checked)}
                  />
                  Ver papelera / anulados
                </label>
              </div>
            )}
            {section === "orders" &&
              table(recordsOf(state.records, "order").filter(show))}
            {section === "jobs" &&
              table(recordsOf(state.records, "job").filter(show))}
            {section === "payments" && (
              <div className="business-finance">
                <div className="business-kpis">
                  <div>
                    <small>Saldo de facturas</small>
                    <strong>{money(outstanding)}</strong>
                  </div>
                  <div>
                    <small>Comprobantes por revisar</small>
                    <strong>{claims.length}</strong>
                  </div>
                  <div>
                    <small>Anticipos sin asignar</small>
                    <strong>
                      {money(
                        recordsOf(active, "payment")
                          .filter((p) => !p.data.invoiceId)
                          .reduce((sum, p) => sum + p.data.amount, 0),
                      )}
                    </strong>
                  </div>
                </div>
                <h3>Facturas y saldos</h3>
                <p className="hint">
                  La facturación es interna. La integración con Defontana se
                  incorporará más adelante. Las facturas históricas marcadas
                  pagadas sin abonos se consideran saldadas.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Factura</th>
                        <th>Cliente</th>
                        <th>Total</th>
                        <th>Cobrado</th>
                        <th>Saldo</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices
                        .filter((d) =>
                          [d.number, d.client]
                            .join(" ")
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        )
                        .map((d) => (
                          <tr key={d.id}>
                            <td>
                              <button onClick={() => onDocument(d)}>
                                {d.number}
                              </button>
                            </td>
                            <td>{d.client}</td>
                            <td>{money(d.total)}</td>
                            <td>{money(invoicePaid(state, d))}</td>
                            <td>
                              {money(
                                Math.max(0, d.total - invoicePaid(state, d)),
                              )}
                            </td>
                            <td>
                              <div className="catalog-actions">
                                {d.status === "Emitida" &&
                                  has("collections", "create") &&
                                  has("collections", "approve") && (
                                    <button
                                      onClick={() => {
                                        const customer = customers.find(
                                          (c) =>
                                            c.rut
                                              .replace(/[^\dkK]/g, "")
                                              .toUpperCase() ===
                                            d.rut
                                              .replace(/[^\dkK]/g, "")
                                              .toUpperCase(),
                                        );
                                        setForm({
                                          kind: "payment",
                                          initial: {
                                            customerId: customer?.id ?? "",
                                            invoiceId: d.id,
                                            amount:
                                              d.total - invoicePaid(state, d),
                                          },
                                        });
                                      }}
                                    >
                                      Abonar
                                    </button>
                                  )}
                                <button onClick={() => setInvoiceFiles(d.id)}>
                                  Respaldos
                                </button>
                                <button
                                  hidden={!has("collections", "create")}
                                  onClick={() =>
                                    setForm({
                                      kind: "billing",
                                      initial: { invoiceId: d.id },
                                    })
                                  }
                                >
                                  Asignar a OC / servicio
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <h3 className="spaced">Comprobantes enviados por clientes</h3>
                {table(recordsOf(state.records, "paymentClaim").filter(show))}
                <h3 className="spaced">Pagos y anticipos</h3>
                {table(recordsOf(state.records, "payment").filter(show))}
                <h3 className="spaced">Asignaciones de facturación</h3>
                {table(recordsOf(state.records, "billing").filter(show))}
              </div>
            )}
            {section === "agenda" && (
              <div className="business-agenda">
                <div className="business-note">
                  {due} vencimiento(s) o tarea(s) para hoy o anteriores. Las
                  garantías y certificados se muestran para revisión; su
                  vencimiento no elimina documentos.
                </div>
                {agenda
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((item, index) => (
                    <button
                      key={index}
                      className={
                        "business-agenda-item " +
                        (item.date < today() ? "overdue" : "")
                      }
                      onClick={() =>
                        item.doc
                          ? onDocument(item.doc)
                          : item.record && setSelected(item.record.id)
                      }
                    >
                      <span>{item.date}</span>
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                      </div>
                      <span>
                        {item.date < today()
                          ? "Revisar vencimiento"
                          : item.date === today()
                            ? "Hoy"
                            : "Programado"}
                      </span>
                    </button>
                  ))}
                {!agenda.length && (
                  <div className="empty">No hay vencimientos pendientes.</div>
                )}
              </div>
            )}
            {section === "portal" && (
              <div className="business-portal-settings">
                {user.role === "admin" ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const result = await execute(
                        () =>
                          api("business", {
                            action: "portal",
                            customerId: portalCustomer,
                            days: portalDays,
                          }),
                        "Enlace de cliente creado",
                      );
                      if (result)
                        setPortalLink(
                          new URL(result.path, window.location.origin).href,
                        );
                    }}
                  >
                    <div className="form-grid">
                      <label>
                        Cliente activo con RUT
                        <select
                          required
                          value={portalCustomer}
                          onChange={(e) => setPortalCustomer(e.target.value)}
                        >
                          <option value="">Selecciona…</option>
                          {customers
                            .filter((c) => c.active && !c.deleted && c.rut)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Vigencia
                        <select
                          value={portalDays}
                          onChange={(e) =>
                            setPortalDays(Number(e.target.value))
                          }
                        >
                          {[1, 7, 15, 30].map((n) => (
                            <option key={n} value={n}>
                              {n} día(s)
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button
                      className="primary spaced"
                      disabled={busy || !portalCustomer}
                    >
                      Generar enlace privado
                    </button>
                  </form>
                ) : (
                  <p>
                    Un administrador puede generar y revocar los accesos de
                    clientes.
                  </p>
                )}
                {portalLink && (
                  <div className="business-note">
                    <strong>Enlace generado</strong>
                    <p>
                      Quien tenga este enlace podrá acceder a los documentos
                      compartidos de ese cliente. Compártelo únicamente con su
                      contacto autorizado.
                    </p>
                    <input
                      readOnly
                      aria-label="Enlace privado del cliente"
                      value={portalLink}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      onClick={async () => {
                        const op = beginFeedback("Copiando enlace");
                        try {
                          await navigator.clipboard.writeText(portalLink);
                          op.success("Enlace copiado");
                        } catch {
                          op.success(
                            "Selecciona y copia el enlace",
                            "Puedes copiarlo desde el campo.",
                            "warning",
                          );
                        }
                      }}
                    >
                      Copiar enlace
                    </button>
                  </div>
                )}
                <p className="hint">
                  El cliente puede aceptar cotizaciones enviadas, subir OC y
                  comprobantes, recibir servicios y descargar los respaldos
                  compartidos. Los costos internos y los datos de otros clientes
                  quedan fuera de su acceso.
                </p>
                {table(
                  recordsOf(state.records, "portal").filter((r) => !r.deleted),
                )}
              </div>
            )}
          </>
        )}
      </section>
      {form && (
        <BusinessEditor
          key={
            (form.record?.id ?? "new") +
            form.kind +
            JSON.stringify(form.initial ?? {})
          }
          form={form}
          records={state.records}
          customers={customers}
          documents={documents}
          busy={busy}
          onClose={() => setForm(null)}
          onSave={async (kind, data, createId) =>
            !!(await execute(
              () =>
                api("business", {
                  action: "save",
                  kind,
                  data,
                  id: form.record?.id,
                  version: form.record?.version,
                  createId: form.record ? undefined : createId,
                }),
              form.record
                ? "Cambios guardados"
                : kind === "payment"
                  ? "Pago registrado"
                  : "Registro creado",
              !!form.record,
            ))
          }
        />
      )}
      {selectedRecord && (
        <BusinessDetail
          record={selectedRecord}
          state={state}
          documents={documents}
          onClose={() => setSelected(null)}
          onSelect={setSelected}
          onForm={setForm}
          onArchive={archive}
          onRefresh={reload}
          onDocument={onDocument}
          onNewInvoice={onNewInvoice}
        />
      )}
      {archiving && (
        <ConfirmationDialog
          title={
            archiving.deleted
              ? "¿Recuperar registro?"
              : archiving.kind === "portal"
                ? "¿Revocar enlace?"
                : archiving.kind === "payment"
                  ? "¿Anular pago?"
                  : "¿Enviar a papelera?"
          }
          description={
            archiving.kind === "payment"
              ? "El pago quedará anulado y se recalculará el saldo de su factura. El historial se conserva. Si necesitas corregirlo, registra un pago nuevo."
              : archiving.kind === "portal"
                ? "El enlace dejará de dar acceso al cliente. Puedes generar otro cuando lo necesites."
                : archiving.kind === "file"
                  ? "El archivo se retirará del registro y del portal. Podrás recuperarlo desde Ver archivos retirados en los respaldos de su registro."
                  : "El registro y sus respaldos se conservan en el historial. Podrás recuperarlo desde la vista de papelera de esta sección."
          }
          busy={busy}
          confirmLabel={
            archiving.deleted
              ? "Sí, recuperar"
              : archiving.kind === "payment"
                ? "Sí, anular pago"
                : archiving.kind === "portal"
                  ? "Sí, revocar"
                  : "Sí, enviar a papelera"
          }
          confirmDisabled={!reason.trim()}
          onClose={() => setArchiving(null)}
          onConfirm={async () => {
            if (
              await execute(
                () =>
                  api("business", {
                    action: "archive",
                    id: archiving.id,
                    version: archiving.version,
                    deleted: !archiving.deleted,
                    reason,
                  }),
                archiving.deleted ? "Registro recuperado" : "Cambio registrado",
                archiving.deleted ? "success" : "warning",
              )
            ) {
              setArchiving(null);
              if (selected === archiving.id) setSelected(null);
            }
          }}
        >
          <label>
            Motivo
            <textarea
              required
              maxLength={1000}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </ConfirmationDialog>
      )}
      {invoiceFiles && (
        <InvoiceFiles
          id={invoiceFiles}
          records={state.records}
          onRefresh={reload}
          onArchive={archive}
          onClose={() => setInvoiceFiles(null)}
        />
      )}
    </div>
  );
}
import { Modal } from "./ui";
function InvoiceFiles({
  id,
  records,
  onRefresh,
  onArchive,
  onClose,
}: {
  id: string;
  records: BusinessRecord[];
  onRefresh: () => Promise<void>;
  onArchive: (r: BusinessRecord) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Respaldos de factura" onClose={onClose}>
      <div className="modal-body">
        <BusinessFiles
          accessModule="invoices"
          records={records}
          parentId={id}
          onRefresh={onRefresh}
          onArchive={onArchive}
        />
      </div>
    </Modal>
  );
}
