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
  expect(screen.getByText("después <script>", { exact: false })).toBeTruthy();
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
