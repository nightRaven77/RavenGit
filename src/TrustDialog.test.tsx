// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import TrustDialog from "./TrustDialog";

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

afterEach(cleanup);

it("muestra nombre y ruta exacta y autoriza el repositorio al confirmar", async () => {
  api.mockResolvedValueOnce({});
  const onAuthorized = vi.fn();
  const onReadOnly = vi.fn();
  const onLock = vi.fn();

  render(
    <TrustDialog
      repoId="repo-42"
      repoName="RavenGit"
      repoPath="/Users/dev/RavenGit"
      onAuthorized={onAuthorized}
      onReadOnly={onReadOnly}
      onLock={onLock}
    />,
  );

  expect(screen.getByText("¿Autorizar operaciones en RavenGit?")).toBeTruthy();
  expect(screen.getByText("/Users/dev/RavenGit")).toBeTruthy();

  await userEvent.click(
    screen.getByRole("button", { name: "Autorizar este repositorio" }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("authorize_repository", { id: "repo-42" }),
  );
  expect(onAuthorized).toHaveBeenCalledTimes(1);
  expect(onReadOnly).not.toHaveBeenCalled();
  expect(onLock).toHaveBeenNthCalledWith(1, true);
  expect(onLock).toHaveBeenLastCalledWith(false);
});

it("permite continuar en solo lectura sin invocar authorize_repository", async () => {
  const onAuthorized = vi.fn();
  const onReadOnly = vi.fn();

  render(
    <TrustDialog
      repoId="repo-42"
      repoName="RavenGit"
      repoPath="/Users/dev/RavenGit"
      onAuthorized={onAuthorized}
      onReadOnly={onReadOnly}
      onLock={vi.fn()}
    />,
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Continuar en solo lectura" }),
  );
  expect(api).not.toHaveBeenCalled();
  expect(onReadOnly).toHaveBeenCalledTimes(1);
  expect(onAuthorized).not.toHaveBeenCalled();
});

it("muestra el error IPC si authorize_repository falla", async () => {
  api.mockRejectedValueOnce({ message: "No se pudo guardar la confianza." });
  const onAuthorized = vi.fn();

  render(
    <TrustDialog
      repoId="repo-42"
      repoName="RavenGit"
      repoPath="/Users/dev/RavenGit"
      onAuthorized={onAuthorized}
      onReadOnly={vi.fn()}
      onLock={vi.fn()}
    />,
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Autorizar este repositorio" }),
  );
  expect(
    await screen.findByText("No se pudo guardar la confianza."),
  ).toBeTruthy();
  expect(onAuthorized).not.toHaveBeenCalled();
});
