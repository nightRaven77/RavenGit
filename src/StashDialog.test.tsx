// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import StashDialog from "./StashDialog";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke),
  oid = "a".repeat(40);
const options = {
  trusted: true,
  entries: [{ hash: oid, label: "stash@{0}", subject: "Trabajo ü" }],
  recovery: null,
};
function mount() {
  const onClose = vi.fn(),
    onLock = vi.fn(),
    onUpdated = vi.fn(async () => true);
  render(
    <StashDialog
      repoId="fixture"
      onClose={onClose}
      onLock={onLock}
      onUpdated={onUpdated}
    />,
  );
  return { onClose, onLock, onUpdated };
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  api.mockReset();
  api.mockImplementation(async (command, args) => {
    if (command === "read_stash") return options;
    if (command === "preview_stash")
      return {
        token: "review",
        action: (args as { action: unknown }).action,
        branch: "main",
        head: oid,
        files: ["file.txt"],
        patch: "",
      };
    return "Stash conservado.";
  });
});
afterEach(cleanup);
async function review() {
  await screen.findByLabelText("Descripción del stash");
  await userEvent.type(
    screen.getByLabelText("Descripción del stash"),
    "Trabajo pendiente",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar guardado" }),
  );
  return screen.findByRole("button", { name: "Guardar en Stash" });
}
it("leer no modifica Git; guardar requiere revisión y confirmación", async () => {
  const h = mount();
  const save = await review();
  expect((save as HTMLButtonElement).disabled).toBe(true);
  expect(api).not.toHaveBeenCalledWith("confirm_stash", expect.anything());
  await userEvent.click(screen.getByLabelText(/Revisé los archivos/));
  await userEvent.click(save);
  await screen.findByText("Stash conservado.");
  expect(api).toHaveBeenCalledWith("confirm_stash", {
    id: "fixture",
    token: "review",
  });
  expect(h.onUpdated).toHaveBeenCalledOnce();
});
it("cambiar las opciones invalida la revisión", async () => {
  mount();
  await review();
  await userEvent.click(screen.getByLabelText(/Revisé los archivos/));
  await userEvent.click(
    screen.getByLabelText("Incluir archivos sin seguimiento"),
  );
  expect(screen.queryByRole("button", { name: "Guardar en Stash" })).toBeNull();
});
it("restaurar usa el hash completo y conserva el stash por defecto", async () => {
  mount();
  await screen.findByLabelText("Descripción del stash");
  await userEvent.click(
    screen.getByRole("button", { name: "Restaurar stash (1)" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar restauración" }),
  );
  await screen.findByRole("button", { name: "Restaurar conservando stash" });
  expect(api).toHaveBeenCalledWith("preview_stash", {
    id: "fixture",
    action: { kind: "apply", hash: oid, index: false },
  });
});
it("requiere autorización y no muestra archivos antes de obtenerla", async () => {
  api.mockResolvedValue({ trusted: false, entries: [], recovery: null });
  mount();
  await screen.findByRole("button", { name: "Autorizar repositorio" });
  expect(screen.queryByLabelText("Descripción del stash")).toBeNull();
  expect(api).toHaveBeenCalledTimes(1);
});
it("doble clic no repite la mutación y no permite cerrar mientras escribe", async () => {
  let done!: (value: string) => void;
  const normal = api.getMockImplementation()!;
  api.mockImplementation((command, args) =>
    command === "confirm_stash"
      ? new Promise((resolve) => {
          done = resolve as (value: string) => void;
        })
      : normal(command, args),
  );
  const h = mount();
  const save = await review();
  await userEvent.click(screen.getByLabelText(/Revisé los archivos/));
  fireEvent.click(save);
  fireEvent.click(save);
  expect(
    api.mock.calls.filter(([command]) => command === "confirm_stash"),
  ).toHaveLength(1);
  expect(
    (screen.getByRole("button", { name: "Cerrar" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(h.onClose).not.toHaveBeenCalled();
  done("Listo");
  await screen.findByText("Listo");
});
it("un resultado incierto carga la recuperación y nunca repite apply automáticamente", async () => {
  let pending = false;
  const normal = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) => {
    if (command === "confirm_stash") {
      pending = true;
      throw { message: "Git no completó Stash." };
    }
    if (command === "read_stash" && pending)
      return {
        ...options,
        recovery: {
          token: "recovery",
          action: { kind: "apply", hash: oid, index: false },
          head: oid,
          branch: "main",
          conflicts: ["file.txt"],
          canFinish: false,
        },
      };
    return normal(command, args);
  });
  mount();
  await review();
  await userEvent.click(screen.getByLabelText(/Revisé los archivos/));
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar en Stash" }),
  );
  await screen.findByRole("region", { name: "Recuperación de stash" });
  expect(
    (
      screen.getByRole("button", {
        name: "Finalizar revisión",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    api.mock.calls.filter(([command]) => command === "confirm_stash"),
  ).toHaveLength(1);
});
it("finalizar recuperación exige reconocer el resultado y envía su token", async () => {
  const normal = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) =>
    command === "read_stash"
      ? {
          ...options,
          recovery: {
            token: "recovery",
            action: { kind: "apply", hash: oid, index: false },
            head: oid,
            branch: "main",
            conflicts: [],
            canFinish: true,
          },
        }
      : normal(command, args),
  );
  mount();
  const finish = await screen.findByRole("button", {
    name: "Finalizar revisión",
  });
  expect((finish as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByLabelText(/Revisé el resultado/));
  await userEvent.click(finish);
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("finish_stash", {
      id: "fixture",
      token: "recovery",
    }),
  );
});
