import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { blank, type Doc } from "../shared/model";
import {
  businessTotals,
  shiftMonths,
  type BusinessState,
  type BusinessRecord,
} from "../shared/business";

test(
  "Operación comercial: OC, pagos concurrentes, adjuntos, servicios y portal aislado",
  { timeout: 60000 },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), "vgm-business-"));
    const port = 44000 + Math.floor(Math.random() * 1000),
      base = `http://127.0.0.1:${port}/api/`;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "server/index.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATA_DIR: folder,
          PORT: String(port),
          STORAGE_MODE: "local",
          NODE_ENV: "test",
          LOCAL_ADMIN_PASSWORD: "Vgm12345!",
        },
        stdio: "pipe",
      },
    );
    let logs = "",
      cookie = "";
    child.stdout.on("data", (d) => (logs += d));
    child.stderr.on("data", (d) => (logs += d));
    const req = (path: string, body?: unknown, auth = true) =>
      fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Cookie: cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const ok = async (path: string, body?: unknown, auth = true) => {
      const r = await req(path, body, auth);
      const data = await r.json();
      assert.equal(r.ok, true, JSON.stringify(data));
      return data;
    };
    const save = async (
      kind: string,
      data: unknown,
      id?: string,
      version?: number,
      createId = randomUUID(),
    ) => ok("business", { action: "save", kind, data, id, version, createId });
    try {
      let started = false;
      for (let i = 0; i < 120; i++) {
        try {
          if ((await req("config")).ok) {
            started = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(started, logs);
      assert.equal((await req("business", undefined, false)).status, 401);
      const login = await req(
        "login",
        { email: "admin@vgm.local", password: "Vgm12345!" },
        false,
      );
      cookie = login.headers.get("set-cookie")!.split(";")[0];
      const customer = await ok("customers", {
        data: {
          name: "Cliente A",
          rut: "12.345.678-5",
          email: "a@example.com",
          phone: "",
          address: "Santiago",
        },
      });
      const other = await ok("customers", {
        data: {
          name: "Cliente B",
          rut: "11.111.111-1",
          email: "b@example.com",
          phone: "",
          address: "Santiago",
        },
      });
      const image = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=",
        "base64",
      );
      const imageResponse = await fetch(base + "images", {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "image/png" },
        body: image,
      });
      assert.equal(imageResponse.ok, true);
      const imageInfo = await imageResponse.json();
      const input = {
        ...blank(),
        client: customer.name,
        rut: customer.rut,
        email: customer.email,
        date: "2026-11-23",
        due: "2027-12-31",
        items: [
          {
            description: "Servicio",
            quantity: 1,
            price: 100000,
            discount: 0,
            imageUrl: imageInfo.url,
          },
        ],
      };
      let quote = await ok("commands", { action: "save", data: input });
      quote = await ok("commands", {
        action: "status",
        id: quote.id,
        version: quote.version,
        status: "Enviada",
      });
      const portal = await ok("business", {
        action: "portal",
        customerId: customer.id,
        days: 7,
      });
      const token = portal.path.split("/").at(-1),
        portalPath = "portal/" + token;
      const portalB = await ok("business", {
        action: "portal",
        customerId: other.id,
        days: 7,
      });
      assert.ok(
        !(await readFile(join(folder, "store.json"), "utf8")).includes(token),
        "el token no se almacena en texto plano",
      );
      const clientView = await ok(portalPath, undefined, false);
      const portalImage = await req(
        portalPath + "/images/" + imageInfo.url.split("/").at(-1),
        undefined,
        false,
      );
      assert.equal(portalImage.ok, true);
      assert.deepEqual(Buffer.from(await portalImage.arrayBuffer()), image);
      assert.equal(
        (
          await req(
            "portal/" +
              portalB.path.split("/").at(-1) +
              "/images/" +
              imageInfo.url.split("/").at(-1),
            undefined,
            false,
          )
        ).status,
        404,
      );
      assert.ok(clientView.documents.some((d: Doc) => d.id === quote.id));
      assert.ok(
        !(
          await ok("portal/" + portalB.path.split("/").at(-1), undefined, false)
        ).documents.some((d: Doc) => d.id === quote.id),
      );
      assert.equal(
        (
          await req(
            "portal/" + portalB.path.split("/").at(-1) + "/accept",
            { id: quote.id, version: quote.version, signer: "Contacto B" },
            false,
          )
        ).ok,
        false,
      );
      quote = await ok(
        portalPath + "/accept",
        { id: quote.id, version: quote.version, signer: "Contacto A" },
        false,
      );
      assert.equal(quote.status, "Aceptada");
      const order = await save("order", {
        customerId: customer.id,
        reference: "OC-CLIENTE-001",
        date: "2026-11-23",
        amount: 119000,
        status: "Aceptada",
        quoteId: quote.id,
      });
      assert.equal(
        (
          await req("business", {
            action: "save",
            kind: "order",
            createId: randomUUID(),
            data: { ...order.data, reference: order.data.reference },
          })
        ).ok,
        false,
        "OC duplicada",
      );
      const newInvoice = async () => {
        let d = await ok("commands", {
          action: "save",
          data: { ...input, kind: "invoice" },
        });
        return ok("commands", {
          action: "status",
          id: d.id,
          version: d.version,
          status: "Emitida",
        });
      };
      const invoice = await newInvoice(),
        invoice2 = await newInvoice();
      const allocations = await Promise.all(
        [invoice, invoice2].map((d) =>
          req("business", {
            action: "save",
            kind: "billing",
            createId: randomUUID(),
            data: { invoiceId: d.id, orderId: order.id, amount: 80000 },
          }),
        ),
      );
      assert.equal(
        allocations.filter((r) => r.ok).length,
        1,
        "las asignaciones concurrentes no exceden la OC",
      );
      const payments = await Promise.all(
        ["REF-1", "REF-2"].map((reference) =>
          req("business", {
            action: "save",
            kind: "payment",
            createId: randomUUID(),
            data: {
              customerId: customer.id,
              invoiceId: invoice.id,
              amount: 70000,
              date: "2026-11-23",
              method: "Transferencia",
              reference,
            },
          }),
        ),
      );
      assert.equal(
        payments.filter((r) => r.ok).length,
        1,
        "no se puede pagar por encima del saldo",
      );
      const firstPayment = await payments.find((r) => r.ok)!.json();
      const createId = randomUUID();
      const remainder = {
        customerId: customer.id,
        invoiceId: invoice.id,
        amount: 49000,
        date: "2026-11-23",
        method: "Transferencia",
        reference: "SALDO",
      };
      const secondPayment = await save(
        "payment",
        remainder,
        undefined,
        undefined,
        createId,
      );
      assert.equal(
        (await save("payment", remainder, undefined, undefined, createId)).id,
        secondPayment.id,
        "reintentar no duplica el pago",
      );
      let doc = (await ok("data")).documents.find(
        (d: Doc) => d.id === invoice.id,
      );
      assert.equal(doc.status, "Pagada");
      await ok("business", {
        action: "archive",
        id: firstPayment.id,
        version: firstPayment.version,
        deleted: true,
        reason: "Transferencia reversada",
      });
      doc = (await ok("data")).documents.find((d: Doc) => d.id === invoice.id);
      assert.equal(doc.status, "Emitida");
      assert.equal(
        (
          await req("commands", {
            action: "status",
            id: doc.id,
            version: doc.version,
            status: "Anulada",
          })
        ).ok,
        false,
        "anular requiere resolver pagos activos",
      );
      const job = await save("job", {
        customerId: customer.id,
        title: "Mantención",
        date: "2026-11-23",
        end: "2026-11-25",
        status: "Por recibir",
        orderId: order.id,
        recurrenceMonths: 1,
      });
      const report = await save("serviceDoc", {
        jobId: job.id,
        category: "report",
        title: "Informe interno",
        date: "2026-11-23",
        content: "Nota técnica",
        amount: 0,
        visibleToClient: false,
      });
      await save("cost", {
        jobId: job.id,
        date: "2026-11-23",
        category: "Traslado",
        description: "Visita",
        amount: 10000,
      });
      await save("serviceDoc", {
        jobId: job.id,
        category: "timesheet",
        title: "Parte",
        date: "2026-11-23",
        amount: 0,
        hours: 2,
        hourlyCost: 5000,
        materials: [{ description: "Repuesto", quantity: 2, cost: 1000 }],
        visibleToClient: true,
      });
      const bytes = Buffer.from("%PDF-1.4\nrespaldo de prueba\n%%EOF");
      const upload = await fetch(base + "business/files/" + report.id, {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/octet-stream",
          "X-File-Name": "respaldo.pdf",
        },
        body: bytes,
      });
      assert.equal(upload.ok, true);
      const file = await upload.json();
      await ok("business", {
        action: "share",
        id: file.id,
        version: file.version,
        visible: true,
      });
      const getFile = await fetch(base + "business/files/" + file.id, {
        headers: { Cookie: cookie },
      });
      assert.deepEqual(Buffer.from(await getFile.arrayBuffer()), bytes);
      assert.equal(
        (await req(portalPath + "/files/" + file.id, undefined, false)).status,
        404,
        "no expone archivos internos",
      );
      const submittedOrder = await ok(
        portalPath + "/orders",
        {
          createId: randomUUID(),
          data: { reference: "OC-PORTAL-01", date: "2026-11-23", amount: 500 },
        },
        false,
      );
      const clientUpload = await fetch(
        base + portalPath + "/files/" + submittedOrder.id,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-File-Name": "orden-cliente.pdf",
          },
          body: bytes,
        },
      );
      assert.equal(clientUpload.ok, true);
      const clientFile = await clientUpload.json();
      assert.equal(
        (await req(portalPath + "/files/" + clientFile.id, undefined, false))
          .ok,
        true,
      );
      assert.equal(
        (
          await req(
            "portal/" +
              portalB.path.split("/").at(-1) +
              "/files/" +
              clientFile.id,
            undefined,
            false,
          )
        ).status,
        404,
      );
      const visible = await ok(portalPath, undefined, false);
      assert.ok(
        !visible.records.some(
          (r: BusinessRecord) => r.id === report.id || r.kind === "cost",
        ),
      );
      const part = visible.records.find(
        (r: BusinessRecord) => r.kind === "serviceDoc",
      );
      assert.equal(part.data.hourlyCost, 0);
      assert.equal(part.data.materials[0].cost, 0);
      const received = await ok(
        portalPath + "/receive",
        {
          jobId: job.id,
          version: job.version,
          signer: "Recepción Cliente A",
          notes: "Conforme",
          createId: randomUUID(),
        },
        false,
      );
      assert.equal(received.data.acceptedVersion, job.version);
      assert.equal(
        (
          await req(
            portalPath + "/receive",
            {
              jobId: job.id,
              version: job.version,
              signer: "Reintento",
              createId: randomUUID(),
            },
            false,
          )
        ).ok,
        false,
        "evita conformidad repetida o desactualizada",
      );
      const claim = await ok(
        portalPath + "/payments",
        {
          createId: randomUUID(),
          data: {
            invoiceId: invoice2.id,
            amount: 20000,
            date: "2026-11-23",
            reference: "COMPROBANTE-CLIENTE",
          },
        },
        false,
      );
      assert.equal(claim.data.status, "En revisión");
      const claimPayment = await save("payment", {
        ...claim.data,
        method: "Transferencia",
        claimId: claim.id,
      });
      assert.ok(claimPayment.id);
      assert.equal(
        (await ok("business")).records.find(
          (r: BusinessRecord) => r.id === claim.id,
        ).data.status,
        "Verificado",
      );
      assert.equal(
        (await ok("data")).documents.find((d: Doc) => d.id === invoice2.id)
          .status,
        "Emitida",
        "el cliente no confirma dinero por sí solo",
      );
      assert.equal(
        (
          await req(
            "portal/" + portalB.path.split("/").at(-1) + "/files/" + job.id,
            undefined,
            false,
          )
        ).status,
        404,
      );
      await ok("business", {
        action: "archive",
        id: portal.record.id,
        version: portal.record.version,
        deleted: true,
        reason: "Revocación solicitada",
      });
      assert.equal(
        (await req(portalPath, undefined, false)).ok,
        false,
        "un enlace revocado deja de servir",
      );
      const snapshot = await ok("business");
      assert.equal(
        snapshot.records.find((r: BusinessRecord) => r.id === portal.record.id)
          .data.tokenHash,
        "",
      );
      assert.equal(
        businessTotals(snapshot, (await ok("data")).documents, job.id).costs,
        22000,
      );
      assert.ok(snapshot.events.length > 10);
      const backup = await req("business/backup");
      assert.equal(backup.ok, true);
      assert.match(backup.headers.get("content-type") ?? "", /zip/);
      const archive = Buffer.from(await backup.arrayBuffer());
      assert.equal(archive.readUInt32LE(0), 0x04034b50);
      assert.ok(archive.includes(bytes));
      assert.ok(archive.includes(Buffer.from("records.json")));
      await ok("users", {
        profile: {
          name: "Miembro",
          email: "member@example.com",
          phone: "",
          position: "",
          rut: "",
        },
        password: "Member123!",
        role: "member",
      });
      const memberLogin = await req(
        "login",
        { email: "member@example.com", password: "Member123!" },
        false,
      );
      const memberCookie = memberLogin.headers.get("set-cookie")!.split(";")[0];
      assert.equal(
        (
          await fetch(base + "business/backup", {
            headers: { Cookie: memberCookie },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(base + "business", {
            method: "POST",
            headers: {
              Cookie: memberCookie,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "portal",
              customerId: other.id,
              days: 7,
            }),
          })
        ).status,
        403,
      );
    } finally {
      child.kill();
      await new Promise((r) => setTimeout(r, 150));
      await rm(folder, { recursive: true, force: true });
    }
  },
);

test("Recurrencias respetan fin de mes y año bisiesto", () => {
  assert.equal(shiftMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(shiftMonths("2027-01-31", 1), "2027-02-28");
  assert.equal(shiftMonths("2026-12-15", 1), "2027-01-15");
});
