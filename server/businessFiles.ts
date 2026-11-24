import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { cloud, businessSnapshot, list } from "./store";
import { listCustomers } from "./people";
import { cleanRut } from "../shared/people";
import { saveBusiness } from "./business";
import type { BusinessRecord } from "../shared/business";
const dir = resolve(process.env.DATA_DIR ?? "data", "attachments");
export function checkFile(bytes: Buffer, originalName: string) {
  if (
    !Buffer.isBuffer(bytes) ||
    !bytes.length ||
    bytes.length > 5 * 1024 * 1024
  )
    throw new Error("Selecciona un archivo de hasta 5 MB.");
  const name = originalName.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 180);
  const ext = name.toLowerCase().split(".").at(-1);
  let mime = "";
  if (ext === "pdf" && bytes.subarray(0, 5).toString() === "%PDF-")
    mime = "application/pdf";
  if (
    ext === "png" &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    mime = "image/png";
  if (
    ["jpg", "jpeg"].includes(ext ?? "") &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    mime = "image/jpeg";
  if (
    ext === "webp" &&
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    mime = "image/webp";
  if (
    ["xlsx", "docx"].includes(ext ?? "") &&
    bytes[0] === 80 &&
    bytes[1] === 75 &&
    bytes[2] === 3 &&
    bytes[3] === 4
  )
    mime =
      ext === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (!mime)
    throw new Error(
      "El contenido no coincide con un PDF, imagen JPG/PNG/WebP, Excel .xlsx o Word .docx válido.",
    );
  return {
    name,
    mime,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
export async function uploadBusinessFile(
  parentId: string,
  name: string,
  bytes: Buffer,
  visibleToClient: boolean,
  actor: string,
  customerId?: string,
) {
  z.uuid().parse(parentId);
  const state = await businessSnapshot();
  let parent: { customerId: string } | undefined = state.records.find(
    (r) =>
      r.id === parentId && !r.deleted && !["file", "portal"].includes(r.kind),
  );
  if (!parent) {
    const doc = (await list()).documents.find(
      (d) => d.id === parentId && !d.deleted,
    );
    const customer =
      doc &&
      (await listCustomers()).find(
        (c) =>
          (!customerId || c.id === customerId) &&
          cleanRut(c.rut) &&
          cleanRut(c.rut) === cleanRut(doc.rut),
      );
    if (customer) parent = { customerId: customer.id };
  }
  if (!parent || (customerId && parent.customerId !== customerId))
    throw new Error("El registro del archivo no está disponible.");
  const info = checkFile(bytes, name);
  const id = randomUUID();
  if (cloud) {
    const db = getFirestore(),
      batch = db.batch();
    for (
      let offset = 0, chunk = 0;
      offset < bytes.length;
      offset += 256 * 1024, chunk++
    )
      batch.set(
        db.doc(`businessBlobs/${id}/chunks/${String(chunk).padStart(4, "0")}`),
        {
          base64: bytes
            .subarray(offset, offset + 256 * 1024)
            .toString("base64"),
        },
      );
    await batch.commit();
  } else {
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, id), bytes, { flag: "wx" });
  }
  try {
    return await saveBusiness({
      kind: "file",
      data: {
        ...info,
        parentId,
        customerId: parent.customerId,
        visibleToClient,
      },
      actor,
      createId: id,
      allowInternal: true,
    });
  } catch (error) {
    if (cloud)
      await getFirestore().recursiveDelete(
        getFirestore().doc("businessBlobs/" + id),
      );
    else await unlink(resolve(dir, id)).catch(() => {});
    throw error;
  }
}
export async function downloadBusinessFile(record: BusinessRecord) {
  if (record.kind !== "file" || record.deleted)
    throw new Error("Archivo no disponible.");
  z.uuid().parse(record.id);
  const bytes = cloud
    ? Buffer.concat(
        (
          await getFirestore()
            .collection(`businessBlobs/${record.id}/chunks`)
            .orderBy("__name__")
            .get()
        ).docs.map((d) => Buffer.from(d.data().base64, "base64")),
      )
    : await readFile(resolve(dir, record.id));
  if (createHash("sha256").update(bytes).digest("hex") !== record.data.sha256)
    throw new Error("El archivo no pasó la verificación de integridad.");
  return bytes;
}
