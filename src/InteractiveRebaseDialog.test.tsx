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
import InteractiveRebaseDialog from "./InteractiveRebaseDialog";
import type { RebasePreview } from "./types";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke);
const preview: RebasePreview = {
  token: "branch-state",
  branch: "topic",
  base: "main",
  headHash: "a".repeat(40),
  baseHash: "b".repeat(40),
  relation: "upToDate",
  candidates: 2,
  commits: [
    { hash: "c".repeat(40), subject: "Primero" },
    { hash: "d".repeat(40), subject: "Segundo" },
  ],
  truncated: false,
  containsMerges: false,
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  api.mockReset();
  api.mockImplementation(async (command, args) =>
    command === "review_interactive_rebase"
      ? {
          ...preview,
          interactive: {
            token: "single-use-review",
            steps: (args as { steps: unknown[] }).steps,
          },
        }
      : { message: "Rebase completado", warning: "Respaldo conservado" },
  );
});
afterEach(cleanup);
function mount() {
  const onClose = vi.fn(),
    onLock = vi.fn(),
    onUpdated = vi.fn(async () => true);
  render(
    <InteractiveRebaseDialog
      repoId="fixture"
      preview={preview}
      onClose={onClose}
      onLock={onLock}
      onUpdated={onUpdated}
    />,
  );
  return { onClose, onLock, onUpdated };
}
it("reordena y entrega acciones/mensaje a revisión sin ejecutar", async () => {
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Subir Segundo" }));
  await userEvent.selectOptions(
    screen.getByLabelText("Acción para Segundo"),
    "reword",
  );
  await userEvent.clear(screen.getByLabelText("Mensaje final para Segundo"));
  await userEvent.type(
    screen.getByLabelText("Mensaje final para Segundo"),
    "Mensaje revisado",
  );
  await userEvent.click(screen.getByRole("button", { name: "Revisar plan" }));
  await screen.findByRole("region", { name: "Plan revisado" });
  expect(api).toHaveBeenCalledWith("review_interactive_rebase", {
    id: "fixture",
    token: "branch-state",
    steps: [
      { hash: "d".repeat(40), action: "reword", message: "Mensaje revisado" },
      { hash: "c".repeat(40), action: "pick", message: "" },
    ],
  });
  expect(api.mock.calls.some(([c]) => c === "edit_rebase")).toBe(false);
  expect(
    (
      screen.getByRole("button", {
        name: "Ejecutar plan revisado",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("cambiar orden invalida revisión y consentimiento", async () => {
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Revisar plan" }));
  await screen.findByRole("checkbox");
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Bajar Primero" }));
  expect(screen.queryByRole("region", { name: "Plan revisado" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Revisar plan" }));
  expect(
    ((await screen.findByRole("checkbox")) as HTMLInputElement).checked,
  ).toBe(false);
});
it("consume sólo token revisado, bloquea doble envío y cierre", async () => {
  const h = mount();
  await userEvent.click(screen.getByRole("button", { name: "Revisar plan" }));
  await userEvent.click(await screen.findByRole("checkbox"));
  let resolve!: (v: unknown) => void;
  api.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const execute = screen.getByRole("button", {
    name: "Ejecutar plan revisado",
  });
  fireEvent.click(execute);
  fireEvent.click(execute);
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(h.onClose).not.toHaveBeenCalled();
  expect(api.mock.calls.filter(([c]) => c === "edit_rebase")).toHaveLength(1);
  expect(api).toHaveBeenCalledWith("edit_rebase", {
    id: "fixture",
    token: "single-use-review",
    edit: null,
  });
  resolve({ message: "Rebase completado" });
  await screen.findByRole("status");
  expect(h.onUpdated).toHaveBeenCalledOnce();
});
it("rechazo del plan es visible y no se reintenta automáticamente", async () => {
  mount();
  api.mockRejectedValue({ message: "Squash necesita un commit anterior" });
  await userEvent.click(screen.getByRole("button", { name: "Revisar plan" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Squash necesita",
  );
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("alert"));
});
