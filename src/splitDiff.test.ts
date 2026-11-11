import { expect, it } from "vitest";
import { splitDiff } from "./splitDiff";

it("numera contexto y reemplazos asimétricos sin inventar una línea ausente", () => {
  const rows = splitDiff(
    "@@ -10,3 +20,4 @@ función\n contexto\n-viejo\n+nuevo\n+extra\n final\n",
  );
  expect(rows?.filter((r) => r.kind === "line")).toEqual([
    {
      kind: "line",
      before: { number: 10, text: "contexto", kind: "context" },
      after: { number: 20, text: "contexto", kind: "context" },
    },
    {
      kind: "line",
      before: { number: 11, text: "viejo", kind: "deletion" },
      after: { number: 21, text: "nuevo", kind: "addition" },
    },
    {
      kind: "line",
      before: undefined,
      after: { number: 22, text: "extra", kind: "addition" },
    },
    {
      kind: "line",
      before: { number: 12, text: "final", kind: "context" },
      after: { number: 23, text: "final", kind: "context" },
    },
  ]);
});
it("admite archivos nuevos y eliminados sin números en el lado vacío", () => {
  expect(
    splitDiff("@@ -0,0 +1,2 @@\n+uno\n+dos\n")
      ?.filter((r) => r.kind === "line")
      .every((r) => !r.before),
  ).toBe(true);
  expect(
    splitDiff("@@ -1,2 +0,0 @@\n-uno\n-dos\n")
      ?.filter((r) => r.kind === "line")
      .every((r) => !r.after),
  ).toBe(true);
});
it("reinicia números entre bloques y archivos y conserva nombres y marcadores", () => {
  const patch =
    "diff --git a/ü.txt b/ü.txt\n--- a/ü.txt\n+++ b/ü.txt\n@@ -1 +1 @@\n-antiguo\n+nuevo\n\\ No newline at end of file\n@@ -30 +40 @@\n-otro\n+cambio\ndiff --git a/b b/b\n@@ -0,0 +1 @@\n+archivo\n";
  const rows = splitDiff(patch)!;
  expect(rows).not.toBeNull();
  expect(
    rows.filter((r) => r.kind === "line").map((r) => r.after?.number),
  ).toEqual([1, 40, 1]);
  expect(
    rows.some(
      (r) => r.kind === "meta" && r.text === "\\ No newline at end of file",
    ),
  ).toBe(true);
  expect(rows.some((r) => r.kind === "meta" && r.text.includes("ü.txt"))).toBe(
    true,
  );
});
it("no confunde contenido parecido a encabezados con metadatos", () => {
  const rows = splitDiff(
    "@@ -1 +1 @@\n--- contenido viejo\n+++ contenido nuevo\n",
  )!;
  expect(rows[1]).toMatchObject({
    before: { text: "-- contenido viejo" },
    after: { text: "++ contenido nuevo" },
  });
});
it.each([
  "Binary files a/image and b/image differ\n",
  "diff --cc archivo\n@@@ -1 -1 +1 @@@\n",
  "@@ -1,2 +1 @@\n-uno\n+nuevo\n",
  "@@ -1 +1 @@\n?desconocido\n",
  "@@ -99999999999999999999 +1 @@\n-a\n+b\n",
  "@@ -0 +1 @@\n-a\n+b\n",
  "rename from uno\nrename to dos\n",
  "",
])(
  "conserva el formato unificado ante contenido no representable: %s",
  (patch) => {
    expect(splitDiff(patch)).toBeNull();
  },
);
