import express from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { businessSnapshot, list, mutate } from "./store";
import {
  saveBusiness,
  archiveBusiness,
  createPortal,
  portalIdentity,
  clientRecords,
  publicRecord,
  shareBusinessFile,
} from "./business";
import { uploadBusinessFile, downloadBusinessFile } from "./businessFiles";
import {
  businessSchemas,
  type BusinessKind,
  type BusinessRecord,
} from "../shared/business";
import { cleanRut } from "../shared/people";
import { sendBusinessBackup } from "./businessBackup";
import { filterBusinessData } from "./authorization";
import { getImage } from "./images";

const wrap =
  (
    fn: (req: express.Request, res: express.Response) => Promise<unknown>,
  ): express.RequestHandler =>
  (req, res, next) => {
    void fn(req, res).catch(next);
  };
const fileBody = express.raw({
  type: "application/octet-stream",
  limit: "5mb",
});
function sendFile(
  res: express.Response,
  record: BusinessRecord,
  bytes: Buffer,
) {
  if (record.kind !== "file") throw new Error("Archivo no disponible.");
  res
    .set({
      "Content-Type": record.data.mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(record.data.name)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    })
    .send(bytes);
}
export const businessRouter = express.Router();
businessRouter.get(
  "/business/backup",
  wrap(async (_req, res) => {
    if (res.locals.user.role !== "admin")
      return res.status(403).json({
        error: "Solo un administrador puede descargar el respaldo completo.",
      });
    await sendBusinessBackup(res);
  }),
);
businessRouter.get(
  "/business",
  wrap(async (_req, res) => {
    const state = filterBusinessData(
      res.locals.user,
      await businessSnapshot(),
      (await list()).documents,
    );
    res.json({
      ...state,
      records: state.records.map(publicRecord),
      events: state.events.map((e) => ({
        ...e,
        before: e.before ? publicRecord(e.before) : null,
        after: publicRecord(e.after),
      })),
    });
  }),
);
businessRouter.post(
  "/business",
  wrap(async (req, res) => {
    const body = z
      .object({
        action: z.enum(["save", "archive", "portal", "share"]),
        kind: z
          .enum(
            Object.keys(businessSchemas) as [BusinessKind, ...BusinessKind[]],
          )
          .optional(),
        data: z.unknown().optional(),
        id: z.uuid().optional(),
        version: z.number().int().positive().optional(),
        createId: z.uuid().optional(),
        deleted: z.boolean().optional(),
        visible: z.boolean().optional(),
        reason: z.string().max(1000).optional(),
        customerId: z.uuid().optional(),
        days: z.number().int().min(1).max(30).optional(),
      })
      .parse(req.body);
    if (body.action === "share")
      return res.json(
        await shareBusinessFile(
          z.uuid().parse(body.id),
          z.number().int().positive().parse(body.version),
          z.boolean().parse(body.visible),
          res.locals.actor,
        ),
      );
    if (body.action === "portal") {
      if (res.locals.user.role !== "admin")
        return res.status(403).json({
          error: "Solo un administrador puede generar enlaces de clientes.",
        });
      return res.json(
        await createPortal(
          z.uuid().parse(body.customerId),
          body.days ?? 7,
          res.locals.actor,
        ),
      );
    }
    if (body.action === "archive") {
      const existing = (await businessSnapshot()).records.find(
        (r) => r.id === body.id,
      );
      if (existing?.kind === "portal" && res.locals.user.role !== "admin")
        return res
          .status(403)
          .json({ error: "Solo un administrador puede revocar enlaces." });
      return res.json(
        publicRecord(
          await archiveBusiness(
            z.uuid().parse(body.id),
            z.number().int().positive().parse(body.version),
            z.boolean().parse(body.deleted),
            body.reason ?? "",
            res.locals.actor,
          ),
        ),
      );
    }
    if (!body.kind) throw new Error("Selecciona un tipo de registro.");
    res.json(
      publicRecord(
        await saveBusiness({
          ...body,
          data: body.data,
          kind: body.kind,
          actor: res.locals.actor,
        }),
      ),
    );
  }),
);
businessRouter.post(
  "/business/files/:id",
  fileBody,
  wrap(async (req, res) => {
    const name = decodeURIComponent(req.get("X-File-Name") ?? "archivo");
    res.json(
      await uploadBusinessFile(
        z.uuid().parse(req.params.id),
        name,
        req.body,
        req.get("X-Share-Client") === "true",
        res.locals.actor,
      ),
    );
  }),
);
businessRouter.get(
  "/business/files/:id",
  wrap(async (req, res) => {
    const record = (await businessSnapshot()).records.find(
      (r) => r.id === req.params.id,
    );
    if (!record || record.kind !== "file" || record.deleted)
      return res.status(404).json({ error: "Archivo no disponible." });
    sendFile(res, record, await downloadBusinessFile(record));
  }),
);

