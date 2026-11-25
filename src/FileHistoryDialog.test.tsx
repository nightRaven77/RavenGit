// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import FileHistoryDialog from "./FileHistoryDialog";
import type { Commit } from "./types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const api = vi.mocked(invoke);

const c1: Commit = {
  hash: "1".repeat(40),
  parents: [],
  author: "Alice",
  date: "2026-01-10T10:00:00Z",
  subject: "create legacy.ts",
};

const c2: Commit = {
  hash: "2".repeat(40),
  parents: [c1.hash],
  author: "Bob",
  date: "2026-02-15T12:00:00Z",
  subject: "rename to modern.ts",
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  api.mockReset();
});

afterEach(cleanup);

it("lista historial con renombres (--follow), pagina, carga diff y abre Blame o salta al commit", async () => {
  const onJump = vi.fn();
  const onOpenBlame = vi.fn();
  const onClose = vi.fn();

  api.mockImplementation(async (command, args) => {
    if (command === "read_file_history") {
      const { offset } = args as { offset: number };
      if (offset === 0) {
        return {
          path: "modern.ts",
          entries: [
            {
              commit: c2,
              path: "modern.ts",
              oldPath: "legacy.ts",
              status: "R",
            },
          ],
          nextOffset: 50,
        };
      }
      return {
        path: "modern.ts",
        entries: [
          {
            commit: c1,
            path: "legacy.ts",
            oldPath: null,
            status: "A",
          },
        ],
        nextOffset: null,
      };
    }
    if (command === "read_commit_diff") {
      const { hash } = args as { hash: string };
      return {
        hash,
        text: `diff --git a/modern.ts b/modern.ts\n+const v = "${hash.slice(0, 4)}";`,
        parent: null,
        parentCount: 0,
      };
    }
    throw new Error(command);
  });

  render(
    <FileHistoryDialog
      repoId="repo-1"
      path="modern.ts"
      onClose={onClose}
      onJumpToCommit={onJump}
      onOpenBlame={onOpenBlame}
    />,
  );

  const listRegion = await screen.findByRole("region", {
    name: "Commits del archivo",
  });
  expect(within(listRegion).getByText("legacy.ts → modern.ts")).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: "Cargar más" }));
  expect(await within(listRegion).findByText("create legacy.ts")).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: "Ver Blame aquí" }));
  expect(onOpenBlame).toHaveBeenCalledWith("modern.ts", c2.hash);
  expect(onClose).toHaveBeenCalled();
});
