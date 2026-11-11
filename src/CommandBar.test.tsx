// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommandBar from "./CommandBar";
afterEach(cleanup);
it("usa el icono local sin duplicar el nombre accesible de la marca", () => {
  mount();
  const icon = document.querySelector<HTMLImageElement>(".brand-icon")!;
  expect(icon.getAttribute("src")).toBe("/ravengit.svg");
  expect(icon.alt).toBe("");
  expect(icon.width).toBe(32);
  expect(
    screen.getByText("RavenGit", { selector: ".command-brand strong" }),
  ).toBeTruthy();
});
const repository = {
  name: "RavenGit",
  path: "/fixture/RavenGit",
  branch: "main",
  head: "a".repeat(40),
};
function mount(repo: typeof repository | null = repository, locked = false) {
  const handlers = {
    onOpen: vi.fn(),
    onRefresh: vi.fn(),
    onChanges: vi.fn(),
    onFetch: vi.fn(),
    onPush: vi.fn(),
    onPull: vi.fn(),
    onBranches: vi.fn(),
    onSearch: vi.fn(),
    onStash: vi.fn(),
  };
  render(<CommandBar repo={repo} locked={locked} {...handlers} />);
  return handlers;
}
it("routes supported commands through existing review flows", async () => {
  const h = mount();
  expect(Object.values(h).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  for (const [label, callback] of [
    ["Abrir", h.onOpen],
    ["Actualizar", h.onRefresh],
    ["Fetch", h.onFetch],
    ["Push", h.onPush],
    ["Pull", h.onPull],
    ["Rama", h.onBranches],
    ["Buscar", h.onSearch],
    ["Stash", h.onStash],
  ] as const) {
    await userEvent.click(screen.getByRole("button", { name: label }));
    expect(callback).toHaveBeenCalledOnce();
  }
});
it("oculta comandos pendientes y evita duplicar la navegación", () => {
  mount();
  for (const label of [
    "Clonar",
    "Deshacer",
    "Rehacer",
    "Pop",
    "Terminal",
    "Cambios",
  ])
    expect(screen.queryByRole("button", { name: label })).toBeNull();
});
it("allows opening a repository but blocks repository commands without one", async () => {
  const h = mount(null);
  await userEvent.click(screen.getByRole("button", { name: "Push" }));
  expect(h.onPush).not.toHaveBeenCalled();
  expect(screen.getByText("Sin repositorio")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
  expect(h.onOpen).toHaveBeenCalledOnce();
});
it("blocks commands while a Git operation runs", async () => {
  const h = mount(repository, true);
  for (const button of screen.getAllByRole("button")) {
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(button);
  }
  expect(Object.values(h).every((fn) => fn.mock.calls.length === 0)).toBe(true);
});

it("permite cerrar la ayuda con Escape sin perder el foco", async () => {
  mount();
  const button = screen.getByRole("button", { name: "Pull" });
  button.focus();
  await userEvent.hover(button);
  expect(screen.getByRole("tooltip")).toBeTruthy();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(document.activeElement).toBe(button);
});
