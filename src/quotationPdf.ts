import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { type Doc, money } from "../shared/model";
export type PdfAssets = {
  logo?: Uint8Array;
  images?: Record<string, Uint8Array>;
  missingImages?: number;
};
const charcoal: [number, number, number] = [65, 66, 63],
  mustard: [number, number, number] = [233, 173, 6];
const unitMoney = (n: number) =>
  "$" +
  new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);
const date = (s: string) => s.split("-").reverse().join("/");
export function createQuotationPdf(d: Doc, assets: PdfAssets = {}) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.setProperties({
    title: (d.kind === "quote" ? "Cotización " : "Factura interna ") + d.number,
    subject: "VGM · Herramientas y soluciones",
    author: "VGM",
    creator: "VGM",
  });
  const painted = new Set<number>();
  function header() {
    const page = pdf.getCurrentPageInfo().pageNumber;
    if (painted.has(page)) return;
    painted.add(page);
    pdf.setFillColor(...charcoal);
    pdf.rect(0, 0, 210, 39, "F");
    pdf.setFillColor(...mustard);
    pdf.lines(
      [
        [37, 0],
        [12, 0, 15, -7, 30, -7],
        [33, 0],
        [0, 6],
        [-30, 0],
        [-15, 0, -20, 6, -31, 6],
        [-39, 0],
      ],
      0,
      39,
      [1, 1],
      "F",
      true,
    );
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(14, 10, 21, 21, 1, 1, "F");
    if (assets.logo)
      pdf.addImage(assets.logo, "PNG", 15, 11, 19, 19, "vgm-logo", "FAST");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(24);
    pdf.text("VGM", 40, 20);
    pdf.setFontSize(7);
    pdf.text("HERRAMIENTAS Y SOLUCIONES", 40, 27);
    pdf.setFontSize(d.kind === "quote" ? 20 : 16);
    pdf.text(d.kind === "quote" ? "COTIZACIÓN" : "FACTURA INTERNA", 196, 20, {
      align: "right",
    });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(...mustard);
    pdf.text(d.number, 196, 28, { align: "right" });
    pdf.setTextColor(100, 102, 98);
    pdf.setFontSize(8);
    pdf.text(
      page === 1 ? "PROPUESTA COMERCIAL" : "DETALLE · CONTINUACIÓN",
      14,
      51,
    );
    pdf.text(
      date(d.date) + "  |  " + d.status + "  |  v" + d.version,
      196,
      51,
      { align: "right" },
    );
  }
  const finishY = () =>
    (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
      ?.finalY ?? 60;
  header();
  autoTable(pdf, {
    startY: 59,
    margin: { left: 14, right: 14, top: 59, bottom: 24 },
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9,
      textColor: charcoal,
      cellPadding: 3.5,
      lineColor: [185, 187, 178],
      lineWidth: 0.3,
      overflow: "linebreak",
    },
    columnStyles: { 0: { cellWidth: 112 }, 1: { cellWidth: 70 } },
    body: [
      [
        {
          content:
            "PREPARADO PARA\n" +
            d.client +
            "\nRUT: " +
            (d.rut || "No informado") +
            "\n" +
            [d.email, d.address].filter(Boolean).join("\n"),
          styles: { fillColor: [246, 246, 243] },
        },
        {
          content:
            "FECHA DE EMISIÓN\n" +
            date(d.date) +
            "\n\nVÁLIDA HASTA\n" +
            date(d.due),
          styles: { fillColor: [255, 247, 220] },
        },
      ],
    ],
    willDrawPage: header,
  });
  const tableY = finishY() + 10;
  autoTable(pdf, {
    startY: tableY,
    margin: { left: 14, right: 14, top: 60, bottom: 25 },
    theme: "plain",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    head: [
      [
        "Imagen",
        "Descripción / Código / Marca",
        "Cant.",
        "P. unitario\nCLP",
        "Descuento\npor unidad",
        "P. con desc.\nCLP",
        "Total neto\nCLP",
      ],
    ],
    body: d.items.map((i) => [
      "",
      i.description +
        "\nCódigo: " +
        (i.productCode || "Sin código") +
        "\nMarca: " +
        (i.productBrand || "No informada"),
      new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 }).format(
        i.quantity,
      ),
      unitMoney(i.price),
      i.discount + "%\n-" + unitMoney((i.price * i.discount) / 100),
      unitMoney(i.price * (1 - i.discount / 100)),
      money(Math.round(i.quantity * i.price * (1 - i.discount / 100))),
    ]),
    styles: {
      font: "helvetica",
      fontSize: 8,
      textColor: charcoal,
      cellPadding: { top: 4, right: 2, bottom: 4, left: 2 },
      overflow: "linebreak",
      valign: "middle",
      minCellHeight: 25,
      lineColor: [224, 225, 220],
      lineWidth: { bottom: 0.2 },
    },
    headStyles: {
      fillColor: charcoal,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: { top: 3, right: 2, bottom: 3, left: 2 },
      minCellHeight: 12,
    },
    alternateRowStyles: { fillColor: [249, 249, 246] },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 50 },
      2: { cellWidth: 13, halign: "center" },
      3: { cellWidth: 25, halign: "right" },
      4: { cellWidth: 18, halign: "right", fontSize: 7 },
      5: { cellWidth: 29, halign: "right" },
      6: { cellWidth: 29, halign: "right", fontStyle: "bold" },
    },
    willDrawPage: header,
    didDrawCell: (cell) => {
      if (cell.section !== "body" || cell.column.index !== 0) return;
      const item = d.items[cell.row.index],
        image = item?.imageUrl ? assets.images?.[item.imageUrl] : undefined;
      if (image) {
        const info = pdf.getImageProperties(image),
          scale = Math.min(14 / info.width, 19 / info.height);
        const w = info.width * scale,
          h = info.height * scale;
        pdf.addImage(
          image,
          info.fileType,
          cell.cell.x + (18 - w) / 2,
          cell.cell.y + (cell.cell.height - h) / 2,
          w,
          h,
          item.imageUrl,
          "FAST",
        );
      } else {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(6);
        pdf.setTextColor(145, 147, 140);
        pdf.text(
          item?.imageUrl
            ? "No disponible"
            : item?.productType === "service"
              ? "Servicio"
              : "Sin imagen",
          cell.cell.x + 9,
          cell.cell.y + cell.cell.height / 2,
          { align: "center" },
        );
      }
    },
  });
  let summaryTop = 0;
  const gross = d.items.reduce(
    (sum, i) => sum + Math.round(i.price * i.quantity),
    0,
  );
  autoTable(pdf, {
    startY: finishY() + 7,
    willDrawCell: (cell) => {
      if (
        cell.section === "body" &&
        cell.row.index === 0 &&
        cell.column.index === 0
      )
        summaryTop = cell.cell.y;
    },
    margin: { left: 109, right: 14, top: 60, bottom: 25 },
    theme: "plain",
    pageBreak: "avoid",
    styles: {
      fontSize: 9,
      textColor: charcoal,
      cellPadding: 3,
      lineColor: [185, 187, 178],
      lineWidth: 0.25,
    },
    alternateRowStyles: { fillColor: [246, 246, 243] },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 35, halign: "right" },
    },
    body: [
      ["Subtotal sin descuento", money(gross)],
      ["Descuento total", "-" + money(gross - d.net)],
      ["Neto", money(d.net)],
      ["IVA (" + d.tax + "%)", money(d.taxAmount)],
      [
        {
          content: "TOTAL CLP",
          styles: { fillColor: mustard, fontStyle: "bold", fontSize: 12 },
        },
        {
          content: money(d.total),
          styles: { fillColor: mustard, fontStyle: "bold", fontSize: 12 },
        },
      ],
    ],
    willDrawPage: header,
  });
  const conditions = [
    d.notes.trim(),
    d.kind === "invoice"
      ? "Factura de uso interno. No constituye un documento tributario electrónico."
      : "",
    assets.missingImages
      ? "Algunas imágenes no estaban disponibles al generar este documento."
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  const sideNotes =
    pdf.splitTextToSize(conditions, 77).length * 3.25 + 22 <= 272 - summaryTop;
  if (conditions)
    autoTable(pdf, {
      startY: sideNotes ? summaryTop : finishY() + 9,
      pageBreak: sideNotes ? "avoid" : "auto",
      margin: { left: 14, right: sideNotes ? 111 : 14, top: 60, bottom: 25 },
      theme: "plain",
      showHead: "everyPage",
      head: [["OBSERVACIONES Y CONDICIONES"]],
      body: [[conditions]],
      headStyles: {
        textColor: charcoal,
        fontStyle: "bold",
        fontSize: 8,
        fillColor: [246, 246, 243],
      },
      styles: {
        fontSize: 8,
        textColor: [100, 102, 98],
        cellPadding: 4,
        overflow: "linebreak",
      },
      willDrawPage: header,
    });
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(220, 222, 215);
    pdf.setLineWidth(0.25);
    pdf.line(14, 277, 196, 277);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(105, 107, 101);
    pdf.setFontSize(7);
    pdf.text("VGM · Herramientas y soluciones", 14, 283);
    pdf.text(d.number + " · Página " + page + " de " + pages, 196, 283, {
      align: "right",
    });
    pdf.setFontSize(6.5);
    pdf.text(
      "Valores netos en CLP. Totales por línea redondeados a pesos enteros.",
      14,
      288,
    );
    pdf.setFillColor(...charcoal);
    pdf.rect(0, 293, 210, 4, "F");
    pdf.setFillColor(...mustard);
    pdf.rect(151, 293, 59, 4, "F");
  }
  return pdf;
}
export async function loadPdfAssets(d: Doc): Promise<PdfAssets> {
  if (typeof window === "undefined") return {};
  const { auth } = await import("./api");
  const token = await auth?.currentUser?.getIdToken();
  const headers: Record<string, string> = token
    ? { Authorization: "Bearer " + token }
    : {};
  async function fetchBytes(url: string, protectedImage = false) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: protectedImage ? headers : {},
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error("No se pudo cargar una imagen.");
    return new Uint8Array(await res.arrayBuffer());
  }
  const assets: PdfAssets = { images: {}, missingImages: 0 };
  try {
    assets.logo = await fetchBytes("/vgm-icon.png");
  } catch {
    throw new Error(
      "No se pudo cargar el logo de VGM. Actualiza la página e intenta nuevamente.",
    );
  }
  const urls = [
    ...new Set(d.items.map((i) => i.imageUrl).filter((s): s is string => !!s)),
  ];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(5, urls.length) }, async () => {
      while (cursor < urls.length) {
        const url = urls[cursor++];
        try {
          if (!/^\/api\/images\/[0-9a-f-]{36}$/.test(url))
            throw new Error("Imagen no válida");
          assets.images![url] = await fetchBytes(url, true);
        } catch {
          assets.missingImages!++;
        }
      }
    }),
  );
  return assets;
}
