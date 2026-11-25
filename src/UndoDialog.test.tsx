// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UndoDialog from "./UndoDialog";
import type { UndoPlan } from "./types";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

afterEach(() => {
  cleanup();
});

describe("UndoDialog", () => {
  it("muestra transición, advertencia remota y ejecuta confirmación o cancelación", async () => {
    const plan: UndoPlan = {
      token: "undo-tok",
      direction: "undo",
      entry: {
        id: "u1",
        timestamp: 1700000100,
        kind: "commit",
        label: "Commit: feat",
        before: { branch: "main", head: "1111111aaaa" },
        after: { branch: "main", head: "2222222bbbb" },
        movesRefs: true,
      },
      currentBranch: "main",
      currentHead: "2222222bbbb",
      targetBranch: "main",
      targetHead: "1111111aaaa",
      requiresConfirmation: true,
      summary:
        "Deshacer «Commit: feat»: moverá HEAD conservando cambios (--mixed).",
      warning:
        "El commit actual figura en una rama remota registrada localmente.",
    };

    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <UndoDialog
        plan={plan}
        undoCount={2}
        redoCount={1}
        busy={false}
        error=""
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Commit: feat")).toBeTruthy();
    expect(within(dialog).getByText("main (2222222)")).toBeTruthy();
    expect(within(dialog).getByText("main (1111111)")).toBeTruthy();
    expect(
      within(dialog).getByText(/El commit actual figura en una rama remota/),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/Deshacer \(2\) · Rehacer \(1\)/),
    ).toBeTruthy();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar deshacer" }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancelar" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
