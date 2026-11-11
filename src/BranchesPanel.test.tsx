// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import BranchesPanel from "./BranchesPanel";
import type { BranchesState } from "./types";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke);
const state: BranchesState = {
  token: "reviewed-state",
  trusted: true,
  current: "main",
  head: "a".repeat(40),
  branches: [
    { name: "main", hash: "a".repeat(40) },
    { name: "feature/uno", hash: "b".repeat(40) },
  ],
  restriction: null,
};
function mount(onUpdated = vi.fn(async () => true)) {
  const onLock = vi.fn();
  render(
    <BranchesPanel
      active
      repoId="fixture"
      onLock={onLock}
      onUpdated={onUpdated}
    />,
  );
  return { onLock, onUpdated };
}
afterEach(cleanup);
it("retira el resultado anterior al revisar otra operación", async () => {
  mount();
  await userEvent.type(
    await screen.findByLabelText("Nombre de la nueva rama"),
    "feature/nueva",
  );
  await userEvent.click(screen.getByRole("button", { name: "Crear rama" }));
  await screen.findByText("Operación confirmada");
  await userEvent.click(
    screen.getByRole("button", {
      name: "Revisar rebase de main sobre feature/uno",
    }),
  );
  expect(screen.queryByText("Operación confirmada")).toBeNull();
});
it.each([false, true])(
  "consume una confirmación de rebase y no repite ante éxito/error: %s",
  async (fails) => {
    api.mockImplementation(async (command) => {
      if (command === "read_branches") return structuredClone(state);
      if (command === "preview_rebase")
        return {
          token: state.token,
          branch: "main",
          base: "feature/uno",
          headHash: "a".repeat(40),
          baseHash: "b".repeat(40),
          relation: "diverged",
          candidates: 1,
          commits: [],
          truncated: false,
          containsMerges: false,
        };
      if (command === "edit_rebase") {
        if (fails) throw { message: "La revisión cambió" };
        return { message: "Rebase completado", warning: null };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    mount(vi.fn(async () => false));
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Revisar rebase de main sobre feature/uno",
      }),
    );
    const confirm = await screen.findByRole("button", {
      name: "Confirmar rebase de main sobre feature/uno",
    });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Entiendo que el rebase/ }),
    );
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: "Confirmar rebase de main sobre feature/uno",
        }),
      ).toBeNull(),
    );
    expect(api).toHaveBeenCalledWith("edit_rebase", {
      id: "fixture",
      token: state.token,
      edit: null,
    });
    expect(
      api.mock.calls.filter(([command]) => command === "edit_rebase"),
    ).toHaveLength(1);
    if (fails)
      expect((await screen.findByRole("alert")).textContent).toContain(
        "La revisión cambió",
      );
    else
      expect(
        await screen.findByText(/No repitas el rebase para actualizarlo/),
      ).toBeTruthy();
  },
);
it("revisa la rama activa sobre la base sin ejecutar ni refrescar escrituras", async () => {
  api.mockImplementation(async (command) => {
    if (command === "read_branches") return structuredClone(state);
    if (command === "preview_rebase")
      return {
        branch: "main",
        base: "feature/uno",
        headHash: "a".repeat(40),
        baseHash: "b".repeat(40),
        relation: "diverged",
        candidates: 101,
        commits: [{ hash: "c".repeat(40), subject: "Candidato local" }],
        truncated: true,
        containsMerges: true,
      };
    throw new Error(`Unexpected command: ${command}`);
  });
  const { onUpdated, onLock } = mount();
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Revisar rebase de main sobre feature/uno",
    }),
  );
  await screen.findByText("Candidato local", { exact: false });
  expect(api).toHaveBeenCalledWith("preview_rebase", {
    id: "fixture",
    token: state.token,
    base: "feature/uno",
  });
  expect(screen.getByText(/El rango contiene merges/)).toBeTruthy();
  expect(screen.getByText(/Lista limitada a 100/)).toBeTruthy();
  expect(onUpdated).not.toHaveBeenCalled();
  expect(api.mock.calls.some(([command]) => command.startsWith("edit_"))).toBe(
    false,
  );
  await waitFor(() => expect(onLock).toHaveBeenLastCalledWith(false));
  await userEvent.click(
    screen.getByRole("button", { name: "Actualizar ramas" }),
  );
  await waitFor(() =>
    expect(screen.queryByText("Candidato local", { exact: false })).toBeNull(),
  );
});
it("un error de revisión de rebase se informa sin reintentar", async () => {
  api.mockImplementation(async (command) => {
    if (command === "read_branches") return structuredClone(state);
    throw { message: "El repositorio cambió" };
  });
  mount();
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Revisar rebase de main sobre feature/uno",
    }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "El repositorio cambió",
  );
  expect(
    api.mock.calls.filter(([command]) => command === "preview_rebase"),
  ).toHaveLength(1);
});
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (command) => {
    if (command === "read_branches") return structuredClone(state);
    if (command === "edit_branch")
      return { message: "Operación confirmada", warning: null };
    throw new Error(`Unexpected command: ${command}`);
  });
});
it("revisa el origen hacia la rama activa sin ejecutar cambios", async () => {
  api.mockImplementation(async (command) => {
    if (command === "read_branches") return structuredClone(state);
    if (command === "preview_merge")
      return {
        token: state.token,
        source: "feature/uno",
        destination: "main",
        sourceHash: "b".repeat(40),
        destinationHash: "a".repeat(40),
        relation: "diverged",
        incoming: 1,
        local: 2,
        commits: [{ hash: "b".repeat(40), subject: "Cambio entrante" }],
        truncated: false,
        shallow: false,
      };
    throw new Error(`Unexpected command: ${command}`);
  });
  const { onUpdated, onLock } = mount();
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Revisar merge de feature/uno en main",
    }),
  );
  await screen.findByText("Cambio entrante", { exact: false });
  expect(api).toHaveBeenCalledWith("preview_merge", {
    id: "fixture",
    token: state.token,
    source: "feature/uno",
  });
  expect(screen.getByText(/Las ramas han divergido/)).toBeTruthy();
  expect(onUpdated).not.toHaveBeenCalled();
  expect(api.mock.calls.some(([command]) => command === "edit_branch")).toBe(
    false,
  );
  await waitFor(() => expect(onLock).toHaveBeenLastCalledWith(false));
});
it.each([false, true])(
  "confirma un único merge y descarta su revisión tras éxito/error: %s",
  async (fails) => {
    api.mockImplementation(async (command) => {
      if (command === "read_branches") return structuredClone(state);
      if (command === "preview_merge")
        return {
          token: state.token,
          source: "feature/uno",
          destination: "main",
          sourceHash: "b".repeat(40),
          destinationHash: "a".repeat(40),
          relation: "fastForward",
          incoming: 1,
          local: 0,
          commits: [],
          truncated: false,
          shallow: false,
        };
      if (command === "edit_merge") {
        if (fails) throw { message: "La revisión cambió" };
        return { message: "Fast-forward completado.", warning: null };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    mount(vi.fn(async () => false));
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Revisar merge de feature/uno en main",
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Confirmar merge de feature/uno en main",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: "Confirmar merge de feature/uno en main",
        }),
      ).toBeNull(),
    );
    expect(api).toHaveBeenCalledWith("edit_merge", {
      id: "fixture",
      token: state.token,
      edit: {
        kind: "start",
        source: "feature/uno",
        sourceHash: "b".repeat(40),
        destinationHash: "a".repeat(40),
      },
    });
    expect(
      api.mock.calls.filter(([command]) => command === "edit_merge"),
    ).toHaveLength(1);
    if (fails)
      expect((await screen.findByRole("alert")).textContent).toContain(
        "La revisión cambió",
      );
    else
      expect(
        await screen.findByText(/No repitas el merge para refrescarlo/),
      ).toBeTruthy();
  },
);
it("un fallo de revisión no ejecuta ni reintenta una integración", async () => {
  api.mockImplementation(async (command) => {
    if (command === "read_branches") return structuredClone(state);
    throw { message: "El repositorio cambió" };
  });
  mount();
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Revisar merge de feature/uno en main",
    }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "El repositorio cambió",
  );
  expect(
    api.mock.calls.filter(([command]) => command === "preview_merge"),
  ).toHaveLength(1);
});
it("respeta la confianza y no consulta archivos desde la interfaz antes de autorizar", async () => {
  let trusted = false;
  api.mockImplementation(async (command) => {
    if (command === "read_branches")
      return trusted
        ? state
        : { ...state, trusted: false, branches: [], head: null };
    if (command === "authorize_repository") {
      trusted = true;
      return {};
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Autorizar operaciones" }),
  );
  await screen.findByRole("button", { name: "Cambiar a feature/uno" });
  expect(api).toHaveBeenCalledWith("authorize_repository", { id: "fixture" });
  expect(api.mock.calls.some(([command]) => command === "edit_branch")).toBe(
    false,
  );
});
it("crea desde HEAD sin ejecutar un cambio de rama adicional", async () => {
  const { onLock, onUpdated } = mount();
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Cambiar a feature/uno" });
  await user.type(
    screen.getByLabelText("Nombre de la nueva rama"),
    "feature/nueva",
  );
  await user.click(screen.getByRole("button", { name: "Crear rama" }));
  await waitFor(() => expect(onUpdated).toHaveBeenCalledOnce());
  expect(api).toHaveBeenCalledWith("edit_branch", {
    id: "fixture",
    token: state.token,
    edit: { kind: "create", name: "feature/nueva" },
  });
  expect(
    api.mock.calls.filter(([command]) => command === "edit_branch"),
  ).toHaveLength(1);
  await waitFor(() => expect(onLock).toHaveBeenLastCalledWith(false));
});
it("cambia de rama con un solo clic en su acción directa", async () => {
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Cambiar a feature/uno" }),
  );
  await screen.findByText("Operación confirmada");
  expect(api).toHaveBeenCalledWith("edit_branch", {
    id: "fixture",
    token: state.token,
    edit: { kind: "switch", name: "feature/uno" },
  });
  expect(
    api.mock.calls.filter(([command]) => command === "edit_branch"),
  ).toHaveLength(1);
  expect(
    (
      screen.getByRole("button", {
        name: "Rama activa: main",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("abrir Renombrar no cambia la rama y enfoca el nuevo nombre", async () => {
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Renombrar feature/uno" }),
  );
  expect(api.mock.calls.some(([command]) => command === "edit_branch")).toBe(
    false,
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByLabelText("Nuevo nombre de la rama seleccionada"),
    ),
  );
  await user.type(
    screen.getByLabelText("Nuevo nombre de la rama seleccionada"),
    "feature/dos",
  );
  await user.click(screen.getByRole("button", { name: "Renombrar rama" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("edit_branch", {
      id: "fixture",
      token: state.token,
      edit: { kind: "rename", source: "feature/uno", name: "feature/dos" },
    }),
  );
  expect(
    api.mock.calls.filter(([command]) => command === "edit_branch"),
  ).toHaveLength(1);
});
it("bloquea escrituras con cambios pendientes", async () => {
  api.mockResolvedValue({
    ...state,
    restriction: "Guarda tus cambios antes de continuar.",
  });
  mount();
  await screen.findByText("Guarda tus cambios antes de continuar.");
  expect(
    (screen.getByRole("button", { name: "Crear rama" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (
      screen.getByRole("button", {
        name: "Cambiar a feature/uno",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(api.mock.calls.some(([command]) => command === "edit_branch")).toBe(
    false,
  );
});
it("conserva el éxito aunque falle el refresco y no repite la escritura", async () => {
  mount(vi.fn(async () => false));
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Cambiar a feature/uno" });
  await user.type(
    screen.getByLabelText("Nombre de la nueva rama"),
    "feature/nueva",
  );
  await user.click(screen.getByRole("button", { name: "Crear rama" }));
  await screen.findByText(
    /Operación confirmada.*El historial no pudo actualizarse/,
  );
  expect(
    api.mock.calls.filter(([command]) => command === "edit_branch"),
  ).toHaveLength(1);
});
it("muestra estado obsoleto y relee las ramas sin reintentar", async () => {
  api.mockImplementation(async (command) => {
    if (command === "read_branches") return state;
    if (command === "edit_branch")
      throw { message: "El repositorio cambió. Actualiza las ramas." };
    throw new Error(`Unexpected command: ${command}`);
  });
  mount();
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Cambiar a feature/uno" });
  await user.type(
    screen.getByLabelText("Nombre de la nueva rama"),
    "feature/nueva",
  );
  await user.click(screen.getByRole("button", { name: "Crear rama" }));
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(
      api.mock.calls.filter(([command]) => command === "read_branches"),
    ).toHaveLength(2),
  );
  expect(
    api.mock.calls.filter(([command]) => command === "edit_branch"),
  ).toHaveLength(1);
});
