import { usePermissions } from "./usePermissions";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Trash2, X, Package } from "lucide-react";
import { type Input, type Doc, money } from "../shared/model";
import {
  type Product,
  available,
  documentEffects,
  roundQty,
} from "../shared/inventory";
import { ProductForm } from "./ProductForm";
import { ProductImage } from "./ProductImage";
export function QuoteProducts({
  items,
  onChange,
  products,
  old,
  documents,
  onSaved,
}: {
  items: Input["items"];
  onChange: (items: Input["items"]) => void;
  products: Product[];
  old: Doc | null;
  documents: Doc[];
  onSaved: (p: Product) => void;
}) {
  const { has } = usePermissions();
  const [open, setOpen] = useState<number | null>(null),
    [query, setQuery] = useState(""),
    [quick, setQuick] = useState<number | null>(null),
    [highlight, setHighlight] = useState("");
  const own = old ? documentEffects(old, documents) : {};
  const active = products.filter((p) => !p.deleted && !p.archived);
  const matches = active
    .filter((p) =>
      [p.description, p.code, p.brand, p.category]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .slice(0, 30);
  function choose(p: Product, index: number) {
    const next = [...items];
    next[index] = {
      description: p.description,
      quantity: items[index]?.quantity || 1,
      price: p.price,
      discount: 0,
      productId: p.id,
      productCode: p.code,
      productBrand: p.brand,
      productType: p.type,
      imageUrl: p.imageUrl,
    };
    onChange(next);
    setOpen(null);
  }
  function addCreated(p: Product, again: boolean) {
    onSaved(p);
    const index = quick ?? items.length;
    const target =
      items[index] && !items[index].description ? index : items.length;
    const next = [...items];
    next[target] = {
      description: p.description,
      quantity: 1,
      price: p.price,
      discount: 0,
      productId: p.id,
      productCode: p.code,
      productBrand: p.brand,
      productType: p.type,
      imageUrl: p.imageUrl,
    };
    onChange(next);
    if (again && next.length < 100) setQuick(target + 1);
    else if (next.length >= 100) setQuick(null);
  }
  return (
    <>
      <div className="line-head">
        <span>Descripción / Buscar en catálogo</span>
        <span>Cantidad</span>
        <span>Precio CLP</span>
        <span>Desc. %</span>
        <span />
      </div>
      <AnimatePresence initial={false}>
        {items.map((item, index) => {
          const p = products.find((p) => p.id === item.productId),
            requested = roundQty(
              items
                .filter((i) => i.productId === item.productId)
                .reduce((sum, i) => sum + i.quantity, 0),
            ),
            capacity = p
              ? roundQty(available(p) + (own[p.id]?.reserved ?? 0))
              : 0,
            remaining = roundQty(capacity - requested);
          return (
            <motion.div
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              key={index}
              className="catalog-line"
            >
              <div className="line-item">
                <div className="product-description">
                  <span className="mobile-field-label" aria-hidden="true">
                    Descripción / Buscar en catálogo
                  </span>
                  <input
                    required
                    maxLength={500}
                    aria-label={"Descripción línea " + (index + 1)}
                    value={item.description}
                    autoComplete="off"
                    placeholder="Busca un producto, código o servicio…"
                    onFocus={() => {
                      setOpen(index);
                      setQuery("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setOpen(null);
                      }
                      if (
                        e.key === "Enter" &&
                        open === index &&
                        matches.length
                      ) {
                        e.preventDefault();
                        choose(
                          matches.find((p) => p.id === highlight) ?? matches[0],
                          index,
                        );
                      }
                    }}
                    onChange={(e) => {
                      const next = [...items];
                      next[index] = { ...item, description: e.target.value };
                      onChange(next);
                      setQuery(e.target.value);
                      setOpen(index);
                    }}
                  />
                  {open === index && (
                    <div className="product-picker">
                      <div className="picker-heading">
                        <small>Doble clic para usar · Enter selecciona</small>
                        <button
                          type="button"
                          aria-label="Cerrar productos"
                          onClick={() => setOpen(null)}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="picker-results">
                        {matches.map((p) => (
                          <div
                            key={p.id}
                            className={
                              "picker-result " +
                              (highlight === p.id ? "highlighted" : "")
                            }
                            onClick={() => setHighlight(p.id)}
                            onDoubleClick={() => choose(p, index)}
                          >
                            <ProductImage src={p.imageUrl} alt="" />
                            <span>
                              <b>{p.description}</b>
                              <small>
                                {p.code} · {p.brand} · {money(p.price)}
                              </small>
                              <small>
                                {p.type === "service"
                                  ? "Servicio"
                                  : "Disponible: " + available(p)}
                              </small>
                            </span>
                            <button
                              type="button"
                              onClick={() => choose(p, index)}
                            >
                              Usar
                            </button>
                          </div>
                        ))}
                        {!matches.length && (
                          <p className="hint">No se encontraron productos.</p>
                        )}
                      </div>
                      <button
                        hidden={!has("products", "create")}
                        type="button"
                        className="picker-create"
                        disabled={items.length >= 100}
                        onClick={() => {
                          setQuick(index);
                          setOpen(null);
                        }}
                      >
                        <Plus size={16} />
                        Crear producto o servicio y usarlo
                      </button>
                    </div>
                  )}
                </div>
                {(["quantity", "price", "discount"] as const).map((key) => (
                  <label className="line-number-field" key={key}>
                    <span className="mobile-field-label">
                      {
                        {
                          quantity: "Cantidad",
                          price: "Precio CLP",
                          discount: "Desc. %",
                        }[key]
                      }
                    </span>
                    <input
                      aria-label={
                        {
                          quantity: "Cantidad",
                          price: "Precio",
                          discount: "Descuento",
                        }[key] +
                        " línea " +
                        (index + 1)
                      }
                      required
                      type="number"
                      inputMode="decimal"
                      step={key === "quantity" ? ".001" : ".01"}
                      min={key === "quantity" ? ".001" : 0}
                      max={
                        key === "discount"
                          ? 100
                          : key === "quantity"
                            ? 100000
                            : 100000000
                      }
                      value={item[key]}
                      onFocus={() => setOpen(null)}
                      onChange={(e) => {
                        const next = [...items];
                        next[index] = {
                          ...item,
                          [key]: Number(e.target.value),
                        };
                        onChange(next);
                      }}
                    />
                  </label>
                ))}
                <button
                  type="button"
                  aria-label={"Quitar línea " + (index + 1)}
                  disabled={items.length === 1}
                  onClick={() => {
                    onChange(items.filter((_, i) => i !== index));
                    setOpen(null);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {item.productId ? (
                <div
                  className={
                    "line-stock " +
                    (p?.type === "product" && remaining < 0
                      ? "insufficient"
                      : "")
                  }
                >
                  <ProductImage src={item.imageUrl} alt="" />
                  <span>
                    <b>{item.productCode}</b> ·{" "}
                    {item.productType === "service"
                      ? "Servicio sin stock"
                      : p
                        ? "Disponible para este documento: " +
                          capacity +
                          " · A reservar: " +
                          requested +
                          " · Quedarán: " +
                          remaining
                        : "Producto no disponible"}
                    {p?.deleted && " · Producto eliminado"}
                    <small>
                      La reserva se confirma al guardar.{" "}
                      {p?.type === "product" && remaining < 0
                        ? "Reduce la cantidad o actualiza las existencias."
                        : ""}
                    </small>
                  </span>
                  <button
                    type="button"
                    aria-label={"Desvincular producto línea " + (index + 1)}
                    title="Convertir en línea manual sin control de stock"
                    onClick={() => {
                      const next = [...items];
                      next[index] = {
                        description: item.description,
                        quantity: item.quantity,
                        price: item.price,
                        discount: item.discount,
                      };
                      onChange(next);
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <small className="hint">
                  Línea manual: selecciona un producto del catálogo para
                  controlar stock.
                </small>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div className="catalog-actions">
        <button
          type="button"
          disabled={items.length >= 100}
          onClick={() => {
            onChange([
              ...items,
              { description: "", price: 0, quantity: 1, discount: 0 },
            ]);
            setOpen(items.length);
            setQuery("");
          }}
        >
          <Plus size={15} />
          Agregar línea
        </button>
        <button
          hidden={!has("products", "create")}
          type="button"
          disabled={items.length >= 100}
          onClick={() => setQuick(items.length)}
        >
          <Package size={15} />
          Crear producto y agregar
        </button>
      </div>
      {quick !== null && (
        <ProductForm
          quick
          onClose={() => setQuick(null)}
          onSaved={addCreated}
        />
      )}
    </>
  );
}
