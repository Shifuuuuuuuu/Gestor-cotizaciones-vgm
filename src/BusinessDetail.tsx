import { usePermissions } from "./usePermissions";
import { kindModules } from "../shared/access";
import { Modal } from "./ui";
import { money, type Doc } from "../shared/model";
import {
  recordsOf,
  businessTotals,
  compareOrderLines,
  serviceCategories,
  shiftMonths,
  type BusinessRecord,
  type BusinessState,
} from "../shared/business";
import type { BusinessForm } from "./BusinessEditor";
import { BusinessFiles } from "./BusinessFiles";
import { businessLabels, recordPdf } from "./businessClient";
import { beginFeedback } from "./feedback";
export function BusinessDetail({
  record,
  state,
  documents,
  onClose,
  onSelect,
  onForm,
  onArchive,
  onRefresh,
  onDocument,
  onNewInvoice,
}: {
  record: BusinessRecord;
  state: BusinessState;
  documents: Doc[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onForm: (form: BusinessForm) => void;
  onArchive: (record: BusinessRecord) => void;
  onRefresh: () => Promise<void>;
  onDocument: (doc: Doc) => void;
  onNewInvoice: (record: BusinessRecord) => void;
}) {
  const { has } = usePermissions();
  const scope = kindModules[record.kind];
  const totals = businessTotals(state, documents, record.id);
  const active = state.records.filter((r) => !r.deleted);
  const link = (id: string) => {
    const d = documents.find((d) => d.id === id);
    const r = state.records.find((r) => r.id === id);
    return d ? (
      <button type="button" onClick={() => onDocument(d)}>
        {d.number}
      </button>
    ) : r ? (
      <button type="button" onClick={() => onSelect(r.id)}>
        {r.number}
      </button>
    ) : null;
  };
  const data = record.data as any;
  const details: Record<string, string> = {
    reference: "Referencia",
    date: "Fecha",
    due: "Entrega / vencimiento",
    end: "Término previsto",
    location: "Lugar",
    assignee: "Responsable",
    scope: "Alcance",
    exclusions: "Exclusiones",
    content: "Contenido",
    signer: "Recibido por",
    acceptedVersion: "Versión del servicio recibida",
    periodEnd: "Vigencia / período hasta",
    warrantyUntil: "Garantía hasta",
    nextServiceDate: "Próxima mantención",
    notes: "Observaciones",
    method: "Medio de pago",
    description: "Descripción",
  };
  const canEdit =
    !["file", "portal", "billing"].includes(record.kind) &&
    !(record.kind === "serviceDoc" && record.data.category === "acceptance") &&
    !(record.kind === "payment" && record.data.invoiceId) &&
    !(record.kind === "paymentClaim" && record.data.status === "Verificado");
  const related = active.filter(
    (r) =>
      (r.data as any).jobId === record.id ||
      (r.data as any).orderId === record.id,
  );
  return (
    <Modal
      title={record.number + " · " + businessLabels[record.kind]}
      onClose={onClose}
      wide
    >
      <div className="modal-body business-detail">
        <div className="document-head">
          <div>
            <h2>{data.title || data.reference || record.customerName}</h2>
            <p>
              {record.customerName} · {record.customerRut}
            </p>
          </div>
          <span className="badge">
            {record.deleted
              ? "En papelera"
              : data.status || businessLabels[record.kind]}
          </span>
        </div>
        <div className="catalog-actions bottom-form">
          {!record.deleted &&
            canEdit &&
            has(scope, "edit") &&
            (record.kind !== "payment" || has("collections", "approve")) && (
              <button
                onClick={() =>
                  onForm({ kind: record.kind as BusinessForm["kind"], record })
                }
              >
                {record.kind === "payment"
                  ? "Asignar anticipo a factura"
                  : "Editar"}
              </button>
            )}
          <button
            hidden={!has(scope, "export")}
            onClick={async () => {
              const op = beginFeedback("Generando PDF", "Preparando documento");
              try {
                op.step("Creando PDF");
                await recordPdf(record);
                op.success("PDF generado", "Descarga iniciada.");
              } catch (e) {
                op.error(e);
              }
            }}
          >
            Descargar PDF
          </button>
          <button
            hidden={
              !has(scope, "delete") ||
              (record.deleted && !has("trash")) ||
              (record.kind === "payment" && !has("collections", "approve"))
            }
            className="danger"
            onClick={() => onArchive(record)}
          >
            {record.deleted
              ? "Recuperar"
              : record.kind === "payment"
                ? "Anular pago"
                : "Enviar a papelera"}
          </button>
        </div>
        {["order", "job"].includes(record.kind) &&
          has("invoices") &&
          has("collections") && (
            <div className="business-kpis">
              {record.kind === "order" && (
                <div>
                  <small>Autorizado</small>
                  <strong>{money(record.data.amount)}</strong>
                </div>
              )}
              <div>
                <small>Asignado a facturas</small>
                <strong>{money(totals.committed)}</strong>
              </div>
              <div>
                <small>Facturado (emitidas / pagadas)</small>
                <strong>{money(totals.billed)}</strong>
              </div>
              <div>
                <small>Cobrado de facturas</small>
                <strong>{money(totals.paid)}</strong>
              </div>
              <div>
                <small>Anticipos sin asignar</small>
                <strong>{money(totals.advances)}</strong>
              </div>
              {record.kind === "order" && (
                <div>
                  <small>Disponible para facturar</small>
                  <strong>
                    {money(record.data.amount - totals.committed)}
                  </strong>
                </div>
              )}
              {record.kind === "job" && (
                <>
                  <div>
                    <small>Costos (manuales + partes)</small>
                    <strong>{money(totals.costs)}</strong>
                  </div>
                  <div>
                    <small>Margen neto estimado</small>
                    <strong>{money(totals.margin)}</strong>
                  </div>
                </>
              )}
            </div>
          )}
        {record.kind === "job" && (
          <p className="hint">
            Facturación neta: {money(totals.billedNet)}. El margen descuenta los
            costos directos netos registrados; no incluye gastos generales ni
            impuestos.
          </p>
        )}
        <dl className="business-definition">
          {Object.entries(details).map(([key, label]) =>
            data[key] !== undefined && data[key] !== "" && data[key] !== 0 ? (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{String(data[key])}</dd>
              </div>
            ) : null,
          )}
          {data.amount !== undefined && (
            <div>
              <dt>Monto total CLP</dt>
              <dd>{money(data.amount)}</dd>
            </div>
          )}
        </dl>
        <div className="catalog-actions">
          {data.quoteId && link(data.quoteId)}
          {data.invoiceId && link(data.invoiceId)}
          {data.orderId && link(data.orderId)}
          {data.jobId && link(data.jobId)}
        </div>
        {record.kind === "order" &&
          record.data.quoteId &&
          (() => {
            const quote = documents.find((d) => d.id === record.data.quoteId);
            return (
              quote && (
                <p className="business-note">
                  Cotización {quote.number}: {money(quote.total)}.{" "}
                  {quote.total === record.data.amount
                    ? "El total coincide con la OC."
                    : "Hay una diferencia de " +
                      money(record.data.amount - quote.total) +
                      "; revisa condiciones y respaldo antes de aceptar."}{" "}
                  {!record.data.items?.length &&
                    " Captura las líneas de la OC para comparar cantidades y precios con el respaldo."}
                </p>
              )
            );
          })()}
        {record.kind === "order" && !!record.data.items?.length && (
          <section className="business-subsection">
            <h3>Detalle y comparación con cotización</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th>Cantidad OC</th>
                    <th>Precio neto</th>
                    <th>Desc. %</th>
                    <th>Comparación</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const quote = documents.find(
                      (d) => d.id === record.data.quoteId,
                    );
                    return (
                      quote
                        ? compareOrderLines(record.data, quote)
                        : record.data.items.map((i) => ({
                            ...i,
                            comparison: "Sin cotización relacionada",
                          }))
                    ).map((item, index) => (
                      <tr key={index}>
                        <td>{item.description}</td>
                        <td>{item.quantity}</td>
                        <td>{money(item.price)}</td>
                        <td>{item.discount}%</td>
                        <td>{item.comparison}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
            <p className="hint">
              La comparación usa descripciones únicas. Revisa el archivo
              original cuando existan líneas repetidas, entregas parciales o
              condiciones distintas.
            </p>
          </section>
        )}
        {record.kind === "job" && !record.deleted && (
          <section className="business-subsection">
            <h3>Gestión del servicio</h3>
            <div className="catalog-actions">
              <button
                hidden={!has("services", "create")}
                onClick={() =>
                  onForm({
                    kind: "serviceDoc",
                    initial: {
                      jobId: record.id,
                      title: "Informe de " + record.data.title,
                    },
                  })
                }
              >
                Crear documento de servicio
              </button>
              <button
                hidden={!has("services", "create")}
                onClick={() =>
                  onForm({ kind: "cost", initial: { jobId: record.id } })
                }
              >
                Registrar costo
              </button>
              <button
                hidden={!has("collections", "create")}
                onClick={() =>
                  onForm({
                    kind: "billing",
                    initial: { jobId: record.id, orderId: record.data.orderId },
                  })
                }
              >
                Vincular factura
              </button>
              <button
                hidden={!has("invoices", "create")}
                onClick={() => onNewInvoice(record)}
              >
                Crear factura interna
              </button>
              {record.data.recurrenceMonths > 0 && (
                <button
                  hidden={
                    !has("services", "create") || !has("services", "approve")
                  }
                  onClick={() => {
                    const date =
                      record.data.nextServiceDate ||
                      shiftMonths(
                        record.data.date,
                        record.data.recurrenceMonths,
                      );
                    const duration =
                      Date.parse(record.data.end + "T12:00:00Z") -
                      Date.parse(record.data.date + "T12:00:00Z");
                    const end = new Date(
                      Date.parse(date + "T12:00:00Z") + duration,
                    )
                      .toISOString()
                      .slice(0, 10);
                    onForm({
                      kind: "job",
                      initial: {
                        ...record.data,
                        date,
                        end,
                        nextServiceDate: "",
                        status: "Programado",
                        previousJobId: record.id,
                      },
                    });
                  }}
                >
                  Programar siguiente mantención
                </button>
              )}
            </div>
          </section>
        )}
        {record.kind === "order" && !record.deleted && (
          <div className="catalog-actions bottom-form">
            <button
              hidden={!has("services", "create")}
              onClick={() =>
                onForm({
                  kind: "job",
                  initial: {
                    customerId: record.customerId,
                    orderId: record.id,
                    quoteId: record.data.quoteId,
                    title: "Servicio OC " + record.data.reference,
                  },
                })
              }
            >
              Crear servicio / OT
            </button>
            <button
              hidden={!has("collections", "create")}
              onClick={() =>
                onForm({ kind: "billing", initial: { orderId: record.id } })
              }
            >
              Vincular factura
            </button>
            <button
              hidden={
                !has("collections", "create") || !has("collections", "approve")
              }
              onClick={() =>
                onForm({
                  kind: "payment",
                  initial: {
                    customerId: record.customerId,
                    orderId: record.id,
                  },
                })
              }
            >
              Registrar anticipo
            </button>
          </div>
        )}
        {record.kind === "paymentClaim" &&
          !record.deleted &&
          record.data.status !== "Verificado" && (
            <p className="business-note">
              Revisa los respaldos antes de confirmar el dinero recibido.{" "}
              <button
                hidden={
                  !has("collections", "create") ||
                  !has("collections", "approve")
                }
                onClick={() =>
                  onForm({
                    kind: "payment",
                    initial: {
                      ...record.data,
                      claimId: record.id,
                      method: "Transferencia",
                    },
                  })
                }
              >
                Verificar y registrar pago
              </button>
            </p>
          )}
        {record.kind === "serviceDoc" && (
          <>
            <p className="hint">
              {serviceCategories[record.data.category]} ·{" "}
              {record.data.visibleToClient
                ? "Compartido en portal"
                : "Uso interno"}
            </p>
            {record.data.category === "acceptance" && (
              <p className="business-note">
                Recepción registrada por {record.data.signer}, el{" "}
                {new Date(record.createdAt).toLocaleString("es-CL")}, sobre la
                versión {record.data.acceptedVersion} del servicio. Es evidencia
                de recepción registrada en VGM; no es una firma electrónica
                avanzada.
              </p>
            )}
            {!!record.data.checklist.length && (
              <ul className="business-checklist">
                {record.data.checklist.map((item, index) => (
                  <li key={index}>
                    {item.done ? "✓" : "○"} {item.label}
                  </li>
                ))}
              </ul>
            )}
            {record.data.category === "timesheet" && (
              <p className="hint">
                Horas: {record.data.hours} · Costo hora:{" "}
                {money(record.data.hourlyCost)} · Materiales:{" "}
                {record.data.materials
                  .map(
                    (m) =>
                      `${m.description} (${m.quantity} × ${money(m.cost)})`,
                  )
                  .join("; ") || "Sin materiales"}
              </p>
            )}
          </>
        )}
        {!!related.length && (
          <section className="business-subsection">
            <h3>Documentos y movimientos relacionados</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Registro</th>
                    <th>Tipo</th>
                    <th>Detalle</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {related.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <button onClick={() => onSelect(r.id)}>
                          {r.number}
                        </button>
                      </td>
                      <td>
                        {r.kind === "serviceDoc"
                          ? serviceCategories[r.data.category]
                          : businessLabels[r.kind]}
                      </td>
                      <td>
                        {(r.data as any).title ||
                          (r.data as any).description ||
                          (r.data as any).reference ||
                          ((r.data as any).invoiceId &&
                            documents.find(
                              (d) => d.id === (r.data as any).invoiceId,
                            )?.number) ||
                          "—"}
                      </td>
                      <td>
                        {typeof (r.data as any).amount === "number"
                          ? money((r.data as any).amount)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <BusinessFiles
          records={state.records}
          parentId={record.id}
          onRefresh={onRefresh}
          onArchive={onArchive}
          readOnly={
            record.deleted || record.kind === "file" || record.kind === "portal"
          }
        />
        <section className="business-subsection">
          <h3 hidden={!has("history")}>Historial y versiones</h3>
          {state.events
            .filter((e) => e.recordId === record.id)
            .sort((a, b) => b.at.localeCompare(a.at))
            .map((e) => (
              <details key={e.id}>
                <summary>
                  v{e.after.version} ·{" "}
                  {(
                    {
                      create: "Creación",
                      edit: "Edición",
                      archive: "Envío a papelera",
                      restore: "Recuperación",
                      void: "Pago anulado",
                      received: "Recepción conforme",
                      verified: "Comprobante verificado",
                      visibility: "Acceso de archivo",
                      payment_void: "Revisión por pago anulado",
                    } as Record<string, string>
                  )[e.action] ?? "Actualización"}{" "}
                  · {new Date(e.at).toLocaleString("es-CL")} · {e.actor}
                </summary>
                {e.reason && <p>{e.reason}</p>}
                <dl className="business-definition">
                  {Object.entries({
                    ...details,
                    title: "Título",
                    status: "Estado",
                    amount: "Monto CLP",
                    name: "Archivo",
                    expiresAt: "Vigencia de acceso",
                    visibleToClient: "Compartido con cliente",
                    hours: "Horas",
                    hourlyCost: "Costo neto por hora CLP",
                  }).map(([key, label]) => {
                    const value = (e.after.data as any)[key];
                    return value !== undefined && value !== "" ? (
                      <div key={key}>
                        <dt>{label}</dt>
                        <dd>
                          {typeof value === "boolean"
                            ? value
                              ? "Sí"
                              : "No"
                            : typeof value === "number" &&
                                ["amount", "hourlyCost"].includes(key)
                              ? money(value)
                              : String(value)}
                        </dd>
                      </div>
                    ) : null;
                  })}
                </dl>
                {e.after.kind === "serviceDoc" && (
                  <p className="hint">
                    {serviceCategories[e.after.data.category]} ·{" "}
                    {e.after.data.checklist.length} puntos de verificación ·{" "}
                    {e.after.data.materials.length} materiales registrados.
                  </p>
                )}
                {canEdit &&
                  has(scope, "edit") &&
                  !record.deleted &&
                  record.kind !== "payment" &&
                  record.kind !== "paymentClaim" &&
                  e.after.version !== record.version && (
                    <button
                      onClick={() =>
                        onForm({
                          kind: record.kind as BusinessForm["kind"],
                          record,
                          initial: e.after.data,
                        })
                      }
                    >
                      Usar contenido de esta versión
                    </button>
                  )}
              </details>
            ))}
        </section>
      </div>
    </Modal>
  );
}
