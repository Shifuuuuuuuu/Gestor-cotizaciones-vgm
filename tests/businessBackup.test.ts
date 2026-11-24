import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, zipStored } from "../server/businessBackup";
test("Respaldo ZIP: CRC estándar, nombres UTF-8 y directorio final íntegro", async () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  const entries = [
    { name: "manifest.json", bytes: Buffer.from('{"version":1}') },
    {
      name: "attachments/cotización.pdf",
      bytes: Buffer.from("%PDF-1.4\n%%EOF"),
    },
  ];
  async function* source() {
    yield* entries;
  }
  const pieces: Buffer[] = [];
  for await (const b of zipStored(source())) pieces.push(b);
  const zip = Buffer.concat(pieces);
  let offset = 0;
  for (const entry of entries) {
    assert.equal(zip.readUInt32LE(offset), 0x04034b50);
    const size = zip.readUInt32LE(offset + 18),
      length = zip.readUInt16LE(offset + 26);
    assert.equal(
      zip.subarray(offset + 30, offset + 30 + length).toString(),
      entry.name,
    );
    const data = zip.subarray(
      offset + 30 + length,
      offset + 30 + length + size,
    );
    assert.deepEqual(data, entry.bytes);
    assert.equal(zip.readUInt32LE(offset + 14), crc32(data));
    offset += 30 + length + size;
  }
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 10), entries.length);
  assert.equal(zip.readUInt32LE(end + 16), offset);
  assert.equal(zip.readUInt32LE(offset), 0x02014b50);
});
