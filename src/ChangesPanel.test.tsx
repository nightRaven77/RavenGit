// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import ChangesPanel from "./ChangesPanel";
import type { ChangesState, FileDiff } from "./types";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke);
const entry = {
  path: "archivo ü.txt",
  indexStatus: " ",
  worktreeStatus: "M",
  untracked: false,
  conflict: false,
  submodule: false,
};
const base: ChangesState = {
  token: "state-before",
  entries: [entry],
  head: "a".repeat(40),
  branch: "main",
  author: "RavenGit Fixture <fixture@example.invalid>",
  operation: null,
  trusted: true,
};
const staged: ChangesState = {
  ...base,
  token: "state-staged",
  entries: [{ ...entry, indexStatus: "M", worktreeStatus: " " }],
};
const preview: FileDiff = {
  previewToken: "preview-before",
  token: base.token,
  path: entry.path,
  area: "unstaged",
  text: "@@ -1 +1 @@\n-anterior\n+nuevo\n",
  hunks: [
    {
      index: 0,
      header: "@@ -1 +1 @@",
      text: "@@ -1 +1 @@\n-anterior\n+nuevo\n",
    },
  ],
  partialAllowed: true,
  partialReason: null,
};
function mount() {
  const onCommitted = vi.fn(async () => true);
  render(
    <ChangesPanel
      active
      repoId="repo-1"
      onLock={vi.fn()}
      onCommitted={onCommitted}
    />,
  );
  return { onCommitted };
}
it("dirige la recuperación de rebase a Ramas sin habilitar staging", async () => {
  api.mockImplementation(async (command) => {
    if (command === "read_changes")
      return { ...base, operation: "rebase-merge" };
    if (command === "read_file_diff") return preview;
    throw new Error(`Unexpected command: ${command}`);
  });
  const onBranches = vi.fn();
  render(
    <ChangesPanel
      active
      repoId="fixture"
      onLock={vi.fn()}
      onCommitted={vi.fn(async () => true)}
      onBranches={onBranches}
    />,
  );
  await screen.findByText(/aborto del rebase desde Ramas/);
  await userEvent.click(screen.getByRole("button", { name: "Ir a Ramas" }));
  expect(onBranches).toHaveBeenCalledOnce();
  expect(
    (
      screen.getByRole("button", {
        name: "Preparar todos",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    api.mock.calls.every(([command]) =>
      ["read_changes", "read_file_diff"].includes(command),
    ),
  ).toBe(true);
});
it("relee cambios tras recuperación externa sin perder el borrador del commit", async () => {
  const props = {
    repoId: "repo-1",
    onLock: vi.fn(),
    onCommitted: vi.fn(async () => true),
  };
  const view = render(<ChangesPanel active refreshKey={0} {...props} />);
  await screen.findByLabelText("Resumen del commit");
  await userEvent.type(
    screen.getByLabelText("Resumen del commit"),
    "Borrador conservado",
  );
  const calls = api.mock.calls.filter(
    ([command]) => command === "read_changes",
  ).length;
  view.rerender(<ChangesPanel active refreshKey={1} {...props} />);
  await waitFor(() =>
    expect(
      api.mock.calls.filter(([command]) => command === "read_changes"),
    ).toHaveLength(calls + 1),
  );
  expect(
    (screen.getByLabelText("Resumen del commit") as HTMLInputElement).value,
  ).toBe("Borrador conservado");
});

it("permite consultar conflictos manteniendo bloqueada la preparación", async () => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.open = false;
    },
  });
  api.mockImplementation(async (command) => {
    if (command === "read_changes")
      return {
        ...base,
        entries: [
          { ...entry, indexStatus: "U", worktreeStatus: "U", conflict: true },
        ],
      };
    if (command === "read_conflict") return { path: entry.path, versions: [] };
    return preview;
  });
  const user = userEvent.setup();
  mount();
  await user.click(
    await screen.findByRole("button", { name: "Consultar conflicto…" }),
  );
  expect(
    await screen.findByRole("dialog", { name: "Consultar conflicto" }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Preparar archivo" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(api.mock.calls.some(([command]) => command === "change_file")).toBe(
    false,
  );
});

