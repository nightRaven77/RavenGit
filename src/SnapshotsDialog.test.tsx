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
import SnapshotsDialog from "./SnapshotsDialog";
import { DEFAULT_SNAPSHOT_PREFERENCES } from "./themes";

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

describe("SnapshotsDialog", () => {
  it("captura un snapshot manual, previsualiza restauración y guarda configuración", async () => {
    const initialList = {
      snapshots: [
        {
          id: "snap-1",
          createdAt: 1700000000,
          label: "Respaldo previo",
          trigger: "auto",
          branch: "main",
          head: "abcdef123456",
          totalBytes: 2048,
          fileCount: 1,
          files: [
            {
              path: "src/app.ts",
              status: " M",
              existed: true,
              sha256: "a".repeat(64),
              size: 2048,
            },
          ],
        },
      ],
      totalBytes: 2048,
      count: 1,
    };

    const capturedList = {
      snapshots: [
        {
          id: "snap-2",
          createdAt: 1700000500,
          label: "Mi punto seguro",
          trigger: "manual",
          branch: "main",
          head: "abcdef123456",
          totalBytes: 4096,
          fileCount: 1,
          files: [
            {
              path: "src/app.ts",
              status: " M",
              existed: true,
              sha256: "b".repeat(64),
              size: 2048,
            },
          ],
        },
        ...initialList.snapshots,
      ],
      totalBytes: 4096,
      count: 2,
    };

    api.mockImplementation(async (command) => {
      if (command === "read_snapshots") return initialList;
      if (command === "create_snapshot") {
        return {
          created: true,
          deduplicated: false,
          snapshot: capturedList.snapshots[0],
          list: capturedList,
          message: "Snapshot guardado con 1 archivo(s).",
        };
      }
      if (command === "preview_snapshot_restore") {
        return {
          token: "plan-tok",
          snapshotId: "snap-1",
          label: "Respaldo previo",
          createdAt: 1700000000,
          snapshotBranch: "main",
          snapshotHead: "abcdef123456",
          currentBranch: "feature",
          currentHead: "999999123456",
          branchMismatch: true,
          headMismatch: true,
          files: [
            {
              path: "src/app.ts",
              action: "restore",
              bytesBefore: 100,
              bytesAfter: 2048,
            },
          ],
          summary: "Se aplicará el estado de 1 archivo(s).",
        };
      }
      if (command === "confirm_snapshot_restore") {
        return {
          snapshotId: "snap-1",
          backupSnapshotId: "snap-pre",
          restoredFiles: 1,
          message: "Se restauraron 1 archivo(s) desde el snapshot local.",
        };
      }
      return null;
    });

    const onSavePreferences = vi.fn().mockResolvedValue(undefined);
    const onRestored = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <SnapshotsDialog
        repoId="repo-1"
        repoName="RavenGit"
        trusted={true}
        preferences={DEFAULT_SNAPSHOT_PREFERENCES}
        onSavePreferences={onSavePreferences}
        onRestored={onRestored}
        onClose={onClose}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Respaldo previo")).toBeTruthy();

    await userEvent.type(
      within(dialog).getByLabelText("Etiqueta del snapshot"),
      "Mi punto seguro",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Capturar snapshot ahora" }),
    );
    expect(await within(dialog).findByText("Mi punto seguro")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("create_snapshot", {
      id: "repo-1",
      label: "Mi punto seguro",
      trigger: "manual",
    });

    const restoreBtns = within(dialog).getAllByRole("button", {
      name: "Restaurar…",
    });
    await userEvent.click(restoreBtns[1]);
    expect(
      await within(dialog).findByText(/el snapshot se tomó en/i),
    ).toBeTruthy();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar restauración" }),
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("confirm_snapshot_restore", {
        id: "repo-1",
        token: "plan-tok",
      }),
    );
    expect(onRestored).toHaveBeenCalledTimes(1);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Guardar configuración" }),
    );
    expect(onSavePreferences).toHaveBeenCalledWith(
      DEFAULT_SNAPSHOT_PREFERENCES,
    );
  });

  it("muestra advertencia clara cuando el repositorio no está autorizado", async () => {
    api.mockResolvedValue({ snapshots: [], totalBytes: 0, count: 0 });
    const onAuthorize = vi.fn();

    render(
      <SnapshotsDialog
        repoId="repo-1"
        repoName="RavenGit"
        trusted={false}
        preferences={DEFAULT_SNAPSHOT_PREFERENCES}
        onSavePreferences={vi.fn().mockResolvedValue(undefined)}
        onAuthorize={onAuthorize}
        onRestored={vi.fn()}
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
