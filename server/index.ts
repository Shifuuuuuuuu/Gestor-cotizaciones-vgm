import "dotenv/config";
import { archiveProduct } from "./store";
import { businessRouter, portalRouter } from "./businessRoutes";
import { resolveProfile, listRoles, saveRole, archiveRole } from "./access";
import { authorizeApi, filterDocumentData } from "./authorization";
import {
  can,
  accessModules,
  actionLabels as permissionActionLabels,
} from "../shared/access";
import { lookupSre } from "./rutLookup";
import { cleanRut, validRut, formatRut } from "../shared/people";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { getAuth } from "firebase-admin/auth";
import { z } from "zod";
import { resolve } from "node:path";
import { createSession, readSession, revokeSession } from "./sessions";
import {
  cloud,
  list,
  mutate,
  saveProduct,
  productAccess,
  importProducts,
} from "./store";
import { saveImage, getImage } from "./images";
import {
  initializeUsers,
  localLogin,
  userById,
  firebaseUser,
  saveProfile,
  listUsers,
  createUser,
  changeAccess,
  listCustomers,
  saveCustomer,
  customerAccess,
  assertCustomerAllowed,
} from "./people";
import type { Profile } from "../shared/people";
import { inputSchema } from "../shared/model";
const app = express();
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: [
          "'self'",
          "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com",
        ],
        frameSrc: ["'self'", "https://*.firebaseapp.com"],
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use("/api", rateLimit({ windowMs: 60000, limit: 180 }));

const cookie = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};
const sessionId = (req: express.Request) =>
  req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("vgm_session="))
    ?.slice(12) ?? "";
