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
import CompareDialog from "./CompareDialog";
import type { Commit } from "./types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const api = vi.mocked(invoke);

const baseCommit: Commit = {
  hash: "1".repeat(40),
  parents: [],
  author: "Alice",
  date: "2026-01-10T10:00:00Z",
  subject: "Commit base",
};

const targetCommit: Commit = {
  hash: "2".repeat(40),
  parents: [baseCommit.hash],
  author: "Bob",
  date: "2026-02-15T10:00:00Z",
  subject: "Commit destino",
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

it("lista archivos del rango, filtra diff por archivo e invierte dirección", async () => {
  const onSwap = vi.fn();

  api.mockImplementation(async (command, args) => {
    if (command === "read_range_files") {
      return {
        base: baseCommit.hash,
        target: targetCommit.hash,
        files: [
          {
            path: "a.ts",
            oldPath: null,
            status: "M",
            additions: 2,
            deletions: 1,
            binary: false,
          },
        ],
      };
    }
    if (command === "read_range_diff") {
      const { path, ignoreWhitespace } = args as {
        path: string | null;
        ignoreWhitespace: boolean;
      };
      return {
        base: baseCommit.hash,
        target: targetCommit.hash,
        text: `diff --git a/a.ts b/a.ts\n+range(${path ?? "ALL"},ws=${String(ignoreWhitespace)})`,
      };
    }
    throw new Error(command);
  });

  render(
    <CompareDialog
      repoId="repo-1"
      base={baseCommit}
      target={targetCommit}
      onClose={vi.fn()}
      onSwap={onSwap}
    />,
  );

  const filesRegion = await screen.findByRole("region", {
    name: "Archivos modificados en el rango",
  });
  const fileBtn = await within(filesRegion).findByRole("button", {
    name: /a\.ts/,
  });
  await userEvent.click(fileBtn);

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("read_range_diff", {
      id: "repo-1",
      base: baseCommit.hash,
      target: targetCommit.hash,
      path: "a.ts",
      oldPath: null,
      ignoreWhitespace: false,
      contextLines: 3,
    }),
  );

  await userEvent.click(screen.getByRole("button", { name: "Invertir A ↔ B" }));
  expect(onSwap).toHaveBeenCalledTimes(1);
});
