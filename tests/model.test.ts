import { test } from "node:test";
import assert from "node:assert/strict";
import { blank, change, totals, type Command, type Doc } from "../shared/model";
const input = {
  ...blank(),
  client: "Cliente prueba",
  items: [{ description: "Servicio", quantity: 2, price: 1000, discount: 10 }],
};
const apply = (old: Doc | null, cmd: Command) =>
  change(old, cmd, "tester", "id", "COT-1", "2026-09-15T12:00:00Z");
test("Cálculo de descuento e impuesto redondeado CLP", () =>
  assert.deepEqual(totals(input), { net: 1800, taxAmount: 342, total: 2142 }));
test("Edición conserva snapshot y detecta concurrencia", () => {
  const first = apply(null, { action: "save", data: input }).doc;
  const result = apply(first, {
    action: "save",
    id: first.id,
    version: 1,
    data: { ...input, client: "Otro" },
  });
  assert.equal(result.event.before?.client, "Cliente prueba");
  assert.equal(result.doc.version, 2);
  assert.throws(
    () =>
      apply(result.doc, {
        action: "delete",
        id: first.id,
        version: 1,
        reason: "Error",
      }),
    /CONFLICT/,
  );
});
test("Papelera recuperable y razón obligatoria", () => {
  const d = apply(null, { action: "save", data: input }).doc;
  assert.throws(
    () => apply(d, { action: "delete", id: d.id, version: 1 }),
    /motivo/,
  );
  const deleted = apply(d, {
    action: "delete",
    id: d.id,
    version: 1,
    reason: "Duplicado",
  }).doc;
  assert.equal(deleted.deleted, true);
  const restored = apply(deleted, {
    action: "restore",
    id: d.id,
    version: 2,
  }).doc;
  assert.equal(restored.deleted, false);
  assert.equal(restored.version, 3);
});
test("Estados y conversión de cotización aceptada", () => {
  const d = apply(null, { action: "save", data: input }).doc;
  assert.throws(
    () => apply(d, { action: "convert", id: d.id, version: 1 }),
    /aceptada/,
  );
  const sent = apply(d, {
    action: "status",
    id: d.id,
    version: 1,
    status: "Enviada",
  }).doc;
  assert.throws(
    () => apply(sent, { action: "save", id: d.id, version: 2, data: input }),
    /borrador/,
  );
  const accepted = apply(sent, {
    action: "status",
    id: d.id,
    version: 2,
    status: "Aceptada",
  }).doc;
  const invoice = apply(accepted, {
    action: "convert",
    id: d.id,
    version: 3,
  }).doc;
  assert.equal(invoice.kind, "invoice");
  assert.equal(invoice.sourceId, d.id);
  assert.equal(invoice.total, d.total);
});
test("Recuperación crea versión nueva y no borra la historia", () => {
  const first = apply(null, { action: "save", data: input });
  const edited = apply(first.doc, {
    action: "save",
    id: first.doc.id,
    version: 1,
    data: { ...input, client: "Cambio" },
  }).doc;
  const recovered = change(
    edited,
    { action: "version", id: edited.id, version: 2 },
    "tester",
    "event3",
    "COT-1",
    "2026-09-15",
    first.event,
  );
  assert.equal(recovered.doc.client, input.client);
  assert.equal(recovered.doc.version, 3);
  assert.equal(recovered.event.before?.client, "Cambio");
});
test("Validaciones de importes, fechas y documentos inexistentes", () => {
  assert.throws(() =>
    apply(null, { action: "save", data: { ...input, tax: -1 } }),
  );
  assert.throws(() =>
    apply(null, { action: "save", data: { ...input, due: "2020-01-01" } }),
  );
  assert.throws(
    () => apply(null, { action: "save", id: "no-existe", data: input }),
    /inexistente/,
  );
});
