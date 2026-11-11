// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import PullPanel from "./PullPanel";
import type { PullOptions, PullPreview } from "./types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke);
const options: PullOptions = {
  token: "options",
  trusted: true,
  branch: "main",
  remote: "equipo",
  remoteBranch: "main",
  url: "https://example.invalid/equipo.git",
  restriction: null,
};
const preview: PullPreview = {
  token: "review",
  remote: "equipo",
  remoteBranch: "main",
  url: options.url!,
  fetchedAt: 1792590000,
  merge: {
    token: "merge",
    source: "refs/remotes/equipo/main",
    destination: "main",
    sourceHash: "b".repeat(40),
    destinationHash: "a".repeat(40),
    relation: "fastForward",
    incoming: 1,
    local: 0,
    commits: [{ hash: "b".repeat(40), subject: "Cambio remoto revisado" }],
    truncated: false,
    shallow: false,
  },
};
function mount(active = true, updated = true) {
  const handlers = {
    onLock: vi.fn(),
    onUpdated: vi.fn(async () => updated),
    onBranches: vi.fn(),
  };
  render(<PullPanel active={active} repoId="fixture" {...handlers} />);
  return handlers;
}
afterEach(cleanup);
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (command) => {
    if (command === "read_pull_options") return structuredClone(options);
    if (command === "preview_pull") return structuredClone(preview);
    if (command === "integrate_pull")
      return { message: "Fast-forward completado.", warning: null };
    throw new Error(`Unexpected command: ${command}`);
  });
});

it("abrir Pull sólo lee configuración y no hace Fetch ni merge", async () => {
  mount();
  await screen.findByText("equipo");
  expect(api.mock.calls.map(([command]) => command)).toEqual([
    "read_pull_options",
  ]);
  expect(
    screen.queryByRole("button", { name: "Confirmar integración con merge" }),
  ).toBeNull();
});
it("la vista inactiva no lee ni contacta al servidor", () => {
  mount(false);
  expect(api).not.toHaveBeenCalled();
});
it("separa la confirmación de Fetch de la integración del hash revisado", async () => {
  const handlers = mount();
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Confirmar Fetch y revisar Pull",
    }),
  );
  await screen.findByText(/Cambio remoto revisado/);
  await waitFor(() => expect(handlers.onLock).toHaveBeenLastCalledWith(false));
  expect(api).toHaveBeenCalledWith("preview_pull", {
    id: "fixture",
    token: options.token,
  });
  expect(api.mock.calls.some(([command]) => command === "integrate_pull")).toBe(
    false,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar integración con merge" }),
  );
  await screen.findByText("Fast-forward completado.");
  expect(api).toHaveBeenCalledWith("integrate_pull", {
    id: "fixture",
    previewToken: preview.token,
  });
  expect(
    api.mock.calls.filter(([command]) => command === "integrate_pull"),
  ).toHaveLength(1);
});
it("sin upstream bloquea Fetch sin elegir origin ni otro remoto", async () => {
  api.mockResolvedValue({
    ...options,
    remote: null,
    remoteBranch: null,
    restriction: "Configura un único upstream",
  });
  mount();
  await screen.findByText("Configura un único upstream");
  expect(
    (
      screen.getByRole("button", {
        name: "Confirmar Fetch y revisar Pull",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(api.mock.calls.map(([command]) => command)).toEqual([
    "read_pull_options",
  ]);
});
it("la autorización persistente no hace Fetch implícito", async () => {
  let trusted = false;
  api.mockImplementation(async (command) => {
    if (command === "read_pull_options") return { ...options, trusted };
    if (command === "authorize_repository") {
      trusted = true;
      return {};
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  mount();
  await screen.findByText(/Git puede ejecutar filtros y hooks configurados/);
  await userEvent.click(
    await screen.findByRole("button", { name: "Autorizar operaciones" }),
  );
  await screen.findByText("equipo");
  expect(api.mock.calls.some(([command]) => command === "preview_pull")).toBe(
    false,
  );
});
it("un Fetch fallido no ofrece integrar una referencia antigua ni se reintenta", async () => {
  api.mockImplementation(async (command) => {
    if (command === "read_pull_options") return options;
    throw { message: "No existe la rama remota" };
  });
  mount();
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Confirmar Fetch y revisar Pull",
    }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "No existe la rama remota",
  );
  expect(
    screen.queryByRole("button", { name: "Confirmar integración con merge" }),
  ).toBeNull();
  expect(
    api.mock.calls.filter(([command]) => command === "preview_pull"),
  ).toHaveLength(1);
});
it.each([false, true])(
  "descarta la revisión después de integrar sin reintentar, error: %s",
  async (fails) => {
    api.mockImplementation(async (command) => {
      if (command === "read_pull_options") return options;
      if (command === "preview_pull") return preview;
      if (command === "integrate_pull") {
        if (fails) throw { message: "El upstream cambió" };
        return { message: "Integración confirmada", warning: null };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    mount(true, false);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Confirmar Fetch y revisar Pull",
      }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Confirmar integración con merge",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar integración con merge" }),
    );
    if (fails)
      expect((await screen.findByRole("alert")).textContent).toContain(
        "El upstream cambió",
      );
    else await screen.findByText(/Integración confirmada.*No repitas/);
    expect(
      screen.queryByRole("button", { name: "Confirmar integración con merge" }),
    ).toBeNull();
    expect(
      api.mock.calls.filter(([command]) => command === "integrate_pull"),
    ).toHaveLength(1);
  },
);
it("actualizar descarta la revisión sin volver a contactar al servidor", async () => {
  const handlers = mount();
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Confirmar Fetch y revisar Pull",
    }),
  );
  await waitFor(() => expect(handlers.onLock).toHaveBeenLastCalledWith(false));
  await userEvent.click(
    screen.getByRole("button", { name: "Actualizar Pull" }),
  );
  expect(
    screen.queryByRole("button", { name: "Confirmar integración con merge" }),
  ).toBeNull();
  expect(
    api.mock.calls.filter(([command]) => command === "preview_pull"),
  ).toHaveLength(1);
  await userEvent.click(
    await screen.findByRole("button", { name: "Gestionar merge en Ramas" }),
  );
  expect(handlers.onBranches).toHaveBeenCalledOnce();
});
