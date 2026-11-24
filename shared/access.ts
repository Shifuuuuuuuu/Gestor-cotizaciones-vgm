import { z } from "zod";
export const actionLabels = {
  view: "Ver",
  create: "Crear / adjuntar",
  edit: "Editar",
  delete: "Eliminar / recuperar",
  approve: "Confirmar / cambiar estado",
  export: "Exportar / descargar",
  share: "Compartir con cliente",
} as const;
export type AccessAction = keyof typeof actionLabels;
export const accessModules = [
  { id: "dashboard", label: "Dashboard", actions: ["view"] },
  { id: "summary", label: "Resumen", actions: ["view"] },
  {
    id: "quotes",
    label: "Cotizaciones",
    actions: ["view", "create", "edit", "delete", "approve", "export", "share"],
  },
  {
    id: "invoices",
    label: "Facturas",
    actions: ["view", "create", "edit", "delete", "approve", "export", "share"],
  },
  {
    id: "products",
    label: "Productos e inventario",
    actions: ["view", "create", "edit", "delete", "export"],
  },
  {
    id: "customers",
    label: "Clientes",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    id: "orders",
    label: "Órdenes de compra",
    actions: ["view", "create", "edit", "delete", "approve", "export", "share"],
  },
  {
    id: "services",
    label: "Servicios y documentos",
    actions: ["view", "create", "edit", "delete", "approve", "export", "share"],
  },
  {
    id: "collections",
    label: "Cobranza y comprobantes",
    actions: ["view", "create", "edit", "delete", "approve", "export", "share"],
  },
  { id: "agenda", label: "Agenda", actions: ["view"] },
  {
    id: "portal",
    label: "Portal de clientes (gestión de enlaces: solo Admin)",
    actions: ["view"],
  },
  { id: "history", label: "Historial", actions: ["view"] },
  { id: "trash", label: "Papelera", actions: ["view"] },
  { id: "settings", label: "Configuración de apariencia", actions: ["view"] },
] as const;
export type AccessModule = (typeof accessModules)[number]["id"];
export type Permissions = Record<AccessModule, Record<AccessAction, boolean>>;
export function emptyPermissions(): Permissions {
  return Object.fromEntries(
    accessModules.map((module) => [
      module.id,
      Object.fromEntries(
        Object.keys(actionLabels).map((action) => [action, false]),
      ),
    ]),
  ) as Permissions;
}
export function fullPermissions(): Permissions {
  const result = emptyPermissions();
  for (const module of accessModules)
    for (const action of module.actions) result[module.id][action] = true;
  return result;
}
export function normalizePermissions(input: unknown): Permissions {
  const result = emptyPermissions();
  const value = input as Partial<Permissions> | null;
  for (const module of accessModules) {
    if (value?.[module.id]?.view !== true) continue;
    for (const action of module.actions)
      result[module.id][action] = value[module.id]?.[action] === true;
  }
  return result;
}
export function can(
  user: { role: string; permissions?: Permissions } | null | undefined,
  module: AccessModule,
  action: AccessAction = "view",
) {
  if (!user) return false;
  if (user.role === "admin") return true;
  // Legacy cached profiles keep the previous member experience until /me refreshes.
  const permissions =
    user.permissions ??
    (user.role === "member" ? fullPermissions() : emptyPermissions());
  return (
    permissions[module]?.view === true && permissions[module]?.[action] === true
  );
}
export const roleInputSchema = z.object({
  name: z.string().trim().min(2).max(70),
  description: z.string().trim().max(300).default(""),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())),
});
export type AccessRole = {
  id: string;
  name: string;
  description: string;
  permissions: Permissions;
  version: number;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
};
export type AccessEvent = {
  id: string;
  roleId: string;
  action: string;
  actor: string;
  at: string;
  before: AccessRole | null;
  after: AccessRole;
  reason: string;
};
export const pageModules: Record<string, AccessModule> = {
  Dashboard: "dashboard",
  Resumen: "summary",
  Cotizaciones: "quotes",
  Facturas: "invoices",
  Productos: "products",
  Clientes: "customers",
  "Órdenes de compra": "orders",
  Servicios: "services",
  Cobranza: "collections",
  Agenda: "agenda",
  "Portal de clientes": "portal",
  Historial: "history",
  Papelera: "trash",
  Configuración: "settings",
};
export const kindModules: Record<string, AccessModule> = {
  quote: "quotes",
  invoice: "invoices",
  order: "orders",
  job: "services",
  serviceDoc: "services",
  cost: "services",
  payment: "collections",
  paymentClaim: "collections",
  billing: "collections",
  portal: "portal",
};
