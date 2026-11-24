import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import {
  can,
  emptyPermissions,
  fullPermissions,
  normalizePermissions,
} from "../shared/access";
import { blank } from "../shared/model";

test("Permisos: acciones sin vista se desactivan y roles desconocidos no tienen acceso", () => {
  const p = emptyPermissions();
  p.quotes.create = true;
  assert.equal(normalizePermissions(p).quotes.create, false);
  assert.equal(can({ role: "unknown" }, "quotes"), false);
  assert.equal(
    can({ role: "member", permissions: emptyPermissions() }, "quotes"),
    false,
  );
  assert.equal(
    can({ role: "admin", permissions: emptyPermissions() }, "quotes", "delete"),
    true,
  );
  assert.equal(can({ role: "member" }, "quotes", "create"), true);
});

test(
  "Roles API: asignación, permisos por acción, filtros, cambios de sesión y protección administrativa",
  { timeout: 60000 },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), "vgm-access-"));
    const port = 47000 + Math.floor(Math.random() * 1000),
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
    let logs = "";
    child.stdout.on("data", (d) => (logs += d));
    child.stderr.on("data", (d) => (logs += d));
    let cookie = "";
    const req = (path: string, body?: unknown, session = cookie) =>
      fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", Cookie: session },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const ok = async (path: string, body?: unknown, session = cookie) => {
      const r = await req(path, body, session),
        data = await r.json();
      assert.equal(r.status, 200, JSON.stringify(data));
      return data;
    };
    try {
      let started = false;
      for (let i = 0; i < 150; i++) {
        try {
          if ((await req("config")).ok) {
            started = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(started, logs);
      const login = await req("login", {
        email: "admin@vgm.local",
        password: "Vgm12345!",
      });
      assert.equal(login.status, 200);
      cookie = login.headers.get("set-cookie")!.split(";")[0];
      const admin = await ok("me");
      const permissions = emptyPermissions();
      permissions.quotes.view = true;
      permissions.settings.view = true;
      let role = await ok("roles", {
        action: "save",
        data: {
          name: "Solo cotizaciones",
          description: "Consulta limitada",
          permissions,
        },
      });
      const user = await ok("users", {
        profile: {
          name: "Consulta",
          email: "consulta@example.com",
          phone: "",
          position: "Ventas",
        },
        password: "Password123!",
        role: role.id,
      });
      const memberLogin = await req(
        "login",
        { email: user.email, password: "Password123!" },
        "",
      );
      const limited = memberLogin.headers.get("set-cookie")!.split(";")[0];
      assert.equal((await ok("me", undefined, limited)).roleName, role.name);
      const data = {
        ...blank(),
        client: "Cliente prueba",
        rut: "12.345.678-5",
        items: [
          { description: "Servicio", quantity: 1, price: 100, discount: 0 },
        ],
      };
      const quote = await ok("commands", { action: "save", data });
      const invoice = await ok("commands", {
        action: "save",
        data: { ...data, kind: "invoice" },
      });
      const deleted = await ok("commands", { action: "save", data });
      await ok("commands", {
        action: "delete",
        id: deleted.id,
        version: deleted.version,
        reason: "Prueba",
      });
      const customer = await ok("customers", {
        data: {
          name: "Cliente prueba",
          rut: "12.345.678-5",
          email: "",
          phone: "",
          address: "",
        },
      });
      await ok("products", {
        data: {
          code: "P-1",
          description: "Solo Admin",
          type: "product",
          category: "",
          brand: "",
          stock: 10,
          price: 100,
          imageUrl: "",
        },
      });
      const order = await ok("business", {
        action: "save",
        kind: "order",
        createId: randomUUID(),
        data: {
          customerId: customer.id,
          reference: "OC 1",
          date: "2026-11-23",
          due: "2026-12-23",
          amount: 119,
          status: "Recibida",
          quoteId: quote.id,
          items: [],
          notes: "",
        },
      });
      const file = Buffer.from("%PDF-1.4\nEOF\n");
      const upload = async (parentId: string, session: string) =>
        fetch(base + "business/files/" + parentId, {
          method: "POST",
          headers: {
            Cookie: session,
            "Content-Type": "application/octet-stream",
            "X-File-Name": "respaldo.pdf",
          },
          body: file,
        });
      const attachmentResponse = await upload(quote.id, cookie);
      assert.equal(attachmentResponse.status, 200);
      const attachment = await attachmentResponse.json();
      const snapshot = await ok("data", undefined, limited);
      assert.deepEqual(
        snapshot.documents.map((d: any) => d.id),
        [quote.id],
      );
      assert.equal(snapshot.products.length, 0);
      assert.equal(snapshot.events.length, 0);
      assert.equal(snapshot.stockMovements.length, 0);
      const commercial = await ok("business", undefined, limited);
      assert.ok(!commercial.records.some((r: any) => r.id === order.id));
      assert.ok(commercial.records.some((r: any) => r.id === attachment.id));
      assert.equal(commercial.events.length, 0);
      for (const path of [
        "users",
        "roles",
        "customers",
        "products",
        "business/backup",
        "business/files/" + attachment.id,
      ])
        assert.equal((await req(path, undefined, limited)).status, 403, path);
      for (const body of [
        { action: "save", data },
        { action: "save", id: quote.id, version: quote.version, data },
        {
          action: "delete",
          id: quote.id,
          version: quote.version,
          reason: "No",
        },
        {
          action: "status",
          id: quote.id,
          version: quote.version,
          status: "Enviada",
        },
      ])
        assert.equal((await req("commands", body, limited)).status, 403);
      assert.equal((await upload(quote.id, limited)).status, 403);
      assert.equal(
        (
          await req(
            "access/check",
            { module: "quotes", action: "export" },
            limited,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await req(
            "roles",
            {
              action: "save",
              data: { name: "Escalada", permissions: fullPermissions() },
            },
            limited,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await req(
            "me",
            {
              name: user.name,
              email: user.email,
              phone: "",
              position: "",
              role: "admin",
              permissions: fullPermissions(),
            },
            limited,
          )
        ).status,
        200,
      );
      assert.equal((await ok("me", undefined, limited)).role, role.id);
      assert.equal(
        (
          await req("users/access", {
            id: admin.id,
            role: role.id,
            active: true,
          })
        ).status,
        400,
        "no se cambia el acceso propio",
      );
      assert.equal(
        (
          await req("roles", {
            action: "save",
            id: "admin",
            version: 1,
            data: { name: "Admin", permissions },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await req("roles", {
            action: "archive",
            id: role.id,
            version: role.version,
            deleted: true,
          })
        ).status,
        400,
        "rol asignado protegido",
      );
      const oldVersion = role.version;
      permissions.quotes.create = true;
      permissions.quotes.export = true;
      permissions.customers.view = true;
      permissions.customers.create = true;
      role = await ok("roles", {
        action: "save",
        id: role.id,
        version: role.version,
        data: { name: "Cotizadores", permissions },
      });
      assert.equal(
        (
          await req("roles", {
            action: "save",
            id: role.id,
            version: oldVersion,
            data: { name: "Viejo", permissions },
          })
        ).status,
        409,
      );
      const changed = await ok("me", undefined, limited);
      assert.equal(changed.roleName, "Cotizadores");
      assert.equal(changed.permissions.quotes.create, true);
      assert.notEqual(changed.permissionsVersion, role.id + ":" + oldVersion);
      assert.equal(
        (await req("commands", { action: "save", data }, limited)).status,
        200,
        "sesión previa recibe nuevo permiso",
      );
      assert.equal(
        (
          await req(
            "commands",
            { action: "save", id: quote.id, version: quote.version, data },
            limited,
          )
        ).status,
        403,
        "crear no permite editar",
      );
      assert.equal(
        (
          await req(
            "customers",
            {
              data: {
                name: customer.name,
                rut: customer.rut,
                email: "",
                phone: "",
                address: "",
              },
            },
            limited,
          )
        ).status,
        403,
        "upsert no permite editar con permiso crear",
      );
      assert.equal(
        (await req("business/files/" + attachment.id, undefined, limited))
          .status,
        200,
      );
      permissions.quotes.view = false;
      permissions.quotes.create = true;
      role = await ok("roles", {
        action: "save",
        id: role.id,
        version: role.version,
        data: { name: role.name, permissions },
      });
      assert.equal(role.permissions.quotes.create, false);
      assert.equal((await ok("data", undefined, limited)).documents.length, 0);
      assert.equal(
        (await req("business/files/" + attachment.id, undefined, limited))
          .status,
        403,
      );
      assert.equal(
        (
          await req("users", {
            profile: { name: "Inválido", email: "invalid@example.com" },
            password: "Password123!",
            role: randomUUID(),
          })
        ).status,
        400,
      );
      await ok("users/access", { id: user.id, role: "member", active: true });
      role = await ok("roles", {
        action: "archive",
        id: role.id,
        version: role.version,
        deleted: true,
      });
      assert.equal(
        (
          await req("users/access", {
            id: user.id,
            role: role.id,
            active: true,
          })
        ).status,
        400,
      );
      role = await ok("roles", {
        action: "archive",
        id: role.id,
        version: role.version,
        deleted: false,
      });
      assert.equal(role.deleted, false);
      assert.equal(
        (
          await req("roles", {
            action: "archive",
            id: "member",
            version: 1,
            deleted: true,
          })
        ).status,
        400,
      );
      const events = (await ok("roles")).events;
      assert.ok(
        events.some((e: any) => e.roleId === role.id && e.action === "delete"),
      );
      assert.ok(events.some((e: any) => e.action === "restore"));
      // Concurrent assignment and deletion can never leave a user on an archived role.
      const raceRole = await ok("roles", {
        action: "save",
        data: { name: "Concurrente", permissions: emptyPermissions() },
      });
      const [assign, archive] = await Promise.all([
        req("users/access", { id: user.id, role: raceRole.id, active: true }),
        req("roles", {
          action: "archive",
          id: raceRole.id,
          version: raceRole.version,
          deleted: true,
        }),
      ]);
      assert.ok([assign.status, archive.status].includes(400));
      const stored = JSON.parse(
        await readFile(join(folder, "roles.json"), "utf8"),
      );
      const team = await ok("users");
      assert.ok(
        !team.some(
          (u: any) =>
            u.role === raceRole.id &&
            stored.roles.find((r: any) => r.id === raceRole.id)?.deleted,
        ),
      );
      assert.ok(
        (await ok("data")).documents.some((d: any) => d.id === invoice.id),
      );
    } finally {
      const exited =
        child.exitCode !== null ? Promise.resolve() : once(child, "exit");
      child.kill();
      await exited;
      assert.ok(
        resolve(folder).startsWith(resolve(tmpdir()) + "\\") ||
          resolve(folder).startsWith(resolve(tmpdir()) + "/"),
      );
      await rm(folder, { recursive: true, force: true });
    }
  },
);
