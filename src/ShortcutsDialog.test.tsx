// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ShortcutsDialog from "./ShortcutsDialog";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

afterEach(cleanup);

it("renderiza las 4 categorías y los atajos reales de RavenGit", () => {
  render(<ShortcutsDialog onClose={vi.fn()} />);

  expect(
    screen.getByRole("heading", { name: "Atajos de teclado" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("region", { name: "General y aplicación" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("region", { name: "Navegación y pestañas" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("region", { name: "Historial y búsqueda" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("region", { name: "Cambios y seguridad" }),
  ).toBeTruthy();

  expect(screen.getByText(/Paleta de comandos/i)).toBeTruthy();
  expect(screen.getByText(/Deshacer última operación local/i)).toBeTruthy();
  expect(screen.getByText(/Búsqueda profunda en historial/i)).toBeTruthy();
  expect(screen.getByText(/Confirmar commit desde resumen/i)).toBeTruthy();
});

it("filtra atajos normalizando acentos y muestra estado vacío sin coincidencias", async () => {
  render(<ShortcutsDialog onClose={vi.fn()} />);
  const input = screen.getByRole("textbox", { name: "Filtrar atajos" });

  await userEvent.type(input, "deshacer");
  expect(screen.getByText(/Deshacer última operación local/i)).toBeTruthy();
  expect(screen.queryByText(/Paleta de comandos/i)).toBeNull();

  await userEvent.clear(input);
  await userEvent.type(input, "pestana");
  expect(screen.getByText(/Cerrar pestaña actual/i)).toBeTruthy();

  await userEvent.clear(input);
  await userEvent.type(input, "zzzz-inexistente");
  expect(screen.getByText(/No se encontraron atajos/)).toBeTruthy();
});

it("invoca onClose al pulsar Cerrar o cancelar el diálogo", async () => {
  const onClose = vi.fn();
  render(<ShortcutsDialog onClose={onClose} />);

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(onClose).toHaveBeenCalledTimes(1);

  const dialog = document.querySelector("dialog.shortcuts-dialog")!;
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(onClose).toHaveBeenCalledTimes(2);
});
