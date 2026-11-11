// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import LibraryDialog from "./LibraryDialog";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
const api = vi.mocked(invoke);
const entry = {
  path: "/fixture/repo",
  name: "Proyecto",
  pinned: false,
  lastOpened: 1,
  preferences: {},
  collectionId: null,
};
const library = { version: 2, repositories: [entry], collections: [] };
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  api.mockReset();
  vi.mocked(open).mockReset();
  api.mockImplementation(async (command) => {
    if (command === "read_repository_library") return structuredClone(library);
    throw { message: "Operación no esperada" };
  });
});
afterEach(cleanup);
function mount(result = true) {
  const onOpen = vi.fn().mockResolvedValue(result),
    onClose = vi.fn(),
    onForgot = vi.fn(),
    onDeleted = vi.fn(),
    onLock = vi.fn();
  render(
    <LibraryDialog
      onOpen={onOpen}
      onClose={onClose}
      onForgot={onForgot}
      onDeleted={onDeleted}
      onLock={onLock}
    />,
  );
  return { onOpen, onClose, onForgot, onDeleted, onLock };
}
it("reabre una ruta guardada sin volver a pedir carpeta", async () => {
  const handlers = mount();
  await userEvent.click(
    await screen.findByRole("button", { name: /^Proyecto/ }),
  );
  expect(handlers.onOpen).toHaveBeenCalledWith(entry.path);
  expect(handlers.onClose).toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
});
it("permite cerrar durante la lectura inicial sin esperar al disco", async () => {
  api.mockImplementation(() => new Promise(() => {}));
  const { onClose } = mount();
  await userEvent.click(
    screen.getByRole("button", { name: "Cerrar repositorios" }),
  );
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(api.mock.calls.map(([command]) => command)).toEqual([
    "read_repository_library",
  ]);
});
it("fija una entrada y la presenta en Fijados", async () => {
  api.mockImplementation(async (command) =>
    command === "edit_repository_library"
      ? { ...library, repositories: [{ ...entry, pinned: true }] }
      : library,
  );
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Fijar Proyecto" }),
  );
  expect(await screen.findByRole("region", { name: "Fijados" })).toBeTruthy();
  expect(api).toHaveBeenCalledWith("edit_repository_library", {
    edit: { kind: "pin", path: entry.path, pinned: true },
  });
});
it("exige confirmar que sólo se quita de la lista", async () => {
  api.mockImplementation(async (command) =>
    command === "edit_repository_library"
      ? { ...library, repositories: [] }
      : library,
  );
  const handlers = mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Quitar Proyecto de la lista" }),
  );
  expect(
    api.mock.calls.some(([command]) => command === "edit_repository_library"),
  ).toBe(false);
  expect(screen.getByText(/Los archivos y commits se conservan/)).toBeTruthy();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar quitar de la lista" }),
  );
  expect(handlers.onForgot).toHaveBeenCalledWith(entry.path);
  expect(await screen.findByText(/Aún no hay repositorios/)).toBeTruthy();
});
it("permite localizar una carpeta después de fallar la apertura", async () => {
  vi.mocked(open).mockResolvedValue("/fixture/moved");
  api.mockImplementation(async (command) =>
    command === "relocate_repository"
      ? { ...library, repositories: [{ ...entry, path: "/fixture/moved" }] }
      : library,
  );
  const handlers = mount(false);
  await userEvent.click(
    await screen.findByRole("button", { name: /^Proyecto/ }),
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(handlers.onClose).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Localizar carpeta de Proyecto" }),
  );
  expect(api).toHaveBeenCalledWith("relocate_repository", {
    oldPath: entry.path,
    path: "/fixture/moved",
  });
  expect(
    await within(screen.getByRole("dialog")).findByText("/fixture/moved"),
  ).toBeTruthy();
  expect(handlers.onForgot).toHaveBeenCalledWith(entry.path);
});
it("ordena varias entradas, distingue ubicaciones y filtra sin contactar Git", async () => {
  api.mockResolvedValue({
    ...library,
    repositories: [
      { ...entry, path: "/equipo/antiguo", lastOpened: 1 },
      { ...entry, path: "/equipo/fijado", pinned: true, lastOpened: 2 },
      { ...entry, path: "/equipo/reciente", lastOpened: 3 },
    ],
  });
  mount();
  const recent = await screen.findByRole("region", { name: "Recientes" });
  expect(
    within(recent)
      .getAllByRole("button", { name: /^Proyecto/ })
      .map((button) => button.textContent),
  ).toEqual(["Proyecto/equipo/reciente", "Proyecto/equipo/antiguo"]);
  expect(
    within(screen.getByRole("region", { name: "Fijados" })).getByText(
      "/equipo/fijado",
    ),
  ).toBeTruthy();
  const search = screen.getByRole("textbox", { name: "Buscar repositorio" });
  await userEvent.type(search, "FIJADO");
  expect(screen.queryByRole("region", { name: "Recientes" })).toBeNull();
  await userEvent.clear(search);
  await userEvent.type(search, "inexistente");
  expect(screen.getByText(/No hay coincidencias/)).toBeTruthy();
  expect(api.mock.calls).toEqual([["read_repository_library"]]);
});
it("permite reintentar una lectura fallida sin cerrar ni abrir repositorios", async () => {
  api.mockRejectedValueOnce({ message: "Almacenamiento no disponible" });
  const handlers = mount();
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Almacenamiento no disponible",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Reintentar lectura" }),
  );
  expect(await screen.findByRole("button", { name: /^Proyecto/ })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(handlers.onOpen).not.toHaveBeenCalled();
  expect(handlers.onClose).not.toHaveBeenCalled();
});
it("conserva la entrada si falla fijar y permite repetir sólo esa acción", async () => {
  mount();
  const button = await screen.findByRole("button", { name: "Fijar Proyecto" });
  api.mockRejectedValueOnce({ message: "No se pudo guardar" });
  await userEvent.click(button);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "No se pudo guardar",
  );
  expect(screen.getByText(entry.path)).toBeTruthy();
  api.mockResolvedValueOnce({
    ...library,
    repositories: [{ ...entry, pinned: true }],
  });
  await userEvent.click(screen.getByRole("button", { name: "Fijar Proyecto" }));
  expect(await screen.findByRole("region", { name: "Fijados" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    api.mock.calls.filter(([command]) => command === "edit_repository_library"),
  ).toHaveLength(2);
});
it("mantiene el foco al fijar con teclado y cambiar de grupo", async () => {
  api.mockImplementation(async (command) =>
    command === "edit_repository_library"
      ? { ...library, repositories: [{ ...entry, pinned: true }] }
      : library,
  );
  mount();
  const button = await screen.findByRole("button", { name: "Fijar Proyecto" });
  button.focus();
  await userEvent.keyboard("{Enter}");
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Desfijar Proyecto" }),
    ),
  );
});
it("devuelve el foco a búsqueda después de quitar y no borra otras entradas", async () => {
  const other = { ...entry, path: "/otro", name: "Otro" };
  api.mockImplementation(async (command) => ({
    ...library,
    repositories:
      command === "edit_repository_library" ? [other] : [entry, other],
  }));
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Quitar Proyecto de la lista" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar quitar de la lista" }),
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Buscar repositorio" }),
    ),
  );
  expect(screen.queryByText(entry.path)).toBeNull();
  expect(screen.getByText("/otro")).toBeTruthy();
});
it("conserva ubicación y preferencias visuales si falla o se cancela localizar", async () => {
  const handlers = mount();
  const button = await screen.findByRole("button", {
    name: "Localizar carpeta de Proyecto",
  });
  vi.mocked(open).mockResolvedValueOnce(null);
  await userEvent.click(button);
  expect(api.mock.calls).toEqual([["read_repository_library"]]);
  vi.mocked(open).mockResolvedValueOnce("/duplicado");
  api.mockRejectedValueOnce({
    message: "Esta ubicación ya está en la biblioteca",
  });
  await userEvent.click(button);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "ya está en la biblioteca",
  );
  expect(screen.getByText(entry.path)).toBeTruthy();
  expect(handlers.onForgot).not.toHaveBeenCalled();
  expect(handlers.onClose).not.toHaveBeenCalled();
});
it("no roba el foco si se continúa buscando durante un guardado pendiente", async () => {
  const user = userEvent.setup();
  mount();
  const button = await screen.findByRole("button", { name: "Fijar Proyecto" });
  let finish!: (value: unknown) => void;
  api.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await user.click(button);
  const search = screen.getByRole("textbox", { name: "Buscar repositorio" });
  await user.click(search);
  await user.type(search, "Proyecto");
  finish({ ...library, repositories: [{ ...entry, pinned: true }] });
  await screen.findByRole("button", { name: "Desfijar Proyecto" });
  expect(document.activeElement).toBe(search);
});
it("cancelar quitar conserva la entrada y devuelve un foco utilizable", async () => {
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Quitar Proyecto de la lista" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(
    screen.queryByRole("button", { name: "Confirmar quitar de la lista" }),
  ).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "Buscar repositorio" }),
  );
  expect(api.mock.calls).toEqual([["read_repository_library"]]);
});
it("restaura el foco al control de apertura cuando se desmonta el diálogo", async () => {
  const launcher = document.createElement("button");
  launcher.textContent = "Repositorios";
  document.body.append(launcher);
  launcher.focus();
  const view = render(
    <LibraryDialog onOpen={vi.fn()} onClose={vi.fn()} onForgot={vi.fn()} />,
  );
  await screen.findByRole("button", { name: "Fijar Proyecto" });
  screen.getByRole("textbox", { name: "Buscar repositorio" }).focus();
  view.unmount();
  expect(document.activeElement).toBe(launcher);
  launcher.remove();
});
const collections = [
  { id: "personal", name: "Personal" },
  { id: "work", name: "Trabajo" },
];
it("filtra por colección y conserva los grupos de fijación sin invocar Git", async () => {
  api.mockResolvedValue({
    ...library,
    collections,
    repositories: [
      entry,
      {
        ...entry,
        path: "/work",
        name: "Trabajo repo",
        collectionId: "work",
        pinned: true,
      },
    ],
  });
  mount();
  const filter = await screen.findByRole("combobox", {
    name: "Mostrar colección",
  });
  await userEvent.selectOptions(filter, "work");
  expect(screen.queryByText(entry.path)).toBeNull();
  expect(
    within(screen.getByRole("region", { name: "Fijados" })).getByText("/work"),
  ).toBeTruthy();
  await userEvent.selectOptions(filter, "none");
  expect(screen.getByText(entry.path)).toBeTruthy();
  expect(screen.queryByText("/work")).toBeNull();
  expect(api.mock.calls).toEqual([["read_repository_library"]]);
});
it("crea una colección y conserva el borrador si falla el guardado", async () => {
  mount();
  await screen.findByRole("combobox", { name: "Mostrar colección" });
  await userEvent.click(
    screen.getByText("Gestionar colecciones", { selector: "summary" }),
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "Nueva colección" }),
    "Personal",
  );
  api.mockRejectedValueOnce({ message: "No se pudo guardar" });
  await userEvent.click(
    screen.getByRole("button", { name: "Crear colección" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "No se pudo guardar",
  );
  expect(
    (
      screen.getByRole("textbox", {
        name: "Nueva colección",
      }) as HTMLInputElement
    ).value,
  ).toBe("Personal");
  api.mockResolvedValueOnce({ ...library, collections: [collections[0]] });
  await userEvent.click(
    screen.getByRole("button", { name: "Crear colección" }),
  );
  expect(
    await screen.findByRole("button", { name: "Renombrar Personal" }),
  ).toBeTruthy();
  expect(api).toHaveBeenLastCalledWith("edit_repository_library", {
    edit: { kind: "createCollection", name: "Personal" },
  });
  expect(
    (
      screen.getByRole("textbox", {
        name: "Nueva colección",
      }) as HTMLInputElement
    ).value,
  ).toBe("");
});
it("mueve una entrada fuera de la colección seleccionada conservando sus metadatos", async () => {
  const assigned = { ...entry, collectionId: "work", pinned: true };
  api.mockResolvedValue({ ...library, collections, repositories: [assigned] });
  const handlers = mount();
  await userEvent.selectOptions(
    await screen.findByRole("combobox", { name: "Mostrar colección" }),
    "work",
  );
  api.mockResolvedValueOnce({
    ...library,
    collections,
    repositories: [{ ...assigned, collectionId: "personal" }],
  });
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Colección de Proyecto" }),
    "personal",
  );
  expect(api).toHaveBeenLastCalledWith("edit_repository_library", {
    edit: {
      kind: "assignCollection",
      path: entry.path,
      collectionId: "personal",
    },
  });
  await screen.findByText(/No hay coincidencias/);
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "Buscar repositorio" }),
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Mostrar colección" }),
    "personal",
  );
  expect(
    within(screen.getByRole("region", { name: "Fijados" })).getByText(
      entry.path,
    ),
  ).toBeTruthy();
  expect(handlers.onForgot).not.toHaveBeenCalled();
});
it("quitar una colección exige confirmación y conserva sus repositorios en Sin colección", async () => {
  api.mockResolvedValue({
    ...library,
    collections: [collections[1]],
    repositories: [{ ...entry, collectionId: "work" }],
  });
  const handlers = mount();
  await userEvent.selectOptions(
    await screen.findByRole("combobox", { name: "Mostrar colección" }),
    "work",
  );
  await userEvent.click(
    screen.getByText("Gestionar colecciones", { selector: "summary" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Quitar colección Trabajo" }),
  );
  expect(api.mock.calls).toEqual([["read_repository_library"]]);
  expect(screen.getByText(/conservarán fijación, preferencias/)).toBeTruthy();
  await userEvent.click(
    screen.getByRole("button", { name: "Cancelar quitar colección" }),
  );
  expect(
    screen.queryByRole("button", { name: "Confirmar quitar colección" }),
  ).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Quitar colección Trabajo" }),
  );
  api.mockResolvedValueOnce(library);
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar quitar colección" }),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("combobox", {
          name: "Mostrar colección",
        }) as HTMLSelectElement
      ).value,
    ).toBe("all"),
  );
  expect(screen.getByText(entry.path)).toBeTruthy();
  expect(handlers.onForgot).not.toHaveBeenCalled();
  expect(api).toHaveBeenLastCalledWith("edit_repository_library", {
    edit: { kind: "removeCollection", id: "work" },
  });
});
it("renombra y ordena colecciones por identidad estable", async () => {
  api.mockResolvedValue({ ...library, collections });
  mount();
  await screen.findByRole("combobox", { name: "Mostrar colección" });
  await userEvent.click(
    screen.getByText("Gestionar colecciones", { selector: "summary" }),
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Subir Personal",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await userEvent.click(
    screen.getByRole("button", { name: "Renombrar Trabajo" }),
  );
  const input = screen.getByRole("textbox", { name: "Nombre de Trabajo" });
  await userEvent.clear(input);
  await userEvent.type(input, "Equipo");
  const renamed = [collections[0], { id: "work", name: "Equipo" }];
  api.mockResolvedValueOnce({ ...library, collections: renamed });
  await userEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
  expect(api).toHaveBeenLastCalledWith("edit_repository_library", {
    edit: { kind: "renameCollection", id: "work", name: "Equipo" },
  });
  api.mockResolvedValueOnce({
    ...library,
    collections: [renamed[1], renamed[0]],
  });
  await userEvent.click(
    await screen.findByRole("button", { name: "Subir Equipo" }),
  );
  expect(api).toHaveBeenLastCalledWith("edit_repository_library", {
    edit: { kind: "moveCollection", id: "work", direction: "up" },
  });
  expect(
    (
      (await screen.findByRole("button", {
        name: "Subir Equipo",
      })) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
async function reviewDeletion() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Quitar Proyecto de la lista" }),
  );
  await userEvent.click(
    screen.getByRole("checkbox", {
      name: "También mover la carpeta a la Papelera",
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar eliminación de carpeta" }),
  );
}
const deletion = { path: entry.path, name: "Proyecto", token: "delete-once" };
it("mover la carpeta exige revisión y nombre exacto, y no confunde quitar metadatos", async () => {
  api.mockImplementation(async (command) =>
    command === "read_repository_library"
      ? library
      : command === "preview_repository_delete"
        ? deletion
        : { library: { ...library, repositories: [] }, warning: null },
  );
  const handlers = mount();
  await reviewDeletion();
  expect(
    screen.queryByRole("button", { name: "Confirmar quitar de la lista" }),
  ).toBeNull();
  const remove = screen.getByRole("button", {
    name: "Mover carpeta a la Papelera",
  }) as HTMLButtonElement;
  expect(remove.disabled).toBe(true);
  await userEvent.type(
    screen.getByRole("textbox", { name: "Escribe Proyecto para confirmar" }),
    "Proyecto",
  );
  await userEvent.click(remove);
  expect(api).toHaveBeenCalledWith("trash_repository", {
    path: entry.path,
    token: deletion.token,
    confirmation: "Proyecto",
  });
  expect(handlers.onDeleted).toHaveBeenCalledWith(entry.path);
  expect(handlers.onForgot).toHaveBeenCalledWith(entry.path);
  expect(await screen.findByText(/Aún no hay repositorios/)).toBeTruthy();
});
it("un fallo al mover consume la revisión sin repetir ni quitar la entrada", async () => {
  api.mockImplementation(async (command) => {
    if (command === "read_repository_library") return library;
    if (command === "preview_repository_delete") return deletion;
    throw { message: "La carpeta cambió desde la revisión" };
  });
  const handlers = mount();
  await reviewDeletion();
  await userEvent.type(
    screen.getByRole("textbox", { name: "Escribe Proyecto para confirmar" }),
    "Proyecto",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Mover carpeta a la Papelera" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain("cambió");
  expect(
    screen.queryByRole("button", { name: "Mover carpeta a la Papelera" }),
  ).toBeNull();
  expect(
    screen.getByText(entry.path, { selector: ".library-open span" }),
  ).toBeTruthy();
  expect(handlers.onDeleted).not.toHaveBeenCalled();
  expect(
    api.mock.calls.filter(([command]) => command === "trash_repository"),
  ).toHaveLength(1);
});
it("cancelar la eliminación no mueve carpetas y vuelve a quitar sólo de la lista", async () => {
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Quitar Proyecto de la lista" }),
  );
  await userEvent.click(
    screen.getByRole("checkbox", {
      name: "También mover la carpeta a la Papelera",
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Quitar Proyecto de la lista" }),
  );
  expect(
    (
      screen.getByRole("checkbox", {
        name: "También mover la carpeta a la Papelera",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  expect(api.mock.calls).toEqual([["read_repository_library"]]);
});
