import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { blank } from "../shared/model";
test(
  "API: sesiones, perfil, administración y directorio de clientes",
  { timeout: 30000 },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), "vgm-api-test-"));
    const port = 33000 + Math.floor(Math.random() * 1000);
    const url = `http://127.0.0.1:${port}/api/`;
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
    const request = (path: string, cookie = "", body?: unknown) =>
      fetch(url + path, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    try {
      let started = false;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await request("config")).ok) {
            started = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(started, logs);
      assert.equal((await request("data")).status, 401);
      assert.equal(
        (
          await request("login", "", {
            email: "admin@vgm.local",
            password: "wrong",
          })
        ).status,
        401,
      );
      const login = await request("login", "", {
        email: "admin@vgm.local",
        password: "Vgm12345!",
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.get("set-cookie")!.split(";")[0];

      assert.equal((await request("products")).status, 401);
      const image = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=",
        "base64",
      );
      const upload = await fetch(url + "images", {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "image/png" },
        body: image,
      });
      assert.equal(upload.status, 200);
      const imagePath = (await upload.json()).url.replace("/api/", "");
      assert.equal((await request(imagePath)).status, 401);
      const fetched = await request(imagePath, cookie);
      assert.equal(fetched.status, 200);
      assert.match(fetched.headers.get("content-type")!, /image\/png/);
      assert.match(fetched.headers.get("content-security-policy")!, /blob:/);
      assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), image);
      const invalidImage = await fetch(url + "images", {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "image/png" },
        body: "<svg></svg>",
      });
      assert.equal(invalidImage.status, 400);
      const product = await request("products", cookie, {
        data: {
          code: "API-1",
          description: "Producto API",
          type: "product",
          category: "",
          brand: "",
          stock: 10,
          price: 100,
          imageUrl: "/api/" + imagePath,
        },
      });
      assert.equal(product.status, 200);
      const productData = await product.json();
      assert.equal(productData.stock, 10);
      const batchId = "12345678-1234-4234-9234-123456789012-0";
      const rows = [{ ...productData, code: "API-IMPORT" }];
      assert.equal(
        (await request("products/import", cookie, { rows, batchId })).status,
        200,
      );
      assert.equal(
        (await request("products/import", cookie, { rows, batchId })).status,
        200,
      );
      assert.equal(
        (await (await request("products", cookie)).json()).products.length,
        2,
      );

      const admin = await login.json();
      assert.equal(admin.role, "admin");
      assert.equal(admin.passwordHash, undefined);
      assert.equal((await request("data", cookie)).status, 200);
      const updated = await request("me", cookie, {
        name: "Admin Editado",
        email: "admin@vgm.local",
        phone: "123",
        position: "Ventas",
        role: "member",
      });
      assert.equal((await updated.json()).role, "admin");
      const created = await request("users", cookie, {
        profile: {
          name: "Miembro prueba",
          email: "member@example.com",
          phone: "",
          position: "Ventas",
        },
        password: "Password123!",
        role: "member",
      });
      assert.equal(created.status, 200);
      const member = await created.json();
      const memberLogin = await request("login", "", {
        email: "member@example.com",
        password: "Password123!",
      });
      const memberCookie = memberLogin.headers.get("set-cookie")!.split(";")[0];
      assert.equal((await request("users", memberCookie)).status, 403);
      const edited = await request("users/edit", cookie, {
        id: member.id,
        profile: {
          ...member,
          name: "Usuario actualizado",
          rut: "123456785",
          phone: "555",
          position: "Supervisor",
          role: "admin",
        },
      });
      assert.equal(edited.status, 200);
      const editedUser = await edited.json();
      assert.equal(editedUser.name, "Usuario actualizado");
      assert.equal(editedUser.rut, "12.345.678-5");
      assert.equal(editedUser.role, "member");
      assert.equal(
        (
          await request("users/edit", memberCookie, {
            id: member.id,
            profile: member,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request("users/edit", cookie, {
            id: member.id,
            profile: { ...member, email: "admin@vgm.local" },
          })
        ).status,
        400,
      );

      assert.equal(
        (
          await request("users/access", cookie, {
            id: admin.id,
            role: "member",
            active: false,
          })
        ).status,
        400,
      );
      const customer = {
        name: "Empresa prueba",
        rut: "123456785",
        email: "cliente@example.com",
        address: "Dirección",
        phone: "123",
      };
      const c1 = await (
        await request("customers", memberCookie, { data: customer })
      ).json();
      assert.equal(c1.rut, "12.345.678-5");
      const lookup = await (await request("rut/lookup", memberCookie, {rut:"12345678-5"})).json();
      assert.equal(lookup.source,"local"); assert.equal(lookup.status,"found"); assert.equal(lookup.address,"Dirección");
      assert.equal((await request("rut/lookup","",{rut:"12345678-5"})).status,401);
      const c2 = await (
        await request("customers", memberCookie, {
          data: {
            ...customer,
            name: "Empresa actualizada",
            rut: "12.345.678-5",
          },
        })
      ).json();
      assert.equal(c1.id, c2.id);
      assert.equal(
        (await (await request("customers", cookie)).json()).length,
        1,
      );
      const quote = {
        ...blank(),
        client: customer.name,
        rut: customer.rut,
        items: [
          {
            description: "Prueba bloqueo",
            price: 1000,
            quantity: 1,
            discount: 0,
          },
        ],
      };
      const beforeBlock = await request("commands", memberCookie, {
        action: "save",
        data: quote,
      });
      assert.equal(beforeBlock.status, 200);
      const original = await beforeBlock.json();
      await request("customers/access", cookie, {
        id: c1.id,
        active: false,
        deleted: false,
      });
      const denied = await request("commands", memberCookie, {
        action: "save",
        data: quote,
      });
      assert.equal(denied.status, 400);
      assert.match((await denied.json()).error, /bloqueado/);
      await request("customers/access", cookie, {
        id: c1.id,
        active: false,
        deleted: true,
      });
      assert.equal(
        (
          await request("commands", memberCookie, {
            action: "save",
            data: quote,
          })
        ).status,
        400,
      );
      const retained = await (await request("data", cookie)).json();
      assert.equal(retained.documents[0].id, original.id);
      assert.equal(retained.events.length, 1);
      await request("customers/access", cookie, {
        id: c1.id,
        active: true,
        deleted: false,
      });
      const afterRestore = await (
        await request("commands", memberCookie, { action: "save", data: quote })
      ).json();
      assert.equal(afterRestore.number, "COT-000002");
      await request("users/access", cookie, {
        id: member.id,
        role: "member",
        active: false,
      });
      assert.equal((await request("data", memberCookie)).status, 401);
      assert.equal((await request("users/trash",cookie,{id:admin.id,deleted:true})).status,400);
      const removedUser = await (await request("users/trash",cookie,{id:member.id,deleted:true})).json();
      assert.equal(removedUser.deleted,true); assert.equal(removedUser.active,false);
      const recoveredUser = await (await request("users/trash",cookie,{id:member.id,deleted:false})).json();
      assert.equal(recoveredUser.deleted,false); assert.equal(recoveredUser.active,false);
      const stored = await readFile(join(folder, "users.json"), "utf8");
      assert.ok(!stored.includes("Password123!"));
      assert.ok(!stored.includes("Vgm12345!"));
      await request("logout", cookie, {});
      assert.equal((await request("data", cookie)).status, 401);
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
