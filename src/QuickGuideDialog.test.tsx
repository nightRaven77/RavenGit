// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import QuickGuideDialog from "./QuickGuideDialog";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

afterEach(cleanup);

it("renderiza el paso 1, avanza y retrocede por los 6 pasos", async () => {
  const onClose = vi.fn();
  render(<QuickGuideDialog onClose={onClose} />);

  expect(
    screen.getByRole("heading", { name: "Guía rápida de RavenGit" }),
  ).toBeTruthy();
  const progress = screen.getByRole("progressbar", {
    name: "Progreso de la guía rápida",
  });
  expect(progress.getAttribute("aria-valuenow")).toBe("1");
  expect(progress.getAttribute("aria-valuemax")).toBe("6");
  expect(
    (screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    screen.getByRole("region", { name: "Espacio local y autorización" }),
  ).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  expect(progress.getAttribute("aria-valuenow")).toBe("2");
  expect(
    screen.getByRole("region", { name: "Grafo Tributary y pestañas" }),
  ).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);

  await userEvent.click(screen.getByRole("button", { name: "Anterior" }));
  expect(progress.getAttribute("aria-valuenow")).toBe("1");

  await userEvent.click(
    screen.getByRole("button", { name: "6. Modos y atajos" }),
  );
  expect(progress.getAttribute("aria-valuenow")).toBe("6");
  expect(
    screen.getByRole("region", { name: "Modo Simple, apariencia y atajos" }),
  ).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: "Finalizar" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("abre atajos desde Ver atajos (?) y cierra al cancelar", async () => {
  const onClose = vi.fn();
  const onOpenShortcuts = vi.fn();
  render(
    <QuickGuideDialog onClose={onClose} onOpenShortcuts={onOpenShortcuts} />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Ver atajos (?)" }));
  expect(onOpenShortcuts).toHaveBeenCalledTimes(1);

  const dialog = document.querySelector("dialog.quick-guide-dialog")!;
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
