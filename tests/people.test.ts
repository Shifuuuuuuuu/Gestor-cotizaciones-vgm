import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRut, validRut, cleanRut } from "../shared/people";
test("RUT: formato incremental, normalización y dígito verificador", () => {
  assert.equal(formatRut("123456785"), "12.345.678-5");
  assert.equal(cleanRut("12.345.678-5"), "123456785");
  assert.ok(validRut("12.345.678-5"));
  assert.ok(!validRut("12.345.678-9"));
  assert.equal(formatRut("1"), "1");
  assert.equal(formatRut("12345678k"), "12.345.678-K");
});
