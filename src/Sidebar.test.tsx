// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";
import type { GitRef, Snapshot, WorktreeItem } from "./types";

afterEach(cleanup);

const repo: Snapshot = {
  id: "r1",
  path: "/fixture/RavenGit",
  name: "RavenGit",
  trusted: true,
  head: "a".repeat(40),
  branch: "main",
  shallow: false,
  refs: [],
  page: { commits: [], nextOffset: null, generation: "g1" },
};

const branches: GitRef[] = [
  { name: "refs/heads/main", hash: "1".repeat(40), kind: "branch" },
  {
    name: "refs/heads/feature/grafo-visual",
    hash: "2".repeat(40),
    kind: "branch",
  },
  { name: "refs/heads/fix/acentos-ñ", hash: "3".repeat(40), kind: "branch" },
];

const remotes: GitRef[] = [
  { name: "refs/remotes/origin/main", hash: "1".repeat(40), kind: "remote" },
];

const tags: GitRef[] = [
  { name: "refs/tags/v1.0.6", hash: "1".repeat(40), kind: "tag" },
];

const worktrees: WorktreeItem[] = [
  {
    path: "/fixture/RavenGit",
    name: "RavenGit",
    head: "1".repeat(40),
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
    path: "/fixture/RavenGit-docs",
    name: "RavenGit-docs",
    head: "2".repeat(40),
    branch: "docs/guia",
    detached: false,
    bare: false,
    main: false,
    current: false,
    locked: false,
    lockReason: null,
    prunable: false,
    prunableReason: null,
  },
];

function renderSidebar() {
  return render(
    <Sidebar
      repo={repo}
      tabs={[{ snapshot: repo }]}
      view="history"
      lastSyncView="remotes"
      syncing={false}
      commitsCount={12}
      wip={null}
      branches={branches}
      remotes={remotes}
      tags={tags}
      worktrees={worktrees}
      busy={false}
      loadingMore={false}
      writing={false}
      undoBusy={false}
      undoState={null}
      onOpenLibrary={vi.fn()}
      onCreateRepo={vi.fn()}
      onSelectView={vi.fn()}
      onGoSync={vi.fn()}
      onOpenRestore={vi.fn()}
      onOpenTagTarget={vi.fn()}
      onOpenTagPublication={vi.fn()}
      onOpenReplay={vi.fn()}
      onOpenWorktrees={vi.fn()}
      onOpenActivity={vi.fn()}
      onOpenAppearance={vi.fn()}
      onOpenSnapshots={vi.fn()}
      onOpenLfsSubmodules={vi.fn()}
      onOpenUndo={vi.fn()}
      onOpenEnvironment={vi.fn()}
      onOpenShortcuts={vi.fn()}
      onOpenQuickGuide={vi.fn()}
      onJumpToHash={vi.fn()}
      onOpenRefContextMenu={vi.fn()}
      onOpenRepositoryPath={vi.fn()}
      onOpenWorktreeContextMenu={vi.fn()}
    />,
  );
}

it("filtra ramas, tags y worktrees en la barra lateral y permite limpiar", async () => {
  renderSidebar();

  const filter = screen.getByRole("textbox", {
    name: "Filtrar ramas y referencias",
  });
  await userEvent.type(filter, "docs");

  expect(screen.queryByRole("button", { name: /^main/i })).toBeNull();
  expect(screen.getByRole("button", { name: /RavenGit-docs/ })).toBeTruthy();

  await userEvent.clear(filter);
  await userEvent.type(filter, "acentos-n");
  expect(screen.getByRole("button", { name: /acentos-ñ/ })).toBeTruthy();

  await userEvent.clear(filter);
  await userEvent.type(filter, "inexistente-xyz");
  expect(
    screen.getAllByText("Sin coincidencias").length,
  ).toBeGreaterThanOrEqual(1);

  await userEvent.click(
    screen.getByRole("button", { name: "Limpiar filtro lateral" }),
  );
  expect((filter as HTMLInputElement).value).toBe("");
  expect(screen.getByRole("button", { name: /^main/i })).toBeTruthy();
  expect(
    screen.getByText("Herramientas", { selector: "summary" }),
  ).toBeTruthy();
});
