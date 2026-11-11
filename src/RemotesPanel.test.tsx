// @vitest-environment jsdom
// UI contract tests with simulated IPC; no provider is contacted.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import RemotesPanel from "./RemotesPanel";
import type { RemotesState } from "./types";
import { operationEvent, type OperationReport } from "./operations";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke);
const base: RemotesState = {
  token: "before",
  trusted: true,
  remotes: [
    {
      name: "upstream",
      fetchUrls: ["https://example.invalid/team/repo.git"],
      pushUrls: ["https://example.invalid/team/repo.git"],
      editUrl: "https://example.invalid/team/repo.git",
      editPushUrl: null,
      provider: "Servidor Git",
      editable: true,
      fetchAllowed: true,
      pushAllowed: true,
      restriction: null,
      trackingCount: 2,
      upstreamBranches: ["main"],
    },
  ],
};
function mount() {
  const onUpdated = vi.fn(async () => true);
  render(
    <RemotesPanel
      active
      repoId="repo"
      onLock={vi.fn()}
      onUpdated={onUpdated}
    />,
  );
  return onUpdated;
}
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (command) => {
    if (command === "read_remotes") return structuredClone(base);
    return {
      state: structuredClone(base),
      message: "Operación completada",
      completedAt: 1792500000,
      warning: null,
    };
  });
});
afterEach(cleanup);
it("aplicar cuenta SSH a descarga abre revisión y conserva publicación independiente", async () => {
  const ssh = structuredClone(base);
  ssh.remotes[0] = {
    ...ssh.remotes[0],
    fetchUrls: ["git@gitlab.com:e/r.git"],
    pushUrls: ["git@gitlab.com:e/r.git"],
    editUrl: "git@gitlab.com:e/r.git",
  };
  const profile = {
    label: "Trabajo",
    provider: "GitLab",
    host: "gitlab-trabajo",
  };
  api.mockImplementation(async (command) => {
    if (command === "read_remotes") return ssh;
    if (command === "read_ssh_accounts")
      return { token: "accounts", profiles: [profile] };
    throw new Error(`Unexpected command: ${command}`);
  });
  mount();
  await userEvent.click(await screen.findByText("Cuentas SSH y agente"));
  await userEvent.click(
    await screen.findByRole("button", { name: "Revisar uso de Trabajo" }),
  );
  expect(
    (screen.getByLabelText("URL de descarga") as HTMLInputElement).value,
  ).toBe("git@gitlab-trabajo:e/r.git");
  expect(
    (screen.getByLabelText("URL de publicación (opcional)") as HTMLInputElement)
      .value,
  ).toBe("git@gitlab.com:e/r.git");
  expect(
    api.mock.calls.some(([command]) =>
      ["edit_remote", "contact_remote"].includes(command),
    ),
  ).toBe(false);
});
it("reads configuration without contacting a server", async () => {
  mount();
  await screen.findByRole("button", { name: "Fetch…" });
  expect(api.mock.calls.every(([c]) => c === "read_remotes")).toBe(true);
});
it("requires explicit confirmation and fetches only selected remote", async () => {
  const done = mount();
  await screen.findByRole("button", { name: "Fetch…" });
  await userEvent.click(screen.getByRole("button", { name: "Fetch…" }));
  expect(api.mock.calls.some(([c]) => c === "contact_remote")).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(api).toHaveBeenCalledWith("contact_remote", {
    id: "repo",
    token: "before",
    name: "upstream",
    fetch: true,
  });
  expect(screen.getByText(/Último fetch en esta apertura/)).toBeTruthy();
});
it("checks access independently without recording a fetch", async () => {
  const reports: OperationReport[] = [];
  const capture = (event: Event) =>
    reports.push((event as CustomEvent<OperationReport>).detail);
  window.addEventListener(operationEvent, capture);
  mount();
  try {
    await userEvent.click(
      await screen.findByRole("button", { name: "Comprobar acceso" }),
    );
    await screen.findByText("Operación completada");
    expect(reports.map((report) => report.title)).toEqual([
      "Comprobando acceso de lectura",
      "Acceso de lectura comprobado",
    ]);
  } finally {
    window.removeEventListener(operationEvent, capture);
  }
  expect(api).toHaveBeenCalledWith("contact_remote", {
    id: "repo",
    token: "before",
    name: "upstream",
    fetch: false,
  });
  expect(
    screen.getByText("Sin fetch confirmado en esta apertura."),
  ).toBeTruthy();
});
it("preserves failure and never claims a successful fetch", async () => {
  api.mockImplementation(async (c) => {
    if (c === "read_remotes") return structuredClone(base);
    throw { message: "No se pudo conectar" };
  });
  mount();
  await userEvent.click(await screen.findByRole("button", { name: "Fetch…" }));
  await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  await screen.findByRole("alert");
  expect(
    screen.getByText("Sin fetch confirmado en esta apertura."),
  ).toBeTruthy();
});
it("requires repository trust before modifications or connections", async () => {
  api.mockResolvedValue({ ...base, trusted: false });
  mount();
  await screen.findByRole("button", { name: "Autorizar operaciones" });
  expect(
    (screen.getByRole("button", { name: "Fetch…" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Añadir remoto" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it("saves explicit URLs only after review", async () => {
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Añadir remoto" }),
  );
  await userEvent.type(screen.getByLabelText("Nombre"), "backup");
  await userEvent.type(
    screen.getByLabelText("URL de descarga"),
    "/tmp/backup.git",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar configuración" }),
  );
  expect(api.mock.calls.some(([c]) => c === "edit_remote")).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("edit_remote", {
      id: "repo",
      token: "before",
      edit: {
        kind: "add",
        name: "backup",
        url: "/tmp/backup.git",
        pushUrl: null,
      },
    }),
  );
});
it("keeps advanced remotes read only", async () => {
  api.mockResolvedValue({
    ...base,
    remotes: [
      {
        ...base.remotes[0],
        editable: false,
        fetchAllowed: false,
        restriction: "Configuración avanzada",
      },
    ],
  });
  mount();
  await screen.findByText("Configuración avanzada");
  for (const name of ["Editar", "Quitar…", "Fetch…", "Comprobar acceso"])
    expect(
      (screen.getByRole("button", { name }) as HTMLButtonElement).disabled,
    ).toBe(true);
});
