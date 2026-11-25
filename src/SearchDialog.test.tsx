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
import SearchDialog from "./SearchDialog";
import type { Commit } from "./types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const api = vi.mocked(invoke);

const commitA: Commit = {
  hash: "a".repeat(40),
  parents: [],
  author: "Alice",
  date: "2026-02-10T10:00:00Z",
  subject: "feat: primera búsqueda",
};

const commitB: Commit = {
  hash: "b".repeat(40),
  parents: [commitA.hash],
  author: "Bob",
  date: "2026-03-01T14:30:00Z",
  subject: "fix: ajustar pickaxe",
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

it("busca en historial con filtros combinados, pagina con Cargar más y salta al commit", async () => {
  const onJump = vi.fn();
  const onClose = vi.fn();

  api.mockImplementation(async (command, args) => {
    if (command === "search_history") {
      const { query } = args as { query: { offset: number } };
      if (query.offset === 0) {
        return {
          commits: [commitA],
          nextOffset: 50,
          truncated: true,
        };
      }
      return {
        commits: [commitB],
        nextOffset: null,
        truncated: false,
      };
    }
    if (command === "read_search_match_diff") {
      const { hash } = args as { hash: string };
      return {
        hash,
        text: `diff --git a/app.ts b/app.ts\n--- a/app.ts\n+++ b/app.ts\n@@ -1 +1 @@\n-old\n+new_${hash.slice(0, 4)}`,
      };
    }
    throw new Error(command);
  });

  render(
    <SearchDialog
      repoId="repo-1"
      repoName="RavenGit"
      currentScope="all"
      branches={["refs/heads/main", "refs/heads/feat/search"]}
      onClose={onClose}
      onJumpToCommit={onJump}
    />,
  );

  await userEvent.type(screen.getByLabelText("Mensaje"), "búsqueda");
  await userEvent.type(screen.getByLabelText("Autor"), "Alice");
  await userEvent.click(
    screen.getByLabelText("Usar expresión regular (regex)"),
  );
  await userEvent.click(screen.getByRole("button", { name: "Buscar" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("search_history", {
      id: "repo-1",
      query: expect.objectContaining({
        message: "búsqueda",
        author: "Alice",
        regex: true,
        offset: 0,
      }),
    }),
  );

  const resultsRegion = screen.getByRole("region", {
    name: "Resultados de búsqueda",
  });
  expect(
    within(resultsRegion).getByText("feat: primera búsqueda"),
  ).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: "Cargar más" }));
  expect(
    await within(resultsRegion).findByText("fix: ajustar pickaxe"),
  ).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: "Ir al commit" }));
  expect(onJump).toHaveBeenCalledWith(commitA);
  expect(onClose).toHaveBeenCalled();
});

it("cambia al modo Código (-S / -G) y carga el fragmento coincidente", async () => {
  api.mockImplementation(async (command) => {
    if (command === "search_history") {
      return {
        commits: [commitB],
        nextOffset: null,
        truncated: false,
      };
    }
    if (command === "read_search_match_diff") {
      return {
        hash: commitB.hash,
        text: "diff --git a/core.rs b/core.rs\n--- a/core.rs\n+++ b/core.rs\n@@ -1 +1 @@\n+let target_symbol = 1;",
      };
    }
    throw new Error(command);
  });

  render(
    <SearchDialog
      repoId="repo-1"
      repoName="RavenGit"
      currentScope="HEAD"
      branches={["refs/heads/main"]}
      onClose={vi.fn()}
      onJumpToCommit={vi.fn()}
    />,
  );

  await userEvent.click(
    screen.getByRole("tab", { name: /Código \(-S \/ -G\)/ }),
  );
  await userEvent.type(
    screen.getByLabelText("Texto o patrón en código"),
    "target_symbol",
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Modo de código"),
    "regex",
  );
  await userEvent.click(screen.getByRole("button", { name: "Buscar" }));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("search_history", {
      id: "repo-1",
      query: expect.objectContaining({
        codeQuery: "target_symbol",
        codeMode: "regex",
      }),
    }),
  );

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("read_search_match_diff", {
      id: "repo-1",
      hash: commitB.hash,
      path: null,
      codeQuery: "target_symbol",
      codeMode: "regex",
    }),
  );
  expect(await screen.findByText(/target_symbol/)).toBeTruthy();
});
