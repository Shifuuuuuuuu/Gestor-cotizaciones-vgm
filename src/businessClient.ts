import { kindModules } from "../shared/access";
import { auth, api } from "./api";
import { download } from "./exports";
import { beginFeedback } from "./feedback";
import { serviceCategories, type BusinessRecord } from "../shared/business";
export const businessLabels = {
  order: "Orden de compra",
  job: "Orden de trabajo",
  serviceDoc: "Documento de servicio",
  payment: "Pago",
  paymentClaim: "Comprobante por revisar",
  cost: "Costo",
  billing: "Vínculo de facturación",
  file: "Archivo",
  portal: "Acceso de cliente",
};
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago" }).format(
    new Date(),
  );
export async function binaryRequest(
  path: string,
  file?: File,
  share = false,
  portal = false,
) {
  const token = portal ? undefined : await auth?.currentUser?.getIdToken();
  const res = await fetch("/api/" + path, {
    method: file ? "POST" : "GET",
    credentials: "same-origin",
    signal: AbortSignal.timeout(file ? 60000 : 120000),
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(file
        ? {
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
            "X-Share-Client": String(share),
          }
        : {}),
    },
    ...(file ? { body: file } : {}),
  });
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    throw new Error(result.error ?? "No se pudo procesar el archivo.");
  }
  return file ? await res.json() : await res.blob();
}
export async function recordPdf(record: BusinessRecord, portalToken?: string) {
  if (typeof window !== "undefined" && !portalToken)
    await api("access/check", {
      module: kindModules[record.kind],
      action: "export",
    });
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  let y = 22;
  const line = (text: string, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(bold ? 13 : 10);
    for (const row of pdf.splitTextToSize(text, 172)) {
      if (y > 275) {
        pdf.addPage();
        y = 22;
      }
      pdf.text(row, 19, y);
      y += 6;
    }
    y += 3;
  };
  pdf.setFillColor(233, 173, 6);
  pdf.rect(0, 0, 210, 6, "F");
  line("VGM · " + businessLabels[record.kind], true);
  line(record.number + " · Versión " + record.version, true);
  line(record.customerName + " · RUT " + record.customerRut);
  const labels: Record<string, string> = {
    title: "Título",
    reference: "Referencia",
    date: "Fecha",
    due: "Entrega",
    end: "Término",
    status: "Estado",
    amount: "Monto total CLP",
    location: "Lugar",
    assignee: "Responsable",
    scope: "Alcance",
    exclusions: "Exclusiones",
    content: "Contenido",
    signer: "Recibido por",
    acceptedVersion: "Versión del servicio recibida",
    periodEnd: "Vigencia / período hasta",
    warrantyUntil: "Garantía hasta",
    nextServiceDate: "Próximo servicio",
    hours: "Horas",
    notes: "Observaciones",
  };
  if (record.kind === "serviceDoc")
    line(serviceCategories[record.data.category], true);
  for (const [key, label] of Object.entries(labels)) {
    const value = (record.data as any)[key];
    if (value !== undefined && value !== "" && value !== 0)
      line(label + ": " + value);
  }
  if (record.kind === "serviceDoc") {
    if (record.data.checklist.length) {
      line("Lista de verificación", true);
      record.data.checklist.forEach((item) =>
        line((item.done ? "[OK] " : "[ ] ") + item.label),
      );
    }
    if (record.data.materials.length) {
      line("Materiales", true);
      record.data.materials.forEach((item) =>
        line(item.description + " · Cantidad: " + item.quantity),
      );
    }
    if (record.data.category === "acceptance")
      line(
        "Recepción registrada en VGM. Este respaldo no constituye una firma electrónica avanzada.",
      );
  }
  line("Documento de respaldo interno. No es un documento tributario.");
  pdf.save(record.number + ".pdf");
}
export const saveAttachment = async (
  path: string,
  record: Extract<BusinessRecord, { kind: "file" }>,
  portal = false,
) =>
  download(
    await binaryRequest(path, undefined, false, portal),
    record.data.name,
  );
export async function downloadCommercialBackup() {
  const op = beginFeedback(
    "Preparando respaldo",
    "Reuniendo registros y archivos",
  );
  try {
    const blob = await binaryRequest("business/backup");
    op.step("Iniciando descarga ZIP");
    download(blob, "respaldo-operaciones-vgm-" + today() + ".zip");
    op.success(
      "Respaldo comercial generado",
      "Incluye registros y adjuntos comerciales. No incluye cuentas, sesiones ni imágenes del catálogo.",
    );
  } catch (e) {
    op.error(e);
  }
}
