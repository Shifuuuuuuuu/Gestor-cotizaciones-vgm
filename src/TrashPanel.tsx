import { usePermissions } from "./usePermissions";
import type { AccessModule } from "../shared/access";
import { useState } from "react";
import type { Doc } from "../shared/model";
import type { Product } from "../shared/inventory";
import type { Customer, Profile } from "../shared/people";
import { RotateCcw, Eye, Trash2 } from "lucide-react";
type Kind = "quote" | "invoice" | "product" | "customer" | "user";
export function TrashPanel({
  documents,
  products,
  customers,
  users,
  admin,
  busy,
  onRestore,
  onOpen,
}: {
  documents: Doc[];
  products: Product[];
  customers: Customer[];
  users: Profile[];
  admin: boolean;
  busy: boolean;
  onRestore: (kind: Kind, id: string) => void;
  onOpen: (doc: Doc) => void;
}) {
  const { has } = usePermissions();
  const scopes: Record<Exclude<Kind, "user">, AccessModule> = {
    quote: "quotes",
    invoice: "invoices",
    product: "products",
    customer: "customers",
  };
  const [kind, setKind] = useState<Kind>("quote"),
    [query, setQuery] = useState("");
  const groups: {
    id: Kind;
    label: string;
    rows: { id: string; name: string; detail: string }[];
  }[] = [
    {
      id: "quote",
      label: "Cotizaciones",
      rows: documents
        .filter((d) => d.deleted && d.kind === "quote")
        .map((d) => ({ id: d.id, name: d.number, detail: d.client })),
    },
    {
      id: "invoice",
      label: "Facturas",
      rows: documents
        .filter((d) => d.deleted && d.kind === "invoice")
        .map((d) => ({ id: d.id, name: d.number, detail: d.client })),
    },
    {
      id: "product",
      label: "Productos",
      rows: products
        .filter((p) => p.deleted)
        .map((p) => ({
          id: p.id,
          name: p.code,
          detail: p.description + (p.archived ? " · Archivado" : ""),
        })),
    },
    {
      id: "customer",
      label: "Clientes",
      rows: customers
        .filter((c) => c.deleted)
        .map((c) => ({ id: c.id, name: c.name, detail: c.rut })),
    },
    ...(admin
      ? [
          {
            id: "user" as const,
            label: "Usuarios",
            rows: users
              .filter((u) => u.deleted)
              .map((u) => ({ id: u.id, name: u.name, detail: u.email })),
          },
        ]
      : []),
  ];
  const allowedGroups = groups.filter((g) =>
    g.id === "user" ? admin : has(scopes[g.id]),
  );
  const selected = allowedGroups.find((g) => g.id === kind) ??
    allowedGroups[0] ?? { id: "quote" as Kind, label: "Registros", rows: [] };
  const rows = selected.rows.filter((r) =>
    (r.name + " " + r.detail).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2>Papelera</h2>
          <p>
            Recupera registros sin perder su historial. Los usuarios se
            restauran con el acceso desactivado.
          </p>
        </div>
        <Trash2 size={22} />
      </div>
      <div className="trash-content">
        <div
          className="choice-group"
          role="group"
          aria-label="Tipos de papelera"
        >
          {allowedGroups.map((g) => (
            <button
              key={g.id}
              aria-pressed={selected.id === g.id}
              className={selected.id === g.id ? "chosen" : ""}
              onClick={() => {
                setKind(g.id);
                setQuery("");
              }}
            >
              {g.label} · {g.rows.length}
            </button>
          ))}
        </div>
        <label className="trash-search">
          Buscar en {selected.label.toLowerCase()}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, código o RUT…"
          />
        </label>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Registro</th>
                <th>Detalle</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                  </td>
                  <td>{r.detail}</td>
                  <td>
                    <div className="inline-actions">
                      {(selected.id === "quote" ||
                        selected.id === "invoice") && (
                        <button
                          onClick={() =>
                            onOpen(documents.find((d) => d.id === r.id)!)
                          }
                        >
                          <Eye size={15} />
                          Detalle e historial
                        </button>
                      )}
                      <button
                        hidden={
                          selected.id !== "user" &&
                          (!has(scopes[selected.id], "delete") ||
                            (selected.id === "customer" &&
                              !has("customers", "edit")))
                        }
                        disabled={busy}
                        onClick={() => onRestore(selected.id, r.id)}
                      >
                        <RotateCcw size={15} />
                        Restaurar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="empty">
            <Trash2 size={28} />
            <h3>
              {query ? "No hay coincidencias" : "Esta papelera está vacía"}
            </h3>
          </div>
        )}
      </div>
    </section>
  );
}
