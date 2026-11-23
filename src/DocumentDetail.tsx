import { ProductImage } from "./ProductImage";
import { useState } from "react";
import {
  Download,
  Printer,
  Pencil,
  Copy,
  Trash2,
  Receipt,
  RotateCcw,
  ArrowRight,
  History,
} from "lucide-react";
import {
  money,
  transitions,
  type Doc,
  type Event,
  type Command,
} from "../shared/model";
import { Modal, Spinner } from "./ui";
export const actionLabels: Record<string, string> = {
  save: "Documento guardado",
  status: "Cambio de estado",
  delete: "Enviado a papelera",
  restore: "Recuperado de papelera",
  version: "Versión recuperada",
  convert: "Factura creada desde cotización",
};
const stateLabels: Record<string, string> = {
  Borrador: "Volver a borrador",
  Enviada: "Marcar enviada",
  Aceptada: "Aceptar cotización",
  Rechazada: "Rechazar",
  Emitida: "Emitir factura",
  Pagada: "Marcar pagada",
  Anulada: "Anular factura",
};
export function DocumentDetail({
  doc,
  events,
  busy,
  onClose,
  onEdit,
  onDuplicate,
  onCommand,
  onExport,
  documents,
  onOpen,
}: {
  doc: Doc;
  events: Event[];
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onCommand: (cmd: Command) => void;
  onExport: (format: "pdf" | "xlsx" | "docx") => void;
  documents: Doc[];
  onOpen: (doc: Doc) => void;
}) {
  const [deleting, setDeleting] = useState(false),
    [reason, setReason] = useState("");
  const command = (cmd: Omit<Command, "id" | "version">) =>
    onCommand({ ...cmd, id: doc.id, version: doc.version });
  return (
    <Modal title={doc.number} onClose={onClose} wide>
      <div className="detail modal-body">
        <div className="document-head">
          <div>
            <span className="eyebrow">
              {doc.kind === "quote" ? "COTIZACIÓN" : "FACTURA INTERNA"} ·
              VERSIÓN {doc.version}
            </span>
            <h2>{doc.client}</h2>
            <p>
              {doc.rut}
              {doc.email && ` · ${doc.email}`}
              <br />
              {doc.address}
            </p>
          </div>
          <span className={"badge " + doc.status}>
            {doc.pending
              ? "Pendiente de sincronizar"
              : doc.deleted
                ? "En papelera"
                : doc.status}
          </span>
        </div>
        <div className="document-links">
          {documents
            .filter((d) =>
              doc.kind === "quote"
                ? d.sourceId === doc.id
                : d.id === doc.sourceId,
            )
            .map((d) => (
              <button key={d.id} onClick={() => onOpen(d)}>
                <Receipt size={14} />
                {d.kind === "quote"
                  ? "Cotización de origen"
                  : "Factura asociada"}
                : {d.number}
                <span className={"badge " + d.status}>
                  {d.deleted ? "Eliminado" : d.status}
                </span>
              </button>
            ))}
        </div>
        <div className="date-strip">
          <span>
            Fecha <strong>{doc.date}</strong>
          </span>
          <span>
            Vencimiento <strong>{doc.due}</strong>
          </span>
          <span>
            Total <strong>{money(doc.total)}</strong>
          </span>
        </div>
        <div className="actions document-tools">
          {(["pdf", "xlsx", "docx"] as const).map((f) => (
            <button disabled={busy} key={f} onClick={() => onExport(f)}>
              <Download size={15} />
              {f.toUpperCase()}
            </button>
          ))}
          <button onClick={() => window.print()}>
            <Printer size={15} />
            Imprimir
          </button>
          <div className="tools-spacer" />
          <button
            disabled={busy || doc.deleted || doc.status !== "Borrador"}
            onClick={onEdit}
          >
            <Pencil size={15} />
            Editar
          </button>
          <button disabled={busy || doc.deleted} onClick={onDuplicate}>
            <Copy size={15} />
            Duplicar
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Detalle</th>
                <th>Cantidad</th>
                <th>Precio</th>
                <th>Desc.</th>
                <th className="right">Total neto</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((i, k) => (
                <tr key={k}>
                  <td>
                    <div className="document-product">
                      {i.imageUrl && <ProductImage src={i.imageUrl} alt="" />}
                      <span>
                        {i.description}
                        {i.productCode && (
                          <small>
                            {i.productCode}
                            {i.productBrand ? " · " + i.productBrand : ""}
                          </small>
                        )}
                      </span>
                    </div>
                  </td>
                  <td>{i.quantity}</td>
                  <td>{money(i.price)}</td>
                  <td>{i.discount}%</td>
                  <td className="right">
                    {money(
                      Math.round(i.quantity * i.price * (1 - i.discount / 100)),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="document-bottom">
          <div>
            <h3>Observaciones</h3>
            <p className="notes">{doc.notes || "Sin observaciones."}</p>
            {doc.kind === "invoice" && (
              <small>
                Documento interno. Sin emisión tributaria electrónica.
              </small>
            )}
          </div>
          <div className="totals">
            <p>
              Neto <b>{money(doc.net)}</b>
            </p>
            <p>
              Impuesto {doc.tax}% <b>{money(doc.taxAmount)}</b>
            </p>
            <h2>
              Total <b>{money(doc.total)}</b>
            </h2>
          </div>
        </div>
        <div className="state-section">
          <h3>Acciones del documento</h3>
          <div className="actions">
            {doc.deleted ? (
              <button
                className="primary"
                disabled={busy}
                onClick={() => command({ action: "restore" })}
              >
                <RotateCcw size={16} />
                Recuperar documento
              </button>
            ) : (
              <>
                {transitions[doc.kind][doc.status].map((s) => (
                  <button
                    className={"state-button state-" + s}
                    disabled={busy}
                    key={s}
                    onClick={() => command({ action: "status", status: s })}
                  >
                    {busy ? <Spinner /> : <ArrowRight size={15} />}{" "}
                    {stateLabels[s]}
                  </button>
                ))}
                {doc.kind === "quote" && doc.status === "Aceptada" && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => command({ action: "convert" })}
                  >
                    {busy ? <Spinner /> : <Receipt size={16} />}Generar factura
                  </button>
                )}
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => setDeleting(!deleting)}
                >
                  <Trash2 size={15} />
                  Eliminar
                </button>
              </>
            )}
          </div>
          {deleting && !doc.deleted && (
            <form
              className="delete-confirm"
              onSubmit={(e) => {
                e.preventDefault();
                command({ action: "delete", reason });
                setDeleting(false);
              }}
            >
              <label>
                Motivo de eliminación
                <input
                  required
                  placeholder="Por ejemplo: documento duplicado"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <small>
                Se conservará el documento en la papelera y su historial.
              </small>
              <button type="button" onClick={() => setDeleting(false)}>
                Cancelar
              </button>
              <button className="danger" disabled={busy}>
                Enviar a papelera
              </button>
            </form>
          )}
        </div>
        <h3 className="history-title">
          <History size={17} />
          Historial y versiones
        </h3>
        {events
          .filter((e) => e.documentId === doc.id)
          .map((e) => (
            <div className="version" key={e.id}>
              <strong>
                v{e.after.version} · {actionLabels[e.action]}
              </strong>
              <small>
                {e.actor} · {new Date(e.at).toLocaleString("es-CL")}
              </small>
              {e.reason && <p>{e.reason}</p>}
              <details>
                <summary>Ver copia guardada y cambios</summary>
                <pre>
                  {JSON.stringify(
                    { antes: e.before, despues: e.after },
                    null,
                    2,
                  )}
                </pre>
              </details>
              {!doc.deleted &&
                doc.status === "Borrador" &&
                e.after.version !== doc.version && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "¿Recuperar el contenido de esta versión? Se guardará como una versión nueva.",
                        )
                      )
                        command({ action: "version", eventId: e.id });
                    }}
                  >
                    <RotateCcw size={13} />
                    Recuperar contenido de v{e.after.version}
                  </button>
                )}
            </div>
          ))}
      </div>
    </Modal>
  );
}
