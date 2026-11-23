import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
test("Sesiones: persistencia en disco, expiración, rotación y cierre", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vgm-sessions-"));
  process.env.DATA_DIR = dir;
  const { createSession, readSession, revokeSession } =
    await import("../server/sessions");
  try {
    const token = await createSession("user1", 86400000);
    assert.equal((await readSession(token))?.id, "user1");
    const disk = await readFile(join(dir, "sessions.json"), "utf8");
    assert.ok(!disk.includes(token));
    assert.equal(Object.values(JSON.parse(disk)).length, 1);
    const rotated = await createSession("user1", 86400000, token);
    assert.equal(await readSession(token), undefined);
    await revokeSession(rotated);
    assert.equal(await readSession(rotated), undefined);
    const expired = await createSession("user1", -1);
    assert.equal(await readSession(expired), undefined);
    assert.equal(await readSession("invalid"), undefined);
  } finally {
    assert.ok(resolve(dir).startsWith(resolve(tmpdir())));
    await rm(dir, { recursive: true, force: true });
  }
});
