import { usePermissions } from "./usePermissions";
import { formatContactField, formatPhone } from "../shared/people";
import { RutLookup } from "./RutLookup";
import { useState } from "react";
import {
  Plus,
  Search,
  Pencil,
  Building2,
  CheckCircle2,
  Ban,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { cleanRut, validRut, type Customer } from "../shared/people";
import { Modal, Spinner, ConfirmationDialog } from "./ui";
export function CustomerPanel({
  customers,
  busy,
  onSave,
  onAccess,
}: {
  customers: Customer[];
  busy: boolean;
  onSave: (data: Customer) => Promise<boolean>;
  onAccess: (
    customer: Customer,
    active: boolean,
    deleted: boolean,
  ) => Promise<boolean>;
}) {
  const { has } = usePermissions();
  const [search, setSearch] = useState(""),
    [form, setForm] = useState<Customer | null>(null),
    [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null),
    [filter, setFilter] = useState("Todos");
  const filtered = customers.filter(
    (c) =>
      `${c.name} ${c.rut} ${c.email}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "Eliminados" ? c.deleted : !c.deleted) &&
      (filter === "Activos"
        ? c.active
        : filter === "Bloqueados"
          ? !c.active
          : true),
  );
  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>
              Clientes <span>{customers.length}</span>
            </h2>
            <p>Tu directorio, disponible al crear cada documento.</p>
          </div>
          <button
            className="primary"
            hidden={!has("customers", "create")}
            onClick={() =>
              setForm({
                id: "",
                name: "",
                rut: "",
                email: "",
                address: "",
                phone: "",
                updatedAt: "",
                active: true,
                deleted: false,
              })
            }
          >
            <Plus size={16} />
            Nuevo cliente
          </button>
        </div>
        <div className="toolbar">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Buscar clientes"
              placeholder="Buscar razón social, RUT o correo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar clientes"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {[
              "Todos",
              "Activos",
              "Bloqueados",
              ...(has("trash") ? ["Eliminados"] : []),
            ].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="client-grid">
          {filtered.map((c) => (
            <article key={c.id}>
              <div className="client-top">
                <span className="avatar">
                  <Building2 size={18} />
                </span>
                <button
                  hidden={!has("customers", "edit")}
                  disabled={c.deleted || busy}
                  className="icon-button"
                  aria-label={"Editar cliente " + c.name}
                  onClick={() => setForm(c)}
                >
                  <Pencil size={15} />
                </button>
              </div>
              <h3>{c.name}</h3>
              <span
                className={
                  "badge " +
                  (c.deleted ? "Anulada" : c.active ? "Aceptada" : "Rechazada")
                }
              >
                {c.deleted ? "Eliminado" : c.active ? "Activo" : "Bloqueado"}
              </span>
              <p>
                {c.rut || "Sin RUT"}
                <br />
                {c.email || "Sin correo"}
                <br />
                {c.address || "Sin dirección"}
              </p>
              {c.phone && <small>{formatPhone(c.phone)}</small>}
              <div className="client-actions">
                {c.deleted ? (
                  <button
                    disabled={busy}
                    hidden={
                      !has("customers", "delete") ||
                      !has("customers", "edit") ||
                      !has("trash")
                    }
                    onClick={() => onAccess(c, false, false)}
                  >
                    <RotateCcw size={14} />
                    Recuperar
                  </button>
                ) : (
                  <>
                    <button
                      disabled={busy}
                      hidden={!has("customers", "edit")}
                      onClick={() => onAccess(c, !c.active, false)}
                    >
                      {c.active ? (
                        <Ban size={14} />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}{" "}
                      {c.active ? "Bloquear" : "Activar"}
                    </button>
                    <button
                      className="danger"
                      disabled={busy}
                      hidden={!has("customers", "delete")}
                      onClick={() => setDeletingCustomer(c)}
                    >
                      <Trash2 size={14} />
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
        {!filtered.length && (
          <div className="empty">
            <Building2 size={34} />
            <h3>Construye tu directorio</h3>
            <p>Agrega un cliente y reutiliza sus datos al cotizar.</p>
          </div>
        )}
      </section>
      {deletingCustomer && (
        <ConfirmationDialog
          title="¿Eliminar cliente?"
          description={`Se enviará a ${deletingCustomer.name} a la papelera. Sus documentos se conservarán y podrás recuperar el cliente.`}
          busy={busy}
          onClose={() => setDeletingCustomer(null)}
          onConfirm={async () => {
            if (await onAccess(deletingCustomer, false, true))
              setDeletingCustomer(null);
          }}
        />
      )}
      {form && (
        <Modal
          title={form.id ? "Editar cliente" : "Nuevo cliente"}
          onClose={() => setForm(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await onSave(form)) setForm(null);
            }}
          >
            <div className="form-grid">
              {(["name", "rut", "email", "phone", "address"] as const).map(
                (key) => (
                  <label key={key}>
                    {
                      {
                        name: "Razón social / Nombre",
                        rut: "RUT",
                        email: "Correo",
                        phone: "Teléfono",
                        address: "Dirección",
                      }[key]
                    }
                    <input
                      required={key === "name"}
                      type={
                        key === "email"
                          ? "email"
                          : key === "phone"
                            ? "tel"
                            : "text"
                      }
                      placeholder={
                        key === "phone"
                          ? "+56 9 4567 0987 / +56 2 2345 6789"
                          : undefined
                      }
                      value={formatContactField(key, form[key])}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          [key]: formatContactField(key, e.target.value),
                        })
                      }
                    />
                    {key === "rut" && form.rut && (
                      <small
                        className={validRut(form.rut) ? "valid-rut" : "hint"}
                      >
                        {validRut(form.rut)
                          ? "Dígito verificador válido"
                          : "Revisa el RUT antes de guardar."}
                      </small>
                    )}
                  </label>
                ),
              )}
            </div>
            <RutLookup
              rut={form.rut}
              customers={customers}
              disabled={busy}
              onApply={(r) =>
                setForm((current) =>
                  !current || cleanRut(current.rut) !== cleanRut(r.rut)
                    ? current
                    : {
                        ...current,
                        name: current.name.trim()
                          ? current.name
                          : (r.name ?? ""),
                        address: current.address.trim()
                          ? current.address
                          : (r.address ?? ""),
                        email: current.email.trim()
                          ? current.email
                          : (r.email ?? ""),
                        phone: current.phone.trim()
                          ? current.phone
                          : (r.phone ?? ""),
                      },
                )
              }
            />
            <div className="modal-actions">
              <button type="button" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                {busy ? <Spinner /> : <CheckCircle2 size={16} />}Guardar cliente
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
