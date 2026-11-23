import { useState, useRef } from "react";
import { Check, Plus, Package, Wrench } from "lucide-react";
import { Modal, Spinner } from "./ui";
import { ImageDropzone } from "./ProductImage";
import { api } from "./api";
import {
  blankProduct,
  type Product,
  type ProductInput,
} from "../shared/inventory";
export function ProductForm({
  product,
  initial,
  onClose,
  onSaved,
  quick = false,
}: {
  product?: Product;
  initial?: ProductInput;
  onClose: () => void;
  onSaved: (p: Product, keepOpen: boolean) => void;
  quick?: boolean;
}) {
  const [data, setData] = useState<ProductInput>(
      product ?? initial ?? blankProduct(),
    ),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const again = useRef(false);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const p = await api("products", {
        data,
        id: product?.id,
        version: product?.version,
        reason,
      });
      onSaved(p, again.current);
      if (again.current) {
        setData(blankProduct());
        setReason("");
      } else onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        product
          ? "Editar " + product.code
          : quick
            ? "Nuevo producto para la cotización"
            : "Nuevo producto o servicio"
      }
      onClose={() => {
        if (!busy && !uploading) onClose();
      }}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="modal-body">
          <div className="choice-group product-kind">
            {(["product", "service"] as const).map((type) => (
              <button
                type="button"
                key={type}
                className={data.type === type ? "chosen" : ""}
                aria-pressed={data.type === type}
                onClick={() =>
                  setData({
                    ...data,
                    type,
                    stock: type === "service" ? 0 : data.stock,
                  })
                }
              >
                {type === "product" ? (
                  <Package size={18} />
                ) : (
                  <Wrench size={18} />
                )}{" "}
                {type === "product" ? "Producto con stock" : "Servicio"}
              </button>
            ))}
          </div>
          <div className="product-form-grid">
            <div>
              <div className="form-grid">
                <label>
                  Código único
                  <input
                    required
                    maxLength={60}
                    pattern="[A-Za-z0-9._-]+"
                    value={data.code}
                    placeholder="Ej. VGM-001"
                    onChange={(e) =>
                      setData({ ...data, code: e.target.value.toUpperCase() })
                    }
                  />
                </label>
                <label>
                  Marca
                  <input
                    maxLength={100}
                    value={data.brand}
                    placeholder="Ej. Bosch"
                    onChange={(e) =>
                      setData({ ...data, brand: e.target.value })
                    }
                  />
                </label>
              </div>
              <label className="spaced">
                Descripción
                <textarea
                  required
                  minLength={2}
                  maxLength={500}
                  rows={3}
                  placeholder="Nombre y características del producto o servicio"
                  value={data.description}
                  onChange={(e) =>
                    setData({ ...data, description: e.target.value })
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  Categoría / Tipo de producto
                  <input
                    value={data.category}
                    maxLength={100}
                    placeholder="Ej. Herramientas eléctricas"
                    onChange={(e) =>
                      setData({ ...data, category: e.target.value })
                    }
                  />
                </label>
                <label>
                  Precio unitario neto (CLP)
                  <input
                    required
                    type="number"
                    min="0"
                    max="100000000"
                    step=".01"
                    value={data.price}
                    onChange={(e) =>
                      setData({ ...data, price: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Stock físico actual
                  <input
                    required
                    type="number"
                    min={product?.reserved ?? 0}
                    max="100000000"
                    step=".001"
                    disabled={data.type === "service"}
                    value={data.stock}
                    onChange={(e) =>
                      setData({ ...data, stock: Number(e.target.value) })
                    }
                  />
                  <small>
                    {data.type === "service"
                      ? "Los servicios no descuentan stock."
                      : product
                        ? "Reservado: " +
                          product.reserved +
                          " · Disponible: " +
                          (data.stock - product.reserved)
                        : "Existencias reales disponibles para comenzar."}
                  </small>
                </label>
                {product && data.stock !== product.stock && (
                  <label>
                    Motivo del ajuste
                    <input
                      required
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Ej. ingreso de mercadería o conteo"
                    />
                  </label>
                )}
              </div>
            </div>
            <ImageDropzone
              value={data.imageUrl}
              onChange={(imageUrl) => setData((d) => ({ ...d, imageUrl }))}
              onBusy={setUploading}
            />
          </div>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {quick && (
            <p className="hint">
              El producto se guardará en el catálogo y se agregará a tu
              cotización. Puedes crear varios seguidos; el stock se reserva
              cuando guardas la cotización.
            </p>
          )}
        </div>
        <div className="modal-actions editor-footer">
          <button type="button" disabled={busy || uploading} onClick={onClose}>
            Cancelar
          </button>
          {!product && (
            <button
              type="submit"
              disabled={busy || uploading}
              onClick={() => {
                again.current = true;
              }}
            >
              <Plus size={16} />
              Guardar y agregar otro
            </button>
          )}
          <button
            type="submit"
            className="primary"
            disabled={busy || uploading}
            onClick={() => {
              again.current = false;
            }}
          >
            {busy ? <Spinner /> : <Check size={16} />}{" "}
            {busy
              ? "Guardando…"
              : quick
                ? "Guardar y usar"
                : product
                  ? "Guardar cambios"
                  : "Guardar producto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
