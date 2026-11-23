import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { blank, change } from "../shared/model";
test("PDF, Excel y Word generan archivos válidos con el total correcto", async () => {
  const { exportDoc } = await import("../src/exports");
  const d = change(
    null,
    {
      action: "save",
      data: {
        ...blank(),
        client: "Prueba exportación",
        items: [
          { description: "Servicio", quantity: 2, price: 1000, discount: 0 },
        ],
      },
    },
    "tester",
    "id",
    "COT-TEST",
    "2026-09-15",
  ).doc;
  const folder = await mkdtemp(join(tmpdir(), "vgm-export-test-"));
  const cwd = process.cwd();
  const downloads: Promise<ArrayBuffer>[] = [];
  const originalDocument = globalThis.document;
  const originalTimeout = globalThis.setTimeout;
  try {
    process.chdir(folder);
    await exportDoc(d, "pdf");
    const pdf = await readFile("COT-TEST.pdf");
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    assert.ok(pdf.length > 1000);
    globalThis.document = {
      createElement: () => ({
        href: "",
        download: "",
        click() {
          downloads.push(fetch(this.href).then((r) => r.arrayBuffer()));
        },
      }),
    } as unknown as Document;
    globalThis.setTimeout = ((callback: () => void) =>
      originalTimeout(callback, 100)) as typeof setTimeout;
    await exportDoc(d, "xlsx");
    const excel = await downloads[0];
    const { default: ExcelJS } = await import("exceljs");
    const { Workbook } = ExcelJS;
    const workbook = new Workbook();
    await workbook.xlsx.load(excel);
    const sheet = workbook.getWorksheet("Documento")!;
    assert.equal(sheet.getCell("B2").value, d.client);
    assert.ok(
      sheet
        .getSheetValues()
        .some((row) => Array.isArray(row) && row.includes(d.total)),
    );
    await exportDoc(d, "docx");
    const word = Buffer.from(await downloads[1]);
    assert.equal(word.subarray(0, 2).toString(), "PK");
    assert.ok(word.length > 1000);
  } finally {
    globalThis.document = originalDocument;
    globalThis.setTimeout = originalTimeout;
    process.chdir(cwd);
    await rm(folder, { recursive: true, force: true });
  }
});
