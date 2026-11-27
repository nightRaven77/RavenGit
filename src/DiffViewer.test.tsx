// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DiffViewer, { DiffContent } from "./DiffViewer";
import * as split from "./splitDiff";
afterEach(cleanup);
afterEach(() => vi.restoreAllMocks());
const patch = "@@ -3 +7 @@\n-antes <script>\n+después <script>\n";
it("el unificado no calcula filas divididas y no vuelve a montar líneas por un render ajeno", () => {
  const parse = vi.spyOn(split, "splitDiff");
  const view = render(<DiffContent text={patch} mode="unified" />);
  const line = screen.getByLabelText("Contenido del diff").firstChild;
  view.rerender(<DiffContent text={patch} mode="unified" />);
  expect(parse).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Contenido del diff").firstChild).toBe(line);
  view.rerender(<DiffContent text={patch} mode="split" />);
  expect(parse).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("table")).toBeTruthy();
});
it("alterna formatos y numera lados sin interpretar HTML", async () => {
  render(<DiffViewer text={patch} />);
  expect(screen.getByLabelText("Contenido del diff")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Dividido" }));
  expect(screen.getByLabelText("Antes, línea 3")).toBeTruthy();
  expect(screen.getByLabelText("Después, línea 7")).toBeTruthy();
  expect(
    screen.getByText(
      (_, node) =>
        node?.tagName === "CODE" &&
        Boolean(node.textContent?.includes("después <script>")),
    ),
  ).toBeTruthy();
  expect(document.querySelector("script")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Unificado" }));
  expect(screen.queryByRole("table")).toBeNull();
});
it("al cambiar a binario vuelve al unificado sin ocultar su contenido", async () => {
  const view = render(<DiffViewer text={patch} />);
  await userEvent.click(screen.getByRole("button", { name: "Dividido" }));
  view.rerender(<DiffViewer text="Binary files a/image and b/image differ" />);
  expect(
    (screen.getByRole("button", { name: "Dividido" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    screen.getByText("Binary files a/image and b/image differ"),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Unificado" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});

it("aplica resaltado de sintaxis, intra-línea, minimapa y selección por rango", async () => {
  const onLineClick = vi.fn();
  const sample = [
    "@@ -1,2 +1,2 @@",
    '-const saludo = "Hola mundo";',
    '+const saludo = "Hola RavenGit";',
    " context",
  ].join("\n");

  const { container } = render(
    <DiffContent
      text={sample}
      mode="unified"
      filePath="src/ejemplo.ts"
      selectable
      selectedLines={new Set([1])}
      onLineClick={onLineClick}
    />,
  );

  expect(container.querySelector(".syn-keyword")?.textContent).toBe("const");
  expect(container.querySelector(".diff-inline-del")?.textContent).toBe(
    "mundo",
  );
  expect(container.querySelector(".diff-inline-add")?.textContent).toBe(
    "RavenGit",
  );

  const lineBtn = screen.getByRole("button", {
    name: /Seleccionar línea \+2:/,
  });
  expect(lineBtn.getAttribute("aria-pressed")).toBe("true");
  await userEvent.click(lineBtn);
  expect(onLineClick).toHaveBeenCalledWith(1, false);
});

it("muestra controles -w, contexto y minimapa en diffs largos", async () => {
  const onIgnore = vi.fn();
  const onContext = vi.fn();
  const longPatch = [
    "@@ -1,25 +1,25 @@",
    ...Array.from({ length: 24 }, (_, i) => ` linea ${i}`),
    "-anterior",
    "+actual",
  ].join("\n");

  const { container } = render(
    <DiffViewer
      text={longPatch}
      filePath="src/archivo.rs"
      ignoreWhitespace={false}
      onIgnoreWhitespaceChange={onIgnore}
      contextLines={3}
      onContextLinesChange={onContext}
    />,
  );

  expect(container.querySelector(".diff-minimap")).toBeTruthy();
  await userEvent.click(
    screen.getByRole("button", { name: "Ignorar espacios" }),
  );
  expect(onIgnore).toHaveBeenCalledWith(true);

  await userEvent.selectOptions(
    screen.getByLabelText("Líneas de contexto"),
    "6",
  );
  expect(onContext).toHaveBeenCalledWith(6);
});

it("activa ajuste de líneas por defecto y permite alternarlo", async () => {
  const { container } = render(
    <DiffViewer
      text={
        '@@ -1 +1 @@\n-const larga = "texto muy largo";\n+const larga = "texto muy largo actualizado para probar ajuste";\n'
      }
      filePath="src/wrap.ts"
    />,
  );

  const toggle = screen.getByRole("button", { name: "Ajustar líneas" });
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelector(".diff-content-wrap.wrap-lines")).toBeTruthy();

  await userEvent.click(toggle);
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  expect(container.querySelector(".diff-content-wrap.no-wrap")).toBeTruthy();
});
