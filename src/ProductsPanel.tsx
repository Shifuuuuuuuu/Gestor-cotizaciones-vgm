import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Search,
  Package,
  Archive,
  Copy,
  Pencil,
  Trash2,
  History,
  RotateCcw,
  Upload,
  Download,
} from "lucide-react";
import {
  type Product,
  type ProductInput,
  type StockMovement,
  available,
} from "../shared/inventory";
import { money } from "../shared/model";
import { api } from "./api";
import { Modal, Spinner } from "./ui";
import { ProductForm } from "./ProductForm";
import { ProductImage } from "./ProductImage";
import { ProductImport } from "./ProductImport";
import { download } from "./exports";
export function ProductsPanel({
  products,
  movements,
  onRefresh,
  onSaved,
}: {
  products: Product[];
  movements: StockMovement[];
  onRefresh: () => Promise<void>;
  onSaved: (p: Product) => void;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("active"),
    [form, setForm] = useState<{
      product?: Product;
      initial?: ProductInput;
    } | null>(null),
    [deleting, setDeleting] = useState<Product | null>(null),
    [importing, setImporting] = useState(false),
    [history, setHistory] = useState<Product | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const visible = products.filter(
    (p) =>
      (filter === "trash"
        ? p.deleted
        : !p.deleted && (filter === "archived" ? !!p.archived : !p.archived)) &&
      (filter !== "service" || p.type === "service") &&
      (filter !== "product" || p.type === "product") &&
      [p.code, p.description, p.brand, p.category]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const [limit, setLimit] = useState(24);
  useEffect(() => setLimit(24), [query, filter]);
  const live = products.filter((p) => !p.deleted && !p.archived);
  return (
    <>
      <div className="inventory-summary">
        <div>
          <Package size={22} />
          <span>
            Catálogo activo<strong>{live.length} artículos</strong>
          </span>
        </div>
        <div>
          <span>
            Productos / Servicios
            <strong>
              {live.filter((p) => p.type === "product").length} /{" "}
              {live.filter((p) => p.type === "service").length}
            </strong>
          </span>
        </div>
        <p>
          Al guardar una cotización se reserva stock. Al emitir su factura se
          registra la salida física.
        </p>
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>
            Tu bodega <span>{visible.length}</span>
          </h2>
          <div className="catalog-actions">
            <button disabled={busy} onClick={() => run(onRefresh)}>
              {busy ? <Spinner /> : <RotateCcw size={16} />}Actualizar
            </button>
            <button
              onClick={() =>
                run(async () => {
                  const m = await import("./productExcel");
                  download(
                    new Blob([m.templateBuffer()], {
                      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    }),
                    "plantilla-productos-vgm.xlsx",
                  );
                })
              }
            >
              <Download size={16} />
              Plantilla Excel
            </button>
            <button onClick={() => setImporting(true)}>
              <Upload size={16} />
              Importar Excel
            </button>
            <button className="primary" onClick={() => setForm({})}>
              <Plus size={16} />
              Nuevo producto / servicio
            </button>
          </div>
        </div>
        <div className="toolbar">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Buscar productos"
              placeholder="Código, descripción, marca o categoría…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar catálogo"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="active">Todo el catálogo</option>
            <option value="product">Productos</option>
            <option value="service">Servicios</option>
            <option value="archived">Archivados</option>
            <option value="trash">Papelera · Eliminados</option>
          </select>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <p className="hint admin-hint">
          {filter === "trash"
            ? "Estos productos conservan sus datos e historial. Usa Recuperar para devolverlos al catálogo; en Movimientos verás quién los eliminó y cuándo."
            : "Eliminar envía el producto a la papelera y registra la fecha y el responsable. Puedes recuperarlo desde el filtro Papelera · Eliminados."}
        </p>
        <div className="catalog-grid">
          <AnimatePresence initial={false}>
            {visible.slice(0, limit).map((p) => (
              <motion.article
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                key={p.id}
                className="product-card"
              >
                <div className="product-card-visual">
                  <ProductImage src={p.imageUrl} alt={p.description} />
                  <span className="product-type">
                    {p.type === "service"
                      ? "Servicio"
                      : p.category || "Producto"}
                  </span>
                </div>
                <div className="product-card-body">
                  <small>
                    {p.code} {p.brand ? " · " + p.brand : ""}
                  </small>
                  <h3>{p.description}</h3>
                  <strong className="product-price">
                    {money(p.price)} <small>neto</small>
                  </strong>
                  {p.type === "product" ? (
                    <div
                      className={
                        "stock-strip " +
                        (available(p) === 0 ? "stock-empty" : "")
                      }
                    >
                      <span>
                        Disponible<b>{available(p)}</b>
                      </span>
                      <span>
                        Reservado<b>{p.reserved}</b>
                      </span>
                      <span>
                        Físico<b>{p.stock}</b>
                      </span>
                    </div>
                  ) : (
                    <p className="hint service-stock">
                      Servicio sin control de stock
                    </p>
                  )}
                  <div className="product-card-actions">
                    {p.deleted ? (
                      <button
                        onClick={() =>
                          run(async () => {
                            onSaved(
                              await api("products/access", {
                                id: p.id,
                                version: p.version,
                                deleted: false,
                              }),
                            );
                            await onRefresh();
                          })
                        }
                      >
                        <RotateCcw size={16} />
                        Recuperar
                      </button>
                    ) : (
                      <>
                        <button
                          aria-label={"Editar " + p.code}
                          title="Editar"
                          onClick={() => setForm({ product: p })}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          aria-label={"Copiar " + p.code}
                          title="Copiar (sin duplicar existencias)"
                          onClick={() =>
                            setForm({ initial: { ...p, code: "", stock: 0 } })
                          }
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          disabled={busy}
                          aria-label={
                            (p.archived ? "Desarchivar " : "Archivar ") + p.code
                          }
                          onClick={() =>
                            run(async () => {
                              onSaved(
                                await api("products/archive", {
                                  id: p.id,
                                  version: p.version,
                                  archived: !p.archived,
                                }),
                              );
                              await onRefresh();
                            })
                          }
                        >
                          <Archive size={16} />
                          {p.archived ? "Desarchivar" : "Archivar"}
                        </button>
                        <button
                          aria-label={"Eliminar " + p.code}
                          title={
                            p.reserved
                              ? "Tiene stock reservado"
                              : "Eliminar (recuperable)"
                          }
                          disabled={busy || p.reserved > 0}
                          onClick={() => {
                            setError("");
                            setDeleting(p);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                    <button
                      aria-label={"Movimientos " + p.code}
                      onClick={() => setHistory(p)}
                    >
                      <History size={16} />
                      Movimientos
                    </button>
                  </div>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
        {visible.length > limit && (
          <div className="catalog-more">
            <button onClick={() => setLimit((n) => n + 24)}>
              Mostrar más ({visible.length - limit} pendientes)
            </button>
          </div>
        )}
        {!visible.length && (
          <div className="empty">
            <Package size={36} />
            <h3>
              {query ? "No hay coincidencias" : "Tu catálogo comienza aquí"}
            </h3>
            <p>Agrega productos, servicios o importa tu plantilla Excel.</p>
          </div>
        )}
      </section>
      <AnimatePresence>
        {deleting && (
          <Modal
            title={"Eliminar " + deleting.code}
            onClose={() => {
              if (!busy) setDeleting(null);
            }}
          >
            <div className="modal-body">
              <p>
                Se enviará el producto a la papelera y se conservará su
                historial.
              </p>
              <strong>{deleting.description}</strong>
              {error && (
                <p role="alert" className="inline-error">
                  {error}
                </p>
              )}
            </div>
            <div className="modal-actions modal-footer">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    onSaved(
                      await api("products/access", {
                        id: deleting.id,
                        version: deleting.version,
                        deleted: true,
                      }),
                    );
                    setDeleting(null);
                    await onRefresh();
                  })
                }
              >
                {busy ? <Spinner /> : <Trash2 size={16} />}Enviar a papelera
              </button>
            </div>
          </Modal>
        )}
        {form && (
          <ProductForm
            {...form}
            onClose={() => setForm(null)}
            onSaved={(p) => onSaved(p)}
          />
        )}
        {importing && (
          <ProductImport
            products={products}
            onClose={() => setImporting(false)}
            onImported={onRefresh}
          />
        )}
        {history && (
          <Modal
            title={"Movimientos · " + history.code}
            onClose={() => setHistory(null)}
            wide
          >
            <div className="modal-body">
              <p className="hint">
                Registro de existencias físicas y reservas. Las cantidades de
                los documentos se comprueban al guardarlos.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha / Responsable</th>
                      <th>Documento / Motivo</th>
                      <th>Físico</th>
                      <th>Reservado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements
                      .filter((m) => m.productId === history.id)
                      .sort((a, b) => b.at.localeCompare(a.at))
                      .map((m) => (
                        <tr key={m.id}>
                          <td>
                            {new Date(m.at).toLocaleString("es-CL")}
                            <small>{m.actor}</small>
                          </td>
                          <td>
                            <b>{m.documentNumber}</b>
                            <small>{m.reason}</small>
                          </td>
                          <td>
                            {m.stockBefore} → {m.stockAfter}
                          </td>
                          <td>
                            {m.reservedBefore} → {m.reservedAfter}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}
