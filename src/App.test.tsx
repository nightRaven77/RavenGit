// @vitest-environment jsdom
// App integration uses simulated IPC; these tests never execute Git.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import App from "./App";
import { operationEvent } from "./operations";
const tauriEventListeners = vi.hoisted(
  () => new Map<string, Set<(event: { payload: unknown }) => void>>(),
);
function emitTauriEvent(name: string, payload: unknown) {
  for (const listener of tauriEventListeners.get(name) ?? []) {
    listener({ payload });
  }
}
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    (name: string, handler: (event: { payload: unknown }) => void) => {
      let set = tauriEventListeners.get(name);
      if (!set) {
        set = new Set();
        tauriEventListeners.set(name, set);
      }
      set.add(handler);
      return Promise.resolve(() => {
        set?.delete(handler);
      });
    },
  ),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: Math.min(options.count, 8) }, (_, index) => ({
        index,
        start: index * options.estimateSize(),
        size: options.estimateSize(),
      })),
    getTotalSize: () => options.count * options.estimateSize(),
    scrollToIndex: vi.fn(),
  }),
}));
const api = vi.mocked(invoke),
  dialog = vi.mocked(open);
const hash = "a".repeat(40);
const repo = {
  id: "fixture",
  path: "/fixture/repo",
  name: "RavenGit Fixture",
  head: hash,
  branch: "main",
  shallow: false,
  refs: [],
  page: {
    commits: [
      {
        hash,
        parents: [],
        author: "Fixture",
        date: "2026-10-20",
        subject: "Base",
      },
    ],
    nextOffset: null,
    generation: "generation",
  },
};
const remote = {
  name: "origin",
  provider: "Servidor Git",
  fetchUrls: ["https://example.invalid/repo.git"],
  pushUrls: ["https://example.invalid/repo.git"],
  editUrl: "https://example.invalid/repo.git",
  editPushUrl: null,
  editable: true,
  fetchAllowed: true,
  pushAllowed: true,
  restriction: null,
  trackingCount: 0,
  upstreamBranches: [],
};
const preferences = {
  inspectorOpen: true,
  inspectorSize: 38,
  authorWidth: 160,
  showDate: true,
  showHash: false,
  scope: "all",
  query: "",
  selectedCommit: null,
};
const repositoryLibrary = {
  version: 2,
  collections: [],
  repositories: [
    {
      path: repo.path,
      name: repo.name,
      pinned: false,
      lastOpened: 1,
      preferences,
      collectionId: null,
    },
  ],
};
const remotes = { token: "remote-state", trusted: true, remotes: [remote] };
it("abre la recuperación de respaldos desde Herramientas sin restaurar automáticamente", async () => {
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) =>
    command === "read_conflict_backups"
      ? { trusted: true, entries: [] }
      : fallback(command, args),
  );
  await opened();
  await userEvent.click(
    screen.getByText("Herramientas", { selector: "summary" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Recuperar respaldo de conflicto…" }),
  );
  await screen.findByRole("heading", {
    name: "Recuperar respaldo de conflicto",
  });
  expect(api).toHaveBeenCalledWith("read_conflict_backups", { id: repo.id });
  expect(
    api.mock.calls.some(([command]) => command === "restore_conflict_backup"),
  ).toBe(false);
});
async function opened() {
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
  await screen.findByText("RavenGit Fixture", { selector: "strong" });
}
it("ofrece publicar una etiqueta creada sin conectar hasta revisar el destino", async () => {
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) => {
    if (command === "preview_tag")
      return { token: "tag-review", name: "v1", commit: hash, subject: "Base" };
    if (command === "create_tag") return "Etiqueta local v1 creada";
    if (command === "read_tag_push_options")
      return { state: remotes, tags: [{ name: "v1", hash }] };
    return fallback(command, args);
  });
  await opened();
  await userEvent.click(
    screen.getByRole("button", { name: "Etiquetar commit…" }),
  );
  await userEvent.type(screen.getByLabelText("Nombre de etiqueta"), "v1");
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar etiqueta" }),
  );
  await screen.findByRole("checkbox", { name: /Confirmo este nombre/ });
  await userEvent.click(
    screen.getByRole("checkbox", { name: /Confirmo este nombre/ }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Crear etiqueta local" }),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Publicar esta etiqueta…",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Publicar esta etiqueta…" }),
  );
  await screen.findByRole("heading", { name: "Publicar etiqueta" });
  await screen.findByLabelText("Etiqueta local");
  expect(
    (screen.getByLabelText("Etiqueta local") as HTMLSelectElement).value,
  ).toBe("v1");
  expect(
    api.mock.calls.some(
      ([command]) =>
        command === "preview_tag_push" || command === "publish_tag",
    ),
  ).toBe(false);
});
it("etiqueta el commit del inspector sin confundirlo con crear una rama", async () => {
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) => {
    if (command === "preview_tag")
      return {
        token: "tag-review",
        name: "v1.0",
        commit: hash,
        subject: "Base",
      };
    if (command === "create_tag") return "Etiqueta local v1.0 creada";
    return fallback(command, args);
  });
  await opened();
  await userEvent.click(
    screen.getByRole("button", { name: "Etiquetar commit…" }),
  );
  await userEvent.type(screen.getByLabelText("Nombre de etiqueta"), "v1.0");
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar etiqueta" }),
  );
  await screen.findByRole("checkbox", { name: /Confirmo este nombre/ });
  await userEvent.click(
    screen.getByRole("checkbox", { name: /Confirmo este nombre/ }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Crear etiqueta local" }),
  );
  await screen.findByText(/no repitas la creación/);
  expect(api).toHaveBeenCalledWith("preview_tag", {
    id: repo.id,
    name: "v1.0",
    commit: hash,
  });
  expect(api.mock.calls.some(([command]) => command === "edit_branch")).toBe(
    false,
  );
});

it("no solicita diffs con el inspector cerrado ni fuera de Historial", async () => {
  await opened();
  await waitFor(() =>
    expect(
      api.mock.calls.filter(([command]) => command === "read_commit_diff"),
    ).toHaveLength(1),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Ocultar detalle" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Cambios" }));
  await userEvent.click(screen.getByRole("button", { name: /Historial/ }));
  expect(
    api.mock.calls.filter(([command]) => command === "read_commit_diff"),
  ).toHaveLength(1);
  await userEvent.click(
    screen.getByRole("button", { name: "Mostrar detalle" }),
  );
  await waitFor(() =>
    expect(
      api.mock.calls.filter(([command]) => command === "read_commit_diff"),
    ).toHaveLength(2),
  );
});

