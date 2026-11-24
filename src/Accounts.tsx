import type { AccessRole } from "../shared/access";
import { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  UserRound,
  Mail,
  Phone,
  Briefcase,
  Plus,
} from "lucide-react";
import { formatContactField, type Profile } from "../shared/people";
import { Brand, Spinner, Modal, ConfirmationDialog } from "./ui";
export function Login({
  mode,
  busy,
  onLogin,
}: {
  mode: string;
  busy: boolean;
  onLogin: (email: string, password: string, remember: boolean) => void;
}) {
  const [remember, setRemember] = useState(
    () => localStorage.getItem("vgm-remember") === "true",
  );
  const [email, setEmail] = useState(() =>
      localStorage.getItem("vgm-remember") === "true"
        ? (localStorage.getItem("vgm-login-email") ?? "")
        : "",
    ),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false);
  return (
    <div className="login-page">
      <div className="login-story">
        <Brand />
        <div className="login-copy">
          <span className="eyebrow">TU TRABAJO. TU EQUIPO. VGM.</span>
          <h1>
            Grandes proyectos.
            <br />
            <span>Todo comienza aquí.</span>
          </h1>
          <p>
            Cotiza con claridad, trabaja en equipo y lleva cada oportunidad
            hasta el cierre.
          </p>
          <div className="login-benefits">
            <span>
              <ShieldCheck size={18} />
              Historial de cada cambio
            </span>
            <span>
              <UserRound size={18} />
              Un espacio para tu equipo
            </span>
          </div>
        </div>
        <small>VGM · Herramientas y soluciones</small>
        <div className="login-shape" aria-hidden="true" />
      </div>
      <div className="login-form-side">
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            onLogin(email, password, remember);
          }}
        >
          <div className="login-mini-brand">
            <Brand compact />
          </div>
          <span className="eyebrow">BIENVENIDO A VGM</span>
          <h2>Inicia sesión</h2>
          <p>Ingresa a tu espacio de trabajo.</p>
          <label>
            Correo electrónico
            <input
              name="username"
              autoComplete="username"
              type="email"
              placeholder="nombre@empresa.cl"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Contraseña
            <div className="password-field">
              <input
                name="password"
                autoComplete="current-password"
                type={show ? "text" : "password"}
                required
                placeholder="Tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          <label className="remember-login">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => {
                setRemember(e.target.checked);
                localStorage.setItem("vgm-remember", String(e.target.checked));
                if (!e.target.checked)
                  localStorage.removeItem("vgm-login-email");
              }}
            />
            <span>Recordar credenciales</span>
          </label>
          <button className="primary login-submit" disabled={busy}>
            {busy ? (
              <>
                <Spinner />
                Ingresando…
              </>
            ) : (
              <>
                Ingresar a VGM
                <ArrowRight size={17} />
              </>
            )}
          </button>
          {mode === "local" && (
            <div className="demo-box">
              <strong>Acceso de prueba local</strong>
              <p>Sin verificación por correo.</p>
              <code>admin@vgm.local · Vgm12345!</code>
              <button
                type="button"
                onClick={() => {
                  setEmail("admin@vgm.local");
                  setPassword("Vgm12345!");
                }}
              >
                Usar cuenta de prueba
              </button>
            </div>
          )}
          <p className="login-footnote">
            ¿Necesitas acceso? Solicita una cuenta al administrador.
          </p>
        </motion.form>
      </div>
    </div>
  );
}
export function ProfilePanel({
  profile,
  busy,
  cloud,
  onSave,
}: {
  profile: Profile;
  busy: boolean;
  cloud: boolean;
  onSave: (p: Profile) => void;
}) {
  const [form, setForm] = useState(profile);
  return (
    <section className="panel profile-panel">
      <div className="profile-cover" />
      <div className="profile-heading">
        <span className="large-avatar">
          {profile.name.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <h2>{profile.name}</h2>
          <p>{profile.role === "admin" ? "Admin" : "Usuario"} · VGM</p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}
      >
        <h3>Información personal</h3>
        <p>Estos datos identifican tus movimientos en el historial.</p>
        <div className="form-grid">
          {(
            [
              ["name", "Nombre completo", UserRound],
              ["email", "Correo electrónico", Mail],
              ["phone", "Teléfono", Phone],
              ["rut", "RUT", UserRound],
              ["position", "Cargo", Briefcase],
            ] as const
          ).map(([key, label, Icon]) => (
            <label key={key}>
              <span className="field-label">
                <Icon size={14} />
                {label}
              </span>
              <input
                type={
                  key === "email" ? "email" : key === "phone" ? "tel" : "text"
                }
                required={key === "name" || key === "email"}
                disabled={cloud && key === "email"}
                inputMode={key === "phone" ? "tel" : undefined}
                placeholder={
                  key === "phone"
                    ? "+56 9 4567 0987 / +56 2 2345 6789"
                    : key === "rut"
                      ? "12.345.678-5"
                      : undefined
                }
                value={formatContactField(key, form[key] ?? "")}
                onChange={(e) =>
                  setForm({
                    ...form,
                    [key]: formatContactField(key, e.target.value),
                  })
                }
              />
            </label>
          ))}
        </div>
        {cloud && (
          <small>
            El correo de Firebase se modifica en su consola de Authentication.
          </small>
        )}
        <button className="primary" disabled={busy}>
          {busy ? <Spinner /> : <ShieldCheck size={16} />}Guardar perfil
        </button>
      </form>
    </section>
  );
}
export function AdminPanel({
  users,
  roles,
  current,
  busy,
  onCreate,
  onAccess,
  onDelete,
  onEdit,
  cloud,
}: {
  roles: AccessRole[];
  cloud: boolean;
  onEdit: (id: string, profile: Profile) => Promise<boolean>;
  onDelete: (u: Profile) => Promise<boolean>;
  users: Profile[];
  current: Profile;
  busy: boolean;
  onCreate: (data: unknown) => Promise<boolean>;
  onAccess: (u: Profile, role: Profile["role"], active: boolean) => void;
}) {
  const [deletingUser, setDeletingUser] = useState<Profile | null>(null);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [open, setOpen] = useState(false),
    [form, setForm] = useState({
      name: "",
      email: "",
      phone: "",
      rut: "",
      position: "",
      password: "",
      role: "member" as Profile["role"],
    });
  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>
              Equipo VGM <span>{users.length}</span>
            </h2>
            <p>Administra las cuentas y el acceso a la plataforma.</p>
          </div>
          <button className="primary" onClick={() => setOpen(true)}>
            <Plus size={16} />
            Agregar usuario
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Acceso</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>
                      {u.name}
                      {u.id === current.id ? " (tú)" : ""}
                    </strong>
                    <small>{u.email}</small>
                    {u.rut && <small>RUT: {u.rut}</small>}
                  </td>
                  <td>
                    <span className="badge">
                      {u.roleName ??
                        roles.find((r) => r.id === u.role)?.name ??
                        u.role}
                    </span>
                  </td>
                  <td>
                    <span
                      className={"badge " + (u.active ? "Aceptada" : "Anulada")}
                    >
                      {u.active ? "Activo" : "Desactivado"}
                    </span>
                  </td>
                  <td>
                    <div className="inline-actions">
                      <button
                        className="danger"
                        disabled={busy || u.id === current.id}
                        onClick={() => setDeletingUser(u)}
                      >
                        Eliminar
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => setEditingUser({ ...u })}
                      >
                        Editar
                      </button>
                      <select
                        aria-label={"Rol de " + u.name}
                        value={u.role}
                        disabled={busy || u.id === current.id}
                        onChange={(e) =>
                          onAccess(
                            u,
                            e.target.value as Profile["role"],
                            u.active,
                          )
                        }
                      >
                        {roles
                          .filter((r) => !r.deleted)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                      <button
                        disabled={busy || u.id === current.id}
                        onClick={() => onAccess(u, u.role, !u.active)}
                      >
                        {u.active ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {deletingUser && (
        <ConfirmationDialog
          title="¿Eliminar usuario?"
          description={`Se enviará a ${deletingUser.name} a la papelera y se desactivará su acceso. Su historial se conservará y podrás recuperar su cuenta.`}
          busy={busy}
          onClose={() => setDeletingUser(null)}
          onConfirm={async () => {
            if (await onDelete(deletingUser)) setDeletingUser(null);
          }}
        />
      )}
      {editingUser && (
        <Modal
          title="Editar usuario"
          onClose={() => {
            if (!busy) setEditingUser(null);
          }}
        >
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await onEdit(editingUser.id, editingUser))
                setEditingUser(null);
            }}
          >
            <div className="form-grid">
              {(["name", "email", "phone", "rut", "position"] as const).map(
                (key) => (
                  <label key={key}>
                    {
                      {
                        name: "Nombre completo",
                        email: "Correo electrónico",
                        phone: "Teléfono",
                        rut: "RUT",
                        position: "Cargo",
                      }[key]
                    }
                    <input
                      type={
                        key === "email"
                          ? "email"
                          : key === "phone"
                            ? "tel"
                            : "text"
                      }
                      required={key === "name" || key === "email"}
                      disabled={busy || (cloud && key === "email")}
                      inputMode={key === "phone" ? "tel" : undefined}
                      placeholder={
                        key === "phone"
                          ? "+56 9 4567 0987 / +56 2 2345 6789"
                          : key === "rut"
                            ? "12.345.678-5"
                            : undefined
                      }
                      value={formatContactField(key, editingUser[key] ?? "")}
                      maxLength={
                        key === "phone" ? 30 : key === "email" ? 254 : 100
                      }
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          [key]: formatContactField(key, e.target.value),
                        })
                      }
                    />
                  </label>
                ),
              )}
            </div>
            {cloud && (
              <p className="hint">
                El correo de esta cuenta se administra en Firebase
                Authentication.
              </p>
            )}
            <p className="hint">
              Puedes cambiar el rol y activar o desactivar el acceso desde la
              lista de usuarios.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditingUser(null)}
              >
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                {busy && <Spinner />}Guardar cambios
              </button>
            </div>
          </form>
        </Modal>
      )}
      {open && (
        <Modal title="Agregar usuario" onClose={() => setOpen(false)}>
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await onCreate({
                  profile: {
                    name: form.name,
                    email: form.email,
                    phone: form.phone,
                    rut: form.rut,
                    position: form.position,
                  },
                  password: form.password,
                  role: form.role,
                })
              ) {
                setOpen(false);
                setForm({
                  name: "",
                  email: "",
                  phone: "",
                  rut: "",
                  position: "",
                  password: "",
                  role: "member",
                });
              }
            }}
          >
            <div className="form-grid">
              {(
                [
                  "name",
                  "email",
                  "phone",
                  "rut",
                  "position",
                  "password",
                ] as const
              ).map((key) => (
                <label key={key}>
                  {
                    {
                      name: "Nombre completo",
                      email: "Correo electrónico",
                      phone: "Teléfono",
                      rut: "RUT",
                      position: "Cargo",
                      password: "Contraseña inicial",
                    }[key]
                  }
                  <input
                    type={
                      key === "password"
                        ? "password"
                        : key === "email"
                          ? "email"
                          : key === "phone"
                            ? "tel"
                            : "text"
                    }
                    required={["name", "email", "password"].includes(key)}
                    minLength={key === "password" ? 8 : undefined}
                    inputMode={key === "phone" ? "tel" : undefined}
                    placeholder={
                      key === "phone"
                        ? "+56 9 4567 0987 / +56 2 2345 6789"
                        : key === "rut"
                          ? "12.345.678-5"
                          : undefined
                    }
                    value={formatContactField(key, form[key] ?? "")}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [key]: formatContactField(key, e.target.value),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <h3 className="spaced">Permisos</h3>
            <label>
              Rol del usuario
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {roles
                  .filter((r) => !r.deleted)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </label>
            <p className="hint">
              Configura las vistas y acciones de cada rol en Roles y permisos.
              No se envía correo de verificación.
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                {busy ? <Spinner /> : <Plus size={16} />}Crear usuario
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