export const portalRouter = express.Router();
portalRouter.use(rateLimit({ windowMs: 60000, limit: 90 }));
portalRouter.use((_req, res, next) => {
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  next();
});
async function portalContext(token: unknown) {
  const identity = await portalIdentity(z.string().parse(token));
  const documents = (await list()).documents.filter(
    (d) =>
      !d.deleted &&
      d.status !== "Borrador" &&
      cleanRut(d.rut) &&
      cleanRut(d.rut) === cleanRut(identity.customer.rut),
  );
  return { ...identity, documents };
}
portalRouter.get(
  "/:token",
  wrap(async (req, res) => {
    const context = await portalContext(req.params.token);
    res.json({
      customer: {
        id: context.customer.id,
        name: context.customer.name,
        rut: context.customer.rut,
      },
      expiresAt: context.portal.data.expiresAt,
      documents: context.documents,
      records: clientRecords(
        context.state,
        context.customer.id,
        context.documents,
      ),
    });
  }),
);
portalRouter.get(
  "/:token/images/:id",
  wrap(async (req, res) => {
    const { documents } = await portalContext(req.params.token);
    const id = z.uuid().parse(req.params.id);
    if (
      !documents.some((d) =>
        d.items.some((item) => item.imageUrl === "/api/images/" + id),
      )
    )
      return res
        .status(404)
        .json({ error: "Imagen no disponible para este cliente." });
    const image = await getImage(id);
    res.type(image.mime).send(image.data);
  }),
);
portalRouter.post(
  "/:token/orders",
  wrap(async (req, res) => {
    const { customer } = await portalContext(req.params.token);
    const body = z
      .object({ createId: z.uuid(), data: z.unknown() })
      .parse(req.body);
    const data = businessSchemas.order.parse({
      ...(body.data as object),
      customerId: customer.id,
      status: "Recibida",
    });
    res.json(
      await saveBusiness({
        kind: "order",
        data,
        createId: body.createId,
        actor: "Cliente: " + customer.name,
      }),
    );
  }),
);
portalRouter.post(
  "/:token/payments",
  wrap(async (req, res) => {
    const { customer } = await portalContext(req.params.token);
    const body = z
      .object({ createId: z.uuid(), data: z.unknown() })
      .parse(req.body);
    const data = businessSchemas.paymentClaim.parse({
      ...(body.data as object),
      customerId: customer.id,
      status: "En revisión",
    });
    res.json(
      await saveBusiness({
        kind: "paymentClaim",
        data,
        createId: body.createId,
        actor: "Cliente: " + customer.name,
      }),
    );
  }),
);
portalRouter.post(
  "/:token/accept",
  wrap(async (req, res) => {
    const { customer, documents } = await portalContext(req.params.token);
    const body = z
      .object({
        id: z.uuid(),
        version: z.number().int().positive(),
        signer: z.string().trim().min(2).max(160),
      })
      .parse(req.body);
    const quote = documents.find(
      (d) => d.id === body.id && d.kind === "quote" && d.status === "Enviada",
    );
    if (!quote)
      throw new Error("No hay una cotización enviada disponible para aceptar.");
    if (
      quote.due <
      new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago" }).format(
        new Date(),
      )
    )
      throw new Error(
        "La cotización venció. Solicita a VGM una versión actualizada.",
      );
    res.json(
      await mutate(
        {
          action: "status",
          id: quote.id,
          version: body.version,
          status: "Aceptada",
        },
        "Aceptada por " + body.signer + " / Cliente: " + customer.name,
      ),
    );
  }),
);
portalRouter.post(
  "/:token/receive",
  wrap(async (req, res) => {
    const { customer, state } = await portalContext(req.params.token);
    const body = z
      .object({
        jobId: z.uuid(),
        version: z.number().int().positive(),
        signer: z.string().trim().min(2).max(160),
        notes: z.string().max(6000).default(""),
        createId: z.uuid(),
      })
      .parse(req.body);
    const job = state.records.find(
      (r) =>
        r.id === body.jobId &&
        r.kind === "job" &&
        !r.deleted &&
        r.customerId === customer.id,
    );
    if (!job || job.kind !== "job" || job.data.status !== "Por recibir")
      throw new Error(
        "El servicio no está disponible para recepción conforme.",
      );
    const data = businessSchemas.serviceDoc.parse({
      jobId: body.jobId,
      category: "acceptance",
      title: "Recepción conforme del cliente",
      date: new Date().toISOString().slice(0, 10),
      content: body.notes,
      signer: body.signer,
      amount: 0,
      acceptedVersion: body.version,
      visibleToClient: true,
    });
    res.json(
      await saveBusiness({
        kind: "serviceDoc",
        data,
        createId: body.createId,
        actor: "Recepción por cliente: " + body.signer + " / " + customer.name,
      }),
    );
  }),
);
portalRouter.post(
  "/:token/files/:id",
  fileBody,
  wrap(async (req, res) => {
    const { customer, state, documents } = await portalContext(
      req.params.token,
    );
    const id = z.uuid().parse(req.params.id);
    const allowed =
      state.records.some(
        (r) =>
          r.id === id &&
          !r.deleted &&
          r.customerId === customer.id &&
          ["order", "job", "paymentClaim"].includes(r.kind),
      ) || documents.some((d) => d.id === id && d.kind === "invoice");
    if (!allowed)
      throw new Error("No puedes adjuntar archivos a ese registro.");
    res.json(
      await uploadBusinessFile(
        id,
        decodeURIComponent(req.get("X-File-Name") ?? "archivo"),
        req.body,
        true,
        "Cliente: " + customer.name,
        customer.id,
      ),
    );
  }),
);
portalRouter.get(
  "/:token/files/:id",
  wrap(async (req, res) => {
    const { state, customer, documents } = await portalContext(
      req.params.token,
    );
    const record = clientRecords(state, customer.id, documents).find(
      (r) => r.id === req.params.id && r.kind === "file",
    );
    if (!record)
      return res.status(404).json({ error: "Archivo no disponible." });
    sendFile(res, record, await downloadBusinessFile(record));
  }),
);
