// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import MergeRecovery from "./MergeRecovery";
import type { MergeState } from "./types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke);
const state: MergeState = {
  token: "merge-state",
  branch: "main",
  head: "a".repeat(40),
  sourceHash: "b".repeat(40),
  conflicts: ["archivo ü.txt"],
  staged: ["automático.txt"],
  canContinue: false,
  restriction: null,
};
function mount() {
  const onEdit = vi.fn(async () => {});
  render(<MergeRecovery repoId="fixture" busy={false} onEdit={onEdit} />);
  return onEdit;
}
afterEach(cleanup);
beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue(structuredClone(state));
});

it("recupera el merge sin ejecutarlo y prepara sólo el archivo elegido", async () => {
  const onEdit = mount();
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Marcar resuelto: archivo ü.txt",
    }),
  );
  expect(onEdit).toHaveBeenCalledWith(state.token, {
    kind: "resolve",
    path: "archivo ü.txt",
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Continuar merge",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(api).toHaveBeenCalledWith("read_merge", { id: "fixture" });
});

it("abortar requiere confirmar la pérdida de resoluciones", async () => {
  const onEdit = mount();
  await screen.findByText("automático.txt");
  const button = screen.getByRole("button", { name: "Abortar merge" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(button);
  expect(onEdit).toHaveBeenCalledWith(state.token, { kind: "abort" });
});

it("actualizar invalida la confirmación y utiliza el nuevo token", async () => {
  const onEdit = mount();
  await screen.findByText("automático.txt");
  await userEvent.click(screen.getByRole("checkbox"));
  api.mockResolvedValue({
    ...state,
    token: "updated",
    conflicts: [],
    canContinue: true,
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Actualizar merge" }),
  );
  await screen.findByText("No quedan archivos sin resolver en el índice.");
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
    false,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Continuar merge" }),
  );
  expect(onEdit).toHaveBeenCalledWith("updated", {
    kind: "continue",
    message: "Integrar ramas",
  });
});

it("una restricción impide resolver, continuar y abortar", async () => {
  api.mockResolvedValue({ ...state, restriction: "ORIG_HEAD cambió" });
  const onEdit = mount();
  await screen.findByRole("alert");
  await userEvent.click(screen.getByRole("checkbox"));
  expect(
    (screen.getByRole("button", { name: "Abortar merge" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (
      screen.getByRole("button", {
        name: "Marcar resuelto: archivo ü.txt",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(onEdit).not.toHaveBeenCalled();
});

it("un error de lectura no ejecuta operaciones ni reintenta", async () => {
  api.mockRejectedValue({ message: "No se pudo leer el estado" });
  const onEdit = mount();
  await screen.findByRole("alert");
  await waitFor(() => expect(api).toHaveBeenCalledOnce());
  expect(onEdit).not.toHaveBeenCalled();
});
