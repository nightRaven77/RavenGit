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
import { open } from "@tauri-apps/plugin-dialog";
import InitializeDialog from "./InitializeDialog";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
const api =
  vi.fn<
    (command: string, args?: Parameters<typeof invoke>[1]) => Promise<unknown>
  >();
const result = { path: "/fixtures/Proyecto", branch: "main" };
beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue(result);
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (command, args) =>
    command === "get_default_repository_directory"
      ? "/fixtures/default"
      : api(command, args),
  );
  vi.mocked(open).mockReset();
  vi.mocked(open).mockResolvedValue("/fixtures");
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(cleanup);
it("aplicar perfil al clonado sólo cambia el host del origen sin conectar", async () => {
  api.mockResolvedValue({
    token: "profiles",
    profiles: [
      { label: "Trabajo", provider: "GitLab", host: "gitlab-trabajo" },
    ],
  });
  mount(true, "clone");
  await userEvent.type(
    screen.getByLabelText("URL o ruta local del origen"),
    "git@gitlab.com:equipo/repo.git",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Cargar perfiles SSH" }),
  );
  await userEvent.selectOptions(
    await screen.findByRole("combobox", { name: /Perfil SSH para el origen/ }),
    "gitlab-trabajo",
  );
  expect(
    (screen.getByLabelText("URL o ruta local del origen") as HTMLInputElement)
      .value,
  ).toBe("git@gitlab-trabajo:equipo/repo.git");
  expect(
    api.mock.calls.some(([command]) => command === "clone_repository"),
  ).toBe(false);
});
function mount(opened = true, mode: "initialize" | "clone" = "initialize") {
  const handlers = {
    onClose: vi.fn(),
    onLock: vi.fn(),
    onOpen: vi.fn().mockResolvedValue(opened),
  };
  render(<InitializeDialog {...handlers} mode={mode} />);
  return handlers;
}
async function fill() {
  await userEvent.click(
    screen.getByRole("button", { name: "Elegir carpeta contenedora…" }),
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "Nombre de la carpeta nueva" }),
    "Proyecto",
  );
  await userEvent.click(
    screen.getByRole("checkbox", { name: /Confirmo la ubicación/ }),
  );
}
it("no ejecuta Git al abrir y permite cerrar durante la edición", async () => {
  const handlers = mount();
  expect(api).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  expect(
    (
      screen.getByRole("button", {
        name: "Crear repositorio",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  const dialog = screen.getByRole("dialog") as HTMLDialogElement;
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(dialog.open).toBe(false);
  expect(handlers.onClose).toHaveBeenCalledTimes(1);
});
it("requiere confirmación y la invalida si cambia la rama o el destino", async () => {
  mount();
  await fill();
  const confirm = screen.getByRole("button", {
    name: "Crear repositorio",
  }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(false);
  await userEvent.type(
    screen.getByRole("textbox", { name: "Rama inicial" }),
    "-otra",
  );
  expect(confirm.disabled).toBe(true);
  await userEvent.click(
    screen.getByRole("checkbox", { name: /Confirmo la ubicación/ }),
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "Nombre de la carpeta nueva" }),
    "-otro",
  );
  expect(confirm.disabled).toBe(true);
  expect(api).not.toHaveBeenCalled();
});
it("crea una sola vez con rama explícita y abre la ruta devuelta", async () => {
  const handlers = mount();
  await fill();
  await userEvent.click(
    screen.getByRole("button", { name: "Crear repositorio" }),
  );
  expect(api).toHaveBeenCalledExactlyOnceWith("initialize_repository", {
    parent: "/fixtures",
    name: "Proyecto",
    branch: "main",
  });
  expect(handlers.onOpen).toHaveBeenCalledWith(result.path);
  expect(handlers.onClose).toHaveBeenCalledTimes(1);
  expect(
    handlers.onLock.mock.calls[handlers.onLock.mock.calls.length - 1],
  ).toEqual([false]);
});
it("si abrir falla conserva el éxito y reintenta sólo la apertura", async () => {
  const handlers = mount(false);
  await fill();
  await userEvent.click(
    screen.getByRole("button", { name: "Crear repositorio" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "fue creado",
  );
  expect(
    screen.queryByRole("button", { name: "Crear repositorio" }),
  ).toBeNull();
  handlers.onOpen.mockResolvedValueOnce(true);
  await userEvent.click(
    screen.getByRole("button", { name: "Abrir repositorio creado" }),
  );
  expect(api).toHaveBeenCalledTimes(1);
  expect(handlers.onOpen).toHaveBeenCalledTimes(2);
  expect(handlers.onClose).toHaveBeenCalledTimes(1);
});
it("no reintenta automáticamente un destino existente o resultado incierto", async () => {
  api.mockRejectedValue({ message: "Comprueba el destino antes de repetir" });
  const handlers = mount();
  await fill();
  await userEvent.click(
    screen.getByRole("button", { name: "Crear repositorio" }),
  );
  await screen.findByRole("alert");
  expect(
    (
      screen.getByRole("button", {
        name: "Crear repositorio",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(api).toHaveBeenCalledTimes(1);
  expect(handlers.onOpen).not.toHaveBeenCalled();
  expect(handlers.onClose).not.toHaveBeenCalled();
});
it("bloquea cierre y solicitudes duplicadas mientras Git está trabajando", async () => {
  let finish!: (value: unknown) => void;
  api.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const handlers = mount();
  await fill();
  await userEvent.dblClick(
    screen.getByRole("button", { name: "Crear repositorio" }),
  );
  const dialog = screen.getByRole("dialog") as HTMLDialogElement;
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(dialog.open).toBe(true);
  expect(handlers.onClose).not.toHaveBeenCalled();
  expect(api).toHaveBeenCalledTimes(1);
  finish(result);
  await waitFor(() => expect(handlers.onClose).toHaveBeenCalledTimes(1));
});
async function fillClone() {
  await userEvent.type(
    screen.getByRole("textbox", { name: "URL o ruta local del origen" }),
    "git@gitlab.example:equipo/proyecto.git",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Elegir carpeta contenedora…" }),
  );
  await userEvent.clear(
    screen.getByRole("textbox", { name: "Nombre de la carpeta nueva" }),
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "Nombre de la carpeta nueva" }),
    "Copia",
  );
  await userEvent.click(
    screen.getByRole("checkbox", { name: /Confío en el origen/ }),
  );
}
it("abrir el clonado no contacta servidores y exige aceptar origen y filtros", async () => {
  mount(true, "clone");
  expect(screen.queryByRole("textbox", { name: "Rama inicial" })).toBeNull();
  expect(api).not.toHaveBeenCalled();
  expect(
    (
      screen.getByRole("button", {
        name: "Confirmar clonado",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await fillClone();
  expect(
    (
      screen.getByRole("button", {
        name: "Confirmar clonado",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  await userEvent.type(
    screen.getByRole("textbox", { name: "URL o ruta local del origen" }),
    "-otro",
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Confirmar clonado",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(api).not.toHaveBeenCalled();
});
it("usa Documentos como ubicación inicial y sugiere el nombre sin sustituir una edición manual", async () => {
  mount(true, "clone");
  await screen.findByText("/fixtures/default");
  const url = screen.getByRole("textbox", {
    name: "URL o ruta local del origen",
  });
  await userEvent.type(url, "https://gitlab.example/equipo/Proyecto.git");
  const name = screen.getByRole("textbox", {
    name: "Nombre de la carpeta nueva",
  }) as HTMLInputElement;
  expect(name.value).toBe("Proyecto");
  await userEvent.clear(name);
  await userEvent.type(name, "Personalizado");
  await userEvent.clear(url);
  await userEvent.type(url, "git@github.example:equipo/Otro.git");
  expect(name.value).toBe("Personalizado");
  expect(api).not.toHaveBeenCalled();
});
it("una respuesta predeterminada tardía nunca sustituye la carpeta elegida", async () => {
  let finish!: (value: string) => void;
  vi.mocked(invoke).mockImplementation(async (command, args) =>
    command === "get_default_repository_directory"
      ? new Promise<string>((resolve) => {
          finish = resolve;
        })
      : api(command, args),
  );
  mount();
  await fill();
  finish("/other/default");
  await userEvent.click(
    screen.getByRole("button", { name: "Crear repositorio" }),
  );
  expect(api).toHaveBeenCalledWith("initialize_repository", {
    parent: "/fixtures",
    name: "Proyecto",
    branch: "main",
  });
});
it("envía el contrato de clonado sin inicializar ni autorizar automáticamente", async () => {
  const handlers = mount(true, "clone");
  await fillClone();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar clonado" }),
  );
  expect(api).toHaveBeenCalledExactlyOnceWith("clone_repository", {
    parent: "/fixtures",
    name: "Copia",
    url: "git@gitlab.example:equipo/proyecto.git",
  });
  expect(handlers.onOpen).toHaveBeenCalledWith(result.path);
  expect(handlers.onClose).toHaveBeenCalledTimes(1);
});
it("conserva el clonado si abrir falla y reintenta sólo su apertura", async () => {
  const handlers = mount(false, "clone");
  await fillClone();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar clonado" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "fue clonado",
  );
  handlers.onOpen.mockResolvedValueOnce(true);
  await userEvent.click(
    screen.getByRole("button", { name: "Abrir repositorio clonado" }),
  );
  expect(api).toHaveBeenCalledTimes(1);
  expect(handlers.onOpen).toHaveBeenCalledTimes(2);
});
it("un fallo SSH no repite el clonado ni abre o borra un destino parcial", async () => {
  api.mockRejectedValue({ message: "SSH no pudo autenticar con clave" });
  const handlers = mount(true, "clone");
  await fillClone();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar clonado" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "SSH no pudo",
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Confirmar clonado",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.getByText(/puede contener datos parciales/)).toBeTruthy();
  expect(api).toHaveBeenCalledTimes(1);
  expect(handlers.onOpen).not.toHaveBeenCalled();
});
it("un HEAD remoto inutilizable mantiene visible el aviso tras abrir las referencias", async () => {
  api.mockResolvedValue({
    ...result,
    warning: "El remoto no proporcionó un HEAD utilizable",
  });
  const handlers = mount(true, "clone");
  await fillClone();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar clonado" }),
  );
  expect(await screen.findByText(/HEAD utilizable/)).toBeTruthy();
  expect(handlers.onOpen).toHaveBeenCalledTimes(1);
  expect(handlers.onClose).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(handlers.onClose).toHaveBeenCalledTimes(1);
  expect(api).toHaveBeenCalledTimes(1);
});
