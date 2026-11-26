// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import PullRequestsDialog from "./PullRequestsDialog";
import type { ForgeInfo, PullRequestsOutcome } from "./types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const api = vi.mocked(invoke);

const baseInfo: ForgeInfo = {
  trusted: true,
  provider: "github",
  remoteName: "origin",
  host: "github.com",
  repoSlug: "nightRaven77/RavenGit",
  webUrl: "https://github.com/nightRaven77/RavenGit",
  cliName: "gh",
  cliAvailable: true,
  currentBranch: "feat/ui",
  createPrUrl:
    "https://github.com/nightRaven77/RavenGit/compare/feat/ui?expand=1",
};

const outcomeFixture: PullRequestsOutcome = {
  provider: "github",
  repoSlug: "nightRaven77/RavenGit",
  fetchedAt: 1_795_650_000,
  items: [
    {
      number: 42,
      title: "feat: pulir modo simple",
      state: "open",
      headBranch: "feat/ui",
      baseBranch: "main",
      author: "erick",
      url: "https://github.com/nightRaven77/RavenGit/pull/42",
      updatedAt: "2026-11-25T18:00:00Z",
    },
  ],
};

beforeEach(() => {
  api.mockReset();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

afterEach(cleanup);

it("al abrir sólo lee metadatos locales y nunca consulta remotos sin clic explícito", async () => {
  api.mockImplementation(async (command) => {
    if (command === "read_forge_info") return baseInfo;
    if (command === "fetch_pull_requests") return outcomeFixture;
    if (command === "open_forge_url")
      return "https://github.com/nightRaven77/RavenGit/pull/42";
    return null;
  });

  const onLoaded = vi.fn();
  render(
    <PullRequestsDialog
      repoId="repo-1"
      repoName="RavenGit"
      branches={["refs/heads/main", "refs/heads/feat/ui"]}
      onLoaded={onLoaded}
      onAuthorize={vi.fn()}
      onJumpToBranch={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  expect(await screen.findByText(/nightRaven77\/RavenGit/)).toBeTruthy();
  expect(api).toHaveBeenCalledWith("read_forge_info", { id: "repo-1" });
  expect(
    api.mock.calls.some(([command]) => command === "fetch_pull_requests"),
  ).toBe(false);

  await userEvent.click(
    screen.getByRole("button", { name: "Consultar PRs / MRs" }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("fetch_pull_requests", { id: "repo-1" }),
  );
  expect(await screen.findByText("feat: pulir modo simple")).toBeTruthy();
  expect(onLoaded).toHaveBeenCalledWith(outcomeFixture);

  await userEvent.click(
    screen.getByRole("button", { name: "Abrir en navegador" }),
  );
  expect(api).toHaveBeenCalledWith("open_forge_url", {
    id: "repo-1",
    url: "https://github.com/nightRaven77/RavenGit/pull/42",
  });
});

it("bloquea consultas de PRs cuando el repositorio no está autorizado", async () => {
  const onAuthorize = vi.fn();
  api.mockImplementation(async (command) => {
    if (command === "read_forge_info") {
      return { ...baseInfo, trusted: false };
    }
    return null;
  });

  render(
    <PullRequestsDialog
      repoId="repo-2"
      repoName="NoAuth"
      branches={[]}
      onLoaded={vi.fn()}
      onAuthorize={onAuthorize}
      onJumpToBranch={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  const authBtn = await screen.findByRole("button", {
    name: "Autorizar repositorio…",
  });
  const fetchBtn = screen.getByRole("button", {
    name: "Consultar PRs / MRs",
  }) as HTMLButtonElement;
  expect(fetchBtn.disabled).toBe(true);

  await userEvent.click(authBtn);
  expect(onAuthorize).toHaveBeenCalledTimes(1);
});
