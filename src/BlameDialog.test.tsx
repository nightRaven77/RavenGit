// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import BlameDialog from "./BlameDialog";

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

it("renderiza líneas de Blame, filtra por autor/contenido y salta al commit al pulsar el hash", async () => {
  const h1 = "1".repeat(40);
  const h2 = "2".repeat(40);
  const onJump = vi.fn();
  const onClose = vi.fn();

  api.mockResolvedValueOnce({
    path: "src/core.rs",
    commit: h2,
    lines: [
      {
        lineNumber: 1,
        hash: h1,
        author: "Alice",
        date: "2026-01-10",
        summary: "init core",
        content: "fn alpha() {}",
      },
      {
        lineNumber: 2,
        hash: h2,
        author: "Bob",
        date: "2026-02-12",
        summary: "add beta",
        content: "fn beta() {}",
      },
    ],
  });

  render(
    <BlameDialog
      repoId="repo-1"
      path="src/core.rs"
      onClose={onClose}
      onJumpToCommitHash={onJump}
    />,
  );

  expect(await screen.findByText("fn alpha() {}")).toBeTruthy();
  expect(screen.getByText("Alice")).toBeTruthy();
  expect(screen.getByText("Bob")).toBeTruthy();

  await userEvent.type(
    screen.getByPlaceholderText("Filtrar líneas, autor o commit…"),
    "Bob",
  );
  expect(screen.queryByText("fn alpha() {}")).toBeNull();
  expect(screen.getByText("fn beta() {}")).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: h2.slice(0, 8) }));
  expect(onJump).toHaveBeenCalledWith(h2);
  expect(onClose).toHaveBeenCalled();
});
