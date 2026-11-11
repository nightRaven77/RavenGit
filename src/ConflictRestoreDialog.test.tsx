// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  render,
  cleanup,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import ConflictRestoreDialog from "./ConflictRestoreDialog";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke);
const entry = {
  id: "ravengit-conflict-one",
  path: "file.txt",
  restriction: null,
};
const review = {
  token: "review",
  id: entry.id,
  path: entry.path,
  original: "<<<<<<< HEAD\noriginal\n",
  current: "new work\n",
  currentChanged: true,
  head: "a".repeat(40),
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  api.mockReset();
  api.mockImplementation(async (command) =>
    command === "read_conflict_backups"
      ? { trusted: true, entries: [entry] }
      : command === "preview_conflict_restore"
        ? review
        : { message: "Archivo restaurado", backup: "/fixture/.git/safety" },
  );
});
afterEach(cleanup);
function mount() {
  const onClose = vi.fn(),
    onLock = vi.fn(),
    onUpdated = vi.fn(async () => true);
  render(
    <ConflictRestoreDialog
      repoId="fixture"
      onClose={onClose}
      onLock={onLock}
      onUpdated={onUpdated}
    />,
  );
  return { onClose, onLock, onUpdated };
}
async function preview() {
  await screen.findByLabelText("Respaldo guardado");
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar restauración" }),
  );
  return screen.findByRole("button", {
    name: "Restaurar archivo con respaldo",
  });
}
it("abrir sólo lista; restaurar exige revisión y consentimiento independiente", async () => {
  const h = mount();
  const restore = await preview();
  expect((restore as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByLabelText("Archivo actual").textContent).toBe(
    review.current,
  );
  expect(screen.getByLabelText("Contenido que se restaurará").textContent).toBe(
    review.original,
  );
  expect(api).not.toHaveBeenCalledWith(
    "restore_conflict_backup",
    expect.anything(),
  );
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(restore);
  await screen.findByText(/Archivo restaurado/);
  expect(api).toHaveBeenCalledWith("restore_conflict_backup", {
    id: "fixture",
    token: "review",
  });
  expect(h.onUpdated).toHaveBeenCalledOnce();
});
it("actualizar invalida la revisión anterior", async () => {
  mount();
  await preview();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Actualizar" }));
  expect(
    screen.queryByRole("button", { name: "Restaurar archivo con respaldo" }),
  ).toBeNull();
});
it("muestra respaldo dañado y bloquea su revisión", async () => {
  api.mockResolvedValue({
    trusted: true,
    entries: [{ ...entry, restriction: "Respaldo dañado" }],
  });
  mount();
  await screen.findByText("Respaldo dañado");
  expect(
    (
      screen.getByRole("button", {
        name: "Revisar restauración",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("solicita autorización sin mostrar respaldos antes de obtenerla", async () => {
  api.mockResolvedValue({ trusted: false, entries: [] });
  mount();
  await screen.findByRole("button", { name: "Autorizar y consultar" });
  expect(screen.queryByLabelText("Respaldo guardado")).toBeNull();
  expect(api).toHaveBeenCalledTimes(1);
});
it("doble envío y cierre quedan bloqueados durante restauración", async () => {
  let resolve!: (value: unknown) => void;
  const normal = api.getMockImplementation()!;
  api.mockImplementation((c, a) =>
    c === "restore_conflict_backup"
      ? new Promise((r) => {
          resolve = r;
        })
      : normal(c, a),
  );
  const h = mount();
  const restore = await preview();
  await userEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(restore);
  fireEvent.click(restore);
  expect(
    api.mock.calls.filter(([c]) => c === "restore_conflict_backup"),
  ).toHaveLength(1);
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(h.onClose).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("button", { name: "Cerrar" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  resolve({ message: "Archivo restaurado", backup: "safety" });
  await screen.findByText(/Archivo restaurado/);
});
it("un fallo descarta la revisión sin reintento y conserva instrucciones de recuperación", async () => {
  const normal = api.getMockImplementation()!;
  api.mockImplementation(async (c, a) => {
    if (c === "restore_conflict_backup")
      throw { message: "El archivo cambió; vuelve a revisar" };
    return normal(c, a);
  });
  mount();
  const restore = await preview();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(restore);
  await screen.findByText("El archivo cambió; vuelve a revisar");
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(
    api.mock.calls.filter(([c]) => c === "restore_conflict_backup"),
  ).toHaveLength(1);
});
it("fallo de refresco conserva éxito y no repite la restauración", async () => {
  const h = mount();
  h.onUpdated.mockResolvedValue(false);
  const restore = await preview();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(restore);
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "no repitas la restauración",
    ),
  );
  expect(
    api.mock.calls.filter(([c]) => c === "restore_conflict_backup"),
  ).toHaveLength(1);
});
