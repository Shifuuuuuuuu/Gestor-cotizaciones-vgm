import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx-js-style";
import ExcelJS from "exceljs";
import {
  createProductTemplate,
  templateBuffer,
  parseProductWorkbook,
} from "../src/productExcel";
const x = XLSX.utils
  ? XLSX
  : (XLSX as unknown as { default: typeof XLSX }).default;
test("Plantilla Excel: encabezados azul pastel, bordes negros y validación de datos", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer());
  const cell = workbook.getWorksheet("Productos")!.getCell("A1");
  assert.equal(cell.font.bold, true);
  assert.equal((cell.fill as ExcelJS.FillPattern).fgColor?.argb, "FFBDD7EE");
  assert.equal(cell.border.bottom?.style, "medium");
  const wb = createProductTemplate();
  x.utils.sheet_add_aoa(
    wb.Sheets.Productos,
    [
      ["A-1", "Producto de prueba", "Producto", "Herramientas", "VGM", 1000, 4],
      ["S-1", "Servicio de prueba", "Servicio", "", "", 2000, 0],
    ],
    { origin: "A2" },
  );
  const buffer = x.write(wb, { type: "array", bookType: "xlsx" });
  const parsed = parseProductWorkbook(buffer);
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows[1].type, "service");
  wb.Sheets.Productos.G3.v = 1;
  assert.ok(
    parseProductWorkbook(x.write(wb, { type: "array", bookType: "xlsx" }))
      .errors.length,
  );
  wb.Sheets.Productos.G3.v = 0;
  wb.Sheets.Productos.F2.f = "1+1";
  assert.match(
    parseProductWorkbook(
      x.write(wb, { type: "array", bookType: "xlsx" }),
    ).errors.join(" "),
    /fórmulas/,
  );
});