it("la búsqueda respeta la ventana virtual con diez mil coincidencias y no muestra columnas del grafo", async () => {
  const fallback = api.getMockImplementation()!;
  const commits = Array.from({ length: 10000 }, (_, index) => ({
    ...repo.page.commits[0],
    hash: index.toString(16).padStart(40, "0"),
    subject: `Coincidencia ${index}`,
  }));
  api.mockImplementation(async (command, args) =>
    command === "open_repository"
      ? {
          ...structuredClone(repo),
          head: commits[0].hash,
          page: { ...repo.page, commits },
        }
      : fallback(command, args),
  );
  await opened();
  fireEvent.change(
    screen.getByRole("textbox", { name: "Buscar en commits cargados" }),
    { target: { value: "Coincidencia" } },
  );
  await screen.findByText("10000 coincidencias");
  const results = document.querySelectorAll(".search-result");
  expect(results).toHaveLength(8);
  expect(document.querySelector(".history-table-header")).toBeNull();
  expect(results[0].getAttribute("title")).toContain(commits[0].hash);
  await userEvent.click(results[0]);
  fireEvent.keyDown(results[0], { key: "ArrowDown" });
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("read_commit_diff", {
      id: repo.id,
      hash: commits[1].hash,
      parentIndex: 0,
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Limpiar búsqueda" }),
  );
  expect(document.querySelector(".history-table-header")).not.toBeNull();
});
beforeEach(() => {
  try {
    window.localStorage?.clear?.();
  } catch {
    // Node/jsdom without localStorage backing file.
  }
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.graphPalette;
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  dialog.mockReset();
  dialog.mockResolvedValue("/fixture/repo");
  api.mockReset();
  tauriEventListeners.clear();
  Element.prototype.scrollTo = vi.fn();
  api.mockImplementation(async (command, args) => {
    if (command === "read_app_settings")
      return {
        version: 1,
        theme: "obsidian",
        graphPalette: "kraken",
        external: {
          preferredEditorId: "antigravity",
          preferredTerminalId: "terminal",
          customEditorPath: null,
          customEditorName: null,
        },
      };
    if (command === "save_app_settings")
      return (args as { settings: unknown }).settings;
    if (command === "read_external_apps")
      return {
        editors: [
          {
            id: "antigravity",
            name: "Antigravity IDE",
            kind: "editor",
            command: "/Applications/Antigravity.app",
            custom: false,
          },
          {
            id: "vscode",
            name: "Visual Studio Code",
            kind: "editor",
            command: "/Applications/Visual Studio Code.app",
            custom: false,
          },
        ],
        terminals: [
          {
            id: "terminal",
            name: "Terminal",
            kind: "terminal",
            command: "Terminal",
            custom: false,
          },
        ],
        explorer: {
          id: "finder",
          name: "Finder",
          kind: "explorer",
          command: "open",
          custom: false,
        },
        preferences: {
          preferredEditorId: "antigravity",
          preferredTerminalId: "terminal",
          customEditorPath: null,
          customEditorName: null,
        },
      };
    if (command === "open_in_external") {
      const payload = args as { kind: string; appId?: string | null };
      return {
        appId: payload.appId ?? payload.kind,
        appName:
          payload.kind === "explorer"
            ? "Finder"
            : payload.kind === "terminal"
              ? "Terminal"
              : "Antigravity IDE",
        kind: payload.kind,
        message: `Abierto en ${payload.kind === "explorer" ? "Finder" : payload.kind === "terminal" ? "Terminal" : "Antigravity IDE"}`,
      };
    }
    if (command === "get_default_repository_directory")
      return "/fixture/default";
    if (command === "open_repository") return structuredClone(repo);
    if (
      command === "remember_repository" ||
      command === "read_repository_library"
    )
      return structuredClone(repositoryLibrary);
    if (command === "save_history_preferences") return null;
    if (command === "read_commit_files")
      return { hash, parent: null, parentCount: 0, files: [] };
    if (command === "read_commit_diff")
      return { hash, text: "diff fixture", parent: null, parentCount: 0 };
    if (command === "read_changes")
      return {
        token: "",
        entries: [],
        head: null,
        branch: null,
        author: null,
        operation: null,
        trusted: false,
      };
    if (command === "read_remotes") return structuredClone(remotes);
    if (command === "read_branches")
      return {
        token: "branches",
        trusted: true,
        current: "main",
        head: hash,
        branches: [{ name: "main", hash }],
        restriction: null,
      };
    if (command === "read_pull_options")
      return {
        token: "pull-options",
        trusted: true,
        branch: "main",
        remote: null,
        remoteBranch: null,
        url: null,
        restriction: "Configura un upstream",
      };
    if (command === "read_push_options")
      return { branches: ["main"], current: "main" };
    if (command === "refresh_repository")
      throw { message: "No se pudo refrescar el historial de prueba" };
    if (command === "preview_push")
      return {
        token: "review",
        remote: "origin",
        url: remote.pushUrls[0],
        sourceBranch: "main",
        sourceHash: hash,
        targetBranch: "main",
        targetHash: null,
        ahead: 1,
        behind: 0,
        relation: "new",
        commits: [{ hash, subject: "Base" }],
        canPush: true,
        setUpstream: false,
      };
    if (command === "publish_push")
      return {
        status: "confirmed",
        message: "Push confirmado",
        warning: null,
        state: structuredClone(remotes),
      };
    if (command === "read_worktree_summary")
      return {
        trusted: false,
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflicts: 0,
        total: 0,
        operation: null,
      };
    if (command === "watch_repository") return null;
    if (command === "read_worktrees")
      return {
        trusted: true,
        currentPath: repo.path,
        branches: [repo.branch ?? "main"],
        restriction: null,
        worktrees: [
          {
            path: repo.path,
            name: repo.name,
            head: repo.head,
            branch: repo.branch,
            detached: false,
            bare: false,
            main: true,
            current: true,
            locked: false,
            lockReason: null,
            prunable: false,
            prunableReason: null,
          },
        ],
      };
    if (command === "record_activity") return null;
    throw new Error(command);
  });
});
afterEach(cleanup);
it("muestra resultados globales y persiste sólo el estado sanitizado", async () => {
  await opened();
  window.dispatchEvent(
    new CustomEvent(operationEvent, {
      detail: {
        id: "operation-test",
        repoId: repo.id,
        operation: "stage",
        status: "confirmed",
        title: "Cambios preparados",
        message: "Git confirmó la preparación.",
      },
    }),
  );
  expect(await screen.findByText("Cambios preparados")).toBeTruthy();
  expect(api).toHaveBeenCalledWith("record_activity", {
    id: repo.id,
    input: { operation: "stage", status: "confirmed" },
  });
});
it("permite reintentar un fallo al guardar preferencias sin reabrir Git", async () => {
  const fallback = api.getMockImplementation()!;
  let failed = true;
  api.mockImplementation(async (command, args) => {
    if (command === "save_history_preferences" && failed)
      throw { message: "Configuración no disponible" };
    return fallback(command, args);
  });
  await opened();
  const retry = await screen.findByRole("button", {
    name: "Reintentar guardar preferencias",
  });
  failed = false;
  await userEvent.click(retry);
  expect(await screen.findByText("Preferencias guardadas")).toBeTruthy();
  expect(
    api.mock.calls.filter(([command]) => command === "open_repository"),
  ).toHaveLength(1);
});
it("restaura el filtro, búsqueda y diseño guardados por repositorio", async () => {
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) => {
    if (command === "remember_repository")
      return {
        ...repositoryLibrary,
        repositories: [
          {
            ...repositoryLibrary.repositories[0],
            preferences: {
              ...preferences,
              scope: "HEAD",
              query: "Base",
              inspectorOpen: false,
              authorWidth: 220,
              showHash: true,
              selectedCommit: hash,
            },
          },
        ],
      };
    if (command === "refresh_repository") return structuredClone(repo);
    return fallback(command, args);
  });
  await opened();
  expect(
    (screen.getByRole("combobox", { name: "Mostrar" }) as HTMLSelectElement)
      .value,
  ).toBe("HEAD");
  expect(
    (
      screen.getByRole("textbox", {
        name: "Buscar en commits cargados",
      }) as HTMLInputElement
    ).value,
  ).toBe("Base");
  expect(screen.getByRole("button", { name: "Mostrar detalle" })).toBeTruthy();
  await userEvent.click(screen.getByText("Vista", { selector: "summary" }));
  expect(
    (screen.getByRole("slider", { name: "Ancho de autor" }) as HTMLInputElement)
      .value,
  ).toBe("220");
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("save_history_preferences", {
      id: repo.id,
      preferences: {
        ...preferences,
        scope: "HEAD",
        query: "Base",
        inspectorOpen: false,
        authorWidth: 220,
        showHash: true,
        selectedCommit: hash,
      },
    }),
  );
});
it("abre el repositorio aunque falle la biblioteca y no intenta sobrescribirla", async () => {
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) => {
    if (command === "remember_repository")
      throw { message: "Biblioteca incompatible" };
    return fallback(command, args);
  });
  await opened();
  expect(screen.getByRole("heading", { name: "Base" })).toBeTruthy();
  expect(
    screen.getByText(/El repositorio se abrió, pero no se guardará/),
  ).toBeTruthy();
  expect(
    api.mock.calls.some(([command]) => command === "save_history_preferences"),
  ).toBe(false);
});
it("recupera Todas las referencias si el filtro guardado desapareció", async () => {
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) => {
    if (command === "remember_repository")
      return {
        ...repositoryLibrary,
        repositories: [
          {
            ...repositoryLibrary.repositories[0],
            preferences: { ...preferences, scope: "refs/heads/missing" },
          },
        ],
      };
    return fallback(command, args);
  });
  await opened();
  expect(
    (screen.getByRole("combobox", { name: "Mostrar" }) as HTMLSelectElement)
      .value,
  ).toBe("all");
  expect(screen.getByText(/La referencia guardada ya no existe/)).toBeTruthy();
  expect(
    api.mock.calls.some(([command]) => command === "refresh_repository"),
  ).toBe(false);
});
it("consulta y pagina el historial de HEAD con su ámbito y generación", async () => {
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) => {
    if (command === "refresh_repository")
      return {
        ...structuredClone(repo),
        page: {
          ...structuredClone(repo.page),
          generation: "scoped|HEAD",
          nextOffset: 200,
        },
      };
    if (command === "read_history")
      return {
        commits: [
          {
            ...repo.page.commits[0],
            hash: "b".repeat(40),
            subject: "Commit más antiguo",
          },
        ],
        nextOffset: null,
        generation: "scoped|HEAD",
      };
    return fallback(command, args);
  });
  await opened();
  await userEvent.type(
    screen.getByRole("textbox", { name: "Buscar en commits cargados" }),
    "Base",
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Mostrar" }),
    "HEAD",
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("refresh_repository", {
      id: "fixture",
      scope: "HEAD",
    }),
  );
  expect(
    (
      screen.getByRole("textbox", {
        name: "Buscar en commits cargados",
      }) as HTMLInputElement
    ).value,
  ).toBe("");
  await userEvent.click(
    await screen.findByRole("button", { name: "Cargar 200 más" }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("read_history", {
      id: "fixture",
      offset: 200,
      generation: "scoped|HEAD",
      scope: "HEAD",
    }),
  );
  expect(await screen.findByText("Fin del historial disponible")).toBeTruthy();
});
it("conserva el filtro y los commits anteriores si falla la lectura de otra rama", async () => {
  await opened();
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Mostrar" }),
    "HEAD",
  );
  await screen.findByRole("alert");
  expect(
    (screen.getByRole("combobox", { name: "Mostrar" }) as HTMLSelectElement)
      .value,
  ).toBe("all");
  expect(screen.getByRole("heading", { name: "Base" })).toBeTruthy();
});
it("navega al padre y vuelve a HEAD sin cambiar ramas ni ejecutar fetch", async () => {
  const fallback = api.getMockImplementation()!;
  const parent = "b".repeat(40);
  api.mockImplementation(async (command, args) => {
    if (command === "open_repository")
      return {
        ...structuredClone(repo),
        page: {
          ...structuredClone(repo.page),
          commits: [
            { ...repo.page.commits[0], parents: [parent] },
            { ...repo.page.commits[0], hash: parent, subject: "Raíz" },
          ],
        },
      };
    return fallback(command, args);
  });
  await opened();
  await userEvent.click(
    await screen.findByRole("button", { name: "Ir al padre 1" }),
  );
  expect(screen.getByRole("heading", { name: "Raíz" })).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Ir a HEAD" }));
  expect(screen.getByRole("heading", { name: "Base" })).toBeTruthy();
  expect(
    api.mock.calls.some(([command]) =>
      ["refresh_repository", "edit_branch", "fetch_remote"].includes(command),
    ),
  ).toBe(false);
});
it("pliega el inspector y conserva el commit seleccionado al restaurarlo", async () => {
  await opened();
  await screen.findByRole("heading", { name: "Base" });
  await userEvent.click(
    screen.getByRole("button", { name: "Ocultar detalle" }),
  );
  expect(
    screen.queryByRole("complementary", { name: "Detalle del commit" }),
  ).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Mostrar detalle" }),
  );
  expect(
    within(
      screen.getByRole("complementary", { name: "Detalle del commit" }),
    ).getByRole("heading", { name: "Base" }),
  ).toBeTruthy();
  expect(
    api.mock.calls.some(([command]) =>
      ["edit_branch", "replay_commit"].includes(command),
    ),
  ).toBe(false);
});
it("permite configurar las columnas sin perder la selección del historial", async () => {
  await opened();
  await userEvent.click(screen.getByText("Vista", { selector: "summary" }));
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Fecha",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Hash del commit" }),
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "Fecha" }));
  expect(
    screen.getByText("Commit", { selector: ".table-heading span" }),
  ).toBeTruthy();
  expect(
    screen.queryByText("Fecha", { selector: ".table-heading span" }),
  ).toBeNull();
  const details = screen.getByText("Más detalles", { selector: "summary" });
  await userEvent.click(details);
  expect(screen.getByText(hash, { selector: ".full-hash" })).toBeTruthy();
});
it("agrupa la sincronización y recuerda su sección sin ejecutar operaciones de red", async () => {
  await opened();
  const navigation = screen.getByRole("navigation", {
    name: "Vistas del repositorio",
  });
  expect(within(navigation).getAllByRole("button")).toHaveLength(3);
  await userEvent.click(
    within(navigation).getByRole("button", { name: "Sincronizar" }),
  );
  const sync = screen.getByRole("navigation", { name: "Sincronización" });
  await userEvent.click(within(sync).getByRole("button", { name: "Pull" }));
  await userEvent.click(
    within(navigation).getByRole("button", { name: /Historial/ }),
  );
  expect(
    screen.queryByRole("navigation", { name: "Sincronización" }),
  ).toBeNull();
  await userEvent.click(
    within(navigation).getByRole("button", { name: "Sincronizar" }),
  );
  expect(
    screen
      .getByRole("link", { name: "Saltar al contenido" })
      .getAttribute("href"),
  ).toBe("#pull-content");
  expect(
    api.mock.calls.some(([command]) =>
      [
        "fetch_remote",
        "preview_pull",
        "integrate_pull",
        "push_branch",
      ].includes(command),
    ),
  ).toBe(false);
});
it("Pull abre su revisión y actualiza el enlace de salto sin contactar remotos", async () => {
  await opened();
  await userEvent.click(
    within(
      screen.getByRole("group", { name: "Comandos Git básicos" }),
    ).getByRole("button", { name: "Pull" }),
  );
  await screen.findByText("Configura un upstream");
  expect(screen.getByText("Saltar al contenido").getAttribute("href")).toBe(
    "#pull-content",
  );
  expect(
    api.mock.calls.some(
      ([command]) => command === "preview_pull" || command === "integrate_pull",
    ),
  ).toBe(false);
});
it("muestra fallos de apertura desde Publicar fuera del Historial oculto", async () => {
  await opened();
  await userEvent.click(
    within(
      screen.getByRole("group", { name: "Comandos Git básicos" }),
    ).getByRole("button", { name: "Push" }),
  );
  await screen.findByRole("option", { name: "main" });
  api.mockImplementation(async (command) => {
    if (command === "open_repository")
      throw { message: "Carpeta inválida de prueba" };
    if (command === "read_remotes") return structuredClone(remotes);
    if (command === "read_push_options")
      return { branches: ["main"], current: "main" };
    throw Error(command);
  });
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Carpeta inválida de prueba");
  expect(alert.closest("[hidden]")).toBeNull();
});
it("muestra el error de Actualizar mientras Cambios permanece activo", async () => {
  await opened();
  await userEvent.click(
    within(
      screen.getByRole("navigation", { name: "Vistas del repositorio" }),
    ).getByRole("button", { name: "Cambios" }),
  );
  await screen.findByRole("button", { name: "Habilitar operaciones locales" });
  await userEvent.click(screen.getByRole("button", { name: "Actualizar" }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("No se pudo refrescar");
  expect(alert.closest("[hidden]")).toBeNull();
  expect(screen.getByRole("region", { name: "Cambios locales" })).toBeTruthy();
  expect(
    within(screen.getByRole("navigation", { name: "Vistas del repositorio" }))
      .getByRole("button", { name: "Cambios" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(
    screen
      .getByRole("link", { name: "Saltar al contenido" })
      .getAttribute("href"),
  ).toBe("#changes-content");
});
it("conserva el éxito de push y avisa si falla el refresco posterior", async () => {
  await opened();
  await userEvent.click(
    within(
      screen.getByRole("group", { name: "Comandos Git básicos" }),
    ).getByRole("button", { name: "Push" }),
  );
  const button = await screen.findByRole("button", { name: "Revisar push" });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
  await userEvent.click(button);
  await userEvent.click(
    await screen.findByRole("button", { name: "Confirmar publicación" }),
  );
  await screen.findByText("Push confirmado");
  expect(
    await screen.findByText(
      /El historial local no pudo actualizarse.*no repitas el push/,
    ),
  ).toBeTruthy();
  expect(
    api.mock.calls.filter(([command]) => command === "publish_push"),
  ).toHaveLength(1);
  await userEvent.click(
    within(
      screen.getByRole("navigation", { name: "Vistas del repositorio" }),
    ).getByRole("button", { name: /^Historial/ }),
  );
  const results = screen.getByRole("region", {
    name: "Resultados de operaciones",
  });
  expect(within(results).getByText("Push completado")).toBeTruthy();
  expect(
    within(results).getByText("RavenGit Fixture · main → origin/main"),
  ).toBeTruthy();
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) =>
    command === "open_repository"
      ? {
          ...repo,
          id: "other",
          path: "/fixture/other",
          name: "Otro repositorio",
        }
      : fallback(command, args),
  );
  dialog.mockResolvedValueOnce("/fixture/other");
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
  await screen.findByText("Otro repositorio", { selector: "strong" });
  expect(within(results).getByText("/fixture/repo")).toBeTruthy();
  await userEvent.click(
    within(results).getByRole("button", {
      name: "Cerrar resultado de operación",
    }),
  );
  expect(
    screen.queryByRole("region", { name: "Resultados de operaciones" }),
  ).toBeNull();
});
it("abre Ramas desde la barra y conserva la navegación accesible", async () => {
  await opened();
  await userEvent.click(screen.getByRole("button", { name: "Rama" }));
  await screen.findByRole("button", { name: "Crear rama" });
  expect(screen.getByRole("region", { name: "Ramas locales" })).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Saltar al contenido" })
      .getAttribute("href"),
  ).toBe("#branches-content");
  expect(
    within(
      screen.getByRole("navigation", {
        name: "Herramientas del repositorio",
      }),
    )
      .getByRole("button", { name: "Ramas" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(api.mock.calls.some(([command]) => command === "edit_branch")).toBe(
    false,
  );
});
it.each(["Cherry-pick", "Revertir commit"])(
  "cierra y permite reabrir el modal desde %s sin escribir en Git",
  async (action) => {
    const fallback = api.getMockImplementation()!;
    api.mockImplementation(async (command, args) =>
      command === "read_replay"
        ? { trusted: true, branch: "main", restriction: null, recovery: null }
        : fallback(command, args),
    );
    await opened();
    const opener = await screen.findByRole("button", { name: action });
    await userEvent.click(opener);
    await screen.findByRole("dialog", { name: "Cherry-pick y revert" });
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(
      screen.queryByRole("dialog", { name: "Cherry-pick y revert" }),
    ).toBeNull();
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    await userEvent.click(opener);
    expect(
      await screen.findByRole("dialog", { name: "Cherry-pick y revert" }),
    ).toBeTruthy();
    expect(api.mock.calls.some(([command]) => command === "edit_replay")).toBe(
      false,
    );
  },
);
it("crea y abre un repositorio nuevo sin requerir uno activo", async () => {
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) =>
    command === "initialize_repository"
      ? { path: "/fixture/nuevo", branch: "main" }
      : fallback(command, args),
  );
  render(<App />);
  await userEvent.click(
    screen.getByRole("button", { name: "Nuevo repositorio…" }),
  );
  await screen.findByRole("dialog", { name: "Nuevo repositorio" });
  expect(
    api.mock.calls.some(([command]) => command === "initialize_repository"),
  ).toBe(false);
  await userEvent.click(
    screen.getByRole("button", { name: "Elegir carpeta contenedora…" }),
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "Nombre de la carpeta nueva" }),
    "nuevo",
  );
  await userEvent.click(
    screen.getByRole("checkbox", { name: /Confirmo la ubicación/ }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Crear repositorio" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Nuevo repositorio" }),
    ).toBeNull(),
  );
  expect(api).toHaveBeenCalledWith("open_repository", {
    path: "/fixture/nuevo",
  });
  expect(
    api.mock.calls.some(([command]) => command === "authorize_repository"),
  ).toBe(false);
});
it("clona y abre la copia desde el lateral sin alterar la inicialización", async () => {
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) =>
    command === "clone_repository"
      ? { path: "/fixture/copia", branch: "main" }
      : fallback(command, args),
  );
  render(<App />);
  await userEvent.click(
    screen.getByRole("button", { name: "Clonar repositorio…" }),
  );
  await screen.findByRole("dialog", { name: "Clonar repositorio" });
  await userEvent.type(
    screen.getByRole("textbox", { name: "URL o ruta local del origen" }),
    "https://example.invalid/repo.git",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Elegir carpeta contenedora…" }),
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "Nombre de la carpeta nueva" }),
    "copia",
  );
  await userEvent.click(
    screen.getByRole("checkbox", { name: /Confío en el origen/ }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar clonado" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Clonar repositorio" }),
    ).toBeNull(),
  );
  expect(api).toHaveBeenCalledWith("open_repository", {
    path: "/fixture/copia",
  });
  expect(
    api.mock.calls.some(([command]) =>
      ["initialize_repository", "authorize_repository"].includes(command),
    ),
  ).toBe(false);
});
it("tras mover la carpeta activa a Papelera limpia la selección y conserva el aviso", async () => {
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) => {
    if (command === "preview_repository_delete")
      return { path: repo.path, name: repo.name, token: "delete-once" };
    if (command === "trash_repository")
      return {
        library: { ...repositoryLibrary, repositories: [] },
        warning: null,
      };
    return fallback(command, args);
  });
  await opened();
  await userEvent.click(screen.getByRole("button", { name: /^Repositorios/ }));
  await userEvent.click(
    await screen.findByRole("button", {
      name: `Quitar ${repo.name} de la lista`,
    }),
  );
  await userEvent.click(
    screen.getByRole("checkbox", {
      name: "También mover la carpeta a la Papelera",
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar eliminación de carpeta" }),
  );
  await userEvent.type(
    await screen.findByRole("textbox", {
      name: `Escribe ${repo.name} para confirmar`,
    }),
    repo.name,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Mover carpeta a la Papelera" }),
  );
  expect(await screen.findByText("Sin repositorio")).toBeTruthy();
  expect(
    await screen.findByText(/No se eliminó el repositorio remoto/),
  ).toBeTruthy();
  expect(
    api.mock.calls.filter(([command]) => command === "trash_repository"),
  ).toHaveLength(1);
});