app.get("/api/config", (_req, res) =>
  res.json({ mode: cloud ? "firebase" : "local" }),
);
app.post(
  "/api/login",
  rateLimit({ windowMs: 60000, limit: 15 }),
  async (req, res, next) => {
    try {
      if (cloud)
        return res.status(400).json({ error: "Inicia sesión con Firebase." });
      const { email, password } = z
        .object({ email: z.email(), password: z.string().min(1).max(200) })
        .parse(req.body);
      const user = await localLogin(email, password);
      const token = await createSession(user.id, cookie.maxAge, sessionId(req));
      res.cookie("vgm_session", token, cookie).json(user);
    } catch (e) {
      res.status(401).json({
        error:
          e instanceof z.ZodError
            ? "Ingresa tu correo y contraseña."
            : (e as Error).message,
      });
    }
  },
);
app.post("/api/logout", async (req, res, next) => {
  try {
    await revokeSession(sessionId(req));
    res.clearCookie("vgm_session", { path: "/" }).json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.use("/api/portal", portalRouter);
app.use("/api", async (req, res, next) => {
  try {
    let user: Profile | undefined;
    if (cloud) {
      const token = await getAuth().verifyIdToken(
        (req.headers.authorization ?? "").replace(/^Bearer /, ""),
        true,
      );
      user = await firebaseUser(token.uid, token.email ?? "");
    } else {
      const session = await readSession(sessionId(req));
      if (session && session.expires > Date.now())
        user = await userById(session.id);
    }
    if (!user?.active || user.deleted)
      return res.status(401).json({ error: "Inicia sesión para continuar." });
    res.locals.user = await resolveProfile(user);
    res.locals.actor = `${user.name} (${user.email})`;
    next();
  } catch {
    res.status(401).json({ error: "Inicia sesión con una cuenta autorizada." });
  }
});
app.use("/api", authorizeApi);
app.get("/api/roles", async (_req, res, next) => {
  try {
    res.json(await listRoles());
  } catch (e) {
    next(e);
  }
});
app.post("/api/roles", async (req, res, next) => {
  try {
    const body = z
      .object({
        action: z.enum(["save", "archive"]),
        id: z.string().max(100).optional(),
        version: z.number().int().positive().optional(),
        data: z.unknown().optional(),
        deleted: z.boolean().optional(),
      })
      .parse(req.body);
    res.json(
      body.action === "save"
        ? await saveRole(body.data, body.id, body.version, res.locals.actor)
        : await archiveRole(
            z.string().min(1).parse(body.id),
            z.number().int().positive().parse(body.version),
            z.boolean().parse(body.deleted),
            res.locals.actor,
            listUsers,
          ),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/access/check", (req, res) => {
  z.object({
    module: z.enum(accessModules.map((m) => m.id)),
    action: z.enum(
      Object.keys(permissionActionLabels) as [
        keyof typeof permissionActionLabels,
        ...(keyof typeof permissionActionLabels)[],
      ],
    ),
  }).parse(req.body);
  res.json({ ok: true });
});
app.use("/api", businessRouter);
app.get("/api/products", async (_req, res, next) => {
  try {
    const state = await list();
    res.json({
      products: state.products.filter(
        (p) => !p.deleted || can(res.locals.user, "trash"),
      ),
      movements: state.stockMovements,
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/products", async (req, res, next) => {
  try {
    const body = z
      .object({
        id: z.uuid().optional(),
        version: z.number().int().positive().optional(),
        data: z.unknown(),
        reason: z.string().max(500).optional(),
      })
      .parse(req.body);
    res.json(
      await saveProduct(
        body.data,
        res.locals.actor,
        body.id,
        body.version,
        body.reason,
      ),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/products/archive", async (req, res, next) => {
  try {
    const b = z
      .object({
        id: z.uuid(),
        version: z.number().int().positive(),
        archived: z.boolean(),
      })
      .parse(req.body);
    res.json(
      await archiveProduct(b.id, b.version, b.archived, res.locals.actor),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/products/access", async (req, res, next) => {
  try {
    const body = z
      .object({
        id: z.uuid(),
        version: z.number().int().positive(),
        deleted: z.boolean(),
      })
      .parse(req.body);
    res.json(
      await productAccess(
        body.id,
        body.version,
        body.deleted,
        res.locals.actor,
      ),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/products/import", async (req, res, next) => {
  try {
    const body = z
      .object({
        rows: z.array(z.unknown()).min(1).max(25),
        batchId: z.string().regex(/^[0-9a-f-]{36}-\d{1,3}$/),
      })
      .parse(req.body);
    res.json(await importProducts(body.rows, body.batchId, res.locals.actor));
  } catch (e) {
    next(e);
  }
});
app.post(
  "/api/images",
  express.raw({
    type: ["image/png", "image/jpeg", "image/webp"],
    limit: "400kb",
  }),
  async (req, res, next) => {
    try {
      res.json(await saveImage(req.body));
    } catch (e) {
      next(e);
    }
  },
);
app.get("/api/images/:id", async (req, res, next) => {
  try {
    const id = z.uuid().parse(req.params.id);
    const image = await getImage(id);
    res
      .set("Cache-Control", "private, max-age=3600")
      .type(image.mime)
      .send(image.data);
  } catch (e) {
    next(e);
  }
});
app.get("/api/me", (_req, res) => res.json(res.locals.user));
app.post("/api/me", async (req, res, next) => {
  try {
    res.json(
      await resolveProfile(await saveProfile(res.locals.user.id, req.body)),
    );
  } catch (e) {
    next(e);
  }
});
app.get("/api/data", async (_req, res, next) => {
  try {
    res.json(filterDocumentData(res.locals.user, await list()));
  } catch (e) {
    next(e);
  }
});
const command = z
  .object({
    requestId: z.uuid().optional(),
    action: z.enum([
      "save",
      "status",
      "delete",
      "restore",
      "version",
      "convert",
    ]),
    id: z.uuid().optional(),
    version: z.number().int().positive().optional(),
    data: z.any().optional(),
    status: z.string().max(30).optional(),
    reason: z.string().max(1000).optional(),
    eventId: z.uuid().optional(),
  })
  .refine((c) => c.action === "save" || !!c.id, "Falta documento");
app.post("/api/commands", async (req, res, next) => {
  try {
    const cmd = command.parse(req.body);
    if (cmd.action === "save") cmd.data = inputSchema.parse(cmd.data);
    if (cmd.action === "save" && !cmd.id) await assertCustomerAllowed(cmd.data);
    if (cmd.action === "convert") {
      const old = (await list()).documents.find((d) => d.id === cmd.id);
      if (old) await assertCustomerAllowed(old);
    }
    res.json(await mutate(cmd, res.locals.actor, res.locals.user.id));
  } catch (e) {
    next(e);
  }
});
app.post(
  "/api/rut/lookup",
  rateLimit({
    windowMs: 60000,
    limit: 20,
    keyGenerator: (_req, res) => res.locals.user.id,
    message: { error: "Espera un minuto antes de volver a consultar." },
  }),
  async (req, res, next) => {
    try {
      const { rut } = z.object({ rut: z.string().max(15) }).parse(req.body);
      if (!validRut(rut))
        throw new Error("Revisa el RUT y su dígito verificador.");
      const local = (await listCustomers()).find(
        (c) => cleanRut(c.rut) === cleanRut(rut),
      );
      if (local) {
        if (!local.active || local.deleted)
          return res.json({
            status: "blocked",
            source: "local",
            rut,
            message:
              "El cliente está bloqueado o eliminado. Revisa su registro en Clientes.",
          });
        return res.json({
          status: "found",
          source: "local",
          rut: formatRut(rut),
          name: local.name,
          address: local.address,
          email: local.email,
          phone: local.phone,
          message: "Cliente encontrado en tu directorio.",
        });
      }
      res.json(await lookupSre(rut));
    } catch (e) {
      next(e);
    }
  },
);
app.get("/api/customers", async (_req, res, next) => {
  try {
    res.json(
      (await listCustomers()).filter(
        (c) => !c.deleted || can(res.locals.user, "trash"),
      ),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/customers", async (req, res, next) => {
  try {
    const body = z
      .object({ id: z.uuid().optional(), data: z.unknown() })
      .parse(req.body);
    res.json(await saveCustomer(body.data, body.id));
  } catch (e) {
    next(e);
  }
});
app.post("/api/customers/access", async (req, res, next) => {
  try {
    const body = z
      .object({ id: z.uuid(), active: z.boolean(), deleted: z.boolean() })
      .parse(req.body);
    res.json(await customerAccess(body.id, body.active, body.deleted));
  } catch (e) {
    next(e);
  }
});
app.use("/api/users", (_req, res, next) => {
  if (res.locals.user.role !== "admin")
    return res
      .status(403)
      .json({ error: "Esta sección requiere un administrador." });
  next();
});
app.get("/api/users", async (_req, res, next) => {
  try {
    res.json(await Promise.all((await listUsers()).map(resolveProfile)));
  } catch (e) {
    next(e);
  }
});
app.post("/api/users", async (req, res, next) => {
  try {
    const body = z
      .object({
        profile: z.unknown(),
        password: z.string().min(8).max(200),
        role: z.string().min(1).max(100),
      })
      .parse(req.body);
    res.json(await createUser(body.profile, body.password, body.role));
  } catch (e) {
    next(e);
  }
});
app.post("/api/users/edit", async (req, res, next) => {
  try {
    const body = z
      .object({ id: z.string().min(1).max(128), profile: z.unknown() })
      .parse(req.body);
    res.json(await saveProfile(body.id, body.profile));
  } catch (e) {
    next(e);
  }
});
app.post("/api/users/trash", async (req, res, next) => {
  try {
    const b = z
      .object({ id: z.string().min(1).max(128), deleted: z.boolean() })
      .parse(req.body);
    const user = await userById(b.id);
    if (!user) throw new Error("Usuario inexistente");
    res.json(
      await changeAccess(b.id, user.role, false, res.locals.user.id, b.deleted),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/users/access", async (req, res, next) => {
  try {
    const body = z
      .object({
        id: z.string().min(1).max(128),
        role: z.string().min(1).max(100),
        active: z.boolean(),
      })
      .parse(req.body);
    res.json(
      await changeAccess(body.id, body.role, body.active, res.locals.user.id),
    );
  } catch (e) {
    next(e);
  }
});
app.get("/portal/:token", (_req, res) => {
  res
    .set("Referrer-Policy", "no-referrer")
    .sendFile(resolve("dist/index.html"));
});
app.use(express.static(resolve("dist")));
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err.message);
    res
      .status(
        (err as Error & { status?: number }).status ??
          (err.message.startsWith("CONFLICT") ? 409 : 400),
      )
      .json({
        error:
          err instanceof z.ZodError
            ? err.issues.map((i) => i.message).join("; ")
            : err.message,
      });
  },
);
if (!cloud && process.env.NODE_ENV === "production")
  throw new Error("Producción requiere STORAGE_MODE=firebase.");
await initializeUsers();
const server = app.listen(
  Number(process.env.PORT ?? 3001),
  cloud ? "0.0.0.0" : "127.0.0.1",
);
server.on("listening", () =>
  console.log(
    `VGM · ${cloud ? "Firebase" : "local"} · puerto ${process.env.PORT ?? 3001}`,
  ),
);
server.on("error", (error) => {
  console.error("No se pudo iniciar la API de VGM:", error.message);
  process.exit(1);
});
