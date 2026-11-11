// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import ConflictDialog, { type ConflictView } from "./ConflictDialog";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke);
const view: ConflictView = {
  path: "archivo ü.txt",
  versions: [1, 2, 3].map((stage) => ({
    stage,
    hash: String(stage).repeat(40),
    text: `versión ${stage}`,
    restriction: null,
  })),
};
beforeEach(() => {
  api.mockReset();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.open = false;
    },
  });
});
afterEach(cleanup);
const editPreview = {
  token: "edit-plan",
  path: view.path,
  text: "<<<<<<< local\ncontenido\n=======\nentrante\n>>>>>>> incoming\n",
  lineEnding: "LF",
};
function editingApi() {
  api.mockImplementation(async (command) => {
    if (command === "read_conflict") return view;
    if (command === "preview_conflict_edit") return editPreview;
    if (command === "save_conflict_result")
      return {
        backup: "C:/fixture/.git/backup",
        message: "Resolución guardada; índice aún en conflicto.",
      };
    throw new Error("unexpected command");
  });
}
function mount() {
  const onClose = vi.fn();
  const result = render(
    <ConflictDialog
      repoId="repo"
      token="token"
      path={view.path}
      onClose={onClose}
    />,
  );
  return { ...result, onClose };
}
it("consulta tres etapas sin comandos de escritura y muestra contexto de rebase", async () => {
  api.mockResolvedValue(view);
  mount();
  expect(await screen.findByText("versión 1")).toBeTruthy();
  expect(screen.getByText("versión 2")).toBeTruthy();
  expect(screen.getByText("versión 3")).toBeTruthy();
  expect(screen.getByText(/En rebase/)).toBeTruthy();
  expect(api.mock.calls).toEqual([
    ["read_conflict", { id: "repo", token: "token", path: view.path }],
  ]);
});
it("distingue etapa ausente, archivo vacío y binario", async () => {
  api.mockResolvedValue({
    ...view,
    versions: [
      { ...view.versions[1], text: "" },
      { ...view.versions[2], text: null, restriction: "Contenido binario" },
    ],
  });
  mount();
  expect(await screen.findByText(/Etapa ausente/)).toBeTruthy();
  expect(
    within(screen.getByRole("region", { name: "Local (etapa 2)" })).getByText(
      "(Archivo vacío)",
    ),
  ).toBeTruthy();
  expect(screen.getByText("Contenido binario")).toBeTruthy();
});
it("se puede cerrar durante carga con botón o Escape", async () => {
  api.mockImplementation(() => new Promise(() => {}));
  const { onClose } = mount();
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { bubbles: true, cancelable: true }),
  );
  expect(onClose).toHaveBeenCalledTimes(2);
});
it("muestra error de estado obsoleto sin reintento automático", async () => {
  api.mockRejectedValue({ message: "El conflicto cambió. Actualiza Cambios." });
  mount();
  expect((await screen.findByRole("alert")).textContent).toContain(
    "El conflicto cambió",
  );
  expect(api).toHaveBeenCalledTimes(1);
});
it("ignora respuestas viejas al cambiar de repositorio y restaura el foco al cerrar", async () => {
  let finish!: (value: ConflictView) => void;
  api.mockImplementationOnce(
    () =>
      new Promise<ConflictView>((resolve) => {
        finish = resolve;
      }),
  );
  api.mockResolvedValue({
    ...view,
    versions: [{ ...view.versions[1], text: "actual" }],
  });
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const { rerender, unmount } = mount();
  rerender(
    <ConflictDialog
      repoId="next"
      token="next"
      path="next.txt"
      onClose={vi.fn()}
    />,
  );
  expect(await screen.findByText("actual")).toBeTruthy();
  finish(view);
  expect(screen.queryByText("versión 1")).toBeNull();
  unmount();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});
