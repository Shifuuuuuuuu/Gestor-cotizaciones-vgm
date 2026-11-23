import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { cloud, list } from "./store";
import { jsonFile } from "./jsonFile";
import {
  profileSchema,
  customerSchema,
  cleanRut,
  formatRut,
  formatPhone,
  type Profile,
  type Customer,
} from "../shared/people";
type Account = Profile & { passwordHash?: string };
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verifyPassword(password: string, hash: string) {
  const [salt, value] = hash.split(":");
  if (!salt || !value) return false;
  const a = Buffer.from(value, "hex"),
    b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}
const publicProfile = (a: Account): Profile => {
  const { passwordHash: _, ...profile } = a;
  return {
    ...profile,
    rut: profile.rut ?? "",
    phone: formatPhone(profile.phone),
  };
};
const localUsers = jsonFile<Account[]>("users.json", () => [
  {
    id: randomUUID(),
    name: "Administrador VGM",
    email: "admin@vgm.local",
    phone: "",
    position: "Administración",
    role: "admin",
    active: true,
    createdAt: new Date().toISOString(),
    passwordHash: hashPassword(process.env.LOCAL_ADMIN_PASSWORD ?? "Vgm12345!"),
  },
]);
const customers = jsonFile<Customer[]>("customers.json", async () => {
  const map = new Map<string, Customer>();
  for (const d of (await list()).documents) {
    const key = cleanRut(d.rut) || d.client.toLowerCase();
    map.set(key, {
      id: randomUUID(),
      name: d.client,
      rut: formatRut(d.rut),
      email: d.email,
      address: d.address,
      phone: "",
      active: true,
      deleted: false,
      updatedAt: d.updatedAt,
    });
  }
  return [...map.values()];
});
export async function initializeUsers() {
  if (!cloud) {
    await localUsers.update(() => {});
    await customers.update(() => {});
  }
}
export async function listUsers() {
  return cloud
    ? (await getFirestore().collection("users").get()).docs.map((d) =>
        publicProfile(d.data() as Account),
      )
    : (await localUsers.read()).map(publicProfile);
}
export async function userById(id: string) {
  const account = cloud
    ? ((await getFirestore().doc(`users/${id}`).get()).data() as
        Account | undefined)
    : (await localUsers.read()).find((u) => u.id === id);
  return account ? publicProfile(account) : undefined;
}
export async function localLogin(email: string, password: string) {
  const account = (await localUsers.read()).find(
    (a) => a.email === email.toLowerCase() && a.active && !a.deleted,
  );
  if (!account || !verifyPassword(password, account.passwordHash ?? ""))
    throw new Error("Correo o contraseña incorrectos.");
  return publicProfile(account);
}
export async function firebaseUser(uid: string, email: string) {
  const found = await userById(uid);
  if (found) return found;
  const allowed = (process.env.ALLOWED_UIDS ?? "")
    .split(",")
    .map((v) => v.trim());
  if (!allowed.includes(uid)) throw new Error("Usuario sin acceso autorizado.");
  const profile: Profile = {
    id: uid,
    email,
    name: email.split("@")[0],
    phone: "",
    position: "",
    active: true,
    role: (process.env.ADMIN_UIDS || process.env.ALLOWED_UIDS || "")
      .split(",")
      .map((v) => v.trim())
      .includes(uid)
      ? "admin"
      : "member",
    createdAt: new Date().toISOString(),
  };
  await getFirestore().doc(`users/${uid}`).set(profile);
  return profile;
}
export async function saveProfile(id: string, input: unknown) {
  const data = profileSchema.parse(input);
  if (cloud) {
    const old = await userById(id);
    if (!old) throw new Error("Usuario inexistente");
    if (data.email !== old.email)
      throw new Error(
        "Para cambiar el correo de Firebase, usa Authentication en la consola.",
      );
    await getFirestore().doc(`users/${id}`).update(data);
    return { ...old, ...data };
  }
  return localUsers.update((users) => {
    const index = users.findIndex((u) => u.id === id);
    if (index < 0) throw new Error("Usuario inexistente");
    if (users.some((u) => u.id !== id && u.email === data.email))
      throw new Error("Ese correo ya está registrado.");
    users[index] = { ...users[index], ...data };
    return publicProfile(users[index]);
  });
}
export async function createUser(
  input: unknown,
  password: string,
  role: Profile["role"],
) {
  const data = profileSchema.parse(input);
  if (password.length < 8)
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  const make = (id: string): Profile => ({
    ...data,
    id,
    role,
    active: true,
    createdAt: new Date().toISOString(),
  });
  if (cloud) {
    const user = await getAuth().createUser({
      email: data.email,
      password,
      displayName: data.name,
      emailVerified: false,
    });
    const profile = make(user.uid);
    try {
      await getFirestore().doc(`users/${user.uid}`).set(profile);
    } catch (e) {
      await getAuth().deleteUser(user.uid);
      throw e;
    }
    return profile;
  }
  return localUsers.update((users) => {
    if (users.some((u) => u.email === data.email))
      throw new Error("Ese correo ya está registrado.");
    const profile = make(randomUUID());
    users.push({ ...profile, passwordHash: hashPassword(password) });
    return profile;
  });
}
export async function changeAccess(
  id: string,
  role: Profile["role"],
  active: boolean,
  actorId: string,
  deleted?: boolean,
) {
  if (id === actorId)
    throw new Error(
      "No puedes modificar tu propio acceso desde administración.",
    );
  if (cloud) {
    return getFirestore().runTransaction(async (t) => {
      const ref = getFirestore().doc(`users/${id}`),
        snap = await t.get(ref);
      if (!snap.exists) throw new Error("Usuario inexistente");
      if (snap.data()?.deleted && deleted === undefined)
        throw new Error("Recupera el usuario desde la papelera.");
      const admins = await t.get(
        getFirestore().collection("users").where("role", "==", "admin"),
      );
      if (
        snap.data()?.role === "admin" &&
        (!active || role !== "admin") &&
        admins.docs.filter((d) => d.data().active).length <= 1
      )
        throw new Error("Debe quedar al menos un administrador activo.");
      const patch = {
        role,
        active,
        ...(deleted === undefined
          ? {}
          : {
              deleted,
              ...(deleted
                ? { deletedAt: new Date().toISOString(), deletedBy: actorId }
                : {}),
            }),
      };
      t.update(ref, patch);
      return { ...snap.data(), ...patch };
    });
  }
  return localUsers.update((users) => {
    const user = users.find((u) => u.id === id);
    if (!user) throw new Error("Usuario inexistente");
    if (
      user.role === "admin" &&
      (!active || role !== "admin") &&
      users.filter((u) => u.role === "admin" && u.active).length <= 1
    )
      throw new Error("Debe quedar al menos un administrador activo.");
    if (user.deleted && deleted === undefined)
      throw new Error("Recupera el usuario desde la papelera.");
    if (deleted !== undefined) {
      user.deleted = deleted;
      if (deleted) {
        user.deletedAt = new Date().toISOString();
        user.deletedBy = actorId;
      }
    }
    user.role = role;
    user.active = active;
    return publicProfile(user);
  });
}
export async function listCustomers() {
  const result = cloud
    ? (await getFirestore().collection("customers").get()).docs.map(
        (d) => d.data() as Customer,
      )
    : await customers.read();
  return result.map((c) => ({
    ...c,
    active: c.active ?? true,
    deleted: c.deleted ?? false,
  }));
}
export async function saveCustomer(input: unknown, id?: string) {
  const data = customerSchema.parse(input);
  const rut = formatRut(data.rut),
    now = new Date().toISOString();
  const apply = (all: Customer[]) => {
    const existing = id
      ? all.find((c) => c.id === id)
      : all.find((c) =>
          rut
            ? cleanRut(c.rut) === cleanRut(rut)
            : !c.rut && c.name.toLowerCase() === data.name.toLowerCase(),
        );
    if (id && !existing) throw new Error("Cliente inexistente.");
    if (existing?.deleted)
      throw new Error(
        "Este cliente está eliminado. Recupéralo desde la papelera de Clientes.",
      );
    if (
      all.some(
        (c) =>
          c.id !== existing?.id && rut && cleanRut(c.rut) === cleanRut(rut),
      )
    )
      throw new Error("Ya existe un cliente con ese RUT.");
    return {
      ...data,
      rut,
      id: existing?.id ?? randomUUID(),
      updatedAt: now,
      active: existing?.active ?? true,
      deleted: false,
    };
  };
  if (cloud) {
    const db = getFirestore();
    return db.runTransaction(async (t) => {
      const all = await t.get(db.collection("customers"));
      const result = apply(all.docs.map((d) => d.data() as Customer));
      t.set(db.doc(`customers/${result.id}`), result);
      return result;
    });
  }
  return customers.update((all) => {
    const result = apply(all);
    const index = all.findIndex((c) => c.id === result.id);
    if (index < 0) all.push(result);
    else all[index] = result;
    return result;
  });
}
export async function customerAccess(
  id: string,
  active: boolean,
  deleted: boolean,
) {
  if (cloud) {
    const db = getFirestore();
    return db.runTransaction(async (t) => {
      const ref = db.doc(`customers/${id}`),
        snap = await t.get(ref);
      if (!snap.exists) throw new Error("Cliente inexistente.");
      const next = {
        ...snap.data(),
        active,
        deleted,
        updatedAt: new Date().toISOString(),
      };
      t.set(ref, next);
      return next;
    });
  }
  return customers.update((all) => {
    const client = all.find((c) => c.id === id);
    if (!client) throw new Error("Cliente inexistente.");
    Object.assign(client, {
      active,
      deleted,
      updatedAt: new Date().toISOString(),
    });
    return client;
  });
}
export async function assertCustomerAllowed(data: {
  client: string;
  rut: string;
}) {
  const match = (await listCustomers()).find((c) =>
    data.rut
      ? cleanRut(c.rut) === cleanRut(data.rut)
      : c.name.toLowerCase() === data.client.toLowerCase(),
  );
  if (match?.deleted)
    throw new Error(
      "El cliente está eliminado. Recupéralo antes de crear documentos.",
    );
  if (match && !match.active)
    throw new Error(
      "El cliente está bloqueado. Actívalo antes de crear documentos.",
    );
}
