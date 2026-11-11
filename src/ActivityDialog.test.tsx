// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import ActivityDialog from "./ActivityDialog";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));

const api = vi.mocked(invoke);
const chooseDestination = vi.mocked(save);
const activity = {
  token: "activity-token",
  events: [
    {
      id: "event-1",
      occurredAt: Date.UTC(2026, 9, 27, 12, 30),
      operation: "stage",
      status: "confirmed",
      repository: "fixture",
    },
  ],
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  api.mockReset();
  chooseDestination.mockReset();
  chooseDestination.mockResolvedValue("/tmp/ravengit-diagnostic.json");
  api.mockImplementation(async (command) => {
    if (command === "read_activity") return structuredClone(activity);
    if (command === "export_diagnostics")
      return { message: "Diagnóstico exportado.", eventCount: 1 };
    if (command === "clear_activity") return { token: "empty", events: [] };
    throw new Error(command);
  });
});

afterEach(cleanup);

it("explica y muestra sólo los metadatos acotados", async () => {
  render(<ActivityDialog onClose={vi.fn()} />);
  expect(await screen.findByText("Preparar cambios")).toBeTruthy();
  expect(
    screen.getByText(/No se guardan rutas, URLs, credenciales/),
  ).toBeTruthy();
  expect(screen.getByText(/fixture/)).toBeTruthy();
  expect(api).toHaveBeenCalledWith("read_activity");
});

it("exporta al destino elegido sin entregar datos del repositorio desde la UI", async () => {
  render(<ActivityDialog onClose={vi.fn()} />);
  await screen.findByText("Preparar cambios");
  await userEvent.click(
    screen.getByRole("button", { name: "Exportar diagnóstico…" }),
  );
  expect(chooseDestination).toHaveBeenCalledOnce();
  expect(api).toHaveBeenCalledWith("export_diagnostics", {
    destination: "/tmp/ravengit-diagnostic.json",
  });
  expect(await screen.findByText(/1 eventos incluidos/)).toBeTruthy();
});

it("muestra el rechazo del selector nativo sin intentar exportar", async () => {
  chooseDestination.mockRejectedValue({ message: "Guardado no permitido" });
  render(<ActivityDialog onClose={vi.fn()} />);
  await screen.findByText("Preparar cambios");
  await userEvent.click(
    screen.getByRole("button", { name: "Exportar diagnóstico…" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Guardado no permitido",
  );
  expect(
    api.mock.calls.some(([command]) => command === "export_diagnostics"),
  ).toBe(false);
});

it("exige consentimiento y token vigente para borrar", async () => {
  render(<ActivityDialog onClose={vi.fn()} />);
  const button = await screen.findByRole("button", {
    name: "Borrar actividad local",
  });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(button);
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("clear_activity", {
      token: "activity-token",
      confirmed: true,
    }),
  );
  expect(
    await screen.findByText("No hay resultados registrados todavía."),
  ).toBeTruthy();
});
