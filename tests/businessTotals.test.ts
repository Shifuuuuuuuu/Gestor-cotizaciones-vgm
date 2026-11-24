import { test } from "node:test";
import assert from "node:assert/strict";
import { blank, type Doc } from "../shared/model";
import {
  businessSchemas,
  businessTotals,
  compareOrderLines,
  type BusinessState,
} from "../shared/business";
test("El margen usa netos y distribuye facturación parcial sin sumar IVA como ingreso", () => {
  const invoice = {
    ...blank(),
    id: "invoice",
    kind: "invoice",
    status: "Pagada",
    total: 119000,
    net: 100000,
    taxAmount: 19000,
    deleted: false,
  } as Doc;
  const state = {
    records: [
      {
        id: "link",
        kind: "billing",
        deleted: false,
        data: {
          invoiceId: "invoice",
          jobId: "job",
          orderId: "",
          amount: 59500,
        },
      },
      {
        id: "cost",
        kind: "cost",
        deleted: false,
        data: { jobId: "job", amount: 20000 },
      },
      {
        id: "part",
        kind: "serviceDoc",
        deleted: false,
        data: {
          category: "timesheet",
          jobId: "job",
          hours: 2,
          hourlyCost: 1000,
          materials: [{ quantity: 1.5, cost: 1000 }],
        },
      },
    ],
    events: [],
    counters: {},
  } as unknown as BusinessState;
  const totals = businessTotals(state, [invoice], "job");
  assert.equal(totals.billed, 59500);
  assert.equal(totals.billedNet, 50000);
  assert.equal(totals.costs, 23500);
  assert.equal(totals.margin, 26500);
  assert.equal(totals.paid, 59500);
  assert.equal(totals.outstanding, 0);
});
test("Comparar OC detecta variaciones y descripciones ambiguas", () => {
  const quote = {
    ...blank(),
    items: [
      { description: "Servicio A", quantity: 2, price: 100, discount: 5 },
      { description: "Repetido", quantity: 1, price: 10, discount: 0 },
      { description: "Repetido", quantity: 3, price: 20, discount: 0 },
    ],
  } as Doc;
  const order = businessSchemas.order.parse({
    customerId: "00000000-0000-4000-8000-000000000001",
    reference: "OC",
    date: "2026-11-23",
    amount: 1000,
    status: "Recibida",
    items: [
      { description: "servicio a", quantity: 2, price: 100, discount: 5 },
      { description: "Servicio A", quantity: 3, price: 100, discount: 5 },
      { description: "Otro", quantity: 1, price: 10, discount: 0 },
      { description: "Repetido", quantity: 1, price: 10, discount: 0 },
    ],
  });
  assert.deepEqual(
    compareOrderLines(order, quote).map((r) => r.comparison),
    [
      "Coincide",
      "Cantidad, precio o descuento diferente",
      "No está en la cotización",
      "Descripción repetida: revisar manualmente",
    ],
  );
});