it("permite abrir el repositorio activo en editor, terminal y explorador desde el encabezado", async () => {
  await opened();
  const header = document.querySelector("header.command-bar")!;
  const editorButton = await within(header as HTMLElement).findByRole(
    "button",
    {
      name: "Abrir en editor: Antigravity IDE",
    },
  );
  await userEvent.click(editorButton);
  expect(api).toHaveBeenCalledWith("open_in_external", {
    id: repo.id,
    kind: "editor",
    appId: "antigravity",
  });
  expect(await screen.findByText("Abierto en Antigravity IDE")).toBeTruthy();

  await userEvent.click(
    within(header as HTMLElement).getByRole("button", {
      name: "Abrir en terminal: Terminal",
    }),
  );
  expect(api).toHaveBeenCalledWith("open_in_external", {
    id: repo.id,
    kind: "terminal",
    appId: "terminal",
  });

  await userEvent.click(
    within(header as HTMLElement).getByRole("button", {
      name: "Abrir en explorador de archivos",
    }),
  );
  expect(api).toHaveBeenCalledWith("open_in_external", {
    id: repo.id,
    kind: "explorer",
    appId: null,
  });
});

it("aplica y persiste cambios de tema y paleta del grafo desde Apariencia en el encabezado y Herramientas", async () => {
  render(<App />);
  const header = document.querySelector("header.command-bar")!;
  await userEvent.click(
    within(header as HTMLElement).getByRole("button", { name: "Apariencia" }),
  );
  await screen.findByRole("heading", { name: "Apariencia y colores" });

  await userEvent.click(
    screen.getByRole("button", { name: /Abismo Esmeralda/ }),
  );
  expect(document.documentElement.dataset.theme).toBe("emerald-abyss");

  await userEvent.click(screen.getByRole("button", { name: /Neón Eléctrico/ }));
  expect(document.documentElement.dataset.graphPalette).toBe("neon");
  expect(api).toHaveBeenCalledWith("save_app_settings", {
    settings: {
      version: 1,
      theme: "emerald-abyss",
      graphPalette: "neon",
      external: {
        preferredEditorId: "antigravity",
        preferredTerminalId: "terminal",
        customEditorPath: null,
        customEditorName: null,
      },
    },
  });

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  await userEvent.click(
    screen.getByText("Herramientas", { selector: "summary" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Apariencia y colores…" }),
  );
  await screen.findByRole("heading", { name: "Apariencia y colores" });
});

it("lista archivos del commit, solicita diff por archivo individual y abre menús contextuales y Paleta", async () => {
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) => {
    if (command === "open_repository") {
      return {
        ...structuredClone(repo),
        refs: [{ name: "refs/heads/main", hash, kind: "branch" }],
      };
    }
    if (command === "read_commit_files") {
      return {
        hash,
        parent: null,
        parentCount: 0,
        files: [
          {
            path: "src/nuevo.ts",
            oldPath: null,
            status: "A",
            additions: 12,
            deletions: 0,
            binary: false,
          },
        ],
      };
    }
    if (command === "read_commit_diff") {
      const payload = args as { path?: string };
      return {
        hash,
        text: payload.path
          ? "@@ -0,0 +1 @@\n+export const ok = true;\n"
          : "diff completo",
        parent: null,
        parentCount: 0,
      };
    }
    return fallback(command, args);
  });

  await opened();
  const fileBtn = await screen.findByRole("button", {
    name: /src\/nuevo\.ts/,
  });
  await userEvent.click(fileBtn);
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("read_commit_diff", {
      id: repo.id,
      hash,
      parentIndex: 0,
      path: "src/nuevo.ts",
    }),
  );
  expect(
    await screen.findByText(
      (_, node) =>
        node?.tagName === "SPAN" &&
        node.classList.contains("diff-line") &&
        Boolean(node.textContent?.includes("export const ok = true;")),
    ),
  ).toBeTruthy();

  // Menú contextual en fila del grafo
  const row = screen.getByRole("button", { name: /Base\. Fixture\./ });
  fireEvent.contextMenu(row, { clientX: 50, clientY: 60 });
  const menu = await screen.findByRole("menu", {
    name: /Acciones del commit/,
  });
  expect(
    within(menu).getByRole("menuitem", { name: "Copiar hash completo" }),
  ).toBeTruthy();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).toBeNull();

  // Menú contextual en referencia del sidebar
  const sidebarSections = document.querySelector(
    ".sidebar-sections",
  ) as HTMLElement;
  const branchBtn = within(sidebarSections).getByRole("button", {
    name: /^main/,
  });
  fireEvent.contextMenu(branchBtn, { clientX: 40, clientY: 120 });
  const refMenu = await screen.findByRole("menu", { name: "Acciones de main" });
  expect(
    within(refMenu).getByRole("menuitem", {
      name: "Filtrar historial por main",
    }),
  ).toBeTruthy();
  await userEvent.keyboard("{Escape}");

  // Paleta de comandos vía Ctrl+K y atajos globales Ctrl+1 / Ctrl+2 / Ctrl+,
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const palette = await screen.findByRole("dialog", {
    name: "Paleta de comandos",
  });
  expect(palette).toBeTruthy();
  await userEvent.click(
    within(palette).getByRole("option", { name: /Ir a Cambios locales/ }),
  );
  expect(
    screen
      .getByRole("region", { name: "Cambios locales" })
      .hasAttribute("hidden"),
  ).toBe(false);

  fireEvent.keyDown(window, { key: "2", ctrlKey: true });
  expect(
    screen
      .getByRole("region", { name: "Historial del repositorio" })
      .hasAttribute("hidden"),
  ).toBe(false);

  fireEvent.keyDown(window, { key: ",", ctrlKey: true });
  await screen.findByRole("heading", { name: "Apariencia y colores" });
});

