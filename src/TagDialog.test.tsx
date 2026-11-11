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
import TagDialog from "./TagDialog";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke),
  commit = "a".repeat(40),
  head = "b".repeat(40);
function mount(onUpdated = vi.fn(async () => true)) {
  const onClose = vi.fn(),
    onLock = vi.fn();
  render(
    <TagDialog
      repoId="fixture"
      commit={commit}
      head={head}
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
  api.mockImplementation(async (command) =>
    command === "preview_tag"
      ? { token: "review", name: "v1.0", commit, subject: "Selected" }
      : "Etiqueta local creada. No se publicó.",
  );
});
afterEach(cleanup);
async function review() {
  await userEvent.type(screen.getByLabelText("Nombre de etiqueta"), "v1.0");
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar etiqueta" }),
  );
  return screen.findByRole("button", { name: "Crear etiqueta local" });
}
it("abrir no ejecuta Git y crear requiere revisión y confirmación", async () => {
  const { onUpdated } = mount();
  expect(api).not.toHaveBeenCalled();
  const create = await review();
  expect((create as HTMLButtonElement).disabled).toBe(true);
  expect(api).toHaveBeenCalledWith("preview_tag", {
    id: "fixture",
    name: "v1.0",
    commit,
  });
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(create);
  await screen.findByRole("status");
  expect(api).toHaveBeenCalledWith("create_tag", {
    id: "fixture",
    token: "review",
  });
  expect(onUpdated).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole("button", { name: "Crear etiqueta local" }),
  ).toBeNull();
});
it("cambiar nombre o elegir HEAD invalida la revisión", async () => {
  mount();
  await review();
  await userEvent.type(screen.getByLabelText("Nombre de etiqueta"), "x");
  expect(screen.queryByRole("checkbox")).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar etiqueta" }),
  );
  await screen.findByRole("checkbox");
  await userEvent.selectOptions(
    screen.getByLabelText("Commit de destino"),
    head,
  );
  expect(screen.queryByRole("checkbox")).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar etiqueta" }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenLastCalledWith("preview_tag", {
      id: "fixture",
      name: "v1.0x",
      commit: head,
    }),
  );
});
it("un fallo de creación conserva el nombre pero obliga a revisar de nuevo", async () => {
  api.mockImplementation(async (command) => {
    if (command === "preview_tag")
      return { token: "review", name: "v1.0", commit, subject: "Selected" };
    throw { message: "Comprueba las etiquetas antes de repetir." };
  });
  mount();
  const create = await review();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(create);
  await screen.findByRole("alert");
  expect(
    (screen.getByLabelText("Nombre de etiqueta") as HTMLInputElement).value,
  ).toBe("v1.0");
  expect(
    screen.queryByRole("button", { name: "Crear etiqueta local" }),
  ).toBeNull();
  expect(
    api.mock.calls.filter(([command]) => command === "create_tag"),
  ).toHaveLength(1);
});
it("Escape cierra sin crear ninguna referencia", () => {
  const { onClose } = mount();
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(onClose).toHaveBeenCalledOnce();
  expect(api).not.toHaveBeenCalled();
});
it("bloquea cierre y doble ejecución mientras se crea la etiqueta", async () => {
  let finish!: (value: string) => void;
  api.mockImplementation(async (command) =>
    command === "preview_tag"
      ? { token: "review", name: "v1.0", commit, subject: "Selected" }
      : new Promise((resolve) => {
          finish = resolve;
        }),
  );
  const { onClose } = mount();
  const create = await review();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.dblClick(create);
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(onClose).not.toHaveBeenCalled();
  expect(
    api.mock.calls.filter(([command]) => command === "create_tag"),
  ).toHaveLength(1);
  finish("Etiqueta creada");
  await screen.findByRole("status");
});
it("un refresco fallido tras éxito no permite repetir la creación", async () => {
  mount(vi.fn(async () => false));
  const create = await review();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(create);
  await screen.findByText(/no repitas la creación/);
  expect(screen.queryByRole("button", { name: "Revisar etiqueta" })).toBeNull();
});