it("edita y exige confirmación explícita antes de guardar sin preparar", async () => {
  editingApi();
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Editar resultado…" }),
  );
  const result = await screen.findByLabelText("Resultado de la resolución");
  await user.clear(result);
  await user.type(result, "resuelto");
  const save = screen.getByRole("button", {
    name: "Guardar resolución con respaldo",
  });
  expect(save.hasAttribute("disabled")).toBe(true);
  await user.click(screen.getByRole("checkbox"));
  await user.click(save);
  expect((await screen.findByRole("status")).textContent).toContain(
    "índice aún en conflicto",
  );
  expect(api).toHaveBeenCalledWith("save_conflict_result", {
    id: "repo",
    token: "edit-plan",
    result: "resuelto",
  });
  expect(api.mock.calls.map(([command]) => command)).toEqual([
    "read_conflict",
    "preview_conflict_edit",
    "save_conflict_result",
  ]);
});
it("requiere descartar expresamente un borrador al cerrar", async () => {
  editingApi();
  const { onClose } = mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Editar resultado…" }),
  );
  await user.click(await screen.findByRole("button", { name: "Usar local" }));
  await user.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(onClose).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Seguir editando" }));
  expect(screen.queryByText(/Hay cambios sin guardar/)).toBeNull();
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { bubbles: true, cancelable: true }),
  );
  await user.click(screen.getByRole("button", { name: "Descartar y cerrar" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
it("conserva borrador ante error, consume revisión y no reintenta solo", async () => {
  editingApi();
  api.mockImplementation(async (command) => {
    if (command === "read_conflict") return view;
    if (command === "preview_conflict_edit") return editPreview;
    throw { message: "El archivo cambió externamente" };
  });
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Editar resultado…" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Usar entrante" }),
  );
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Guardar resolución con respaldo" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "externamente",
  );
  expect(
    (screen.getByLabelText("Resultado de la resolución") as HTMLTextAreaElement)
      .value,
  ).toBe("versión 3");
  expect(
    screen
      .getByRole("button", { name: "Guardar resolución con respaldo" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    api.mock.calls.filter(([command]) => command === "save_conflict_result"),
  ).toHaveLength(1);
  await user.click(
    screen.getByRole("button", { name: "Volver a revisar el guardado" }),
  );
  expect(
    (screen.getByLabelText("Resultado de la resolución") as HTMLTextAreaElement)
      .value,
  ).toBe("versión 3");
});
it("bloquea cierre y doble envío mientras guarda, e invalida confirmación al editar", async () => {
  editingApi();
  let finish!: (result: unknown) => void;
  api.mockImplementation(async (command) => {
    if (command === "read_conflict") return view;
    if (command === "preview_conflict_edit") return editPreview;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const { onClose } = mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Editar resultado…" }),
  );
  await user.click(await screen.findByRole("button", { name: "Usar local" }));
  await user.click(screen.getByRole("checkbox"));
  await user.type(screen.getByLabelText("Resultado de la resolución"), "extra");
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
    false,
  );
  await user.click(screen.getByRole("checkbox"));
  await user.dblClick(
    screen.getByRole("button", { name: "Guardar resolución con respaldo" }),
  );
  expect(
    api.mock.calls.filter(([command]) => command === "save_conflict_result"),
  ).toHaveLength(1);
  expect(
    screen.getByRole("button", { name: "Cerrar" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { bubbles: true, cancelable: true }),
  );
  expect(onClose).not.toHaveBeenCalled();
  finish({ backup: "backup", message: "Guardado" });
  await screen.findByText("Guardado");
});

function stageApi(failure = false, pending = false) {
  api.mockImplementation(async (command) => {
    if (command === "read_conflict") return view;
    if (command === "preview_conflict_edit") return editPreview;
    if (command === "save_conflict_result")
      return {
        backup: "backup-local",
        message: "Guardado",
        prepareToken: "saved-receipt",
      };
    if (command === "preview_conflict_stage")
      return {
        token: "stage-review",
        path: view.path,
        hash: "a".repeat(40),
        mode: "100644",
        text: "contenido normalizado por Git\n",
      };
    if (command === "prepare_conflict_result") {
      if (failure) throw { message: "El archivo cambió; revisa el índice" };
      if (pending) return new Promise(() => {});
      return { message: "Resolución preparada sin continuar", warning: null };
    }
    throw new Error("unexpected command");
  });
}
async function saveForStage() {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Editar resultado…" }),
  );
  await user.click(await screen.findByRole("button", { name: "Usar local" }));
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Guardar resolución con respaldo" }),
  );
  await screen.findByText("Guardado");
  return user;
}
it("separa guardado, revisión y preparación con nueva confirmación", async () => {
  stageApi();
  mount();
  const user = await saveForStage();
  expect(
    api.mock.calls.some(([command]) => command === "preview_conflict_stage"),
  ).toBe(false);
  await user.click(
    screen.getByRole("button", { name: "Revisar preparación…" }),
  );
  expect(await screen.findByText("contenido normalizado por Git")).toBeTruthy();
  const prepare = screen.getByRole("button", {
    name: "Preparar resolución revisada",
  });
  expect(prepare.hasAttribute("disabled")).toBe(true);
  await user.click(screen.getByRole("checkbox"));
  await user.click(prepare);
  expect(
    await screen.findByText("Resolución preparada sin continuar"),
  ).toBeTruthy();
  expect(api).toHaveBeenCalledWith("preview_conflict_stage", {
    id: "repo",
    token: "saved-receipt",
  });
  expect(api).toHaveBeenCalledWith("prepare_conflict_result", {
    id: "repo",
    token: "stage-review",
  });
  expect(
    screen.queryByRole("button", { name: "Preparar resolución revisada" }),
  ).toBeNull();
  expect(
    api.mock.calls.some(([command]) => /continue|commit/.test(command)),
  ).toBe(false);
});
it("conserva el guardado y respaldo ante fallo al preparar, sin reintento", async () => {
  stageApi(true);
  mount();
  const user = await saveForStage();
  await user.click(
    screen.getByRole("button", { name: "Revisar preparación…" }),
  );
  await screen.findByRole("region", { name: "Revisión de preparación" });
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Preparar resolución revisada" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "El archivo cambió",
  );
  expect(screen.getByText("backup-local")).toBeTruthy();
  expect(screen.getByText("Guardado")).toBeTruthy();
  expect(
    api.mock.calls.filter(([command]) => command === "prepare_conflict_result"),
  ).toHaveLength(1);
  expect(
    screen.queryByRole("button", { name: "Revisar preparación…" }),
  ).toBeNull();
});
it("bloquea cierre y doble envío durante preparación", async () => {
  stageApi(false, true);
  const { onClose } = mount();
  const user = await saveForStage();
  await user.click(
    screen.getByRole("button", { name: "Revisar preparación…" }),
  );
  await screen.findByRole("region", { name: "Revisión de preparación" });
  await user.click(screen.getByRole("checkbox"));
  await user.dblClick(
    screen.getByRole("button", { name: "Preparar resolución revisada" }),
  );
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { bubbles: true, cancelable: true }),
  );
  expect(onClose).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Cerrar" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(
    api.mock.calls.filter(([command]) => command === "prepare_conflict_result"),
  ).toHaveLength(1);
});
