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
import TagPublishDialog from "./TagPublishDialog";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke),
  hash = "a".repeat(40);
const options = {
  state: {
    token: "config",
    trusted: true,
    remotes: [
      {
        name: "origin",
        pushAllowed: true,
        pushUrls: ["https://example.invalid/repo.git"],
      },
      {
        name: "other",
        pushAllowed: true,
        pushUrls: ["https://example.invalid/other.git"],
      },
    ],
  },
  tags: [
    { name: "v1", hash },
    { name: "v2", hash },
  ],
};
const plan = {
  token: "review",
  tag: "v1",
  hash,
  remote: "origin",
  url: options.state.remotes[0].pushUrls[0],
  targetHash: null,
  relation: "new",
  canPush: true,
};
function mount(onUpdated = vi.fn(async () => true)) {
  const onClose = vi.fn(),
    onLock = vi.fn();
  render(
    <TagPublishDialog
      repoId="fixture"
      initialTag="v1"
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
  api.mockImplementation(async (command) => {
    if (command === "read_tag_push_options") return structuredClone(options);
    if (command === "preview_tag_push") return structuredClone(plan);
    if (command === "publish_tag")
      return { message: "Publicación confirmada", warning: null };
    throw new Error(`Unexpected command: ${command}`);
  });
});
afterEach(cleanup);
async function review() {
  await screen.findByLabelText("Etiqueta local");
  await userEvent.click(
    screen.getByRole("button", { name: "Consultar remoto y revisar" }),
  );
  return screen.findByRole("button", {
    name: "Publicar etiqueta seleccionada",
  });
}
it("abrir sólo carga opciones locales y publicar requiere revisión y confirmación", async () => {
  const { onUpdated, onLock } = mount();
  await screen.findByLabelText("Etiqueta local");
  expect(api.mock.calls.map(([command]) => command)).toEqual([
    "read_tag_push_options",
  ]);
  const publish = await review();
  expect((publish as HTMLButtonElement).disabled).toBe(true);
  expect(api).toHaveBeenCalledWith("preview_tag_push", {
    id: "fixture",
    token: "config",
    tag: "v1",
    remote: "origin",
  });
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(publish);
  await screen.findByText("Publicación confirmada");
  expect(api).toHaveBeenCalledWith("publish_tag", {
    id: "fixture",
    token: "review",
  });
  expect(onUpdated).toHaveBeenCalledOnce();
  expect(onLock).toHaveBeenLastCalledWith(false);
  expect(
    screen.queryByRole("button", { name: "Publicar etiqueta seleccionada" }),
  ).toBeNull();
});
it.each(["equal", "conflict"])(
  "el estado %s no permite enviar ni sobrescribir",
  async (relation) => {
    api.mockImplementation(async (command) =>
      command === "read_tag_push_options"
        ? options
        : { ...plan, relation, canPush: false, targetHash: hash },
    );
    mount();
    await screen.findByLabelText("Etiqueta local");
    await userEvent.click(
      screen.getByRole("button", { name: "Consultar remoto y revisar" }),
    );
    await screen.findByRole("region", {
      name: "Revisión de publicación de etiqueta",
    });
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Publicar etiqueta seleccionada" }),
    ).toBeNull();
    expect(api.mock.calls.some(([command]) => command === "publish_tag")).toBe(
      false,
    );
  },
);
it("cambiar etiqueta o remoto descarta revisión y confirmación", async () => {
  mount();
  await review();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.selectOptions(screen.getByLabelText("Etiqueta local"), "v2");
  expect(screen.queryByRole("checkbox")).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Consultar remoto y revisar" }),
  );
  await screen.findByRole("checkbox");
  await userEvent.selectOptions(
    screen.getByLabelText("Remoto de publicación"),
    "other",
  );
  expect(screen.queryByRole("checkbox")).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Consultar remoto y revisar" }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenLastCalledWith("preview_tag_push", {
      id: "fixture",
      token: "config",
      tag: "v2",
      remote: "other",
    }),
  );
});
it("un resultado incierto consume la confirmación y no reintenta", async () => {
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) => {
    if (command === "publish_tag")
      throw { message: "Comprueba el remoto antes de repetir." };
    return fallback(command, args);
  });
  const { onUpdated } = mount();
  const publish = await review();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(publish);
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("button", { name: "Publicar etiqueta seleccionada" }),
  ).toBeNull();
  expect(
    (screen.getByLabelText("Etiqueta local") as HTMLSelectElement).value,
  ).toBe("v1");
  expect(onUpdated).not.toHaveBeenCalled();
  expect(
    api.mock.calls.filter(([command]) => command === "publish_tag"),
  ).toHaveLength(1);
});
it("cierra con Escape durante carga local sin contactar el remoto", () => {
  api.mockImplementation(() => new Promise(() => {}));
  const { onClose } = mount();
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(onClose).toHaveBeenCalledOnce();
  expect(api.mock.calls.map(([command]) => command)).toEqual([
    "read_tag_push_options",
  ]);
});
it("bloquea cierre y doble ejecución durante publicación", async () => {
  let finish!: (value: unknown) => void;
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) =>
    command === "publish_tag"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : fallback(command, args),
  );
  const { onClose } = mount();
  const publish = await review();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.dblClick(publish);
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(onClose).not.toHaveBeenCalled();
  expect(
    api.mock.calls.filter(([command]) => command === "publish_tag"),
  ).toHaveLength(1);
  finish({ message: "Publicación confirmada", warning: null });
  await screen.findByText("Publicación confirmada");
});
it("no ofrece repetir después de éxito con verificación o refresco fallidos", async () => {
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) =>
    command === "publish_tag"
      ? { message: "Git terminó", warning: "No se confirmó el remoto" }
      : fallback(command, args),
  );
  mount(vi.fn(async () => false));
  const publish = await review();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(publish);
  await screen.findByText(/no repitas el push/);
  expect(
    screen.queryByRole("button", { name: "Consultar remoto y revisar" }),
  ).toBeNull();
});
it("no permite consultar destinos sin autorización", async () => {
  api.mockResolvedValue({
    state: { token: "", trusted: false, remotes: [] },
    tags: [],
  });
  mount();
  await screen.findByText(/Autoriza el repositorio desde Cambios/);
  expect(
    screen.queryByRole("button", { name: "Consultar remoto y revisar" }),
  ).toBeNull();
});
