import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blank, change } from "../shared/model";
test("Migración: conserva números existentes y continúa cada serie por separado", async () => {
  const folder = await mkdtemp(join(tmpdir(), "vgm-migration-test-"));
  process.env.DATA_DIR = folder;
  process.env.STORAGE_MODE = "local";
  const data = {
    ...blank(),
    client: "Empresa",
    items: [{ description: "Servicio", quantity: 1, price: 1000, discount: 0 }],
  };
  const quote = change(
    null,
    { action: "save", data },
    "test",
    "quote-id",
    "COT-000012",
    "2026-09-15",
  ).doc;
  quote.deleted = true;
  const invoice = change(
    null,
    { action: "save", data: { ...data, kind: "invoice" } },
    "test",
    "invoice-id",
    "FAC-000004",
    "2026-09-15",
  ).doc;
  await writeFile(
    join(folder, "store.json"),
    JSON.stringify({ documents: [quote, invoice], events: [], counter: 99 }),
  );
  try {
    const { mutate, list } = await import("../server/store");
    const q = await mutate({ action: "save", data }, "test");
    const f = await mutate(
      { action: "save", data: { ...data, kind: "invoice" } },
      "test",
    );
    assert.equal(q.number, "COT-000013");
    assert.equal(f.number, "FAC-000005");
    assert.equal(
      (await list()).documents.find((d) => d.id === quote.id)?.number,
      "COT-000012",
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
