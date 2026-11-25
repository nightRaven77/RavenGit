// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import WorktreeDialog from "./WorktreeDialog";
import type { WorktreesState } from "./types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const api = vi.mocked(invoke);
const dialog = vi.mocked(open);

function baseState(overrides: Partial<WorktreesState> = {}): WorktreesState {
  return {
    trusted: true,
    currentPath: "/repos/alpha",
    branches: ["main", "develop", "feat/ui"],
    restriction: null,
    worktrees: [
      {
        path: "/repos/alpha",
        name: "alpha",
        head: "1111111111111111111111111111111111111111",
        branch: "main",
        detached: false,
        bare: false,
        main: true,
        current: true,
        locked: false,
        lockReason: null,
        prunable: false,
        prunableReason: null,
      },
      {
        path: "/repos/alpha-feat",
        name: "alpha-feat",
        head: "2222222222222222222222222222222222222222",
        branch: "feat/ui",
        detached: false,
        bare: false,
        main: false,
        current: false,
        locked: false,
        lockReason: null,
        prunable: false,
        prunableReason: null,
      },
      {
        path: "/repos/alpha-gone",
        name: "alpha-gone",
        head: "3333333333333333333333333333333333333333",
        branch: null,
        detached: true,
        bare: false,
        main: false,
        current: false,
        locked: false,
        lockReason: null,
        prunable: true,
        prunableReason: "gitdir points to missing dir",
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  api.mockReset();
  dialog.mockReset();
});

afterEach(cleanup);

it("lista worktrees, bloquea con motivo, desbloquea, elimina tras confirmación y limpia obsoletos", async () => {
  let current = baseState();
  const onUpdated = vi.fn().mockResolvedValue(undefined);
  const onOpenInTab = vi.fn().mockResolvedValue(undefined);
  const onLock = vi.fn();

  api.mockImplementation(async (command, args) => {
    if (command === "read_worktrees") return structuredClone(current);
    if (command === "lock_worktree") {
      const { reason } = args as { reason: string | null };
      current = baseState({
        worktrees: current.worktrees.map((w) =>
          w.path === "/repos/alpha-feat"
            ? { ...w, locked: true, lockReason: reason }
            : w,
        ),
      });
      return {
        message: "Worktree alpha-feat bloqueado.",
        createdPath: null,
        state: structuredClone(current),
      };
    }
    if (command === "unlock_worktree") {
      current = baseState({
        worktrees: current.worktrees.map((w) =>
          w.path === "/repos/alpha-feat"
            ? { ...w, locked: false, lockReason: null }
            : w,
        ),
      });
      return {
        message: "Worktree alpha-feat desbloqueado.",
        createdPath: null,
        state: structuredClone(current),
      };
    }
    if (command === "remove_worktree") {
      const { force } = args as { force: boolean };
      current = baseState({
        worktrees: current.worktrees.filter(
          (w) => w.path !== "/repos/alpha-feat",
        ),
      });
      return {
        message: force
          ? "Eliminado con force"
          : "Worktree alpha-feat eliminado.",
        createdPath: null,
        state: structuredClone(current),
      };
    }
    if (command === "prune_worktrees") {
      current = baseState({
        worktrees: current.worktrees.filter((w) => !w.prunable),
      });
      return {
        message: "Entradas de worktrees obsoletos limpiadas.",
        createdPath: null,
        state: structuredClone(current),
      };
    }
    if (command === "open_worktree_external") {
      return {
        appId: "antigravity",
        appName: "Antigravity IDE",
        kind: (args as { kind: string }).kind,
        message: "Abierto en Antigravity IDE",
      };
    }
    throw new Error(command);
  });

  render(
    <WorktreeDialog
      repoId="repo-1"
      repoPath="/repos/alpha"
      repoName="alpha"
      openTabPaths={["/repos/alpha"]}
      onClose={vi.fn()}
      onLock={onLock}
      onUpdated={onUpdated}
      onOpenInTab={onOpenInTab}
    />,
  );

  const section = await screen.findByRole("region", {
    name: "Worktrees activos del repositorio",
  });
  expect(within(section).getByText("Principal")).toBeTruthy();
  expect(within(section).getByText("Actual")).toBeTruthy();
  expect(within(section).getByText("Obsoleto")).toBeTruthy();

  // Abrir externo en editor
  const featRow = within(section).getByText("alpha-feat").closest("li")!;
  await userEvent.click(
    within(featRow).getByRole("button", { name: "Editor" }),
  );
  expect(api).toHaveBeenCalledWith("open_worktree_external", {
    id: "repo-1",
    path: "/repos/alpha-feat",
    kind: "editor",
  });

  // Bloquear con motivo inline
  await userEvent.click(
    within(featRow).getByRole("button", { name: "Bloquear" }),
  );
  await userEvent.type(
    screen.getByLabelText("Motivo del bloqueo (opcional)"),
    "En revisión",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar bloqueo" }),
  );
  await screen.findByText("Motivo de bloqueo: En revisión");
  expect(
    within(featRow)
      .getByRole("button", { name: "Eliminar…" })
      .hasAttribute("disabled"),
  ).toBe(true);

  // Desbloquear y eliminar en dos pasos
  await userEvent.click(
    within(featRow).getByRole("button", { name: "Desbloquear" }),
  );
  await waitFor(() =>
    expect(
      within(featRow)
        .getByRole("button", { name: "Eliminar…" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );

  await userEvent.click(
    within(featRow).getByRole("button", { name: "Eliminar…" }),
  );
  const confirmRegion = screen.getByRole("region", {
    name: "Confirmar eliminación de worktree",
  });
  await userEvent.click(
    within(confirmRegion).getByRole("button", {
      name: "Confirmar eliminación",
    }),
  );
  expect(api).toHaveBeenCalledWith("remove_worktree", {
    id: "repo-1",
    path: "/repos/alpha-feat",
    force: false,
  });

  // Prune de obsoletos
  await userEvent.click(
    screen.getByRole("button", { name: "Limpiar obsoletos (Prune)" }),
  );
  expect(api).toHaveBeenCalledWith("prune_worktrees", { id: "repo-1" });
  expect(onUpdated).toHaveBeenCalled();
});

it("sugiere ruta automática, crea un worktree en rama nueva y lo abre en pestaña", async () => {
  const initial = baseState({
    worktrees: baseState().worktrees.slice(0, 1),
  });
  const onOpenInTab = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  api.mockImplementation(async (command, args) => {
    if (command === "read_worktrees") return initial;
    if (command === "add_worktree") {
      const req = (args as { request: { path: string; branch: string } })
        .request;
      return {
        message: `Worktree creado en rama ${req.branch}.`,
        createdPath: req.path,
        state: baseState(),
      };
    }
    throw new Error(command);
  });

  render(
    <WorktreeDialog
      repoId="repo-1"
      repoPath="/repos/alpha"
      repoName="alpha"
      openTabPaths={["/repos/alpha"]}
      onClose={onClose}
      onLock={vi.fn()}
      onUpdated={vi.fn().mockResolvedValue(undefined)}
      onOpenInTab={onOpenInTab}
    />,
  );

  const branchInput = await screen.findByLabelText("Nombre de la nueva rama");
  await userEvent.type(branchInput, "feat/pagos");
  const pathInput = screen.getByLabelText(
    "Carpeta de destino",
  ) as HTMLInputElement;
  expect(pathInput.value).toBe("/repos/alpha-feat-pagos");

  await userEvent.click(screen.getByRole("button", { name: "Crear worktree" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("add_worktree", {
      id: "repo-1",
      request: {
        mode: "newBranch",
        path: "/repos/alpha-feat-pagos",
        branch: "feat/pagos",
        baseRef: null,
      },
    }),
  );
  expect(onOpenInTab).toHaveBeenCalledWith("/repos/alpha-feat-pagos");
  expect(onClose).toHaveBeenCalled();
});

it("mantiene modo de solo lectura cuando el repositorio no está autorizado", async () => {
  const onAuthorize = vi.fn();
  const onClose = vi.fn();
  api.mockResolvedValueOnce(baseState({ trusted: false }));

  render(
    <WorktreeDialog
      repoId="repo-1"
      repoPath="/repos/alpha"
      repoName="alpha"
      openTabPaths={["/repos/alpha"]}
      onClose={onClose}
      onLock={vi.fn()}
      onUpdated={vi.fn().mockResolvedValue(undefined)}
      onOpenInTab={vi.fn().mockResolvedValue(undefined)}
      onAuthorize={onAuthorize}
    />,
  );

  expect(
    await screen.findByText(/Este repositorio está en modo de solo lectura/),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Crear worktree" })
      .hasAttribute("disabled"),
  ).toBe(true);

  await userEvent.click(
    screen.getByRole("button", { name: "Ir a Cambios para autorizar" }),
  );
  expect(onAuthorize).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});
