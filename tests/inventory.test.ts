import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { blank, type Doc } from "../shared/model";
import { blankProduct, type Product } from "../shared/inventory";
test("Inventario transaccional: reservas, edición, rechazo, facturación y concurrencia", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vgm-inventory-"));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_MODE = "local";
  const { saveProduct, mutate, list, productAccess, importProducts, archiveProduct } =
    await import("../server/store");
  const actor = "Prueba inventario";
  try {
    const p = await saveProduct(
      {
        ...blankProduct(),
        code: "vgm-1",
        description: "Taladro",
        stock: 10,
        price: 1000,
      },
      actor,
    );
    const data = (qty: number) => ({
      ...blank(),
      client: "Cliente prueba",
      items: [
        {
          description: p.description,
          quantity: qty,
          price: p.price,
          discount: 0,
          productId: p.id,
          productType: "service" as const,
        },
      ],
    });
    const stock = async () => {
      const current = (await list()).products.find((x) => x.id === p.id)!;
      return [current.stock, current.reserved];
    };
    let q = await mutate({ action: "save", data: data(6) }, actor);
    assert.equal(
      q.items[0].productType,
      "product",
      "Servidor impide evadir stock falsificando tipo",
    );
    assert.deepEqual(await stock(), [10, 6]);
    await assert.rejects(
      mutate({ action: "save", data: data(5) }, actor),
      /Stock insuficiente/,
    );
    assert.equal((await list()).documents.length, 1);
    await assert.rejects(
      productAccess(p.id, (await list()).products[0].version, true, actor),
      /reservadas/,
    );
    q = await mutate(
      {
        action: "save",
        id: q.id,
        version: q.version,
        data: {
          ...q,
          items: [
            { ...q.items[0], quantity: 2 },
            { ...q.items[0], quantity: 1 },
          ],
        },
      },
      actor,
    );
    assert.deepEqual(await stock(), [10, 3]);
    const firstEvent = (await list()).events.find(
      (e) => e.documentId === q.id && e.action === "save",
    )!;
    q = await mutate(
      {
        action: "version",
        id: q.id,
        version: q.version,
        eventId: firstEvent.id,
      },
      actor,
    );
    assert.deepEqual(await stock(), [10, 6]);
    q = await mutate(
      { action: "status", id: q.id, version: q.version, status: "Enviada" },
      actor,
    );
    q = await mutate(
      { action: "status", id: q.id, version: q.version, status: "Rechazada" },
      actor,
    );
    assert.deepEqual(await stock(), [10, 0]);
    q = await mutate(
      { action: "status", id: q.id, version: q.version, status: "Borrador" },
      actor,
    );
    q = await mutate(
      { action: "save", id: q.id, version: q.version, data: data(4) },
      actor,
    );
    q = await mutate(
      { action: "status", id: q.id, version: q.version, status: "Enviada" },
      actor,
    );
    q = await mutate(
      { action: "status", id: q.id, version: q.version, status: "Aceptada" },
      actor,
    );
    let invoice = await mutate(
      { action: "convert", id: q.id, version: q.version },
      actor,
    );
    assert.deepEqual(
      await stock(),
      [10, 4],
      "Convertir conserva una sola reserva",
    );
    q = await mutate(
      { action: "delete", id: q.id, version: q.version, reason: "Prueba" },
      actor,
    );
    assert.deepEqual(
      await stock(),
      [10, 4],
      "Eliminar origen no libera reserva de factura",
    );
    invoice = await mutate(
      {
        action: "status",
        id: invoice.id,
        version: invoice.version,
        status: "Emitida",
      },
      actor,
    );
    assert.deepEqual(await stock(), [6, 0]);
    invoice = await mutate(
      {
        action: "status",
        id: invoice.id,
        version: invoice.version,
        status: "Anulada",
      },
      actor,
    );
    assert.deepEqual(await stock(), [10, 0]);
    const service = await saveProduct(
      {
        ...blankProduct(),
        code: "SERV-1",
        description: "Instalación",
        type: "service",
      },
      actor,
    );
    await mutate(
      {
        action: "save",
        data: {
          ...data(1),
          items: [
            {
              description: "Servicio",
              quantity: 100,
              price: 500,
              discount: 0,
              productId: service.id,
            },
          ],
        },
      },
      actor,
    );
    assert.equal(
      (await list()).products.find((x) => x.id === service.id)!.reserved,
      0,
    );
    const concurrent = await Promise.allSettled([
      mutate({ action: "save", data: data(7) }, actor),
      mutate({ action: "save", data: data(7) }, actor),
    ]);
    assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
    const winner = (
      concurrent.find(
        (r) => r.status === "fulfilled",
      ) as PromiseFulfilledResult<Doc>
    ).value;
    assert.deepEqual(await stock(), [10, 7]);
    const deleted = await mutate(
      {
        action: "delete",
        id: winner.id,
        version: winner.version,
        reason: "Prueba",
      },
      actor,
    );
    assert.deepEqual(await stock(), [10, 0]);
    let holder = await mutate({ action: "save", data: data(9) }, actor);
    const before = await list();
    await assert.rejects(
      mutate(
        { action: "restore", id: deleted.id, version: deleted.version },
        actor,
      ),
      /Stock insuficiente/,
    );
    assert.deepEqual(
      await list(),
      before,
      "Restauración fallida es atómica, sin historial ficticio",
    );
    holder = await mutate(
      {
        action: "save",
        id: holder.id,
        version: holder.version,
        data: {
          ...holder,
          items: [
            { description: "Manual", quantity: 1, price: 1, discount: 0 },
          ],
        },
      },
      actor,
    );
    assert.deepEqual(
      await stock(),
      [10, 0],
      "Quitar producto devuelve reserva",
    );
    const current = (await list()).products.find((x) => x.id === p.id)!;
    await assert.rejects(
      saveProduct({ ...current, stock: 2 }, actor, p.id, p.version, "Conteo"),
      /CONFLICT/,
    );
    await assert.rejects(
      saveProduct({ ...current, stock: 2 }, actor, p.id, current.version),
      /motivo/,
    );
    const archived = await productAccess(p.id, current.version, true, actor);
    await assert.rejects(
      mutate({ action: "save", data: data(1) }, actor),
      /eliminado/,
    );
    await productAccess(p.id, archived.version, false, actor);
    const paidDraft = await mutate(
      { action: "save", data: { ...data(2), kind: "invoice" } },
      actor,
    );
    const issued = await mutate(
      {
        action: "status",
        id: paidDraft.id,
        version: paidDraft.version,
        status: "Emitida",
      },
      actor,
    );
    const paid = await mutate(
      {
        action: "status",
        id: issued.id,
        version: issued.version,
        status: "Pagada",
      },
      actor,
    );
    assert.deepEqual(await stock(), [8, 0], "Pago no descuenta otra vez");
    await mutate(
      {
        action: "delete",
        id: paid.id,
        version: paid.version,
        reason: "Prueba",
      },
      actor,
    );
    assert.deepEqual(await stock(), [10, 0]);
    const batch = [
      {
        ...blankProduct(),
        code: "BULK-1",
        description: "Masivo uno",
        stock: 3,
      },
      {
        ...blankProduct(),
        code: "BULK-2",
        description: "Masivo dos",
        stock: 2,
      },
    ];
    const job = randomUUID() + "-0";
    const imported = await importProducts(batch, job, actor);
    assert.deepEqual(await importProducts(batch, job, actor), imported);
    await assert.rejects(
      importProducts([{ ...batch[0], stock: 5 }], job, actor),
      /no coincide/,
    );
    const count = (await list()).products.length;
    await assert.rejects(
      importProducts(
        [{ ...batch[0], code: "ROLLBACK" }, batch[1]],
        randomUUID() + "-0",
        actor,
      ),
      /ya existe/,
    );
    assert.equal(
      (await list()).products.length,
      count,
      "Lote inválido no deja productos parciales",
    );
    assert.ok((await list()).stockMovements.length > 10);
    const sample = await saveProduct({...blankProduct(),code:"ARCH-1",description:"Producto archivado",stock:7,price:50},actor);
    const hidden = await archiveProduct(sample.id,sample.version,true,actor);
    assert.equal(hidden.archived,true); assert.equal(hidden.deleted,false); assert.equal(hidden.stock,7);
    await assert.rejects(()=>archiveProduct(sample.id,sample.version,false,actor),/CONFLICT/);
    const shown = await archiveProduct(hidden.id,hidden.version,false,actor);
    assert.equal(shown.archived,false); assert.equal(shown.stock,7);
    assert.equal((await list()).stockMovements.filter(m=>m.productId===sample.id && ["archive","unarchive"].includes(m.action)).length,2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
