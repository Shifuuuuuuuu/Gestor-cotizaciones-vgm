import type { Doc } from "../shared/model";
import { money } from "../shared/model";
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function exportDoc(d: Doc, format: "pdf" | "xlsx" | "docx") {
  if (d.pending)
    throw new Error(
      "Sincroniza el borrador antes de exportar el documento final con su correlativo.",
    );
  const rows = d.items.map((i) => [
    i.description,
    i.quantity,
    i.price,
    i.discount,
    Math.round(i.quantity * i.price * (1 - i.discount / 100)),
  ]);
  const title = `${d.kind === "quote" ? "Cotización" : "Factura interna"} ${d.number}`;
  if (format === "pdf") {
    const { createQuotationPdf, loadPdfAssets } =
      await import("./quotationPdf");
    const pdf = createQuotationPdf(d, await loadPdfAssets(d));
    pdf.save(d.number + ".pdf");
  } else if (format === "xlsx") {
    const { default: ExcelJS } = await import("exceljs");
    const { Workbook } = ExcelJS;
    const book = new Workbook();
    const sheet = book.addWorksheet("Documento");
    sheet.addRows([
      [title],
      ["Cliente", d.client],
      ["RUT", d.rut],
      ["Email", d.email],
      ["Dirección", d.address],
      ["Fecha", d.date],
      ["Vencimiento", d.due],
      ["Estado", d.status],
      [],
      ["Descripción", "Cantidad", "Precio CLP", "Descuento %", "Neto CLP"],
      ...rows,
      [],
      ["Neto", d.net],
      ["Impuesto %", d.tax],
      ["Impuesto CLP", d.taxAmount],
      ["Total CLP", d.total],
      ["Observaciones", d.notes],
    ]);
    sheet.columns = [
      { width: 55 },
      { width: 25 },
      { width: 20 },
      { width: 20 },
      { width: 22 },
    ];
    sheet.getRow(10).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(10).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF686963" },
    };
    sheet.views = [{ state: "frozen", ySplit: 10 }];
    download(
      new Blob([(await book.xlsx.writeBuffer()) as ArrayBuffer]),
      d.number + ".xlsx",
    );
  } else {
    const {
      Document,
      Packer,
      Paragraph,
      Table,
      TableRow,
      TableCell,
      HeadingLevel,
    } = await import("docx");
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: "VGM · " + title,
              heading: HeadingLevel.TITLE,
            }),
            ...[
              "Cliente: " + d.client,
              "RUT: " + d.rut,
              "Contacto: " + d.email,
              "Dirección: " + d.address,
              `Fecha: ${d.date} · Vence: ${d.due}`,
              `Estado: ${d.status} · Versión: ${d.version}`,
            ].map((text) => new Paragraph(text)),
            new Table({
              rows: [
                ["Descripción", "Cant.", "Precio CLP", "Desc. %", "Neto CLP"],
                ...rows,
              ].map(
                (row) =>
                  new TableRow({
                    children: row.map(
                      (v) =>
                        new TableCell({ children: [new Paragraph(String(v))] }),
                    ),
                  }),
              ),
            }),
            ...[
              "Neto: " + money(d.net),
              `Impuesto (${d.tax}%): ${money(d.taxAmount)}`,
              "Total: " + money(d.total),
              d.notes,
              ...(d.kind === "invoice"
                ? ["Factura interna. Sin emisión tributaria electrónica."]
                : []),
            ].map((text) => new Paragraph(text)),
          ],
        },
      ],
    });
    download(await Packer.toBlob(doc), d.number + ".docx");
  }
}
