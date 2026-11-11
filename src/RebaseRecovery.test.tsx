// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import RebaseRecovery from "./RebaseRecovery";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.mocked(invoke).mockReset();
});
const state = {
  active: true,
  token: "recovery",
  branch: "main",
  original: "a".repeat(40),
  base: "b".repeat(40),
  backup: "refs/ravengit/rebase/fixture",
  conflicts: ["archivo.txt"],
  canContinue: false,
};
it("recupera el estado, prepara una resolución y exige confirmar el aborto", async () => {
  vi.mocked(invoke).mockResolvedValue(state);
  const onEdit = vi.fn(async () => {});
  render(<RebaseRecovery repoId="fixture" busy={false} onEdit={onEdit} />);
  const resolve = await screen.findByRole("button", {
    name: "Marcar resuelto: archivo.txt",
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Continuar rebase",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  const abort = screen.getByRole("button", { name: "Abortar rebase" });
  expect((abort as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(resolve);
  expect(onEdit).toHaveBeenCalledWith("recovery", {
    kind: "resolve",
    path: "archivo.txt",
  });
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(abort);
  expect(onEdit).toHaveBeenCalledWith("recovery", { kind: "abort" });
});
it("habilita continuar sólo cuando el backend confirma el estado", async () => {
  vi.mocked(invoke).mockResolvedValue({
    ...state,
    conflicts: [],
    canContinue: true,
  });
  const onEdit = vi.fn(async () => {});
  render(<RebaseRecovery repoId="fixture" busy={false} onEdit={onEdit} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Continuar rebase" }),
  );
  expect(onEdit).toHaveBeenCalledWith("recovery", { kind: "continue" });
});
it("un estado desconocido se informa sin ejecutar acciones", async () => {
  vi.mocked(invoke).mockRejectedValue({ message: "El registro no coincide" });
  const onEdit = vi.fn(async () => {});
  render(<RebaseRecovery repoId="fixture" busy={false} onEdit={onEdit} />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "El registro no coincide",
  );
  expect(onEdit).not.toHaveBeenCalled();
});
it("retira sólo un registro sin operación después de confirmación explícita", async () => {
  vi.mocked(invoke).mockResolvedValue({
    ...state,
    active: false,
    conflicts: [],
  });
  const onEdit = vi.fn(async () => {});
  render(<RebaseRecovery repoId="fixture" busy={false} onEdit={onEdit} />);
  const clear = await screen.findByRole("button", {
    name: "Retirar registro de inicio rechazado",
  });
  expect((clear as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Continuar rebase" })).toBeNull();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(clear);
  expect(onEdit).toHaveBeenCalledWith("recovery", { kind: "clearRecord" });
});
it("explica y permite retirar el registro cuando no se confirmó el respaldo", async () => {
  vi.mocked(invoke).mockResolvedValue({
    ...state,
    active: false,
    backup: null,
    conflicts: [],
  });
  const onEdit = vi.fn(async () => {});
  render(<RebaseRecovery repoId="fixture" busy={false} onEdit={onEdit} />);
  expect(
    await screen.findByText(/No se confirmó un respaldo/),
  ).toBeTruthy();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(
    screen.getByRole("button", { name: "Retirar registro de inicio rechazado" }),
  );
  expect(onEdit).toHaveBeenCalledWith("recovery", { kind: "clearRecord" });
});
