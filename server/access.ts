import { randomUUID } from "node:crypto";
import { getFirestore, type Transaction } from "firebase-admin/firestore";
import { cloud } from "./store";
import { jsonFile } from "./jsonFile";
import {
  fullPermissions,
  emptyPermissions,
  normalizePermissions,
  roleInputSchema,
  can,
  type AccessRole,
  type AccessEvent,
  type AccessModule,
  type AccessAction,
} from "../shared/access";
import type { Profile } from "../shared/people";
const initialRole = (): AccessRole => ({
  id: "member",
  name: "Usuario",
  description: "Rol inicial compatible con los usuarios existentes.",
  permissions: fullPermissions(),
  version: 1,
  deleted: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
const adminRole = (): AccessRole => ({
  id: "admin",
  name: "Admin",
  description:
    "Rol protegido con acceso completo y administración de seguridad.",
  permissions: fullPermissions(),
  version: 1,
  deleted: false,
  createdAt: "1970-01-01T00:00:00.000Z",
  updatedAt: "1970-01-01T00:00:00.000Z",
});
const local = jsonFile<{ roles: AccessRole[]; events: AccessEvent[] }>(
  "roles.json",
  () => ({ roles: [initialRole()], events: [] }),
);
let queue: Promise<unknown> = Promise.resolve();
export async function withAccessLock<T>(work: () => Promise<T>): Promise<T> {
  if (cloud) return work();
  const task = queue.then(work);
  queue = task.catch(() => {});
  return task;
}
export async function initializeAccess() {
  if (!cloud) {
    await local.update(() => {});
    return;
  }
  const db = getFirestore();
  await db.runTransaction(async (t) => {
    const ref = db.doc("roles/member"),
      snap = await t.get(ref);
    if (!snap.exists) t.create(ref, initialRole());
  });
}
export async function listRoles() {
  const state = cloud
    ? {
        roles: (await getFirestore().collection("roles").get()).docs.map(
          (d) => d.data() as AccessRole,
        ),
        events: (
          await getFirestore()
            .collection("accessEvents")
            .orderBy("at", "desc")
            .limit(100)
            .get()
        ).docs.map((d) => d.data() as AccessEvent),
      }
    : await local.read();
  return {
    roles: [
      adminRole(),
      ...state.roles
        .filter((r) => r.id !== "admin")
        .map((r) => ({
          ...r,
          permissions: normalizePermissions(r.permissions),
        })),
    ],
    events: state.events.slice(-100),
  };
}
export async function findRole(id: string) {
  if (id === "admin") return adminRole();
  if (!cloud)
    return (await local.read()).roles.find((r) => r.id === id && !r.deleted);
  const value = (
    await getFirestore()
      .doc("roles/" + id)
      .get()
  ).data() as AccessRole | undefined;
  return value && !value.deleted ? value : undefined;
}
export async function requireRole(id: string) {
  if (!/^(admin|member|[0-9a-f-]{36})$/.test(id))
    throw new Error("Rol inválido.");
  const role = await findRole(id);
  if (!role) throw new Error("El rol no existe o fue eliminado.");
  return role;
}
export async function resolveProfile(user: Profile): Promise<Profile> {
  const role = await findRole(user.role);
  return {
    ...user,
    roleName: role?.name ?? "Rol no disponible",
    permissions:
      user.role === "admin"
        ? fullPermissions()
        : role
          ? normalizePermissions(role.permissions)
          : emptyPermissions(),
    permissionsVersion: role
      ? role.id + ":" + role.version + ":" + role.updatedAt
      : "missing:" + user.role,
  };
}
export function requirePermission(
  user: Profile,
  module: AccessModule,
  action: AccessAction = "view",
) {
  if (!can(user, module, action)) {
    const error = new Error(
      "No tienes permiso para esta acción en esta sección.",
    ) as Error & { status: number };
    error.status = 403;
    throw error;
  }
}
export async function readRoleForTransaction(t: Transaction, id: string) {
  const db = getFirestore(),
    lock = db.doc("metadata/access-lock"),
    generation = await t.get(lock);
  if (id !== "admin") {
    const role = await t.get(db.doc("roles/" + id));
    if (!role.exists || role.data()?.deleted)
      throw new Error("El rol no existe o fue eliminado.");
  }
  return { lock, generation: (generation.data()?.version ?? 0) + 1 };
}
export async function saveRole(
  input: unknown,
  id: string | undefined,
  version: number | undefined,
  actor: string,
) {
  const parsed = roleInputSchema.parse(input);
  const data = {
    ...parsed,
    permissions: normalizePermissions(parsed.permissions),
  };
  if (id === "admin")
    throw new Error("El rol Admin es protegido y no se modifica.");
  return withAccessLock(async () => {
    const apply = (roles: AccessRole[]) => {
      const old = id ? roles.find((r) => r.id === id) : null;
      if (id && !old) throw new Error("Rol inexistente.");
      if (old?.deleted) throw new Error("Recupera primero el rol.");
      if (old && old.version !== version)
        throw new Error("CONFLICT: El rol cambió. Recarga antes de guardar.");
      if (
        roles.some(
          (r) =>
            r.id !== id &&
            !r.deleted &&
            r.name.toLocaleLowerCase("es") ===
              data.name.toLocaleLowerCase("es"),
        ) ||
        data.name.toLowerCase() === "admin"
      )
        throw new Error("Ya existe un rol con ese nombre.");
      const now = new Date().toISOString(),
        after: AccessRole = {
          ...data,
          id: old?.id ?? randomUUID(),
          version: (old?.version ?? 0) + 1,
          deleted: false,
          createdAt: old?.createdAt ?? now,
          updatedAt: now,
        };
      const event: AccessEvent = {
        id: randomUUID(),
        roleId: after.id,
        action: old ? "edit" : "create",
        actor,
        at: now,
        before: old ?? null,
        after,
        reason: "",
      };
      return { old, after, event };
    };
    if (!cloud)
      return local.update((state) => {
        const { after, event } = apply(state.roles);
        state.roles = state.roles
          .filter((r) => r.id !== after.id)
          .concat(after);
        state.events.push(event);
        return after;
      });
    const db = getFirestore();
    return db.runTransaction(async (t) => {
      const lock = db.doc("metadata/access-lock"),
        generation = await t.get(lock),
        all = await t.get(db.collection("roles"));
      const { after, event } = apply(
        all.docs.map((d) => d.data() as AccessRole),
      );
      t.set(db.doc("roles/" + after.id), after);
      t.create(db.doc("accessEvents/" + event.id), event);
      t.set(lock, { version: (generation.data()?.version ?? 0) + 1 });
      return after;
    });
  });
}
export async function archiveRole(
  id: string,
  version: number,
  deleted: boolean,
  actor: string,
  users: () => Promise<Profile[]>,
) {
  if (id === "admin" || id === "member")
    throw new Error("Los roles iniciales Admin y Usuario no se eliminan.");
  return withAccessLock(async () => {
    const apply = (old: AccessRole | undefined, assigned: Profile[]) => {
      if (!old) throw new Error("Rol inexistente.");
      if (old.version !== version)
        throw new Error("CONFLICT: El rol cambió. Recarga antes de continuar.");
      if (old.deleted === deleted)
        throw new Error("El rol ya tiene ese estado.");
      if (deleted && assigned.some((u) => u.role === id))
        throw new Error(
          "Reasigna primero todos los usuarios de este rol, incluidos los desactivados o eliminados.",
        );
      const after = {
        ...old,
        deleted,
        version: old.version + 1,
        updatedAt: new Date().toISOString(),
      };
      return {
        after,
        event: {
          id: randomUUID(),
          roleId: id,
          action: deleted ? "delete" : "restore",
          actor,
          at: after.updatedAt,
          before: old,
          after,
          reason: "",
        } as AccessEvent,
      };
    };
    if (!cloud) {
      const assigned = await users();
      return local.update((state) => {
        const { after, event } = apply(
          state.roles.find((r) => r.id === id),
          assigned,
        );
        if (
          !deleted &&
          state.roles.some(
            (r) =>
              r.id !== id &&
              !r.deleted &&
              r.name.toLowerCase() === after.name.toLowerCase(),
          )
        )
          throw new Error("Ya hay otro rol activo con ese nombre.");
        state.roles = state.roles.map((r) => (r.id === id ? after : r));
        state.events.push(event);
        return after;
      });
    }
    const db = getFirestore();
    return db.runTransaction(async (t) => {
      const lock = db.doc("metadata/access-lock"),
        generation = await t.get(lock),
        roles = await t.get(db.collection("roles")),
        assigned = await t.get(db.collection("users").where("role", "==", id));
      const { after, event } = apply(
        roles.docs.find((d) => d.id === id)?.data() as AccessRole | undefined,
        assigned.docs.map((d) => d.data() as Profile),
      );
      if (
        !deleted &&
        roles.docs.some(
          (d) =>
            d.id !== id &&
            !d.data().deleted &&
            d.data().name.toLowerCase() === after.name.toLowerCase(),
        )
      )
        throw new Error("Ya hay otro rol activo con ese nombre.");
      t.set(db.doc("roles/" + id), after);
      t.create(db.doc("accessEvents/" + event.id), event);
      t.set(lock, { version: (generation.data()?.version ?? 0) + 1 });
      return after;
    });
  });
}
