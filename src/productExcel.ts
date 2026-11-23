import * as XLSX from "xlsx-js-style";
import { productSchema, type ProductInput } from "../shared/inventory";
const excel = XLSX.utils
  ? XLSX
  : (XLSX as unknown as { default: typeof XLSX }).default;
export const headers = [
  "Código",
  "Descripción",
  "Tipo",
  "Categoría",
  "Marca",
  "Precio neto CLP",
  "Stock inicial",
];
export function createProductTemplate() {
  const wb = excel.utils.book_new(),
    rows: unknown[][] = [
      headers,
      ...Array.from({ length: 30 }, () => headers.map(() => "")),
    ],
    ws = excel.utils.aoa_to_sheet(rows);
  const border = { style: "medium", color: { rgb: "000000" } },
    thick = { style: "medium", color: { rgb: "000000" } };
  for (let r = 0; r < rows.length; r++)
    for (let c = 0; c < headers.length; c++) {
      const address = excel.utils.encode_cell({ r, c });
      const cell = ws[address] ?? { v: "", t: "s" };
      cell.s = {
        font: {
          name: "Calibri",
          sz: 11,
          bold: r === 0,
          color: { rgb: "172B4D" },
        },
        fill: { fgColor: { rgb: r === 0 ? "BDD7EE" : "FFFFFF" } },
        alignment: { vertical: "center", wrapText: true },
        border: {
          top: r === 0 ? thick : border,
          bottom: r === 0 ? thick : border,
          left: r === 0 ? thick : border,
          right: r === 0 ? thick : border,
        },
        ...(c >= 5 ? { numFmt: "0.###" } : {}),
      };
      ws[address] = cell;
    }
  ws["!cols"] = [
    { wch: 22 },
    { wch: 52 },
    { wch: 18 },
    { wch: 26 },
    { wch: 22 },
    { wch: 22 },
    { wch: 18 },
  ];
  ws["!rows"] = [{ hpt: 32 }];
  ws["!autofilter"] = { ref: "A1:G31" };
  excel.utils.book_append_sheet(wb, ws, "Productos");
  const instructions = excel.utils.aoa_to_sheet([
    ["INSTRUCCIONES"],
    ["Completa la hoja Productos. No cambies los encabezados."],
    [
      "Código: obligatorio y único; letras, números, punto, guion y guion bajo.",
    ],
    ["Descripción: obligatoria. Tipo: Producto o Servicio."],
    [
      "Precio neto CLP: número sin símbolo de moneda. Stock inicial: hasta 3 decimales.",
    ],
    ["Servicios: stock inicial debe ser 0. Categoría y marca son opcionales."],
    [
      "Solo se crean códigos nuevos. Los existentes (incluidos eliminados) se rechazan.",
    ],
    [
      "Máximo 500 filas por archivo. Las imágenes se agregan desde el formulario.",
    ],
    ["Las filas vacías se ignoran. No se admiten fórmulas."],
    [],
    ["EJEMPLO (no se importa desde esta hoja)"],
    headers,
    [
      "VGM-001",
      "Taladro 750 W",
      "Producto",
      "Herramientas",
      "Marca ejemplo",
      45000,
      20,
    ],
    [
      "SRV-001",
      "Instalación por hora",
      "Servicio",
      "Instalación",
      "",
      20000,
      0,
    ],
  ]);
  instructions["!cols"] = [
    { wch: 85 },
    ...Array.from({ length: 6 }, () => ({ wch: 23 })),
  ];
  excel.utils.book_append_sheet(wb, instructions, "Instrucciones");
  return wb;
}
export function templateBuffer() {
  return excel.write(createProductTemplate(), {
    type: "array",
    bookType: "xlsx",
  });
}
export function parseProductWorkbook(buffer: ArrayBuffer): {
  rows: ProductInput[];
  errors: string[];
} {
  const wb = excel.read(buffer, {
    type: "array",
    sheetRows: 503,
    cellFormula: true,
  });
  const ws = wb.Sheets.Productos;
  if (!ws)
    throw new Error("Falta la hoja Productos. Usa la plantilla descargable.");
  if (excel.utils.decode_range(ws["!fullref"] ?? ws["!ref"] ?? "A1").e.r > 500)
    throw new Error(
      "La hoja supera las 500 filas de productos. Divide el archivo en partes.",
    );
  const matrix = excel.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: true,
  });
  const first = matrix[0] ?? [];
  if (headers.some((h, i) => String(first[i] ?? "").trim() !== h))
    throw new Error("Los encabezados no coinciden con la plantilla.");
  const rows: ProductInput[] = [],
    errors: string[] = [],
    codes = new Set<string>();
  for (let r = 1; r < matrix.length; r++) {
    const values = matrix[r];
    if (values.every((v) => v === "" || v === null)) continue;
    if (rows.length + errors.length >= 500) {
      errors.push("Máximo 500 productos por archivo.");
      break;
    }
    if (headers.some((_, c) => ws[excel.utils.encode_cell({ r, c })]?.f)) {
      errors.push("Fila " + (r + 1) + ": no se admiten fórmulas.");
      continue;
    }
    const type = String(values[2]).trim().toLowerCase();
    const numeric = (v: unknown) =>
      typeof v === "number"
        ? v
        : typeof v === "string" && /^\d+(?:[.,]\d{1,3})?$/.test(v.trim())
          ? Number(v.replace(",", "."))
          : NaN;
    const result = productSchema.safeParse({
      code: String(values[0]).trim(),
      description: String(values[1]).trim(),
      type:
        type === "producto"
          ? "product"
          : type === "servicio"
            ? "service"
            : type,
      category: String(values[3]).trim(),
      brand: String(values[4]).trim(),
      price: numeric(values[5]),
      stock: numeric(values[6]),
      imageUrl: "",
    });
    if (!result.success) {
      errors.push(
        "Fila " +
          (r + 1) +
          ": " +
          result.error.issues
            .map((e) => e.path.join(".") + ": " + e.message)
            .join("; "),
      );
      continue;
    }
    if (codes.has(result.data.code)) {
      errors.push("Fila " + (r + 1) + ": código repetido " + result.data.code);
      continue;
    }
    codes.add(result.data.code);
    rows.push(result.data);
  }
  if (!rows.length && !errors.length)
    errors.push("La hoja no contiene productos.");
  return { rows, errors };
}
