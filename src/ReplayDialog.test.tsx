// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import ReplayDialog from "./ReplayDialog";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke);
const hash = "b".repeat(40);
const options = {
  trusted: true,
  branch: "main",
  restriction: null,
  recovery: null,
};
const plan = {
  kind: "cherryPick",
  commit: hash,
  token: "review",
  head: "a".repeat(40),
  branch: "main",
  subject: "Cambio seleccionado",
  patch: "@@ -1 +1 @@\n-antes\n+después\n",
};
function mount(onUpdated = vi.fn(async () => true)) {
  const onClose = vi.fn(),
    onLock = vi.fn();
  render(
    <ReplayDialog
      repoId="fixture"
      initial={{ kind: "cherryPick", commit: hash }}
      onClose={onClose}
      onLock={onLock}
      onUpdated={onUpdated}
    />,
  );
  return { onClose, onLock, onUpdated };
}
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
  api.mockImplementation(async (command) => {
    if (command === "read_replay") return options;
    if (command === "preview_replay") return plan;
    if (command === "edit_replay")
      return { message: "Nuevo commit confirmado", warning: null };
    throw new Error(`Unexpected command: ${command}`);
  });
});
afterEach(cleanup);
it("cierra el diálogo nativo antes de notificar el cierre durante la lectura", async () => {
  api.mockImplementation(() => new Promise(() => {}));
  const handlers = mount();
  const dialog = screen.getByRole("dialog") as HTMLDialogElement;
  const nativeState: boolean[] = [];
  handlers.onClose.mockImplementation(() => {
    nativeState.push(dialog.open);
  });
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(handlers.onClose).toHaveBeenCalledTimes(1);
  expect(nativeState).toEqual([false]);
  expect(api.mock.calls.map(([command]) => command)).toEqual(["read_replay"]);
});
it("Escape cierra el diálogo nativo sin abortar la operación Git", async () => {
  const handlers = mount();
  await screen.findByRole("button", { name: "Revisar Cherry-pick" });
  const dialog = screen.getByRole("dialog") as HTMLDialogElement;
  fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
  expect(dialog.open).toBe(false);
  expect(handlers.onClose).toHaveBeenCalledTimes(1);
  expect(api.mock.calls.map(([command]) => command)).toEqual(["read_replay"]);
});
it("no cierra durante una solicitud en curso y vuelve a permitirlo al terminar", async () => {
  let finish!: (value: unknown) => void;
  api.mockImplementation(async (command) =>
    command === "preview_replay"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : options,
  );
  const handlers = mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Revisar Cherry-pick" }),
  );
  const dialog = screen.getByRole("dialog") as HTMLDialogElement;
  const cancel = new Event("cancel", { cancelable: true });
  fireEvent(dialog, cancel);
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(cancel.defaultPrevented).toBe(true);
  expect(dialog.open).toBe(true);
  expect(handlers.onClose).not.toHaveBeenCalled();
  finish(plan);
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Cerrar" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(dialog.open).toBe(false);
  expect(handlers.onClose).toHaveBeenCalledTimes(1);
  expect(handlers.onLock.mock.calls).toEqual([[true], [false]]);
});
it("abrir sólo lee y revisar requiere una confirmación separada", async () => {
  mount();
  await screen.findByRole("button", { name: "Revisar Cherry-pick" });
  expect(api.mock.calls.map(([command]) => command)).toEqual(["read_replay"]);
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar Cherry-pick" }),
  );
  const confirm = await screen.findByRole("button", {
    name: "Confirmar Cherry-pick",
  });
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  expect(api).toHaveBeenCalledWith("preview_replay", {
    id: "fixture",
    kind: "cherryPick",
    commit: hash,
  });
  expect(api.mock.calls.some(([command]) => command === "edit_replay")).toBe(
    false,
  );
  await userEvent.type(screen.getByLabelText("Hash completo del commit"), "a");
  expect(
    screen.queryByRole("button", { name: "Confirmar Cherry-pick" }),
  ).toBeNull();
});
it.each([false, true])(
  "consume la revisión tras éxito/error sin reintentar: %s",
  async (fails) => {
    api.mockImplementation(async (command) => {
      if (command === "read_replay") return options;
      if (command === "preview_replay") return plan;
      if (command === "edit_replay") {
        if (fails) throw { message: "El repositorio cambió" };
        return { message: "Nuevo commit confirmado", warning: null };
      }
    });
    mount(vi.fn(async () => false));
    await userEvent.click(
      await screen.findByRole("button", { name: "Revisar Cherry-pick" }),
    );
    await userEvent.click(
      await screen.findByRole("checkbox", { name: /Confirmo el commit/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar Cherry-pick" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Confirmar Cherry-pick" }),
      ).toBeNull(),
    );
    expect(api).toHaveBeenCalledWith("edit_replay", {
      id: "fixture",
      token: "review",
      action: null,
    });
    expect(
      api.mock.calls.filter(([command]) => command === "edit_replay"),
    ).toHaveLength(1);
    if (fails)
      expect((await screen.findByRole("alert")).textContent).toContain(
        "El repositorio cambió",
      );
    else
      expect((await screen.findByRole("status")).textContent).toContain(
        "No repitas la operación",
      );
  },
);
it("recupera conflicto y exige consentimiento antes de abortar", async () => {
  api.mockResolvedValue({
    ...options,
    recovery: {
      ...plan,
      status: "active",
      original: plan.head,
      backup: "refs/ravengit/replay/fixture",
      conflicts: ["archivo.txt"],
      canContinue: false,
      canClear: false,
    },
  });
  mount();
  await screen.findByRole("button", { name: "Marcar resuelto: archivo.txt" });
  expect(
    (
      screen.getByRole("button", {
        name: "Continuar operación",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (
      screen.getByRole("button", {
        name: "Abortar operación",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await userEvent.click(
    screen.getByRole("checkbox", { name: /He guardado mis ediciones/ }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Abortar operación" }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("edit_replay", {
      id: "fixture",
      token: "review",
      action: { kind: "abort" },
    }),
  );
});
it("sin confianza no permite revisar ni ejecutar", async () => {
  api.mockResolvedValue({
    trusted: false,
    branch: null,
    restriction: null,
    recovery: null,
  });
  mount();
  await screen.findByRole("button", {
    name: "Autorizar operaciones de commit",
  });
  expect(
    screen.queryByRole("button", { name: "Revisar Cherry-pick" }),
  ).toBeNull();
  expect(api.mock.calls.map(([command]) => command)).toEqual(["read_replay"]);
});