it("agrupa ramas con prefijo en el sidebar, permite redimensionar el inspector y copiar hash desde cabecera", async () => {
  const fallback = api.getMockImplementation()!;
  const hashA = "a".repeat(40);
  const hashB = "b".repeat(40);
  const groupedRepo = {
    ...repo,
    head: hashA,
    branch: "feature/auth",
    refs: [
      { name: "refs/heads/main", hash: hashA, kind: "branch" as const },
      { name: "refs/heads/feature/auth", hash: hashA, kind: "branch" as const },
      { name: "refs/heads/feature/ui", hash: hashB, kind: "branch" as const },
    ],
    page: {
      commits: [
        {
          hash: hashA,
          parents: [hashB],
          author: "Ada",
          date: "2026-04-11T08:00:00Z",
          subject: "feat: login",
        },
        {
          hash: hashB,
          parents: [],
          author: "Ada",
          date: "2026-04-10T08:00:00Z",
          subject: "base",
        },
      ],
      nextOffset: null,
      generation: 1,
    },
  };
  api.mockImplementation(async (command, args) => {
    if (command === "open_repository") return structuredClone(groupedRepo);
    if (command === "read_commit_files") {
      return { hash: hashA, parent: hashB, parentCount: 1, files: [] };
    }
    return fallback(command, args);
  });

  await opened();

  // Agrupación visual de ramas locales con `/` conservando nombre accesible y clic
  const sidebarSections = document.querySelector(
    ".sidebar-sections",
  ) as HTMLElement;
  const authBranchBtn = within(sidebarSections).getByRole("button", {
    name: /^feature\/auth/,
  });
  const uiBranchBtn = within(sidebarSections).getByRole("button", {
    name: /^feature\/ui/,
  });
  expect(authBranchBtn.closest("details.branch-folder")).toBeTruthy();
  await userEvent.click(uiBranchBtn);
  expect(uiBranchBtn.getAttribute("title")).toContain("feature/ui");

  // Separador vertical redimensionable por teclado
  const mainShell = document.querySelector(
    "main.workspace-shell",
  ) as HTMLElement;
  const separator = screen.getByRole("separator", {
    name: "Redimensionar panel de detalle",
  });
  expect(separator.getAttribute("aria-valuenow")).toBe("38");
  fireEvent.keyDown(separator, { key: "ArrowLeft" });
  expect(separator.getAttribute("aria-valuenow")).toBe("40");
  expect(mainShell.style.getPropertyValue("--inspector-size")).toBe("40%");
  fireEvent.keyDown(separator, { key: "ArrowRight" });
  expect(separator.getAttribute("aria-valuenow")).toBe("38");

  // Barra compacta de historial unificada con alcance, búsqueda, Ir a HEAD, Vista y toggle inspector
  expect(screen.getByRole("combobox", { name: "Mostrar" })).toBeTruthy();
  expect(
    screen.getByRole("textbox", { name: "Buscar en commits cargados" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Ir a HEAD" })).toBeTruthy();
  expect(screen.getByText("Vista", { selector: "summary" })).toBeTruthy();

  // Botón de copia rápida del hash en la cabecera del inspector
  const copyHashBtn = screen.getByRole("button", {
    name: /Copiar hash completo/,
  });
  await userEvent.click(copyHashBtn);
  expect(await screen.findByText(/Hash copiado/)).toBeTruthy();
});

it("gestiona múltiples pestañas independientes, persiste el estado y actualiza la rama en la barra aunque el filtro quede obsoleto", async () => {
  const fallback = api.getMockImplementation()!;
  let currentBranch = "feat/vieja";
  let filterDropped = false;
  const repoA = {
    ...repo,
    id: "repo-a",
    path: "/fixture/repo-a",
    name: "Repo Alpha",
    branch: currentBranch,
    refs: [
      { name: "refs/heads/main", hash, kind: "branch" as const },
      { name: "refs/heads/feat/vieja", hash, kind: "branch" as const },
    ],
  };
  const repoB = {
    ...repo,
    id: "repo-b",
    path: "/fixture/repo-b",
    name: "Repo Beta",
    branch: "develop",
    refs: [{ name: "refs/heads/develop", hash, kind: "branch" as const }],
  };
  api.mockImplementation(async (command, args) => {
    if (command === "open_repository") {
      const p = (args as { path: string }).path;
      return structuredClone(p === repoB.path ? repoB : repoA);
    }
    if (command === "close_repository") return;
    if (command === "read_branches") {
      return {
        rebaseRecord: false,
        operation: null,
        token: "br-token",
        trusted: true,
        current: currentBranch,
        head: hash,
        branches: [
          { name: currentBranch, hash },
          { name: "main", hash },
        ],
        restriction: null,
      };
    }
    if (command === "edit_branch") {
      currentBranch = "feat/nueva";
      filterDropped = true;
      return {
        message: "Rama feat/vieja renombrada a feat/nueva.",
        warning: null,
      };
    }
    if (command === "refresh_repository") {
      const payload = args as { id: string; scope?: string };
      if (
        payload.id === repoA.id &&
        filterDropped &&
        payload.scope === "refs/heads/feat/vieja"
      ) {
        throw {
          code: "INVALID_SCOPE",
          message: "La rama seleccionada ya no existe.",
        };
      }
      if (payload.id === repoB.id) return structuredClone(repoB);
      return {
        ...structuredClone(repoA),
        branch: currentBranch,
        refs: [
          { name: "refs/heads/main", hash, kind: "branch" as const },
          {
            name: `refs/heads/${currentBranch}`,
            hash,
            kind: "branch" as const,
          },
        ],
      };
    }
    return fallback(command, args);
  });

  // Abrir Repo Alpha y comprobar rama inicial en barra
  dialog.mockResolvedValueOnce(repoA.path);
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
  await screen.findByRole("tab", { name: /Repo Alpha/ });
  expect(document.querySelector(".toolbar-branch")?.textContent).toBe(
    "feat/vieja",
  );

  // Abrir Repo Beta en segunda pestaña y cambiar de vista
  dialog.mockResolvedValueOnce(repoB.path);
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
  await screen.findByRole("tab", { name: /Repo Beta/ });
  expect(document.querySelector(".toolbar-branch")?.textContent).toBe(
    "develop",
  );
  await userEvent.click(screen.getByRole("button", { name: "Cambios" }));

  // Volver a Repo Alpha conserva vista Historial
  await userEvent.click(screen.getByRole("tab", { name: /Repo Alpha/ }));
  expect(document.querySelector(".toolbar-branch")?.textContent).toBe(
    "feat/vieja",
  );
  expect(
    screen
      .getByRole("region", { name: "Historial del repositorio" })
      .hasAttribute("hidden"),
  ).toBe(false);

  // Filtrar historial por la rama actual y luego renombrarla -> refresh hace fallback a "all" y actualiza .toolbar-branch
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Mostrar" }),
    "refs/heads/feat/vieja",
  );
  await userEvent.click(
    within(document.querySelector(".header-toolbar") as HTMLElement).getByRole(
      "button",
      { name: "Rama" },
    ),
  );
  const renameBtn = await screen.findByRole("button", {
    name: "Renombrar feat/vieja",
  });
  await userEvent.click(renameBtn);
  const renameInput = screen.getByLabelText(
    "Nuevo nombre de la rama seleccionada",
  );
  await userEvent.type(renameInput, "feat/nueva");
  await userEvent.click(screen.getByRole("button", { name: "Renombrar rama" }));
  await waitFor(() =>
    expect(document.querySelector(".toolbar-branch")?.textContent).toBe(
      "feat/nueva",
    ),
  );

  // Cerrar Repo Alpha con Ctrl+W invoca close_repository y activa Repo Beta
  fireEvent.keyDown(window, { key: "w", ctrlKey: true });
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("close_repository", { id: repoA.id }),
  );
  await waitFor(() =>
    expect(document.querySelector(".toolbar-branch")?.textContent).toBe(
      "develop",
    ),
  );
});

it("vigila sólo la pestaña activa, muestra fila WIP en el grafo y refresca en silencio al cambiar el repo", async () => {
  const fallback = api.getMockImplementation()!;
  let repoABranch = "main";
  let repoBBranch = "main";
  const repoA = {
    ...repo,
    id: "watch-repo-a",
    path: "/fixture/watch-a",
    name: "Watch Alpha",
    branch: repoABranch,
    refs: [{ name: "refs/heads/main", hash, kind: "branch" as const }],
  };
  const repoB = {
    ...repo,
    id: "watch-repo-b",
    path: "/fixture/watch-b",
    name: "Watch Beta",
    branch: repoBBranch,
    refs: [{ name: "refs/heads/main", hash, kind: "branch" as const }],
  };
  const dirtySummary = {
    trusted: true,
    staged: 1,
    unstaged: 2,
    untracked: 1,
    conflicts: 0,
    total: 4,
    operation: null,
  };
  const cleanSummary = {
    trusted: true,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicts: 0,
    total: 0,
    operation: null,
  };
  api.mockImplementation(async (command, args) => {
    if (command === "open_repository") {
      const p = (args as { path: string }).path;
      return structuredClone(p === repoB.path ? repoB : repoA);
    }
    if (command === "read_worktree_summary") {
      const id = (args as { id: string }).id;
      return id === repoB.id ? dirtySummary : cleanSummary;
    }
    if (command === "refresh_repository") {
      const { id } = args as { id: string };
      if (id === repoB.id) {
        return {
          ...structuredClone(repoB),
          branch: repoBBranch,
          refs: [
            {
              name: `refs/heads/${repoBBranch}`,
              hash,
              kind: "branch" as const,
            },
          ],
        };
      }
      return {
        ...structuredClone(repoA),
        branch: repoABranch,
        refs: [
          { name: `refs/heads/${repoABranch}`, hash, kind: "branch" as const },
        ],
      };
    }
    return fallback(command, args);
  });

  dialog.mockResolvedValueOnce(repoA.path);
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
  await screen.findByRole("tab", { name: /Watch Alpha/ });
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("watch_repository", { id: repoA.id }),
  );

  // Abrir Watch Beta mueve el watcher sólo a repoB y muestra fila WIP + badge sucio
  dialog.mockResolvedValueOnce(repoB.path);
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
  const tabB = await screen.findByRole("tab", { name: /Watch Beta/ });
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("watch_repository", { id: repoB.id }),
  );
  const wipButton = await screen.findByRole("button", {
    name: /Cambios sin commitear \(4\)/,
  });
  expect(within(wipButton).getByText("1 preparados")).toBeTruthy();
  expect(within(wipButton).getByText("2 sin preparar")).toBeTruthy();
  expect(within(wipButton).getByText("1 nuevos")).toBeTruthy();
  expect(tabB.querySelector(".repo-tab-dirty")?.textContent).toBe("4");

  // Click en fila WIP navega a la vista Cambios
  await userEvent.click(wipButton);
  expect(
    screen
      .getByRole("region", { name: "Cambios locales" })
      .hasAttribute("hidden"),
  ).toBe(false);

  await userEvent.click(screen.getByRole("button", { name: /^Historial/ }));

  // Evento externo de repoA (en segundo plano) se ignora mientras repoB está activo
  const refreshCountBefore = api.mock.calls.filter(
    ([cmd, payload]) =>
      cmd === "refresh_repository" &&
      (payload as { id?: string } | undefined)?.id === repoB.id,
  ).length;
  repoBBranch = "feat/live";
  await act(async () => {
    emitTauriEvent("ravengit://repo-changed", { id: repoA.id, kind: "git" });
  });
  expect(
    api.mock.calls.filter(
      ([cmd, payload]) =>
        cmd === "refresh_repository" &&
        (payload as { id?: string } | undefined)?.id === repoB.id,
    ).length,
  ).toBe(refreshCountBefore);

  // Evento externo sobre pestaña activa refresca silenciosamente y actualiza .toolbar-branch
  await act(async () => {
    emitTauriEvent("ravengit://repo-changed", { id: repoB.id, kind: "git" });
  });
  await waitFor(() =>
    expect(document.querySelector(".toolbar-branch")?.textContent).toBe(
      "feat/live",
    ),
  );

  // Cambiar a Watch Alpha actualiza el watcher a repoA y sincroniza repoA en segundo plano
  repoABranch = "hotfix/focus";
  await userEvent.click(screen.getByRole("tab", { name: /Watch Alpha/ }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("watch_repository", { id: repoA.id }),
  );
  await waitFor(() =>
    expect(document.querySelector(".toolbar-branch")?.textContent).toBe(
      "hotfix/focus",
    ),
  );
});

