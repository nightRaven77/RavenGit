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
import AmendDialog from "./AmendDialog";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke);
const plan = {
  token: "amend-reviewed",
  head: "a".repeat(40),
  branch: "main",
  author: "Original <original@example.invalid>",
  committer: "Actual <actual@example.invalid>",
  originalMessage: "Mensaje original\n\nCuerpo",
  message: "Mensaje original\n\nCuerpo",
  originalPatch: "@@ -0,0 +1 @@\n+original\n",
  stagedPatch: "@@ -1 +1 @@\n-original\n+preparado\n",
  publishedRefs: ["refs/remotes/origin/main"],
};
const result = { commitHash: "b".repeat(40), changes: null, warning: null };
function mount(onAmended = vi.fn(async () => {})) {
  const onClose = vi.fn(),
    onLock = vi.fn();
  render(
    <AmendDialog
      repoId="fixture"
      onClose={onClose}
      onLock={onLock}
      onAmended={onAmended}
    />,
  );
  return { onClose, onLock, onAmended };
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
  api.mockImplementation(async (command, args) => {
    if (command === "preview_amend")
      return {
        ...plan,
        message:
          (args && "message" in args ? args.message : null) ?? plan.message,
      };
    if (command === "confirm_amend")
      return { result, backup: "refs/ravengit/amend/fixture" };
    throw new Error(`Unexpected command: ${command}`);
  });
});
afterEach(cleanup);
async function review() {
  await waitFor(() =>
    expect(
      (
        screen.getByLabelText(
          "Mensaje del commit reemplazado",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe(plan.message),
  );
  await userEvent.click(screen.getByRole("button", { name: "Revisar amend" }));
  return screen.findByRole("button", { name: "Confirmar amend" });
}
it("exige revisión y confirmación explícita, conserva autor y muestra riesgo remoto", async () => {
  const { onAmended, onLock } = mount();
  const confirm = await review();
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  expect(
    screen.getByText(/El commit aparece en referencias remotas locales/)
      .textContent,
  ).toContain("origin/main");
  expect(screen.getByText(/Autor conservado/).textContent).toContain(
    "Original",
  );
  expect(api.mock.calls.some(([command]) => command === "confirm_amend")).toBe(
    false,
  );
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(confirm);
  await screen.findByText(/Amend confirmado:/);
  expect(api).toHaveBeenCalledWith("confirm_amend", {
    id: "fixture",
    token: plan.token,
  });
  expect(onAmended).toHaveBeenCalledWith(result);
  expect(onLock).toHaveBeenLastCalledWith(false);
  expect(screen.queryByRole("button", { name: "Confirmar amend" })).toBeNull();
});
it("editar el mensaje invalida la revisión y exige nueva confirmación", async () => {
  mount();
  await review();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.type(
    screen.getByLabelText("Mensaje del commit reemplazado"),
    " corregido",
  );
  expect(screen.queryByRole("button", { name: "Confirmar amend" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Revisar amend" }));
  await screen.findByRole("button", { name: "Confirmar amend" });
  expect(api).toHaveBeenLastCalledWith("preview_amend", {
    id: "fixture",
    message: `${plan.message} corregido`,
  });
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
    false,
  );
});
it("un fallo consume la confirmación, conserva el mensaje y no reintenta", async () => {
  api.mockImplementation(async (command, args) => {
    if (command === "preview_amend")
      return {
        ...plan,
        message:
          (args && "message" in args ? args.message : null) ?? plan.message,
      };
    throw {
      message: "Revisión obsoleta; comprueba HEAD. Respaldo conservado.",
    };
  });
  const { onAmended } = mount();
  const confirm = await review();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(confirm);
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Confirmar amend" })).toBeNull();
  expect(
    (
      screen.getByLabelText(
        "Mensaje del commit reemplazado",
      ) as HTMLTextAreaElement
    ).value,
  ).toBe(plan.message);
  expect(onAmended).not.toHaveBeenCalled();
  expect(
    api.mock.calls.filter(([command]) => command === "confirm_amend"),
  ).toHaveLength(1);
});
it("Escape cierra sin ejecutar amend", async () => {
  const { onClose } = mount();
  await review();
  const dialog = screen.getByRole("dialog");
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect((dialog as HTMLDialogElement).open).toBe(false);
  expect(api.mock.calls.some(([command]) => command === "confirm_amend")).toBe(
    false,
  );
});
it("no permite cerrar ni duplicar una ejecución en curso", async () => {
  let finish!: (value: unknown) => void;
  api.mockImplementation(async (command) =>
    command === "preview_amend"
      ? plan
      : new Promise((resolve) => {
          finish = resolve;
        }),
  );
  const { onClose } = mount();
  const confirm = await review();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.dblClick(confirm);
  expect(
    (screen.getByRole("button", { name: "Cerrar" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(onClose).not.toHaveBeenCalled();
  expect(
    api.mock.calls.filter(([command]) => command === "confirm_amend"),
  ).toHaveLength(1);
  finish({ result, backup: "refs/ravengit/amend/test" });
  await screen.findByText(/Amend confirmado:/);
});
it("un fallo de refresco tras éxito no ofrece repetir amend", async () => {
  mount(
    vi.fn(async () => {
      throw new Error("refresco");
    }),
  );
  const confirm = await review();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(confirm);
  await screen.findByText(/No se pudo actualizar la vista; no repitas amend/);
  expect(screen.queryByRole("button", { name: "Revisar amend" })).toBeNull();
});
it("si no hay refs remotas no declara que el commit sea privado y permite reintentar lectura", async () => {
  api
    .mockRejectedValueOnce({ message: "No se pudo leer" })
    .mockResolvedValue({ ...plan, publishedRefs: [], stagedPatch: "" });
  mount();
  await screen.findByRole("alert");
  await userEvent.click(
    screen.getByRole("button", { name: "Recargar último commit" }),
  );
  await review();
  expect(
    screen.getByText(/Esto no demuestra que no haya sido publicado/),
  ).toBeTruthy();
  expect(
    screen.getByText(/Sin cambios preparados: sólo se reemplaza el mensaje/),
  ).toBeTruthy();
});
