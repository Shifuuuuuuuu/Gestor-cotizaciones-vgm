import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { blank, change } from "../shared/model";
import { createQuotationPdf } from "../src/quotationPdf";
mkdirSync("output/pdf", { recursive: true });
mkdirSync("tmp/pdfs", { recursive: true });
const imageUrl = "/api/images/12345678-1234-4234-9234-123456789012";
const logo = new Uint8Array(readFileSync("public/vgm-icon.png"));
const rows = [
  {
    description:
      "Servicio de personalización con imagen corporativa. Ejemplo ilustrativo de una línea con imagen.",
    productCode: "DEMO-001",
    productBrand: "VGM",
    productType: "service" as const,
    imageUrl,
    quantity: 2,
    price: 45000,
    discount: 10,
  },
  {
    description:
      "Taladro percutor 750 W. Incluye maletín y accesorios básicos.",
    productCode: "DEMO-002",
    productBrand: "Marca de ejemplo",
    productType: "product" as const,
    quantity: 3,
    price: 58990,
    discount: 15,
  },
  {
    description: "Instalación y puesta en marcha por hora de trabajo.",
    productCode: "DEMO-003",
    productBrand: "VGM",
    productType: "service" as const,
    quantity: 1.5,
    price: 20000,
    discount: 0,
  },
];
const make = (items: typeof rows) =>
  change(
    null,
    {
      action: "save",
      data: {
        ...blank(),
        client: "Empresa de ejemplo · DATOS FICTICIOS",
        rut: "",
        email: "compras@example.com",
        address: "Dirección de ejemplo, Santiago",
        items,
        notes:
          "MUESTRA DE DISEÑO. No corresponde a una cotización real.\n\nValidez de la oferta: 30 días. Valores netos en pesos chilenos. El IVA se indica en el resumen. Disponibilidad y entrega sujetas a confirmación.",
      },
    },
    "demo",
    "demo-id",
    "COT-DEMO-001",
    "2026-09-17",
  ).doc;
const assets = { logo, images: { [imageUrl]: logo } };
const short = createQuotationPdf(make(rows), assets);
writeFileSync(
  "output/pdf/Muestra-cotizacion-VGM.pdf",
  Buffer.from(short.output("arraybuffer")),
);
const longRows = Array.from({ length: 32 }, (_, i) => ({
  ...rows[i % 3],
  description:
    "Artículo " +
    (i + 1) +
    ". " +
    rows[i % 3].description +
    " Especificaciones y condiciones de entrega para comprobar el ajuste del contenido sin truncar texto.",
}));
const longDoc = make(longRows);
longDoc.notes +=
  "\n\n" +
  Array.from(
    { length: 25 },
    (_, i) =>
      "Condición " +
      (i + 1) +
      ": revisar las especificaciones técnicas antes de confirmar la compra.",
  ).join("\n");
const long = createQuotationPdf(longDoc, assets);
writeFileSync(
  "tmp/pdfs/multipagina.pdf",
  Buffer.from(long.output("arraybuffer")),
);
console.log(
  JSON.stringify({
    shortPages: short.getNumberOfPages(),
    longPages: long.getNumberOfPages(),
    total: make(rows).total,
  }),
);
