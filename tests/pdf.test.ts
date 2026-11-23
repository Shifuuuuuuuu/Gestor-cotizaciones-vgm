import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { blank, change } from "../shared/model";
import { createQuotationPdf } from "../src/quotationPdf";
test("PDF comercial: marca, precios con descuento, imágenes y paginación", async () => {
  const logo = new Uint8Array(await readFile("public/vgm-icon.png"));
  const imageUrl = "/api/images/12345678-1234-4234-9234-123456789012";
  const doc = change(
    null,
    {
      action: "save",
      data: {
        ...blank(),
        client: "Cliente PDF",
        items: Array.from({ length: 35 }, (_, i) => ({
          description:
            "Producto de prueba " +
            (i + 1) +
            " con especificaciones completas y descripción técnica.",
          productCode: "TEST-" + i,
          productBrand: "MARCA-SNAPSHOT",
          imageUrl,
          quantity: 2,
          price: 1000,
          discount: 25,
        })),
      },
    },
    "test",
    "id",
    "COT-PDF-TEST",
    "2026-09-17",
  ).doc;
  const pdf = createQuotationPdf(doc, { logo, images: { [imageUrl]: logo } });
  assert.ok(pdf.getNumberOfPages() > 1);
  const bytes = Buffer.from(pdf.output("arraybuffer")),
    raw = bytes.toString("latin1");
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((m) => {
      try {
        return inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
      } catch {
        return "";
      }
    })
    .join("\n");
  assert.ok(raw.includes("/Subtype /Image"), "Imagen incrustada en PDF");
  assert.ok(streams.includes("MARCA-SNAPSHOT"), "Marca histórica visible");
  assert.ok(streams.includes("TEST-34"), "Último producto no truncado");
  assert.ok(streams.includes("$750"), "Precio unitario con descuento");
  assert.ok(streams.includes("$1.500"), "Total de línea después de descuento");
  assert.ok(streams.includes("25%"), "Porcentaje visible");
  assert.ok(streams.includes("COT-PDF-TEST"));
});