it("abre amend desde Cambios y refresca tras reemplazar el último commit", async () => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.open = false;
    },
  });
  api.mockImplementation(async (command) => {
    if (command === "read_changes") return base;
    if (command === "read_file_diff") return preview;
    if (command === "preview_amend")
      return {
        token: "amend-plan",
        head: base.head,
        branch: "main",
        author: base.author,
        committer: base.author,
        originalMessage: "Anterior",
        message: "Anterior",
        originalPatch: "",
        stagedPatch: "",
        publishedRefs: [],
      };
    if (command === "confirm_amend")
      return {
        result: {
          commitHash: "b".repeat(40),
          changes: { ...base, entries: [], token: "after-amend" },
          warning: null,
        },
        backup: "refs/ravengit/amend/test",
      };
    throw new Error(`Unexpected command: ${command}`);
  });
  const { onCommitted } = mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Reemplazar último commit…" }),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByLabelText(
          "Mensaje del commit reemplazado",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Anterior"),
  );
  await userEvent.click(screen.getByRole("button", { name: "Revisar amend" }));
  await screen.findByRole("button", { name: "Confirmar amend" });
  await userEvent.click(
    within(screen.getByRole("dialog")).getByRole("checkbox", {
      name: /Entiendo que reemplazaré este commit/,
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar amend" }),
  );
  await waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText(/Último commit reemplazado:/)).toBeTruthy();
  expect(api.mock.calls.some(([command]) => command === "create_commit")).toBe(
    false,
  );
});

it("amend queda deshabilitado antes del primer commit", async () => {
  api.mockResolvedValue({ ...base, head: null, entries: [] });
  mount();
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Reemplazar último commit…",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true),
  );
  expect(api.mock.calls.some(([command]) => command === "preview_amend")).toBe(
    false,
  );
});
afterEach(cleanup);
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (command) => {
    if (command === "read_changes") return base;
    if (command === "read_file_diff") return preview;
    throw new Error(`Unexpected command: ${command}`);
  });
});

