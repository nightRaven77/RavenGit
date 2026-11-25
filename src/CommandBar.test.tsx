// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommandBar from "./CommandBar";
afterEach(cleanup);
it("usa el icono local sin duplicar el nombre accesible de la marca", () => {
  mount();
  const icon = document.querySelector<HTMLImageElement>(".brand-icon")!;
  expect(icon.getAttribute("src")).toBe("/ravengit.svg");
  expect(icon.alt).toBe("");
  expect(icon.width).toBe(20);
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

it("muestra la pestaña activa, utilidades del encabezado y el slot externo", async () => {
  const onLibrary = vi.fn();
  const onAppearance = vi.fn();
  render(
    <CommandBar
      repo={repository}
      locked={false}
      onOpen={vi.fn()}
      onRefresh={vi.fn()}
      onChanges={vi.fn()}
      onFetch={vi.fn()}
      onPush={vi.fn()}
      onPull={vi.fn()}
      onBranches={vi.fn()}
      onSearch={vi.fn()}
      onStash={vi.fn()}
      onLibrary={onLibrary}
      onAppearance={onAppearance}
      themeSwatches={["#101620", "#52b7ff", "#ff667d"]}
      externalSlot={<span>Acciones externas</span>}
    />,
  );

  const tab = screen.getByRole("tab", { name: "RavenGit" });
  expect(tab.classList.contains("active")).toBe(true);
  expect(screen.getByText("Acciones externas")).toBeTruthy();

  await userEvent.click(
    screen.getByRole("button", { name: "Biblioteca de repositorios" }),
  );
  expect(onLibrary).toHaveBeenCalledOnce();

  await userEvent.click(screen.getByRole("button", { name: "Apariencia" }));
  expect(onAppearance).toHaveBeenCalledOnce();
});

it("gestiona múltiples pestañas: selección, cierre por botón/clic medio, reorden y bloqueo", async () => {
  const onSelectTab = vi.fn();
  const onCloseTab = vi.fn();
  const onReorderTabs = vi.fn();
  const tabs = [
    {
      id: "1",
      name: "repo-uno",
      path: "/fixture/repo-uno",
      branch: "main",
      dirtyCount: 2,
    },
    {
      id: "2",
      name: "repo-dos",
      path: "/fixture/repo-dos",
      branch: "feat/ui",
    },
  ];
  const { rerender } = render(
    <CommandBar
      repo={{
        name: "repo-uno",
        path: "/fixture/repo-uno",
        branch: "main",
        head: "a".repeat(40),
      }}
      tabs={tabs}
      activeTabId="1"
      onSelectTab={onSelectTab}
      onCloseTab={onCloseTab}
      onReorderTabs={onReorderTabs}
      locked={false}
      onOpen={vi.fn()}
      onRefresh={vi.fn()}
      onChanges={vi.fn()}
      onFetch={vi.fn()}
      onPush={vi.fn()}
      onPull={vi.fn()}
      onBranches={vi.fn()}
      onSearch={vi.fn()}
      onStash={vi.fn()}
    />,
  );

  const tabOne = screen.getByRole("tab", { name: /repo-uno/ });
  const tabTwo = screen.getByRole("tab", { name: /repo-dos/ });
  expect(tabOne.getAttribute("aria-selected")).toBe("true");
  expect(tabTwo.getAttribute("aria-selected")).toBe("false");
  expect(screen.getByLabelText("2 cambios").textContent).toBe("2");

  await userEvent.click(tabTwo);
  expect(onSelectTab).toHaveBeenCalledWith("2");

  await userEvent.click(
    screen.getByRole("button", { name: "Cerrar repo-dos" }),
  );
  expect(onCloseTab).toHaveBeenCalledWith("2");

  fireEvent.mouseUp(tabTwo, { button: 1 });
  fireEvent(tabTwo, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
  expect(onCloseTab).toHaveBeenCalledTimes(2);

  const dataTransfer = {
    data: "",
    effectAllowed: "move",
    setData(_type: string, val: string) {
      this.data = val;
    },
    getData() {
      return this.data;
    },
  };
  fireEvent.dragStart(tabOne, { dataTransfer });
  const wrapTwo = tabTwo.closest(".repo-tab-wrap")!;
  fireEvent.dragOver(wrapTwo, { dataTransfer });
  fireEvent.drop(wrapTwo, { dataTransfer });
  expect(onReorderTabs).toHaveBeenCalledWith("1", "2");

  rerender(
    <CommandBar
      repo={{
        name: "repo-uno",
        path: "/fixture/repo-uno",
        branch: "main",
        head: "a".repeat(40),
      }}
      tabs={tabs}
      activeTabId="1"
      onSelectTab={onSelectTab}
      onCloseTab={onCloseTab}
      onReorderTabs={onReorderTabs}
      locked={true}
      onOpen={vi.fn()}
      onRefresh={vi.fn()}
      onChanges={vi.fn()}
      onFetch={vi.fn()}
      onPush={vi.fn()}
      onPull={vi.fn()}
      onBranches={vi.fn()}
      onSearch={vi.fn()}
      onStash={vi.fn()}
    />,
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Cerrar repo-uno",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