it("lista worktrees en el sidebar y permite abrir un worktree enlazado en nueva pestaña", async () => {
  const fallback = api.getMockImplementation()!;
  const mainRepo = {
    ...repo,
    id: "wt-main",
    path: "/fixture/wt-main",
    name: "Repo Principal",
    branch: "main",
    refs: [{ name: "refs/heads/main", hash, kind: "branch" as const }],
  };
  const linkedRepo = {
    ...repo,
    id: "wt-linked",
    path: "/fixture/wt-linked",
    name: "wt-linked",
    branch: "feat/worktree",
    refs: [
      { name: "refs/heads/main", hash, kind: "branch" as const },
      { name: "refs/heads/feat/worktree", hash, kind: "branch" as const },
    ],
  };

  api.mockImplementation(async (command, args) => {
    if (command === "open_repository") {
      const p = (args as { path: string }).path;
      return structuredClone(p === linkedRepo.path ? linkedRepo : mainRepo);
    }
    if (command === "read_worktrees") {
      const id = (args as { id: string }).id;
      const onLinked = id === linkedRepo.id;
      return {
        trusted: true,
        currentPath: onLinked ? linkedRepo.path : mainRepo.path,
        branches: ["main", "feat/worktree"],
        restriction: null,
        worktrees: [
          {
            path: mainRepo.path,
            name: mainRepo.name,
            head: hash,
            branch: "main",
            detached: false,
            bare: false,
            main: true,
            current: !onLinked,
            locked: false,
            lockReason: null,
            prunable: false,
            prunableReason: null,
          },
          {
            path: linkedRepo.path,
            name: linkedRepo.name,
            head: hash,
            branch: "feat/worktree",
            detached: false,
            bare: false,
            main: false,
            current: onLinked,
            locked: false,
            lockReason: null,
            prunable: false,
            prunableReason: null,
          },
        ],
      };
    }
    return fallback(command, args);
  });

  dialog.mockResolvedValueOnce(mainRepo.path);
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
  await screen.findByRole("tab", { name: /Repo Principal/ });

  const wtButton = await screen.findByRole("button", {
    name: /wt-linked/,
  });
  await userEvent.click(wtButton);

  await screen.findByRole("tab", { name: /wt-linked/ });
  expect(api).toHaveBeenCalledWith("open_repository", {
    path: linkedRepo.path,
  });
  expect(document.querySelector(".toolbar-branch")?.textContent).toBe(
    "feat/worktree",
  );
});

