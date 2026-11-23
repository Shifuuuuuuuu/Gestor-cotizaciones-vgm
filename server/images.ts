import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getFirestore } from "firebase-admin/firestore";
import { cloud } from "./store";
const dir = resolve(process.env.DATA_DIR ?? "data", "images");
export function imageMime(data: Buffer) {
  if (data.length < 12) throw new Error("Imagen inválida.");
  if (
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255)
    return "image/jpeg";
  if (
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  throw new Error("Usa una imagen PNG, JPG o WebP.");
}
export async function saveImage(data: Buffer) {
  if (!Buffer.isBuffer(data) || data.length > 400 * 1024)
    throw new Error(
      "La imagen debe pesar como máximo 400 KB después de prepararse.",
    );
  const mime = imageMime(data),
    id = randomUUID();
  if (cloud)
    await getFirestore()
      .doc("images/" + id)
      .create({ mime, data: data.toString("base64") });
  else {
    await mkdir(dir, { recursive: true });
    await writeFile(
      resolve(dir, id + ".json"),
      JSON.stringify({ mime, data: data.toString("base64") }),
    );
  }
  return { url: "/api/images/" + id };
}
export async function getImage(id: string) {
  const value = cloud
    ? (
        await getFirestore()
          .doc("images/" + id)
          .get()
      ).data()
    : JSON.parse(await readFile(resolve(dir, id + ".json"), "utf8"));
  if (!value) throw new Error("Imagen inexistente.");
  return {
    mime: value.mime as string,
    data: Buffer.from(value.data, "base64"),
  };
}
