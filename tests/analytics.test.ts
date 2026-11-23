import { test } from "node:test";
import assert from "node:assert/strict";
import { analytics } from "../shared/analytics";
import { blank, totals, type Doc } from "../shared/model";
function doc(id: string, overrides: Partial<Doc> = {}): Doc {
  const data = {
    ...blank(),
    client: "Cliente prueba",
    date: "2026-09-01",
    due: "2026-09-10",
    items: [{ description: "Servicio", quantity: 2, price: 100, discount: 10 }],
    tax: 19,
  };
  return {
    ...data,
    ...totals(data),
    id,
    number: id,
    status: "Borrador",
    version: 1,
    deleted: false,
    createdAt: "",
    updatedAt: "",
    sourceId: null,
    ...overrides,
  };
}
test("Dashboard: separa cotización de factura, aplica descuentos y excluye eliminados y pendientes", () => {
  const quote = doc("q", { status: "Aceptada" });
  const invoice = doc("i", {
    kind: "invoice",
    status: "Emitida",
    sourceId: "q",
  });
  const a = analytics(
    [
      quote,
      invoice,
      doc("draft", { kind: "invoice" }),
      doc("void", { kind: "invoice", status: "Anulada" }),
      doc("deleted", { deleted: true }),
      doc("pending", { pending: true }),
    ],
    [],
    [],
    "",
    "",
    "2026-09-21",
  );
  assert.equal(a.quoted, 214);
  assert.equal(a.billed, 214);
  assert.equal(a.receivable, 214);
  assert.equal(a.items[0].net, 180);
  assert.equal(a.items[0].quantity, 2);
  assert.equal(a.clients[0].count, 1);
  assert.equal(a.overdue.length, 1);
  assert.equal(a.pending, 1);
  assert.equal(a.acceptance, 100);
  assert.equal(a.count, 4);
  assert.deepEqual(a.monthly, [
    { month: "2026-09", cotizado: 214, facturado: 214 },
  ]);
});
test("Dashboard: fechas inclusivas, pagos, RUT normalizado y período vacío", () => {
  const a = analytics(
    [
      doc("a", { kind: "invoice", status: "Pagada", rut: "12.345.678-5" }),
      doc("b", { kind: "invoice", status: "Emitida", rut: "12345678-5" }),
      doc("old", { date: "2026-08-31" }),
    ],
    [],
    [],
    "2026-09-01",
    "2026-09-01",
    "2026-09-21",
  );
  assert.equal(a.paid, 214);
  assert.equal(a.clients.length, 1);
  assert.equal(a.clients[0].total, 428);
  assert.equal(a.acceptance, null);
  const empty = analytics([doc("a")], [], [], "2027-01-01", "2027-12-31");
  assert.equal(empty.count, 0);
  assert.deepEqual(empty.monthly, []);
  assert.equal(empty.billed, 0);
});
