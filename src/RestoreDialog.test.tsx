// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import RestoreDialog, { type RestorePlan, type RestoreOutcome } from "./RestoreDialog";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke);

const samplePlan: RestorePlan = {
  token: "restore-token-123",
  path: "lineas.txt",
  diff: "@@ -1 +1 @@\n-linea modificada\n+linea original\n",
  currentContent: "linea modificada\n",
  targetContent: "linea original\n",
  isRedo: false,
  backupId: "ravengit-restore-lineas-txt-1",
};

const sampleOutcome: RestoreOutcome = {
  result: {
    commitHash: null,
    changes: null,
    warning: null,
  },
  backup: samplePlan.backupId,
  isRedo: false,
  message: "Archivo restaurado con éxito. Se guardó una copia de seguridad para rehacer.",
};

describe("RestoreDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("muestra la vista previa y mantiene el botón de confirmación deshabilitado hasta confirmar", async () => {
    api.mockResolvedValueOnce(samplePlan);

    render(
      <RestoreDialog
        repoId="repo-1"
        path="lineas.txt"
        isRedo={false}
        onClose={vi.fn()}
        onLock={vi.fn()}
        onRestored={vi.fn()}
      />
    );

    expect(screen.getByText(/Calculando vista previa de restauración/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("lineas.txt")).toBeTruthy();
    });

    const confirmBtn = screen.getByRole("button", { name: /Confirmar restauración/i });
    expect(confirmBtn).toHaveProperty("disabled", true);

    const checkbox = screen.getByRole("checkbox", {
      name: /Confirmo restaurar los bytes revisados con respaldo/i,
    });
    await userEvent.click(checkbox);

    expect(confirmBtn).toHaveProperty("disabled", false);
  });

  it("ejecuta la restauración y notifica al confirmar", async () => {
    api.mockResolvedValueOnce(samplePlan);
    api.mockResolvedValueOnce(sampleOutcome);

    const onRestored = vi.fn();
    const onClose = vi.fn();

    render(
      <RestoreDialog
        repoId="repo-1"
        path="lineas.txt"
        isRedo={false}
        onClose={onClose}
        onLock={vi.fn()}
        onRestored={onRestored}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("lineas.txt")).toBeTruthy();
    });

    const checkbox = screen.getByRole("checkbox", {
      name: /Confirmo restaurar los bytes revisados con respaldo/i,
    });
    await userEvent.click(checkbox);

    const confirmBtn = screen.getByRole("button", { name: /Confirmar restauración/i });
    await userEvent.click(confirmBtn);

    expect(api).toHaveBeenCalledWith("confirm_worktree_restore", {
      id: "repo-1",
      token: samplePlan.token,
    });

    await waitFor(() => {
      expect(onRestored).toHaveBeenCalledWith(sampleOutcome.result);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("muestra error de vista obsoleta si el backend rechaza por STALE_RESTORE", async () => {
    api.mockResolvedValueOnce(samplePlan);
    api.mockRejectedValueOnce({
      code: "STALE_RESTORE",
      message: "El archivo o repositorio cambió desde la vista previa. Actualiza antes de continuar.",
    });

    const onRestored = vi.fn();
    const onClose = vi.fn();

    render(
      <RestoreDialog
        repoId="repo-1"
        path="lineas.txt"
        isRedo={false}
        onClose={onClose}
        onLock={vi.fn()}
        onRestored={onRestored}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("lineas.txt")).toBeTruthy();
    });

    const checkbox = screen.getByRole("checkbox", {
      name: /Confirmo restaurar los bytes revisados con respaldo/i,
    });
    await userEvent.click(checkbox);

    const confirmBtn = screen.getByRole("button", { name: /Confirmar restauración/i });
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByText(/El archivo o repositorio cambió desde la vista previa/i)).toBeTruthy();
    });

    expect(onRestored).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("soporta modo Rehacer con textos y confirmación correspondiente", async () => {
    const redoPlan = { ...samplePlan, isRedo: true };
    api.mockResolvedValueOnce(redoPlan);

    render(
      <RestoreDialog
        repoId="repo-1"
        path="lineas.txt"
        isRedo={true}
        onClose={vi.fn()}
        onLock={vi.fn()}
        onRestored={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Rehacer cambios respaldados/i)).toBeTruthy();
    });

    const checkbox = screen.getByRole("checkbox", {
      name: /Confirmo rehacer los cambios respaldados/i,
    });
    expect(checkbox).toBeTruthy();
    const confirmBtn = screen.getByRole("button", { name: /Confirmar rehacer/i });
    expect(confirmBtn).toHaveProperty("disabled", true);
  });
});
