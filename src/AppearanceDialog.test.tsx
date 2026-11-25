// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppearanceDialog from "./AppearanceDialog";
import { GRAPH_PALETTES, THEMES } from "./themes";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

afterEach(cleanup);

it("muestra todos los temas, paletas de grafo y vista previa en vivo", () => {
  render(
    <AppearanceDialog
      theme="obsidian"
      graphPalette="kraken"
      onChange={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  expect(
    screen.getByRole("heading", { name: "Apariencia y colores" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("region", { name: "Vista previa en vivo" }),
  ).toBeTruthy();
  for (const theme of THEMES) {
    expect(screen.getByText(theme.name)).toBeTruthy();
  }
  for (const palette of GRAPH_PALETTES) {
    expect(screen.getByText(palette.name)).toBeTruthy();
  }
});

it("permite seleccionar temas, paletas del grafo y restaurar la identidad oficial", async () => {
  const onChange = vi.fn();
  const onClose = vi.fn();

  render(
    <AppearanceDialog
      theme="obsidian"
      graphPalette="kraken"
      onChange={onChange}
      onClose={onClose}
    />,
  );

  await userEvent.click(
    screen.getByRole("button", { name: /Ártico \(Claro\)/ }),
  );
  expect(onChange).toHaveBeenLastCalledWith("arctic-light", "kraken");

  await userEvent.click(
    screen.getByRole("button", { name: /Cuervo Nocturno/ }),
  );
  expect(onChange).toHaveBeenLastCalledWith("raven-violet", "kraken");

  await userEvent.click(screen.getByRole("button", { name: /Alto Contraste/ }));
  expect(onChange).toHaveBeenLastCalledWith("high-contrast", "kraken");

  await userEvent.click(screen.getByRole("button", { name: /Neón Eléctrico/ }));
  expect(onChange).toHaveBeenLastCalledWith("obsidian", "neon");

  await userEvent.click(
    screen.getByRole("button", { name: /Alta Distinción/ }),
  );
  expect(onChange).toHaveBeenLastCalledWith("obsidian", "accessible");

  await userEvent.click(
    screen.getByRole("button", { name: "Restaurar identidad oficial" }),
  );
  expect(onChange).toHaveBeenLastCalledWith("obsidian", "identity");

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(onClose).toHaveBeenCalledOnce();
});

it("muestra y permite cambiar el estilo del grafo entre Tributary y Compacto", async () => {
  const onChangeGraphStyle = vi.fn();

  render(
    <AppearanceDialog
      theme="obsidian"
      graphPalette="kraken"
      graphStyle="tributary"
      onChange={vi.fn()}
      onChangeGraphStyle={onChangeGraphStyle}
      onClose={vi.fn()}
    />,
  );

  await userEvent.click(
    screen.getByRole("button", { name: /Compacto \(Puntos\)/ }),
  );
  expect(onChangeGraphStyle).toHaveBeenLastCalledWith("compact");

  await userEvent.click(
    screen.getByRole("button", { name: /Tributary \(Avatares\)/ }),
  );
  expect(onChangeGraphStyle).toHaveBeenLastCalledWith("tributary");
});
