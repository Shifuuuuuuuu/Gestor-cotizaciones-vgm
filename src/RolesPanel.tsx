import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { api } from "./api";
import { beginFeedback } from "./feedback";
import { Modal, ConfirmationDialog } from "./ui";
import {
  accessModules,
  actionLabels,
  emptyPermissions,
  normalizePermissions,
  type AccessRole,
  type AccessEvent,
  type AccessAction,
} from "../shared/access";
import type { Profile } from "../shared/people";
export function RolesPanel({
  users,
  onChanged,
}: {
  users: Profile[];
  onChanged: () => Promise<void>;
}) {
  const [roles, setRoles] = useState<AccessRole[]>([]),
    [events, setEvents] = useState<AccessEvent[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retired, setRetired] = useState(false);
  const [form, setForm] = useState<{
      role?: AccessRole;
      copy?: AccessRole;
    } | null>(null),
    [removing, setRemoving] = useState<AccessRole | null>(null);
  async function load() {
    const data = await api("roles");
    setRoles(data.roles);
    setEvents(data.events);
    setError("");
  }
  useEffect(() => {
    let active = true;
    api("roles")
      .then((data) => {
        if (active) {
          setRoles(data.roles);
          setEvents(data.events);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(body: unknown, title: string) {
    const op = beginFeedback("Actualizando roles", "Guardando permisos");
    setBusy(true);
    try {
      await api("roles", body);
      op.step("Actualizando usuarios y roles");
      try {
        await load();
        await onChanged();
        op.success(title, undefined, "edit");
      } catch (e) {
        op.success(
          "Rol guardado; listado pendiente",
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
  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Roles y permisos por vista</h2>
            <p>
              Define qué secciones puede consultar cada rol y qué acciones puede
              realizar.
            </p>
          </div>
          <button className="primary" onClick={() => setForm({})}>
            <Plus size={16} />
            Crear rol
          </button>
        </div>
        <div className="role-guide">
          <p>
            Admin conserva acceso completo. Los demás roles reciben únicamente
            los permisos seleccionados. Para elegir clientes o vincular
            documentos, concede también Ver en las secciones relacionadas.
          </p>
          <p>
            Dashboard, Resumen, Agenda e Historial muestran solo información de
            módulos autorizados. La administración de usuarios, roles, enlaces
            privados y respaldos completos permanece reservada a Admin.
          </p>
          <label className="business-checkbox">
            <input
              type="checkbox"
              checked={retired}
              onChange={(e) => setRetired(e.target.checked)}
            />
            Ver roles eliminados
          </label>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rol</th>
                <th>Vistas permitidas</th>
                <th>Usuarios asignados</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {roles
                .filter((r) => r.deleted === retired)
                .map((role) => {
                  const count = users.filter((u) => u.role === role.id).length;
                  return (
                    <tr key={role.id}>
                      <td>
                        <strong>{role.name}</strong>
                        <small>{role.description}</small>
                        {["admin", "member"].includes(role.id) && (
                          <small>Rol inicial protegido</small>
                        )}
                      </td>
                      <td>
                        {accessModules
                          .filter((m) => role.permissions[m.id]?.view)
                          .map((m) => m.label.split(" (")[0])
                          .join(", ") || "Solo Mi perfil"}
                      </td>
                      <td>
                        {count} usuario(s)
                        <small>Incluye desactivados y eliminados</small>
                      </td>
                      <td>
                        <div className="catalog-actions">
                          {role.deleted ? (
                            <button
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  await save(
                                    {
                                      action: "archive",
                                      id: role.id,
                                      version: role.version,
                                      deleted: false,
                                    },
                                    "Rol recuperado",
                                  )
                                )
                                  setRetired(false);
                              }}
                            >
                              <RotateCcw size={15} />
                              Recuperar
                            </button>
                          ) : (
                            <>
                              <button onClick={() => setForm({ role })}>
                                {role.id === "admin" ? (
                                  <ShieldCheck size={15} />
                                ) : (
                                  <Pencil size={15} />
                                )}
                                {role.id === "admin"
                                  ? "Ver permisos"
                                  : "Editar"}
                              </button>
                              <button onClick={() => setForm({ copy: role })}>
                                <Copy size={15} />
                                Duplicar
                              </button>
                              <button
                                className="danger"
                                disabled={
                                  busy ||
                                  ["admin", "member"].includes(role.id) ||
                                  count > 0
                                }
                                title={
                                  count
                                    ? "Reasigna primero sus usuarios"
                                    : "Eliminar rol"
                                }
                                onClick={() => setRemoving(role)}
                              >
                                <Trash2 size={15} />
                                Eliminar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
      {!!events.length && (
        <section className="panel settings bottom-form">
          <h2>Historial de roles</h2>
          {[...events]
            .sort((a, b) => b.at.localeCompare(a.at))
            .map((event) => (
              <details key={event.id}>
                <summary>
                  {event.after.name} ·{" "}
                  {{
                    create: "Creación",
                    edit: "Edición",
                    delete: "Eliminación",
                    restore: "Recuperación",
                  }[event.action] ?? "Cambio"}{" "}
                  · {new Date(event.at).toLocaleString("es-CL")} · {event.actor}
                </summary>
                <p>
                  Versión {event.after.version}. Vistas:{" "}
                  {accessModules
                    .filter((m) => event.after.permissions[m.id]?.view)
                    .map((m) => m.label.split(" (")[0])
                    .join(", ") || "Solo Mi perfil"}
                  .
                </p>
              </details>
            ))}
        </section>
      )}
      {form && (
        <RoleEditor
          key={form.role?.id ?? form.copy?.id ?? "new"}
          role={form.role}
          copy={form.copy}
          roles={roles}
          busy={busy}
          onClose={() => setForm(null)}
          onSave={async (data) => {
            if (
              await save(
                {
                  action: "save",
                  id: form.role?.id,
                  version: form.role?.version,
                  data,
                },
                form.role ? "Permisos del rol actualizados" : "Rol creado",
              )
            )
              setForm(null);
          }}
        />
      )}
      {removing && (
        <ConfirmationDialog
          title={"¿Eliminar el rol " + removing.name + "?"}
          description="El rol dejará de estar disponible para asignarlo. Puedes recuperarlo desde Ver roles eliminados. No se eliminan usuarios ni sus documentos."
          busy={busy}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            if (
              await save(
                {
                  action: "archive",
                  id: removing.id,
                  version: removing.version,
                  deleted: true,
                },
                "Rol eliminado",
              )
            )
              setRemoving(null);
          }}
        />
      )}
    </>
  );
}
function RoleEditor({
  role,
  copy,
  roles,
  busy,
  onClose,
  onSave,
}: {
  role?: AccessRole;
  copy?: AccessRole;
  roles: AccessRole[];
  busy: boolean;
  onClose: () => void;
  onSave: (data: unknown) => Promise<void>;
}) {
  const [name, setName] = useState(
      role?.name ?? (copy ? "Copia de " + copy.name : ""),
    ),
    [description, setDescription] = useState(
      role?.description ?? copy?.description ?? "",
    );
  const [permissions, setPermissions] = useState(() =>
    normalizePermissions(
      role?.permissions ?? copy?.permissions ?? emptyPermissions(),
    ),
  );
  const protectedRole = role?.id === "admin";
  function toggle(
    module: (typeof accessModules)[number],
    action: AccessAction,
    checked: boolean,
  ) {
    setPermissions((old) => {
      const next = structuredClone(old);
      next[module.id][action] = checked;
      if (action === "view" && !checked)
        for (const key of Object.keys(actionLabels) as AccessAction[])
          next[module.id][key] = false;
      return next;
    });
  }
  return (
    <Modal
      title={
        protectedRole
          ? "Permisos del rol Admin"
          : role
            ? "Editar rol"
            : "Crear rol"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
      className="role-editor-modal"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && !protectedRole)
            void onSave({ name, description, permissions });
        }}
      >
        <div className="modal-body">
          <div className="form-grid">
            <label>
              Nombre del rol
              <input
                required
                minLength={2}
                maxLength={70}
                disabled={protectedRole}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Copiar permisos de
              <select
                disabled={protectedRole}
                defaultValue=""
                onChange={(e) => {
                  const source = roles.find((r) => r.id === e.target.value);
                  if (source)
                    setPermissions(normalizePermissions(source.permissions));
                }}
              >
                <option value="">Selecciona un rol…</option>
                {roles
                  .filter((r) => !r.deleted)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label className="spaced">
            Descripción
            <textarea
              maxLength={300}
              disabled={protectedRole}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <p className="hint">
            Activa Ver antes de habilitar acciones. Desmarcar Ver elimina las
            acciones de esa vista. Los cambios se aplican a todos los usuarios
            del rol.
          </p>
          {protectedRole && (
            <p className="business-note">
              Admin es un rol protegido; sus permisos no pueden reducirse desde
              esta pantalla.
            </p>
          )}
          <div className="table-wrap permissions-table">
            <table>
              <thead>
                <tr>
                  <th>Vista</th>
                  {Object.entries(actionLabels).map(([key, label]) => (
                    <th key={key}>{label}</th>
                  ))}
                  <th>Todos</th>
                </tr>
              </thead>
              <tbody>
                {accessModules.map((module) => (
                  <tr key={module.id}>
                    <td>
                      <strong>{module.label}</strong>
                    </td>
                    {(Object.keys(actionLabels) as AccessAction[]).map(
                      (action) => (
                        <td
                          key={action}
                          data-label={actionLabels[action]}
                          data-supported={(
                            module.actions as readonly string[]
                          ).includes(action)}
                        >
                          {(module.actions as readonly string[]).includes(
                            action,
                          ) ? (
                            <input
                              type="checkbox"
                              aria-label={
                                module.label + ": " + actionLabels[action]
                              }
                              disabled={
                                protectedRole ||
                                busy ||
                                (action !== "view" &&
                                  !permissions[module.id].view)
                              }
                              checked={permissions[module.id][action]}
                              onChange={(e) =>
                                toggle(module, action, e.target.checked)
                              }
                            />
                          ) : (
                            <span aria-hidden="true">—</span>
                          )}
                        </td>
                      ),
                    )}
                    <td data-label="Todos los permisos">
                      <button
                        type="button"
                        disabled={protectedRole || busy}
                        onClick={() =>
                          setPermissions((old) => {
                            const next = structuredClone(old),
                              value = !module.actions.every(
                                (action) => next[module.id][action],
                              );
                            for (const action of module.actions)
                              next[module.id][action] = value;
                            return next;
                          })
                        }
                      >
                        {module.actions.every(
                          (action) => permissions[module.id][action],
                        )
                          ? "Quitar"
                          : "Marcar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-actions modal-footer">
          <button type="button" disabled={busy} onClick={onClose}>
            {protectedRole ? "Cerrar" : "Cancelar"}
          </button>
          {!protectedRole && (
            <button className="primary" disabled={busy}>
              Guardar rol y permisos
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
