import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Package,
  Users,
  FileText,
  Receipt,
  Search,
  Plus,
  Eye,
  Pencil,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { type Doc, type Command, money, statuses } from "../shared/model";
import { Modal, Spinner } from "./ui";

type Props = {
  documents: Doc[];
  busy: boolean;
  users: ReactNode;
  products: ReactNode;
  productCount: number;
  onOpen: (d: Doc) => void;
  onEdit: (d: Doc) => void;
  onNew: (kind: Doc["kind"]) => void;
  onCommand: (cmd: Command) => Promise<boolean>;
  onRefresh: () => void;
};
export function Administration(props: Props) {
  const [module, setModule] = useState<
    "users" | "quote" | "invoice" | "products"
  >("users");
  return (
    <>
      <div
        className="admin-modules"
        role="group"
        aria-label="Módulos de administración"
      >
        {(
          [
            { id: "users", label: "Usuarios", icon: Users },
            { id: "quote", label: "Cotizaciones", icon: FileText },
            { id: "invoice", label: "Facturas", icon: Receipt },
            { id: "products", label: "Productos", icon: Package },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-pressed={module === id}
            className={module === id ? "chosen" : ""}
            onClick={() => setModule(id)}
          >
            <Icon size={20} />
            <span>{label}</span>
            {id !== "users" && (
              <small>
                {id === "products"
                  ? props.productCount
                  : props.documents.filter((d) => d.kind === id && !d.deleted)
                      .length}
              </small>
            )}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={module}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
        >
          {module === "users" ? (
            props.users
          ) : module === "products" ? (
            props.products
          ) : (
            <AdminDocuments {...props} kind={module} />
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
function AdminDocuments({
  documents,
  busy,
  kind,
  onOpen,
  onEdit,
  onNew,
  onCommand,
  onRefresh,
}: Props & { kind: Doc["kind"] }) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("Todos"),
    [trash, setTrash] = useState(false),
    [deleting, setDeleting] = useState<Doc | null>(null),
    [reason, setReason] = useState("");
  const rows = documents
    .filter(
      (d) =>
        d.kind === kind &&
        d.deleted === trash &&
        (status === "Todos" || d.status === status) &&
        [d.number, d.client, d.rut]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const title = kind === "quote" ? "Cotizaciones" : "Facturas";
  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>
              {title}
              <span>{rows.length}</span>
            </h2>
            <p>Consulta y administra tus documentos desde este módulo.</p>
          </div>
          <div className="inline-actions">
            <button disabled={busy} onClick={onRefresh}>
              {busy ? <Spinner /> : <RotateCcw size={16} />}Actualizar
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => onNew(kind)}
            >
              <Plus size={16} />
              Nueva {kind === "quote" ? "cotización" : "factura"}
            </button>
          </div>
        </div>
        <div className="toolbar admin-toolbar">
          <label className="search">
            <Search size={17} />
            <input
              aria-label={"Buscar " + title.toLowerCase()}
              placeholder="Número, cliente o RUT…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Estado del documento"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["Todos", ...statuses[kind]].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <div className="choice-group">
            <button
              aria-pressed={!trash}
              className={!trash ? "chosen" : ""}
              onClick={() => setTrash(false)}
            >
              Activos
            </button>
            <button
              aria-pressed={trash}
              className={trash ? "chosen" : ""}
              onClick={() => setTrash(true)}
            >
              <Trash2 size={14} />
              Papelera
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th className="right">Total</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.number}</strong>
                    <small>Versión {d.version}</small>
                  </td>
                  <td>
                    {d.client}
                    <small>{d.rut || "Sin RUT"}</small>
                  </td>
                  <td>
                    {d.date}
                    <small>Vence {d.due}</small>
                  </td>
                  <td>
                    <span className={"badge " + d.status}>
                      {d.deleted ? "En papelera" : d.status}
                    </span>
                  </td>
                  <td className="right">
                    <strong>{money(d.total)}</strong>
                  </td>
                  <td>
                    <div className="inline-actions admin-row-actions">
                      <button
                        aria-label={"Ver " + d.number}
                        onClick={() => onOpen(d)}
                      >
                        <Eye size={15} />
                        Ver
                      </button>
                      {d.deleted ? (
                        <button
                          disabled={busy}
                          aria-label={"Recuperar " + d.number}
                          onClick={() =>
                            onCommand({
                              action: "restore",
                              id: d.id,
                              version: d.version,
                            })
                          }
                        >
                          <RotateCcw size={15} />
                          Recuperar
                        </button>
                      ) : (
                        <>
                          <button
                            disabled={busy || d.status !== "Borrador"}
                            title={
                              d.status === "Borrador"
                                ? "Editar documento"
                                : "Solo se pueden editar borradores"
                            }
                            aria-label={"Editar " + d.number}
                            onClick={() => onEdit(d)}
                          >
                            <Pencil size={15} />
                            Editar
                          </button>
                          <button
                            disabled={busy}
                            aria-label={"Eliminar " + d.number}
                            onClick={() => {
                              setDeleting(d);
                              setReason("");
                            }}
                          >
                            <Trash2 size={15} />
                            Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="empty">
            <FileText size={30} />
            <h3>No hay documentos en esta vista</h3>
            <p>
              {trash
                ? "Aquí aparecerán los documentos eliminados que puedes recuperar."
                : "Crea un documento o ajusta los filtros."}
            </p>
          </div>
        )}
        <p className="hint admin-hint">
          Editar está disponible en borradores. Eliminar conserva el historial y
          permite recuperar el documento desde Papelera.
        </p>
      </section>
      {deleting && (
        <Modal
          title={"Eliminar " + deleting.number}
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await onCommand({
                  action: "delete",
                  id: deleting.id,
                  version: deleting.version,
                  reason,
                })
              )
                setDeleting(null);
            }}
          >
            <div className="modal-body">
              <p>
                Se enviará a la papelera y se conservará su historial. Las
                existencias asociadas se ajustarán según el documento.
              </p>
              <label>
                Motivo de eliminación
                <textarea
                  required
                  minLength={1}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Indica por qué eliminas este documento"
                  rows={3}
                />
              </label>
            </div>
            <div className="modal-actions modal-footer">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                Cancelar
              </button>
              <button className="danger" disabled={busy || !reason.trim()}>
                {busy ? <Spinner /> : <Trash2 size={16} />}Enviar a papelera
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
