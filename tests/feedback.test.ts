import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  beginFeedback,
  beginForegroundSave,
  isForegroundSave,
  feedbackStore,
  dismissFeedback,
  notify,
} from "../src/feedback";

afterEach(() =>
  feedbackStore.getSnapshot().forEach((notice) => dismissFeedback(notice.id)),
);

test("el resultado no aparece hasta terminar la operación", () => {
  const operation = beginFeedback(
    "Creando cotización",
    "Guardando información",
  );
  operation.result("Cotización creada", "COT-000001", "success");
  assert.equal(feedbackStore.getSnapshot()[0].loading, true);
  operation.step("Creando PDF");
  assert.equal(feedbackStore.getSnapshot()[0].title, "Creando PDF");
  operation.success();
  const notice = feedbackStore.getSnapshot()[0];
  assert.equal(notice.loading, false);
  assert.equal(notice.title, "Cotización creada");
  assert.deepEqual(notice.steps, ["Guardando información", "Creando PDF"]);
  assert.equal(notice.description, "COT-000001");
});

test("un error conserva los pasos y nunca termina como éxito", () => {
  const operation = beginFeedback();
  operation.step("Guardando producto");
  operation.error(new Error("Código duplicado"));
  const notice = feedbackStore.getSnapshot()[0];
  assert.equal(notice.kind, "error");
  assert.equal(notice.failed, true);
  assert.equal(notice.loading, false);
  assert.equal(notice.description, "Código duplicado");
  assert.equal(notice.steps.at(-1), "Guardando producto");
});

test("guardado parcial y edición tienen resultados distintos", () => {
  const edit = beginFeedback();
  edit.result("Cliente editado");
  edit.success();
  const partial = beginFeedback();
  partial.result(
    "Cotización guardada; PDF pendiente",
    "Descárgalo desde el detalle.",
    "warning",
  );
  partial.success();
  assert.deepEqual(
    feedbackStore.getSnapshot().map((n) => n.kind),
    ["edit", "warning"],
  );
});

test("el rechazo confirmado es rojo sin marcar un fallo de transporte", () => {
  const operation = beginFeedback();
  operation.result("Cotización rechazada", "Estado confirmado", "error");
  operation.success();
  assert.equal(feedbackStore.getSnapshot()[0].kind, "error");
  assert.notEqual(feedbackStore.getSnapshot()[0].failed, true);
});

test("ocultar el progreso no cancela ni vuelve a abrir la alerta", () => {
  const operation = beginFeedback();
  dismissFeedback(feedbackStore.getSnapshot()[0].id);
  operation.step("Creando PDF");
  operation.success();
  assert.equal(feedbackStore.getSnapshot().length, 0);
});

test("los avisos concurrentes se conservan en orden", () => {
  notify("Cliente creado");
  const operation = beginFeedback();
  operation.error(new Error("Sin conexión"));
  assert.equal(feedbackStore.getSnapshot().length, 2);
  assert.equal(feedbackStore.getSnapshot()[0].title, "Cliente creado");
  dismissFeedback(feedbackStore.getSnapshot()[0].id);
  assert.equal(feedbackStore.getSnapshot()[0].kind, "error");
});

test("el guardado manual no suprime la sincronización de otros documentos", () => {
  const finish = beginForegroundSave("quote-1");
  const finishAgain = beginForegroundSave("quote-1");
  assert.equal(isForegroundSave("quote-1"), true);
  assert.equal(isForegroundSave("quote-2"), false);
  finish();
  assert.equal(isForegroundSave("quote-1"), true);
  finishAgain();
  assert.equal(isForegroundSave("quote-1"), false);
});
