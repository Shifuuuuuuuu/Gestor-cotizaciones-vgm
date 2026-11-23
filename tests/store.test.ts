import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blank } from "../shared/model";
test("Persistencia atómica, concurrencia y deduplicación de factura", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vgm-test-"));
  process.env.DATA_DIR = directory;
  process.env.STORAGE_MODE = "local";
  const { mutate, list } = await import("../server/store");
  try {
    const d = await mutate(
      {
        action: "save",
        data: {
          ...blank(),
          client: "Prueba",
          items: [
            { description: "Servicio", price: 2500, quantity: 1, discount: 0 },
          ],
        },
      },
      "test",
    );
    const results = await Promise.allSettled([
      mutate(
        { action: "status", id: d.id, version: 1, status: "Enviada" },
        "a",
      ),
      mutate(
        { action: "status", id: d.id, version: 1, status: "Enviada" },
        "b",
      ),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    const accepted = await mutate(
      { action: "status", id: d.id, version: 2, status: "Aceptada" },
      "test",
    );
    const invoice = await mutate(
      { action: "convert", id: d.id, version: accepted.version },
      "test",
    );
    await assert.rejects(
      mutate(
        { action: "convert", id: d.id, version: accepted.version },
        "test",
      ),
      /ya tiene/,
    );
    const state = await list();
    assert.equal(state.documents.length, 2);
    assert.equal(state.events.length, 4);
    assert.equal(invoice.sourceId, d.id);
    assert.equal(d.number, "COT-000001");
    assert.equal(invoice.number, "FAC-000001");
    const editedInvoice = await mutate(
      {
        action: "save",
        id: invoice.id,
        version: 1,
        data: { ...invoice, notes: "Actualizada" },
      },
      "test",
    );
    assert.equal(editedInvoice.number, "FAC-000001");
    const duplicate = await mutate({ action: "save", data: d }, "test");
    assert.equal(duplicate.number, "COT-000002");
    const duplicateInvoice = await mutate(
      { action: "save", data: invoice },
      "test",
    );
    assert.equal(duplicateInvoice.number, "FAC-000002");
    const edited = await mutate(
      {
        action: "save",
        id: duplicate.id,
        version: 1,
        data: { ...duplicate, notes: "Modificada" },
      },
      "test",
    );
    const deleted = await mutate(
      { action: "delete", id: edited.id, version: 2, reason: "Prueba" },
      "test",
    );
    await mutate({ action: "restore", id: deleted.id, version: 3 }, "test");
    await assert.rejects(
      mutate({ action: "save", data: { ...d, tax: -1 } }, "test"),
    );
    const next = await mutate({ action: "save", data: d }, "test");
    assert.equal(next.number, "COT-000003");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
