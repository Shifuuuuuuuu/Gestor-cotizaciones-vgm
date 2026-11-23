import { ProductImage } from "./ProductImage";
import { useState } from "react";
import {
  ChevronDown,
  FileText,
  Receipt,
  Search,
  History,
  Download,
  ArrowUpRight,
} from "lucide-react";
import { money, type Doc, type Event } from "../shared/model";
import { actionLabels } from "./DocumentDetail";
import { download } from "./exports";
export function HistoryPanel({
  documents,
  events,
  onOpen,
}: {
  documents: Doc[];
  events: Event[];
  onOpen: (d: Doc) => void;
}) {
  const [search, setSearch] = useState(""),
    [expanded, setExpanded] = useState<string | null>(null),
    [tab, setTab] = useState<"detail" | "changes">("detail");
  const groups = documents
    .filter(
      (d) =>
        d.kind === "quote" ||
        !d.sourceId ||
        !documents.some((q) => q.id === d.sourceId),
    )
    .map((root) => {
      const invoices =
        root.kind === "quote"
          ? documents.filter(
              (d) => d.kind === "invoice" && d.sourceId === root.id,
            )
          : [];
      const ids = new Set([root.id, ...invoices.map((d) => d.id)]);
      const changes = events
        .filter((e) => ids.has(e.documentId))
        .sort((a, b) => b.at.localeCompare(a.at));
      return {
        root,
        invoices,
        changes,
        last: changes[0]?.at ?? root.updatedAt,
      };
    })
    .filter((g) =>
      `${g.root.number} ${g.root.client} ${g.root.rut} ${g.invoices.map((d) => d.number).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.last.localeCompare(a.last));
  return (
    <section className="panel history-panel">
      <div className="panel-title">
        <div>
          <h2>
            Historial por cotización <span>{groups.length}</span>
          </h2>
          <p>
            Cada cotización reúne su detalle, las facturas asociadas y todos sus
            cambios.
          </p>
        </div>
        <button
          onClick={() =>
            download(
              new Blob([JSON.stringify(events, null, 2)], {
                type: "application/json",
              }),
              "historial-vgm.json",
            )
          }
        >
          <Download size={15} />
          Exportar cambios
        </button>
      </div>
      <div className="toolbar">
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Buscar historial"
            placeholder="Cotización, factura, cliente o RUT…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <small>
          Las facturas independientes se muestran en su propia entrada.
        </small>
      </div>
      <div className="history-group-list">
        {groups.map(({ root, invoices, changes, last }) => (
          <article
            key={root.id}
            className={
              "history-group " + (expanded === root.id ? "expanded" : "")
            }
          >
            <button
              className="history-group-heading"
              aria-expanded={expanded === root.id}
              onClick={() => {
                setExpanded(expanded === root.id ? null : root.id);
                setTab("detail");
              }}
            >
              <span className="document-symbol">
                {root.kind === "quote" ? (
                  <FileText size={20} />
                ) : (
                  <Receipt size={20} />
                )}
              </span>
              <span className="group-identity">
                <strong>{root.number}</strong>
                <small>{root.client}</small>
              </span>
              <span className={"badge " + root.status}>
                {root.deleted ? "Eliminado" : root.status}
              </span>
              <span className="group-invoices">
                {invoices.length ? (
                  <>
                    <Receipt size={14} />
                    {invoices.map((i) => i.number).join(", ")}
                  </>
                ) : root.kind === "quote" ? (
                  "Sin factura asociada"
                ) : (
                  "Factura independiente"
                )}
              </span>
              <span className="group-amount">
                <strong>{money(root.total)}</strong>
                <small>
                  {changes.length} movimientos ·{" "}
                  {new Date(last).toLocaleDateString("es-CL")}
                </small>
              </span>
              <ChevronDown size={17} className="group-chevron" />
            </button>
            {expanded === root.id && (
              <div className="history-expanded">
                <div className="history-tabs">
                  <button
                    className={tab === "detail" ? "chosen" : ""}
                    onClick={() => setTab("detail")}
                  >
                    <FileText size={14} />
                    Detalle cotizado
                  </button>
                  <button
                    className={tab === "changes" ? "chosen" : ""}
                    onClick={() => setTab("changes")}
                  >
                    <History size={14} />
                    Historial de cambios ({changes.length})
                  </button>
                  <button
                    className="open-document"
                    onClick={() => onOpen(root)}
                  >
                    Abrir {root.kind === "quote" ? "cotización" : "factura"}
                    <ArrowUpRight size={14} />
                  </button>
                </div>
                <div className="related-invoices">
                  <strong>
                    {root.kind === "quote"
                      ? "Facturas asociadas"
                      : "Factura interna"}
                  </strong>
                  {invoices.length ? (
                    invoices.map((invoice) => (
                      <button key={invoice.id} onClick={() => onOpen(invoice)}>
                        <Receipt size={14} />
                        {invoice.number}
                        <span className={"badge " + invoice.status}>
                          {invoice.deleted ? "Eliminada" : invoice.status}
                        </span>
                        {money(invoice.total)}
                        <ArrowUpRight size={14} />
                      </button>
                    ))
                  ) : (
                    <small>
                      {root.kind === "quote"
                        ? "Esta cotización todavía no tiene una factura generada."
                        : root.number + " · " + root.status}
                    </small>
                  )}
                </div>
                {tab === "detail" ? (
                  <>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Producto / Servicio</th>
                            <th>Cantidad</th>
                            <th>Precio</th>
                            <th>Desc.</th>
                            <th className="right">Neto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {root.items.map((i, index) => (
                            <tr key={index}>
                              <td>
                                <div className="document-product">
                                  {i.imageUrl && (
                                    <ProductImage src={i.imageUrl} alt="" />
                                  )}
                                  <span>
                                    {i.description}
                                    {i.productCode && (
                                      <small>
                                        {i.productCode}
                                        {i.productBrand
                                          ? " · " + i.productBrand
                                          : ""}
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
                                  Math.round(
                                    i.quantity *
                                      i.price *
                                      (1 - i.discount / 100),
                                  ),
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="history-totals">
                      <span>
                        Neto <b>{money(root.net)}</b>
                      </span>
                      <span>
                        Impuesto <b>{money(root.taxAmount)}</b>
                      </span>
                      <strong>Total {money(root.total)}</strong>
                    </div>
                    <p className="history-notes">{root.notes}</p>
                  </>
                ) : (
                  <div className="compact-timeline">
                    {changes.map((e) => (
                      <div className="compact-event" key={e.id}>
                        <span className="timeline-point" />
                        <div>
                          <strong>
                            {actionLabels[e.action]}{" "}
                            <span>
                              {e.number} · v{e.after.version}
                            </span>
                          </strong>
                          <small>
                            {e.actor} · {new Date(e.at).toLocaleString("es-CL")}
                          </small>
                          <p>
                            {e.before?.status ?? "Nuevo"} → {e.after.status}
                            {e.reason && " · " + e.reason}
                          </p>
                          <details>
                            <summary>Ver detalle de esta versión</summary>
                            <div className="snapshot-summary">
                              <strong>
                                {e.after.client} · {money(e.after.total)}
                              </strong>
                              <ul>
                                {e.after.items.map((i, index) => (
                                  <li key={index}>
                                    {i.quantity} × {i.description} ·{" "}
                                    {money(i.price)}
                                  </li>
                                ))}
                              </ul>
                              <p>{e.after.notes}</p>
                              <details>
                                <summary>Comparar antes y después</summary>
                                <pre>
                                  {JSON.stringify(
                                    { antes: e.before, despues: e.after },
                                    null,
                                    2,
                                  )}
                                </pre>
                              </details>
                            </div>
                          </details>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      {!groups.length && (
        <div className="empty">
          <History size={32} />
          <h3>No hay documentos para mostrar</h3>
          <p>
            El historial agrupará tus cotizaciones y sus facturas en un solo
            lugar.
          </p>
        </div>
      )}
    </section>
  );
}