it("al ocultar Cambios no lee diffs y al volver espera al estado recién leído", async () => {
  const props = {
    repoId: "repo-1",
    onLock: vi.fn(),
    onCommitted: vi.fn(async () => true),
  };
  const view = render(<ChangesPanel active {...props} />);
  await screen.findByRole("button", { name: "Preparar bloque" });
  const before = api.mock.calls.filter(
    ([command]) => command === "read_file_diff",
  ).length;
  view.rerender(<ChangesPanel active={false} {...props} />);
  expect(
    api.mock.calls.filter(([command]) => command === "read_file_diff"),
  ).toHaveLength(before);
  let resolveState!: (value: ChangesState) => void;
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) =>
    command === "read_changes"
      ? new Promise((resolve) => {
          resolveState = resolve;
        })
      : fallback(command, args),
  );
  view.rerender(<ChangesPanel active {...props} />);
  expect(
    api.mock.calls.filter(([command]) => command === "read_file_diff"),
  ).toHaveLength(before);
  resolveState({ ...base, token: "fresh-visible" });
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("read_file_diff", {
      id: "repo-1",
      token: "fresh-visible",
      path: entry.path,
      area: "unstaged",
    }),
  );
  expect(
    api.mock.calls.filter(([command]) => command === "read_file_diff"),
  ).toHaveLength(before + 1);
});
describe("Cambios y commits", () => {
  it("alternar a dividido no escribe y preparar conserva la identidad del bloque", async () => {
    api.mockImplementation(async (command) => {
      if (command === "read_changes") return base;
      if (command === "read_file_diff") return preview;
      if (command === "change_file")
        return { changes: staged, commitHash: null, warning: null };
      throw new Error(`Unexpected command: ${command}`);
    });
    mount();
    await userEvent.click(
      await screen.findByRole("button", { name: "Dividido" }),
    );
    expect(screen.getByLabelText("Antes, línea 1")).toBeTruthy();
    expect(screen.getByLabelText("Después, línea 1")).toBeTruthy();
    expect(api.mock.calls.some(([command]) => command === "change_file")).toBe(
      false,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Preparar bloque" }),
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("change_file", {
        id: "repo-1",
        token: base.token,
        path: entry.path,
        area: "unstaged",
        hunkIndex: 0,
        previewToken: "preview-before",
      }),
    );
    expect(
      api.mock.calls.filter(([command]) => command === "change_file"),
    ).toHaveLength(1);
  });
  it("permite revocar la autorización y vuelve a ocultar los archivos", async () => {
    api.mockImplementation(async (command) => {
      if (command === "read_changes") return base;
      if (command === "read_file_diff") return preview;
      if (command === "revoke_repository_authorization")
        return { ...base, trusted: false, entries: [] };
      throw new Error(`Unexpected command: ${command}`);
    });
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByText(
        "Repositorio autorizado · Gestionar autorización",
      ),
    );
    await user.click(
      await screen.findByRole("button", { name: "Revocar autorización" }),
    );
    await screen.findByRole("button", {
      name: "Habilitar operaciones locales",
    });
    expect(api).toHaveBeenCalledWith("revoke_repository_authorization", {
      id: "repo-1",
    });
    expect(
      screen.queryByRole("button", { name: "Preparar bloque" }),
    ).toBeNull();
    expect(screen.queryByText("Árbol de trabajo limpio.")).toBeNull();
  });
  it("requiere habilitar operaciones antes de preparar un bloque", async () => {
    api.mockImplementation(async (command) => {
      if (command === "read_changes") return { ...base, trusted: false };
      if (command === "read_file_diff") return preview;
      if (command === "authorize_repository") return base;
      if (command === "change_file")
        return { changes: staged, commitHash: null, warning: null };
      throw new Error("Unexpected");
    });
    const user = userEvent.setup();
    mount();
    await screen.findByRole("button", {
      name: "Habilitar operaciones locales",
    });
    expect(
      screen.queryByRole("button", { name: "Preparar bloque" }),
    ).toBeNull();
    expect(screen.queryByText("Árbol de trabajo limpio.")).toBeNull();
    expect(api.mock.calls.some(([c]) => c === "read_file_diff")).toBe(false);
    expect(api.mock.calls.some(([c]) => c === "change_file")).toBe(false);
    await user.click(
      screen.getByRole("button", { name: "Habilitar operaciones locales" }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Preparar bloque" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Preparar bloque" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("change_file", {
        id: "repo-1",
        token: base.token,
        path: entry.path,
        area: "unstaged",
        hunkIndex: 0,
        previewToken: "preview-before",
      }),
    );
    expect(await screen.findByRole("status")).toBeTruthy();
  });
  it("prepara archivo completo sin enviar parches arbitrarios", async () => {
    api.mockImplementation(async (command) =>
      command === "read_changes"
        ? base
        : command === "read_file_diff"
          ? preview
          : { changes: staged, commitHash: null, warning: null },
    );
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Preparar archivo" }),
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("change_file", {
        id: "repo-1",
        token: base.token,
        path: entry.path,
        area: "unstaged",
        hunkIndex: null,
        previewToken: null,
      }),
    );
  });
  it("prepara los archivos seleccionados en una sola escritura revisada", async () => {
    const second = {
      ...entry,
      path: "nuevo archivo.ts",
      untracked: true,
      worktreeStatus: "?",
    };
    const multiple = { ...base, entries: [entry, second] };
    const after = {
      ...multiple,
      token: "state-after-multiple",
      entries: [
        { ...entry, indexStatus: "M", worktreeStatus: " " },
        { ...second, indexStatus: "A", worktreeStatus: " ", untracked: false },
      ],
    };
    api.mockImplementation(async (command) => {
      if (command === "read_changes") return multiple;
      if (command === "read_file_diff") return preview;
      if (command === "change_files")
        return { changes: after, commitHash: null, warning: null };
      throw new Error(`Unexpected command: ${command}`);
    });
    const user = userEvent.setup();
    mount();
    const first = await screen.findByRole("checkbox", {
      name: `Seleccionar ${entry.path}`,
    });
    first.focus();
    await user.keyboard(" ");
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Seleccionar todos los cambios sin preparar",
        }) as HTMLInputElement
      ).indeterminate,
    ).toBe(true);
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", { name: `Seleccionar ${second.path}` }),
    );
    await user.keyboard(" ");
    expect(screen.getByText("2 seleccionados")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Preparar seleccionados" }),
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("change_files", {
        id: "repo-1",
        token: base.token,
        paths: [entry.path, second.path],
      }),
    );
    expect(
      api.mock.calls.filter(([command]) => command === "change_files"),
    ).toHaveLength(1);
    expect(api.mock.calls.some(([command]) => command === "change_file")).toBe(
      false,
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "2 archivos preparados",
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("status")),
    );
    expect(
      screen.queryByRole("button", { name: "Preparar seleccionados" }),
    ).toBeNull();
  });
  it("no roba foco si el usuario sale del control durante la preparación", async () => {
    let finish!: (value: unknown) => void;
    api.mockImplementation(async (command) => {
      if (command === "read_changes") return base;
      if (command === "read_file_diff") return preview;
      if (command === "change_files")
        return new Promise((resolve) => {
          finish = resolve;
        });
      throw new Error(`Unexpected command: ${command}`);
    });
    render(
      <>
        <button>Ayuda externa</button>
        <ChangesPanel
          active
          repoId="fixture"
          onLock={vi.fn()}
          onCommitted={vi.fn(async () => true)}
        />
      </>,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Preparar todos" }),
    );
    const other = screen.getByRole("button", { name: "Ayuda externa" });
    await userEvent.click(other);
    finish({ changes: staged, commitHash: null, warning: null });
    await screen.findByRole("status");
    expect(document.activeElement).toBe(other);
  });
  it("prepara todos los archivos elegibles y excluye submódulos", async () => {
    const second = {
      ...entry,
      path: "eliminado.md",
      worktreeStatus: "D",
    };
    const submodule = {
      ...entry,
      path: "dependencia",
      submodule: true,
    };
    const multiple = { ...base, entries: [entry, second, submodule] };
    api.mockImplementation(async (command) => {
      if (command === "read_changes") return multiple;
      if (command === "read_file_diff") return preview;
      if (command === "change_files")
        return {
          changes: { ...multiple, token: "after-all", entries: [submodule] },
          commitHash: null,
          warning: null,
        };
      throw new Error(`Unexpected command: ${command}`);
    });
    const user = userEvent.setup();
    mount();
    const unsupported = await screen.findByRole("checkbox", {
      name: `Seleccionar ${submodule.path}`,
    });
    expect((unsupported as HTMLInputElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Preparar todos" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("change_files", {
        id: "repo-1",
        token: base.token,
        paths: [entry.path, second.path],
      }),
    );
  });
  it("conserva la selección elegible si la escritura múltiple queda obsoleta", async () => {
    const second = { ...entry, path: "otro.txt" };
    const multiple = { ...base, entries: [entry, second] };
    api.mockImplementation(async (command) => {
      if (command === "read_changes") return multiple;
      if (command === "read_file_diff") return preview;
      if (command === "change_files")
        throw {
          code: "STALE_CHANGES",
          message: "El repositorio cambió. Actualiza.",
        };
      throw new Error(`Unexpected command: ${command}`);
    });
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("checkbox", {
        name: "Seleccionar todos los cambios sin preparar",
      }),
    );
    expect(screen.getByText("2 seleccionados")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Preparar seleccionados" }),
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("alert")),
    );
    expect(screen.getByText("2 seleccionados")).toBeTruthy();
    expect(
      api.mock.calls.filter(([command]) => command === "change_files"),
    ).toHaveLength(1);
  });
  it("conserva el mensaje cuando Git rechaza el commit", async () => {
    api.mockImplementation(async (command) => {
      if (command === "read_changes") return staged;
      if (command === "read_file_diff") return { ...preview, area: "staged" };
      if (command === "create_commit")
        throw { code: "WRITE_FAILED", message: "Un hook rechazó el commit." };
      throw new Error("Unexpected");
    });
    const user = userEvent.setup();
    mount();
    const summary = screen.getByLabelText("Resumen del commit");
    await user.type(summary, "Conservar este mensaje");
    await user.type(screen.getByLabelText(/Descripción/), "Motivo del cambio");
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Crear commit" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Crear commit" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((summary as HTMLInputElement).value).toBe("Conservar este mensaje");
    expect(
      (screen.getByLabelText(/Descripción/) as HTMLTextAreaElement).value,
    ).toBe("Motivo del cambio");
  });
  it("sólo limpia el borrador tras recibir el hash de éxito", async () => {
    let resolveCommit: (value: unknown) => void = () => {};
    api.mockImplementation(async (command) => {
      if (command === "read_changes") return staged;
      if (command === "read_file_diff") return { ...preview, area: "staged" };
      if (command === "create_commit")
        return new Promise((resolve) => {
          resolveCommit = resolve;
        });
      throw new Error("Unexpected");
    });
    const user = userEvent.setup();
    const { onCommitted } = mount();
    const summary = screen.getByLabelText("Resumen del commit");
    await user.type(summary, "Guardar cambios");
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Crear commit" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Crear commit" }));
    expect((summary as HTMLInputElement).value).toBe("Guardar cambios");
    expect(
      screen
        .getByRole("button", { name: "Procesando…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    resolveCommit({
      commitHash: "b".repeat(40),
      changes: { ...base, token: "after", entries: [] },
      warning: null,
    });
    await waitFor(() => expect((summary as HTMLInputElement).value).toBe(""));
    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect((await screen.findByRole("status")).textContent).toContain(
      "bbbbbbbb",
    );
  });
  it("no permite crear commit sin autor o durante conflictos", async () => {
    api.mockImplementation(async (command) =>
      command === "read_changes"
        ? { ...staged, author: null, operation: "MERGE_HEAD" }
        : preview,
    );
    const user = userEvent.setup();
    mount();
    await screen.findByText(/Falta configurar/);
    await user.type(screen.getByLabelText("Resumen del commit"), "No ejecutar");
    const formButton = screen.getByRole("button", { name: "Crear commit" });
    expect(formButton.hasAttribute("disabled")).toBe(true);
    await user.click(formButton);
    expect(api.mock.calls.some(([c]) => c === "create_commit")).toBe(false);
    const prepared = screen.getByRole("region", { name: "Preparados" });
    expect(within(prepared).getByText(entry.path)).toBeTruthy();
  });
});
