import { useEffect, useState } from "react";
import { Brand, Modal, ConfirmationDialog, useNotices } from "./ui";
import { beginFeedback } from "./feedback";
import { money, type Doc } from "../shared/model";
import {
  recordsOf,
  serviceCategories,
  type BusinessRecord,
} from "../shared/business";
import { BusinessFiles } from "./BusinessFiles";
import { today, binaryRequest, recordPdf } from "./businessClient";
import { exportDoc } from "./exports";
type PortalData = {
  customer: { id: string; name: string; rut: string };
  expiresAt: string;
  documents: Doc[];
  records: BusinessRecord[];
};
export default function ClientPortal({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Cotizaciones"),
    [selected, setSelected] = useState<string | null>(null),
    [form, setForm] = useState<"order" | "paymentClaim" | null>(null);
  const [accepting, setAccepting] = useState<Doc | null>(null),
    [receiving, setReceiving] = useState<Extract<
      BusinessRecord,
      { kind: "job" }
    > | null>(null),
    [signer, setSigner] = useState(""),
    [notes, setNotes] = useState("");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("vgm-theme") ?? "light",
  );
  const { Toasts } = useNotices();
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  async function request(path = "", body?: unknown) {
    const res = await fetch("/api/portal/" + encodeURIComponent(token) + path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(12000),
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await res.json();
    if (!res.ok)
      throw new Error(result.error ?? "No se pudo completar la solicitud.");
    return result;
  }
  async function reload() {
    const result = await request();
    setData(result);
    setError("");
  }
  useEffect(() => {
    let active = true;
    request()
      .then((result) => {
        if (active) setData(result);
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
  }, [token]);
  async function action(work: () => Promise<unknown>, title: string) {
    const op = beginFeedback("Enviando solicitud", "Registrando respuesta");
    setBusy(true);
    try {
      await work();
      op.step("Actualizando portal");
      try {
        await reload();
        op.success(title);
      } catch (e) {
        op.success(
          "Respuesta guardada; portal pendiente",
          (e as Error).message,
          "warning",
        );
      }
      return true;
    } catch (e) {
      op.error(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const selectedDoc = data?.documents.find((d) => d.id === selected),
    selectedRecord = data?.records.find((r) => r.id === selected);
  async function pdf(doc: Doc) {
    const op = beginFeedback("Generando PDF");
    try {
      await exportDoc(doc, "pdf", op.step, {
        resolveImage: (url) =>
          "/api/portal/" +
          encodeURIComponent(token) +
          "/images/" +
          url.split("/").at(-1),
      });
      op.success("PDF generado", "Descarga iniciada.");
    } catch (e) {
      op.error(e);
    }
  }
  return (
    <div className="client-portal">
      <div className="client-portal-header">
        <Brand compact />
        <div>
          <strong>{data?.customer.name ?? "Portal de clientes"}</strong>
          <small>{data?.customer.rut ?? "Documentos y respaldos VGM"}</small>
        </div>
        <button
          onClick={() => {
            const next =
              document.documentElement.dataset.theme === "dark"
                ? "light"
                : "dark";
            localStorage.setItem("vgm-theme", next);
            setTheme(next);
          }}
        >
          Cambiar tema
        </button>
      </div>
      <main className="client-portal-main">
        <h1>Tu carpeta comercial</h1>
        <p>
          Cotizaciones, órdenes de compra, servicios y respaldos compartidos con
          tu empresa.
        </p>
        {loading ? (
          <div className="empty">Cargando tu portal…</div>
        ) : error ? (
          <section className="panel settings" role="alert">
            <h2>Portal no disponible</h2>
            <p>{error}</p>
            <p>Si el enlace venció o fue revocado, solicita uno nuevo a VGM.</p>
            <button onClick={() => reload().catch((e) => setError(e.message))}>
              Intentar nuevamente
            </button>
          </section>
        ) : (
          data && (
            <>
              <div
                className="business-portal-tabs"
                role="group"
                aria-label="Secciones del portal"
              >
                {[
                  "Cotizaciones",
                  "Órdenes de compra",
                  "Servicios",
                  "Facturas",
                  "Pagos",
                ].map((name) => (
                  <button
                    key={name}
                    aria-pressed={tab === name}
                    className={tab === name ? "chosen" : ""}
                    onClick={() => setTab(name)}
                  >
                    {name}
                  </button>
                ))}
                <button
                  disabled={busy}
                  onClick={() => action(reload, "Portal actualizado")}
                >
                  Actualizar
                </button>
              </div>
              <section className="panel">
                <div className="panel-title">
                  <h2>{tab}</h2>
                  {tab === "Órdenes de compra" && (
                    <button
                      className="primary"
                      onClick={() => setForm("order")}
                    >
                      Subir orden de compra
                    </button>
                  )}
                  {tab === "Pagos" && (
                    <button
                      className="primary"
                      onClick={() => setForm("paymentClaim")}
                    >
                      Informar pago y adjuntar comprobante
                    </button>
                  )}
                </div>
                {["Cotizaciones", "Facturas"].includes(tab) ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Documento</th>
                          <th>Fecha</th>
                          <th>Estado</th>
                          <th>Total</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.documents
                          .filter(
                            (d) =>
                              d.kind ===
                              (tab === "Cotizaciones" ? "quote" : "invoice"),
                          )
                          .map((d) => (
                            <tr key={d.id}>
                              <td>
                                <button onClick={() => setSelected(d.id)}>
                                  {d.number}
                                </button>
                              </td>
                              <td>{d.date}</td>
                              <td>{d.status}</td>
                              <td>{money(d.total)}</td>
                              <td>
                                <div className="catalog-actions">
                                  <button onClick={() => pdf(d)}>PDF</button>
                                  {d.kind === "quote" &&
                                    d.status === "Enviada" && (
                                      <button
                                        className="primary"
                                        disabled={busy}
                                        onClick={() => {
                                          setSigner("");
                                          setAccepting(d);
                                        }}
                                      >
                                        Aceptar cotización
                                      </button>
                                    )}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="business-client-cards">
                    {data.records
                      .filter((r) =>
                        tab === "Órdenes de compra"
                          ? r.kind === "order"
                          : tab === "Servicios"
                            ? r.kind === "job"
                            : r.kind === "payment" || r.kind === "paymentClaim",
                      )
                      .map((r) => (
                        <article className="business-client-card" key={r.id}>
                          <small>{r.number}</small>
                          <h3>
                            {(r.data as any).title ||
                              (r.data as any).reference ||
                              (r.kind === "payment"
                                ? "Pago registrado"
                                : "Comprobante informado")}
                          </h3>
                          <p>
                            {(r.data as any).status || "Confirmado por VGM"}
                          </p>
                          {typeof (r.data as any).amount === "number" && (
                            <strong>{money((r.data as any).amount)}</strong>
                          )}
                          <button onClick={() => setSelected(r.id)}>
                            Ver detalle y respaldos
                          </button>
                          {r.kind === "job" &&
                            r.data.status === "Por recibir" && (
                              <button
                                className="primary"
                                onClick={() => {
                                  setSigner("");
                                  setNotes("");
                                  setReceiving(r);
                                }}
                              >
                                Registrar recepción conforme
                              </button>
                            )}
                        </article>
                      ))}
                  </div>
                )}
              </section>
              <p className="hint">
                Enlace vigente hasta{" "}
                {new Date(data.expiresAt).toLocaleString("es-CL")}. Los
                comprobantes informados requieren revisión de VGM antes de
                confirmar un pago.
              </p>
            </>
          )
        )}
      </main>
      {data && selectedDoc && (
        <Modal
          title={selectedDoc.number}
          onClose={() => setSelected(null)}
          wide
        >
          <div className="modal-body">
            <h2>
              {selectedDoc.kind === "quote" ? "Cotización" : "Factura interna"}
            </h2>
            <p>
              {selectedDoc.client} · {selectedDoc.status}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Detalle</th>
                    <th>Cantidad</th>
                    <th>Precio neto</th>
                    <th>Descuento</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDoc.items.map((item, i) => (
                    <tr key={i}>
                      <td>{item.description}</td>
                      <td>{item.quantity}</td>
                      <td>{money(item.price)}</td>
                      <td>{item.discount}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="totals">
              <p>
                Neto <b>{money(selectedDoc.net)}</b>
              </p>
              <p>
                Impuesto <b>{money(selectedDoc.taxAmount)}</b>
              </p>
              <h2>
                Total <b>{money(selectedDoc.total)}</b>
              </h2>
            </div>
            <p className="business-prewrap">{selectedDoc.notes}</p>
            <button onClick={() => pdf(selectedDoc)}>Descargar PDF</button>
            <BusinessFiles
              records={data.records}
              parentId={selectedDoc.id}
              portalToken={token}
              onRefresh={reload}
              readOnly
            />
          </div>
        </Modal>
      )}
      {data && selectedRecord && (
        <Modal
          title={selectedRecord.number}
          onClose={() => setSelected(null)}
          wide
        >
          <div className="modal-body">
            <h2>
              {(selectedRecord.data as any).title ||
                (selectedRecord.data as any).reference ||
                "Detalle del registro"}
            </h2>
            <p>{(selectedRecord.data as any).status || "Pago confirmado"}</p>
            <dl className="business-definition">
              {(
                [
                  ["date", "Fecha"],
                  ["due", "Entrega"],
                  ["end", "Término previsto"],
                  ["scope", "Alcance"],
                  ["exclusions", "Condiciones"],
                  ["content", "Contenido"],
                  ["location", "Lugar"],
                  ["assignee", "Responsable"],
                  ["notes", "Observaciones"],
                  ["signer", "Recibido por"],
                ] as const
              ).map(
                ([key, label]) =>
                  (selectedRecord.data as any)[key] && (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{(selectedRecord.data as any)[key]}</dd>
                    </div>
                  ),
              )}
              {typeof (selectedRecord.data as any).amount === "number" && (
                <div>
                  <dt>Monto</dt>
                  <dd>{money((selectedRecord.data as any).amount)}</dd>
                </div>
              )}
            </dl>
            {selectedRecord.kind === "job" && (
              <section className="business-subsection">
                <h3>Documentos compartidos del servicio</h3>
                {recordsOf(data.records, "serviceDoc")
                  .filter((d) => d.data.jobId === selectedRecord.id)
                  .map((doc) => (
                    <article className="business-client-document" key={doc.id}>
                      <strong>{doc.data.title}</strong>
                      <small>
                        {serviceCategories[doc.data.category]} · {doc.data.date}
                      </small>
                      <p className="business-prewrap">{doc.data.content}</p>
                      {doc.data.category === "acceptance" && (
                        <p>
                          Recepción registrada por {doc.data.signer}, el{" "}
                          {new Date(doc.createdAt).toLocaleString("es-CL")},
                          para la versión {doc.data.acceptedVersion} del
                          servicio.
                        </p>
                      )}
                      <button
                        onClick={async () => {
                          const op = beginFeedback("Creando respaldo PDF");
                          try {
                            await recordPdf(doc, token);
                            op.success("PDF generado");
                          } catch (e) {
                            op.error(e);
                          }
                        }}
                      >
                        Descargar PDF
                      </button>
                      <BusinessFiles
                        records={data.records}
                        parentId={doc.id}
                        portalToken={token}
                        onRefresh={reload}
                        readOnly
                      />
                    </article>
                  ))}
              </section>
            )}
            <BusinessFiles
              records={data.records}
              parentId={selectedRecord.id}
              portalToken={token}
              onRefresh={reload}
              readOnly={
                !["order", "job", "paymentClaim"].includes(selectedRecord.kind)
              }
            />
          </div>
        </Modal>
      )}
      {form && data && (
        <PortalSubmission
          kind={form}
          data={data}
          busy={busy}
          onClose={() => setForm(null)}
          onSave={async (body, file, createId) => {
            const op = beginFeedback(
              "Enviando respaldo",
              "Registrando información",
            );
            setBusy(true);
            try {
              const record = await request(
                form === "order" ? "/orders" : "/payments",
                { data: body, createId },
              );
              let uploadError = "";
              if (file) {
                op.step("Subiendo archivo de respaldo");
                try {
                  await binaryRequest(
                    "portal/" + token + "/files/" + record.id,
                    file,
                    true,
                    true,
                  );
                } catch (e) {
                  uploadError = (e as Error).message;
                }
              }
              op.step("Actualizando portal");
              await reload();
              op.success(
                uploadError
                  ? "Registro guardado; archivo pendiente"
                  : form === "order"
                    ? "Orden de compra recibida"
                    : "Comprobante enviado a revisión",
                uploadError
                  ? uploadError +
                      " Puedes adjuntarlo desde el detalle del registro."
                  : "VGM revisará la información recibida.",
                uploadError ? "warning" : "success",
              );
              setForm(null);
            } catch (e) {
              op.error(e);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {accepting && (
        <ConfirmationDialog
          title={"¿Aceptar " + accepting.number + "?"}
          description={
            "Confirmas la aceptación de la versión " +
            accepting.version +
            " por un total de " +
            money(accepting.total) +
            ". Esta respuesta se guardará en su historial."
          }
          tone="warning"
          confirmLabel="Sí, aceptar cotización"
          busy={busy}
          confirmDisabled={signer.trim().length < 2}
          onClose={() => setAccepting(null)}
          onConfirm={async () => {
            if (
              await action(
                () =>
                  request("/accept", {
                    id: accepting.id,
                    version: accepting.version,
                    signer,
                  }),
                "Cotización aceptada",
              )
            )
              setAccepting(null);
          }}
        >
          <label>
            Nombre de quien acepta
            <input
              required
              maxLength={160}
              value={signer}
              onChange={(e) => setSigner(e.target.value)}
            />
          </label>
        </ConfirmationDialog>
      )}
      {receiving && (
        <ConfirmationDialog
          title={"Recepción conforme " + receiving.number}
          description="Confirma que recibiste el servicio descrito. Se guardarán tu nombre, la fecha y la versión recibida. Es una constancia de recepción en VGM, no una firma electrónica avanzada."
          tone="warning"
          confirmLabel="Confirmar recepción conforme"
          busy={busy}
          confirmDisabled={signer.trim().length < 2}
          onClose={() => setReceiving(null)}
          onConfirm={async () => {
            if (
              await action(
                () =>
                  request("/receive", {
                    jobId: receiving.id,
                    version: receiving.version,
                    signer,
                    notes,
                    createId: crypto.randomUUID(),
                  }),
                "Recepción conforme registrada",
              )
            )
              setReceiving(null);
          }}
        >
          <label>
            Tu nombre
            <input
              required
              maxLength={160}
              value={signer}
              onChange={(e) => setSigner(e.target.value)}
            />
          </label>
          <label>
            Observaciones
            <textarea
              maxLength={6000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </ConfirmationDialog>
      )}
      {Toasts}
    </div>
  );
}
function PortalSubmission({
  kind,
  data,
  busy,
  onClose,
  onSave,
}: {
  kind: "order" | "paymentClaim";
  data: PortalData;
  busy: boolean;
  onClose: () => void;
  onSave: (
    data: unknown,
    file: File | undefined,
    createId: string,
  ) => Promise<void>;
}) {
  const [body, setBody] = useState<any>({
    reference: "",
    date: today(),
    due: "",
    amount: 0,
    quoteId: "",
    invoiceId: "",
    orderId: "",
    notes: "",
  });
  const [file, setFile] = useState<File>();
  const [id] = useState(() => crypto.randomUUID());
  const set = (key: string, value: any) =>
    setBody((old: any) => ({ ...old, [key]: value }));
  return (
    <Modal
      title={kind === "order" ? "Subir orden de compra" : "Informar pago"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void onSave(body, file, id);
        }}
      >
        <div className="modal-body">
          <p className="hint">
            {kind === "order"
              ? "La orden quedará recibida para revisión por VGM."
              : "Adjunta tu comprobante. El pago se confirmará una vez revisado por VGM."}
          </p>
          <div className="form-grid">
            <label>
              {kind === "order" ? "Número de OC" : "Referencia de pago"}
              <input
                required
                value={body.reference}
                maxLength={100}
                onChange={(e) => set("reference", e.target.value)}
              />
            </label>
            <label>
              Fecha
              <input
                type="date"
                required
                value={body.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </label>
            <label>
              Monto total CLP
              <input
                type="number"
                required
                min={1}
                step={1}
                value={body.amount}
                onChange={(e) => set("amount", Number(e.target.value))}
              />
            </label>
            {kind === "order" ? (
              <>
                <label>
                  Fecha de entrega solicitada
                  <input
                    type="date"
                    value={body.due}
                    onChange={(e) => set("due", e.target.value)}
                  />
                </label>
                <label>
                  Cotización relacionada
                  <select
                    value={body.quoteId}
                    onChange={(e) => set("quoteId", e.target.value)}
                  >
                    <option value="">Sin referencia</option>
                    {data.documents
                      .filter((d) => d.kind === "quote")
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.number}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label>
                  Factura
                  <select
                    value={body.invoiceId}
                    onChange={(e) => set("invoiceId", e.target.value)}
                  >
                    <option value="">Anticipo sin factura</option>
                    {data.documents
                      .filter(
                        (d) => d.kind === "invoice" && d.status === "Emitida",
                      )
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.number}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Orden de compra
                  <select
                    value={body.orderId}
                    onChange={(e) => set("orderId", e.target.value)}
                  >
                    <option value="">Sin referencia</option>
                    {recordsOf(data.records, "order").map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.data.reference}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
          <label className="spaced">
            Observaciones
            <textarea
              maxLength={6000}
              value={body.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </label>
          <label>
            Adjuntar respaldo (hasta 5 MB)
            <input
              required
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.docx"
              onChange={(e) => setFile(e.target.files?.[0])}
            />
          </label>
        </div>
        <div className="modal-actions modal-footer">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={busy || !file}>
            Enviar respaldo
          </button>
        </div>
      </form>
    </Modal>
  );
}
