// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommandPalette, { type PaletteCommand } from "./CommandPalette";

describe("CommandPalette", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value() {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value() {
        this.open = false;
      },
    });
  });

  afterEach(cleanup);

  it("filtra sin distinguir acentos, navega con teclado y ejecuta comandos", async () => {
    const onHistory = vi.fn();
    const onAppearance = vi.fn();
    const onDisabled = vi.fn();
    const onClose = vi.fn();
    const commands: PaletteCommand[] = [
      {
        id: "blocked",
        label: "Push bloqueado",
        category: "Git",
        disabled: true,
        onSelect: onDisabled,
      },
      {
        id: "history",
        label: "Ir a Historial",
        category: "Navegación",
        shortcut: "Ctrl+2",
        onSelect: onHistory,
      },
      {
        id: "appearance",
        label: "Apariencia y colores",
        category: "Aplicación",
        description: "Cambiar tema y paleta de grafos",
        shortcut: "Ctrl+,",
        onSelect: onAppearance,
      },
    ];

    const user = userEvent.setup();
    render(<CommandPalette commands={commands} onClose={onClose} />);

    const input = screen.getByLabelText("Buscar comando");
    expect(document.activeElement).toBe(input);

    await user.type(input, "navegacion");
    expect(screen.queryByRole("option", { name: /Apariencia/ })).toBeNull();
    expect(screen.getByRole("option", { name: /Ir a Historial/ })).toBeTruthy();

    await user.clear(input);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAppearance).toHaveBeenCalledTimes(1);
    expect(onDisabled).not.toHaveBeenCalled();
  });

  it("cierra con Escape sin ejecutar nada", () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(
      <CommandPalette
        commands={[{ id: "one", label: "Uno", category: "Test", onSelect }]}
        onClose={onClose}
      />,
    );
    fireEvent(
      screen.getByRole("dialog", { name: "Paleta de comandos" }),
      new Event("cancel", { cancelable: true }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
