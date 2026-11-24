import type { Response } from "express";
import { getFirestore } from "firebase-admin/firestore";
import { cloud, completeLocalSnapshot } from "./store";
import { listCustomers } from "./people";
import { downloadBusinessFile } from "./businessFiles";
import { recordsOf, type BusinessState } from "../shared/business";
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let value = i;
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const value of bytes) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export async function* zipStored(
  entries: AsyncIterable<{ name: string; bytes: Buffer }>,
) {
  let offset = 0;
  const central: Buffer[] = [];
  for await (const entry of entries) {
    if (central.length >= 65535 || offset + entry.bytes.length > 0xffffffff)
      throw new Error(
        "El respaldo excede el formato ZIP admitido. Respalda el almacenamiento del servidor.",
      );
    const name = Buffer.from(entry.name, "utf8"),
      crc = crc32(entry.bytes),
      header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(entry.bytes.length, 18);
    header.writeUInt32LE(entry.bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8);
    directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(entry.bytes.length, 20);
    directory.writeUInt32LE(entry.bytes.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([directory, name]));
    yield header;
    yield name;
    yield entry.bytes;
    offset += header.length + name.length + entry.bytes.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  for (const entry of central) yield entry;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  yield end;
}
async function snapshot() {
  if (!cloud)
    return {
      ...(await completeLocalSnapshot()),
      customers: await listCustomers(),
    };
  const db = getFirestore();
  return db.runTransaction(async (t) => {
    const names = [
      "documents",
      "events",
      "products",
      "stockMovements",
      "businessRecords",
      "businessEvents",
      "customers",
    ];
    const collections = await Promise.all(
      names.map((name) => t.get(db.collection(name))),
    );
    const counter = await t.get(db.doc("metadata/business-counters"));
    const data = Object.fromEntries(
      names.map((name, i) => [name, collections[i].docs.map((d) => d.data())]),
    );
    return {
      documents: data.documents,
      events: data.events,
      products: data.products,
      stockMovements: data.stockMovements,
      customers: data.customers,
      business: {
        records: data.businessRecords,
        events: data.businessEvents,
        counters: counter.data()?.values ?? {},
      },
    };
  });
}
export async function sendBusinessBackup(res: Response) {
  const state = await snapshot();
  async function* entries() {
    yield {
      name: "manifest.json",
      bytes: Buffer.from(
        JSON.stringify(
          {
            format: "vgm-commercial-backup",
            version: 1,
            exportedAt: new Date().toISOString(),
            contents:
              "Operaciones, documentos, clientes, catálogo y adjuntos comerciales. No incluye cuentas, sesiones ni imágenes del catálogo.",
          },
          null,
          2,
        ),
      ),
    };
    yield {
      name: "records.json",
      bytes: Buffer.from(JSON.stringify(state, null, 2)),
    };
    for (const file of recordsOf(
      state.business.records as BusinessState["records"],
      "file",
    ))
      yield {
        name: "attachments/" + file.id + "/" + file.data.name,
        bytes: await downloadBusinessFile({ ...file, deleted: false }),
      };
  }
  res.set({
    "Content-Type": "application/zip",
    "Content-Disposition":
      'attachment; filename="respaldo-operaciones-vgm.zip"',
    "Cache-Control": "no-store",
  });
  try {
    for await (const bytes of zipStored(entries())) {
      if (res.destroyed) break;
      if (!res.write(bytes))
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            res.off("drain", drain);
            res.off("close", close);
          };
          const drain = () => {
            cleanup();
            resolve();
          };
          const close = () => {
            cleanup();
            reject(new Error("Descarga interrumpida."));
          };
          res.once("drain", drain);
          res.once("close", close);
        });
    }
    res.end();
  } catch (error) {
    res.destroy(error as Error);
  }
}
