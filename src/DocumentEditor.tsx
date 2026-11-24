import { usePermissions } from "./usePermissions";
import { RutLookup } from "./RutLookup";
import { QuoteProducts } from "./QuoteProducts";
import type { Product } from "../shared/inventory";
import { useState } from "react";

import { Check, Building2, Search } from "lucide-react";
import { totals, money, type Doc, type Input } from "../shared/model";
import { formatRut, cleanRut, validRut, type Customer } from "../shared/people";
import { Modal, Spinner } from "./ui";
export function DocumentEditor({
  products,
  documents,
  onProductSaved,
  initial,
  old,
  customers,
  busy,
  onClose,
  onSave,
}: {
  products: Product[];
  documents: Doc[];
  onProductSaved: (p: Product) => void;
  initial: Input;
  old: Doc | null;
  customers: Customer[];
  busy: boolean;
  onClose: () => void;
  onSave: (data: Input) => void;
}) {
  const { has } = usePermissions();
  const allowed = has(
    initial.kind === "quote" ? "quotes" : "invoices",
    old ? "edit" : "create",
  );
  const [data, setData] = useState(initial),
    [field, setField] = useState<"client" | "rut" | null>(null),
    [matched, setMatched] = useState("");
  const selectCustomer = (c: Customer) => {
    if (!c.active || c.deleted) return;
    setData((d) => ({
      ...d,
      client: c.name,
      rut: c.rut,
      email: c.email,
      address: c.address,
    }));
    setMatched(c.name);
    setField(null);
  };
  const lookup = (key: "client" | "rut", value: string) => {
    const text = key === "rut" ? formatRut(value) : value;
    setData((d) => ({ ...d, [key]: text }));
    setMatched("");
    setField(key);
    const exact = customers.find((c) =>
      key === "rut"
        ? cleanRut(text).length >= 8 && cleanRut(c.rut) === cleanRut(text)
        : c.name.toLowerCase() === text.toLowerCase(),
    );
    if (exact && exact.active && !exact.deleted) selectCustomer(exact);
  };
  const matches = field
    ? customers
        .filter((c) => c.active && !c.deleted)
        .filter((c) =>
          field === "rut"
            ? cleanRut(c.rut).includes(cleanRut(data.rut))
            : c.name.toLowerCase().includes(data.client.toLowerCase()),
        )
        .slice(0, 5)
    : [];
  const amount = totals(data);
  return (
    <Modal
      title={`${old ? "Editar" : "Nueva"} ${data.kind === "quote" ? "cotización" : "factura interna"}${old ? " · " + old.number : ""}`}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (allowed) onSave(data);
        }}
      >
        <div className="modal-body">
          <div className="editor-section-title">
            <span className="step-label">01</span>
            <h3>Datos del cliente</h3>
            {matched && (
              <span className="matched">
                <Check size={13} />
                Cliente encontrado
              </span>
            )}
          </div>
          <div className="form-grid">
            <div
              className="autocomplete"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setField(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setField(null);
                }
              }}
            >
              <label>
                Razón social / Cliente
                <input
                  required
                  autoComplete="off"
                  value={data.client}
                  placeholder="Busca o escribe un nuevo cliente"
                  onFocus={() => setField("client")}
                  onChange={(e) => lookup("client", e.target.value)}
                />
              </label>
              {field === "client" && !!matches.length && (
                <div className="suggestions">
                  {matches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectCustomer(c)}
                    >
                      <Building2 size={16} />
                      <span>
                        {c.name}
                        <small>{c.rut || c.email}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="customer-field">
              <div
                className="autocomplete"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                    setField(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setField(null);
                  }
                }}
              >
                <label>
                  RUT / Identificación
                  <input
                    autoComplete="off"
                    placeholder="12.345.678-5"
                    value={data.rut}
                    onFocus={() => setField("rut")}
                    onChange={(e) => lookup("rut", e.target.value)}
                  />
                </label>
                {field === "rut" && !!matches.length && data.rut && (
                  <div className="suggestions">
                    {matches.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => selectCustomer(c)}
                      >
                        <Search size={16} />
                        <span>
                          {c.rut}
                          <small>{c.name}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <RutLookup
                rut={data.rut}
                customers={customers}
                disabled={busy}
                onApply={(r) => {
                  setData((d) =>
                    cleanRut(d.rut) !== cleanRut(r.rut)
                      ? d
                      : {
                          ...d,
                          client: d.client.trim() ? d.client : (r.name ?? ""),
                          address: d.address.trim()
                            ? d.address
                            : (r.address ?? ""),
                          email: d.email.trim() ? d.email : (r.email ?? ""),
                        },
                  );
                  setField(null);
                }}
              />
              {data.rut && (
                <small className={validRut(data.rut) ? "valid-rut" : "hint"}>
                  {validRut(data.rut)
                    ? "RUT con dígito verificador válido"
                    : "Revisa el dígito verificador."}
                </small>
              )}
            </div>
            {(
              [
                ["email", "Correo", "email"],
                ["address", "Dirección", "text"],
                ["date", "Fecha", "date"],
                ["due", "Vencimiento", "date"],
              ] as const
            ).map(([key, label, type]) => (
              <label key={key}>
                {label}
                <input
                  required={key === "date" || key === "due"}
                  type={type}
                  min={key === "due" ? data.date : undefined}
                  value={data[key]}
                  onFocus={() => setField(null)}
                  onChange={(e) => setData({ ...data, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <p className="hint">
            Los clientes guardados se completan por nombre o RUT. Los datos de
            este documento se conservarán como una copia.
          </p>
          <div className="editor-section-title">
            <span className="step-label">02</span>
            <h3>Productos y servicios</h3>
          </div>
          <QuoteProducts
            items={data.items}
            onChange={(items) => setData((d) => ({ ...d, items }))}
            products={products}
            old={old}
            documents={documents}
            onSaved={onProductSaved}
          />
          <div className="form-grid bottom-form">
            <label>
              Observaciones y condiciones
              <textarea
                rows={5}
                value={data.notes}
                onChange={(e) => setData({ ...data, notes: e.target.value })}
              />
            </label>
            <div>
              <label>
                Impuesto (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={data.tax}
                  onChange={(e) =>
                    setData({ ...data, tax: Number(e.target.value) })
                  }
                />
              </label>
              <div className="totals">
                <p>
                  Neto <b>{money(amount.net)}</b>
                </p>
                <p>
                  Impuesto <b>{money(amount.taxAmount)}</b>
                </p>
                <h2>
                  Total <b>{money(amount.total)}</b>
                </h2>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-actions editor-footer">
          <span>
            {old
              ? "Conserva su correlativo. Se creará una nueva versión."
              : "El correlativo se asignará al guardar."}
          </span>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" hidden={!allowed} disabled={busy}>
            {busy ? (
              <>
                <Spinner />
                Guardando…
              </>
            ) : (
              <>
                <Check size={17} />
                {old
                  ? "Guardar cambios"
                  : "Crear " +
                    (data.kind === "quote" ? "cotización" : "factura")}
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
