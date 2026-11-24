import type { Request, Response, NextFunction } from "express";
import { can, kindModules, type AccessModule } from "../shared/access";
import type { Profile } from "../shared/people";
import type { Doc } from "../shared/model";
import type { BusinessRecord, BusinessState } from "../shared/business";
import { list, businessSnapshot } from "./store";
import { requirePermission } from "./access";
export function filterDocumentData<
  T extends {
    documents: Doc[];
    events: any[];
    products: any[];
    stockMovements: any[];
  },
>(user: Profile, state: T): T {
  const trash = can(user, "trash");
  const documents = state.documents.filter(
    (d) =>
      can(user, d.kind === "quote" ? "quotes" : "invoices") &&
      (!d.deleted || trash),
  );
  const ids = new Set(documents.map((d) => d.id));
  return {
    ...state,
    documents,
    events: can(user, "history")
      ? state.events.filter((e) => ids.has(e.documentId))
      : [],
    products: can(user, "products")
      ? state.products.filter((p) => !p.deleted || trash)
      : [],
    stockMovements: can(user, "products") ? state.stockMovements : [],
  };
}
export function resourceModule(
  id: string,
  state: BusinessState,
  docs: Doc[],
  user?: Profile,
  seen = new Set<string>(),
): AccessModule {
  if (seen.has(id)) throw new Error("Referencia de archivo inválida.");
  seen.add(id);
  const record = state.records.find((r) => r.id === id);
  if (record) {
    if (user && record.deleted) requirePermission(user, "trash");
    if (record.kind === "file")
      return resourceModule(record.data.parentId, state, docs, user, seen);
    return kindModules[record.kind];
  }
  const doc = docs.find((d) => d.id === id);
  if (!doc) throw new Error("Registro no disponible.");
  if (user && doc.deleted) requirePermission(user, "trash");
  return doc.kind === "quote" ? "quotes" : "invoices";
}
export function filterBusinessData(
  user: Profile,
  state: BusinessState,
  docs: Doc[],
): BusinessState {
  const records = state.records.filter((record) => {
    if (record.deleted && !can(user, "trash")) return false;
    try {
      return can(user, resourceModule(record.id, state, docs, user));
    } catch {
      return false;
    }
  });
  const ids = new Set(records.map((r) => r.id));
  return {
    records,
    events: can(user, "history")
      ? state.events.filter((e) => ids.has(e.recordId))
      : [],
    counters: {},
  };
}
function admin(user: Profile) {
  if (user.role !== "admin") {
    const error = new Error(
      "Solo un administrador puede gestionar usuarios, roles o accesos de clientes.",
    ) as Error & { status: number };
    error.status = 403;
    throw error;
  }
}
export async function authorizeApi(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = res.locals.user as Profile,
      path = req.path,
      body = req.body ?? {};
    if (path === "/me" || path === "/data") return next();
    if (path.startsWith("/roles") || path.startsWith("/users")) {
      admin(user);
      return next();
    }
    if (path === "/access/check") {
      requirePermission(user, body.module, body.action);
      return next();
    }
    if (path === "/products" && req.method === "GET")
      requirePermission(user, "products");
    if (path.startsWith("/products") && req.method === "POST")
      requirePermission(
        user,
        "products",
        path.endsWith("/access")
          ? "delete"
          : path.endsWith("/archive")
            ? "edit"
            : path.endsWith("/import")
              ? "create"
              : body.id
                ? "edit"
                : "create",
      );
    if (path === "/products/access" && body.deleted === false)
      requirePermission(user, "trash");
    if (path === "/customers" && req.method === "GET")
      requirePermission(user, "customers");
    if (path === "/customers/access") {
      requirePermission(user, "customers", body.deleted ? "delete" : "edit");
      if (body.deleted === false) {
        const { listCustomers } = await import("./people");
        if ((await listCustomers()).find((c) => c.id === body.id)?.deleted) {
          requirePermission(user, "trash");
          requirePermission(user, "customers", "delete");
        }
      }
    }
    if (path === "/customers" && req.method === "POST") {
      const { listCustomers } = await import("./people");
      const { cleanRut } = await import("../shared/people");
      const data = body.data ?? {};
      const exists = (await listCustomers()).some((c) =>
        body.id
          ? c.id === body.id
          : data.rut
            ? cleanRut(c.rut) === cleanRut(String(data.rut))
            : !c.rut &&
              c.name.toLowerCase() === String(data.name ?? "").toLowerCase(),
      );
      requirePermission(user, "customers", exists ? "edit" : "create");
    }
    if (path === "/rut/lookup") requirePermission(user, "customers");
    if (
      path === "/images" &&
      req.method === "POST" &&
      !can(user, "products", "create")
    )
      requirePermission(user, "products", "edit");
    if (
      path.startsWith("/images/") &&
      req.method === "GET" &&
      !can(user, "products")
    ) {
      const image = "/api" + path;
      const data = filterDocumentData(user, await list());
      if (
        !data.documents.some((d) =>
          d.items.some((item) => item.imageUrl === image),
        )
      )
        requirePermission(user, "products");
    }
    if (path === "/commands" && req.method === "POST") {
      const state = await list(),
        old = state.documents.find((d) => d.id === body.id);
      const kind = old?.kind ?? body.data?.kind;
      const module = kind === "invoice" ? "invoices" : "quotes";
      const action =
        body.action === "save"
          ? body.id
            ? "edit"
            : "create"
          : body.action === "delete" || body.action === "restore"
            ? "delete"
            : body.action === "version"
              ? "edit"
              : "approve";
      requirePermission(user, module, action);
      if (body.action === "restore") requirePermission(user, "trash");
      if (body.action === "version") requirePermission(user, "history");
      if (body.action === "convert")
        requirePermission(user, "invoices", "create");
      if (body.action === "status" && body.status === "Pagada")
        requirePermission(user, "collections", "approve");
      if (
        body.action === "save" &&
        !can(user, "products") &&
        Array.isArray(body.data?.items) &&
        body.data.items.some(
          (i: any) =>
            i.productId &&
            !old?.items.some((item) => item.productId === i.productId),
        )
      )
        requirePermission(user, "products");
    }
    if (path === "/business/backup") admin(user);
    if (path.startsWith("/business/files/")) {
      const state = await businessSnapshot(),
        docs = (await list()).documents,
        id = path.split("/").at(-1)!;
      const module = resourceModule(id, state, docs, user);
      requirePermission(
        user,
        module,
        req.method === "POST" ? "create" : "export",
      );
      if (req.method === "POST" && req.get("X-Share-Client") === "true")
        requirePermission(user, module, "share");
    }
    if (path === "/business" && req.method === "POST") {
      if (body.action === "portal") {
        admin(user);
        return next();
      }
      const state = await businessSnapshot(),
        docs = (await list()).documents;
      const old = body.id
        ? state.records.find((r) => r.id === body.id)
        : undefined;
      if (old?.kind === "portal") {
        admin(user);
        return next();
      }
      const kind = old?.kind ?? body.kind,
        module =
          kind === "file"
            ? resourceModule(old?.id ?? "", state, docs, user)
            : kindModules[kind];
      if (!module) throw new Error("Tipo de operación inválido.");
      requirePermission(
        user,
        module,
        body.action === "archive"
          ? "delete"
          : body.action === "share"
            ? "share"
            : body.id
              ? "edit"
              : "create",
      );
      if (body.action === "archive" && body.deleted === false)
        requirePermission(user, "trash");
      const data = body.data ?? {};
      if (kind === "payment") requirePermission(user, "collections", "approve");
      if (body.action === "save") {
        for (const [key, scope] of [
          ["quoteId", "quotes"],
          ["invoiceId", "invoices"],
          ["orderId", "orders"],
          ["jobId", "services"],
        ] as const)
          if (data[key]) requirePermission(user, scope);
        const initial: Record<string, string> = {
          order: "Recibida",
          job: "Borrador",
          paymentClaim: "En revisión",
        };
        if (
          data.status &&
          initial[kind] &&
          data.status !== (old ? (old.data as any).status : initial[kind])
        )
          requirePermission(user, module, "approve");
        if (kind === "serviceDoc" && data.category === "acceptance")
          requirePermission(user, "services", "approve");
        if (
          typeof data.visibleToClient === "boolean" &&
          data.visibleToClient !==
            (old ? (old.data as any).visibleToClient : false)
        )
          requirePermission(user, module, "share");
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}