it("solicita autorización al abrir un repositorio no autorizado, recuerda solo lectura en la sesión y permite autorizar desde la barra de estado", async () => {
  const fallback = api.getMockImplementation()!;
  let repoTrusted = false;
  const untrustedRepo = {
    ...repo,
    id: "repo-untrusted",
    path: "/fixture/untrusted",
    name: "Repo Nuevo",
    trusted: false,
  };
  const otherRepo = {
    ...repo,
    id: "repo-trusted",
    path: "/fixture/trusted",
    name: "Repo Confiable",
    trusted: true,
  };

  api.mockImplementation(async (command, args) => {
    if (command === "open_repository") {
      const p = (args as { path: string }).path;
      return structuredClone(p === otherRepo.path ? otherRepo : untrustedRepo);
    }
    if (command === "authorize_repository") {
      repoTrusted = true;
      return {
        token: "auth",
        entries: [],
        head: hash,
        branch: "main",
        author: null,
        operation: null,
        trusted: true,
      };
    }
    if (command === "read_worktree_summary") {
      const id = (args as { id: string }).id;
      if (id === untrustedRepo.id && repoTrusted) {
        return {
          trusted: true,
          staged: 1,
          unstaged: 0,
          untracked: 0,
          conflicts: 0,
          total: 1,
          operation: null,
        };
      }
      return {
        trusted: id === otherRepo.id,
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflicts: 0,
        total: 0,
        operation: null,
      };
    }
    return fallback(command, args);
  });

  dialog.mockResolvedValueOnce(untrustedRepo.path);
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));

  // Aparece el modal automático mostrando nombre y ruta del repositorio
  const trustModal = await screen.findByRole("dialog");
  expect(
    within(trustModal).getByText("¿Autorizar operaciones en Repo Nuevo?"),
  ).toBeTruthy();
  expect(within(trustModal).getByText("/fixture/untrusted")).toBeTruthy();

  // Continuar en solo lectura no autoriza y muestra el botón en la barra de estado
  await userEvent.click(
    screen.getByRole("button", { name: "Continuar en solo lectura" }),
  );
  expect(api).not.toHaveBeenCalledWith("authorize_repository", {
    id: untrustedRepo.id,
  });
  expect(
    await screen.findByRole("button", {
      name: "Solo lectura · Autorizar…",
    }),
  ).toBeTruthy();

  // Abrir otra pestaña confiable y volver a Repo Nuevo no vuelve a abrir el modal automáticamente
  dialog.mockResolvedValueOnce(otherRepo.path);
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
  await screen.findByRole("tab", { name: /Repo Confiable/ });
  await userEvent.click(screen.getByRole("tab", { name: /Repo Nuevo/ }));
  expect(
    screen.queryByText("¿Autorizar operaciones en Repo Nuevo?"),
  ).toBeNull();

  // Autorizar desde la barra de estado abre el modal, autoriza y habilita la fila WIP
  await userEvent.click(
    await screen.findByRole("button", { name: "Solo lectura · Autorizar…" }),
  );
  expect(
    await screen.findByText("¿Autorizar operaciones en Repo Nuevo?"),
  ).toBeTruthy();
  await userEvent.click(
    screen.getByRole("button", { name: "Autorizar este repositorio" }),
  );

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("authorize_repository", {
      id: untrustedRepo.id,
    }),
  );
  expect(
    screen.queryByRole("button", { name: "Solo lectura · Autorizar…" }),
  ).toBeNull();
  expect(
    await screen.findByRole("button", {
      name: /Cambios sin commitear \(1\)/,
    }),
  ).toBeTruthy();
});
