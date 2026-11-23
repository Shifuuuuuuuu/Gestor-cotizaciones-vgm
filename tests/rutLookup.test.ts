import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSre } from "../server/rutLookup";
test("Consulta RUT: respuesta válida, cuota, ausencia y RUT diferente", () => {
  const rut = "76.883.241-2";
  const found = parseSre(
    {
      result: true,
      rut: "76883241-2",
      razon_social: " Empresa SPA ",
      direccion: "Dato no contratado",
    },
    200,
    rut,
  );
  assert.equal(found.status, "found");
  assert.equal(found.name, "Empresa SPA");
  assert.equal(found.address, undefined);
  assert.equal(
    parseSre({ message: "Cuota agotada" }, 403, rut).status,
    "unavailable",
  );
  assert.equal(parseSre({}, 404, rut).status, "not_found");
  assert.equal(
    parseSre(
      { result: true, rut: "12345678-5", razon_social: "Incorrecta" },
      200,
      rut,
    ).status,
    "unavailable",
  );
  assert.equal(parseSre("<html>", 200, rut).status, "unavailable");
});
