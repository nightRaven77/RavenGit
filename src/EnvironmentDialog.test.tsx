// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EnvironmentDialog from "./EnvironmentDialog";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

afterEach(cleanup);

it("muestra estado saludable con gix activo, Git CLI y Git LFS", async () => {
  const onRecheck = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  render(
    <EnvironmentDialog
      status={{
        os: "macos",
        gitAvailable: true,
        gitVersion: "git version 2.47.0",
        lfsAvailable: true,
        lfsVersion: "git-lfs/3.5.1",
        gixEnabled: true,
      }}
      checking={false}
      onRecheck={onRecheck}
      onClose={onClose}
    />,
  );

  expect(screen.getByText("Activo")).toBeTruthy();
  expect(screen.getByText("git version 2.47.0")).toBeTruthy();
  expect(screen.getByText("git-lfs/3.5.1")).toBeTruthy();
  expect(
    screen.queryByRole("region", { name: "Guía rápida para instalar Git" }),
  ).toBeNull();

  await userEvent.click(
    screen.getByRole("button", { name: "Volver a comprobar" }),
  );
  expect(onRecheck).toHaveBeenCalledTimes(1);
});

it("muestra guía de instalación winget en Windows cuando falta Git CLI", () => {
  render(
    <EnvironmentDialog
      status={{
        os: "windows",
        gitAvailable: false,
        gitVersion: null,
        lfsAvailable: false,
        lfsVersion: null,
        gixEnabled: true,
      }}
      checking={false}
      onRecheck={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />,
  );

  expect(screen.getByText("Faltante")).toBeTruthy();
  expect(screen.getByText("Instalar Git en Windows")).toBeTruthy();
  expect(
    screen.getByText("winget install --id Git.Git -e --source winget"),
  ).toBeTruthy();
  expect(
    screen.getByText(/https:\/\/git-scm\.com\/download\/win/),
  ).toBeTruthy();
});
