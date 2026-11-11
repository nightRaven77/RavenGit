import assert from "node:assert/strict";
import { test } from "node:test";
import { checkReleaseRef } from "./check-release-ref.mjs";

const input = {
  eventName: "push",
  ref: "refs/tags/v1.0.0-beta.1",
  defaultBranch: "main",
  version: "1.0.0-beta.1",
};
test("acepta el tag exacto de la versión beta", () =>
  assert.equal(checkReleaseRef(input), "tag"));
test("rechaza un tag de otra versión", () =>
  assert.throws(
    () => checkReleaseRef({ ...input, ref: "refs/tags/v1.0.0-beta.2" }),
    /no coincide/,
  ));
test("rechaza tags estables, alpha, mal formados y con sufijos", () => {
  for (const ref of [
    "refs/tags/v1.0.0",
    "refs/tags/v1.0.0-alpha.1",
    "refs/tags/v1.0.0-beta.0",
    "refs/tags/v1.0.0-beta.01",
    "refs/tags/v1.0.0-beta.1-extra",
    "refs/tags/1.0.0-beta.1",
  ])
    assert.throws(
      () => checkReleaseRef({ ...input, ref }),
      /Se requiere un tag/,
    );
});
test("un push de rama nunca es una entrega por tag", () =>
  assert.throws(
    () => checkReleaseRef({ ...input, ref: "refs/heads/main" }),
    /Se requiere un tag/,
  ));
test("permite ejecución manual en la rama predeterminada", () =>
  assert.equal(
    checkReleaseRef({
      ...input,
      eventName: "workflow_dispatch",
      ref: "refs/heads/main",
    }),
    "manual",
  ));
test("rechaza ejecución manual de ramas alternativas o tags", () => {
  for (const ref of ["refs/heads/feature", input.ref])
    assert.throws(
      () => checkReleaseRef({ ...input, eventName: "workflow_dispatch", ref }),
      /rama predeterminada/,
    );
});
test("rechaza eventos externos al flujo de entrega", () =>
  assert.throws(
    () => checkReleaseRef({ ...input, eventName: "pull_request" }),
    /Evento/,
  ));
test("rechaza contexto incompleto", () => {
  assert.throws(
    () => checkReleaseRef({ ...input, defaultBranch: "" }),
    /Falta/,
  );
  assert.throws(
    () => checkReleaseRef({ ...input, ref: undefined }),
    /Se requiere/,
  );
});
