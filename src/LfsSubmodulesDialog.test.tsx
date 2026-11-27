// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import LfsSubmodulesDialog from "./LfsSubmodulesDialog";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const api = vi.mocked(invoke);

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  api.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("LfsSubmodulesDialog", () => {
  it("gestiona pull, lock/unlock de Git LFS y actualización/sincronización de submódulos", async () => {
    const baseLfs = {
      installed: true,
      version: "git-lfs/3.5.1",
      configured: true,
      trackedPatterns: ["*.psd", "*.png"],
      files: [
        {
          path: "assets/hero.psd",
          oid: "1234567890abcdef1234",
          downloaded: false,
          sizeLabel: "2.4 MiB",
        },
      ],
      locks: [
        {
          id: "99",
          path: "assets/hero.psd",
          owner: "Erick",
          lockedAt: "2026-11-25T10:00:00Z",
        },
      ],
      cacheBytes: 2048,
      trusted: true,
    };

    const baseSubmodules = {
      submodules: [
        {
          name: "vendor-core",
          path: "deps/core",
          url: "https://example.com/core.git",
          branch: "main",
          head: "abcdef1234567890abcdef1234567890abcdef12",
          describe: null,
          status: "uninitialized",
          initialized: false,
        },
      ],
      trusted: true,
    };

    api.mockImplementation(async (command, args) => {
      if (command === "read_lfs_status") return baseLfs;
      if (command === "read_submodules") return baseSubmodules;
      if (command === "pull_lfs_objects") {
        return {
          message: "Objetos LFS descargados.",
          status: {
            ...baseLfs,
            files: [{ ...baseLfs.files[0], downloaded: true }],
          },
        };
      }
      if (command === "refresh_lfs_locks") {
        return baseLfs.locks;
      }
      if (command === "lock_lfs_file") {
        return {
          message: `Bloqueado ${(args as { path: string }).path}`,
          status: baseLfs,
        };
      }
      if (command === "unlock_lfs_file") {
        return {
          message: "Desbloqueado assets/hero.psd",
          status: { ...baseLfs, locks: [] },
        };
      }
      if (command === "update_submodule") {
        return {
          message: "Submódulo deps/core actualizado.",
          list: {
            submodules: [
              {
                ...baseSubmodules.submodules[0],
                status: "clean",
                initialized: true,
              },
            ],
            trusted: true,
          },
        };
      }
      return null;
    });

    const onUpdated = vi.fn().mockResolvedValue(undefined);
    render(
      <LfsSubmodulesDialog
        repoId="repo-1"
        repoName="RavenGit"
        trusted={true}
        onUpdated={onUpdated}
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("git-lfs/3.5.1")).toBeTruthy();
    expect(
      within(dialog).getAllByText("assets/hero.psd").length,
    ).toBeGreaterThan(0);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Descargar" }),
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("pull_lfs_objects", {
        id: "repo-1",
        path: "assets/hero.psd",
      }),
    );

    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "Consultar bloqueos en remoto",
      }),
    );
    expect(api).toHaveBeenCalledWith("refresh_lfs_locks", { id: "repo-1" });

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Bloquear" }),
    );
    expect(api).toHaveBeenCalledWith("lock_lfs_file", {
      id: "repo-1",
      path: "assets/hero.psd",
    });

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Desbloquear" }),
    );
    expect(api).toHaveBeenCalledWith("unlock_lfs_file", {
      id: "repo-1",
      path: "assets/hero.psd",
      force: false,
    });

    // Cambiar a pestaña Submódulos
    await userEvent.click(
      within(dialog).getByRole("tab", { name: /Submódulos/ }),
    );
    expect(await within(dialog).findByText("deps/core")).toBeTruthy();
    expect(within(dialog).getByText("Sin inicializar")).toBeTruthy();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Actualizar" }),
    );
    expect(api).toHaveBeenCalledWith("update_submodule", {
      id: "repo-1",
      action: { kind: "initUpdate", path: "deps/core", recursive: false },
    });

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Sincronizar URL" }),
    );
    expect(api).toHaveBeenCalledWith("update_submodule", {
      id: "repo-1",
      action: { kind: "syncUrls", path: "deps/core" },
    });
  });

  it("muestra banner de solo lectura cuando no está autorizado", async () => {
    api.mockImplementation(async (command) => {
      if (command === "read_lfs_status")
        return {
          installed: false,
          version: null,
          configured: false,
          trackedPatterns: [],
          files: [],
          locks: [],
          cacheBytes: 0,
          trusted: false,
        };
      if (command === "read_submodules")
        return { submodules: [], trusted: false };
      return null;
    });
    const onAuthorize = vi.fn();

    render(
      <LfsSubmodulesDialog
        repoId="repo-1"
        repoName="RavenGit"
        trusted={false}
        onAuthorize={onAuthorize}
        onUpdated={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        /Este repositorio está en modo de solo lectura/i,
      ),
    ).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "Autorizar este repositorio…",
      }),
    );
    expect(onAuthorize).toHaveBeenCalledTimes(1);
  });
});
