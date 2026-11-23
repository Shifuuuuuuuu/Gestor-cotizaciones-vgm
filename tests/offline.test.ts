import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { blank, type Command } from "../shared/model";
import {
  preparePending,
  projectSnapshot,
  type Snapshot,
} from "../shared/offline";
test("Borradores offline: creación, edición, persistencia de versión y reserva provisional", () => {
  const base: Snapshot = {
    documents: [],
    events: [],
    products: [],
    stockMovements: [],
  };
  const cmd: Command = {
    action: "save",
    data: {
      ...blank(),
      client: "Cliente offline",
      items: [
        { description: "Servicio", quantity: 2, price: 1000, discount: 10 },
      ],
    },
  };
  const first = preparePending(
    base,
    [],
    cmd,
    "user",
    randomUUID(),
    new Date().toISOString(),
  );
  assert.equal(first.doc.pending, true);
  assert.match(first.doc.number, /^PEND-/);
  const second = preparePending(
    base,
    [first],
    {
      action: "save",
      id: first.doc.id,
      version: 1,
      data: { ...first.doc, notes: "Cambio sin conexión" },
    },
    "user",
    randomUUID(),
    new Date().toISOString(),
  );
  assert.equal(second.doc.id, first.doc.id);
  assert.equal(second.doc.version, 2);
  const projected = projectSnapshot(base, [first, second]);
  assert.equal(projected.documents.length, 1);
  assert.equal(projected.events.length, 2);
  assert.equal(projected.documents[0].notes, "Cambio sin conexión");
  assert.equal(base.documents.length, 0);
  assert.throws(
    () =>
      preparePending(
        base,
        [first, second],
        { action: "save", id: first.doc.id, version: 1, data: first.doc },
        "user",
        randomUUID(),
        new Date().toISOString(),
      ),
    /CONFLICT/,
  );
});
test("Sincronización: reintentos y respuestas perdidas no duplican documentos, números ni stock", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vgm-sync-"));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_MODE = "local";
  const { mutate, list, saveProduct } = await import("../server/store");
  try {
    const p = await saveProduct(
      {
        code: "OFF-1",
        description: "Producto offline",
        type: "product",
        category: "",
        brand: "VGM",
        price: 1000,
        stock: 10,
        imageUrl: "",
      },
      "tester",
    );
    const initial = await list(),
      base: Snapshot = { ...initial, products: initial.products };
    const first = preparePending(
      base,
      [],
      {
        action: "save",
        data: {
          ...blank(),
          client: "Prueba",
          items: [
            {
              description: p.description,
              quantity: 3,
              price: 1000,
              discount: 0,
              productId: p.id,
            },
          ],
        },
      },
      "tester",
      randomUUID(),
      new Date().toISOString(),
    );
    const [a, b] = await Promise.all([
      mutate(first.command, "tester", "owner"),
      mutate(first.command, "tester", "owner"),
    ]);
    assert.deepEqual(a, b);
    assert.equal(a.id, first.doc.id);
    assert.equal(a.number, "COT-000001");
    let state = await list();
    assert.equal(state.documents.length, 1);
    assert.equal(state.events.length, 1);
    assert.equal(state.products[0].reserved, 3);
    await assert.rejects(
      mutate(
        {
          ...first.command,
          data: { ...first.command.data!, notes: "otro cuerpo" },
        },
        "tester",
        "owner",
      ),
      /otros datos/,
    );
    await assert.rejects(
      mutate(first.command, "tester", "other-owner"),
      /otros datos/,
    );
    await assert.rejects(
      mutate(
        { action: "save", requestId: a.id, data: first.command.data },
        "tester",
        "owner",
      ),
      /otros datos/,
    );
    const edited = preparePending(
      base,
      [first],
      {
        action: "save",
        id: a.id,
        version: 1,
        data: {
          ...first.doc,
          notes: "Edición offline",
          items: [{ ...first.doc.items[0], quantity: 4 }],
        },
      },
      "tester",
      randomUUID(),
      new Date().toISOString(),
    );
    await mutate(edited.command, "tester", "owner");
    await mutate(edited.command, "tester", "owner");
    state = await list();
    assert.equal(state.documents[0].version, 2);
    assert.equal(state.events.length, 2);
    assert.equal(state.products[0].reserved, 4);
    assert.equal(state.documents[0].pending, undefined);
    const next = await mutate(
      { action: "save", requestId: randomUUID(), data: first.command.data },
      "tester",
      "owner",
    );
    assert.equal(next.number, "COT-000002");
    await assert.rejects(
      mutate({ ...edited.command, requestId: randomUUID() }, "tester", "owner"),
      /CONFLICT/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
