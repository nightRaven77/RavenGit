// @vitest-environment jsdom
// Contract tests use simulated IPC; no real provider is contacted.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import PushPanel from "./PushPanel";
import type { OperationResult } from "./OperationNotice";
import type { PushPreview, RemotesState } from "./types";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke);
const state: RemotesState = {
  token: "remote-state",
  trusted: true,
  remotes: [
    {
      name: "origin",
      fetchUrls: ["https://example.invalid/repo.git"],
      pushUrls: ["https://example.invalid/repo.git"],
      editUrl: "https://example.invalid/repo.git",
      editPushUrl: null,
      provider: "Servidor Git",
      editable: true,
      fetchAllowed: true,
      pushAllowed: true,
      restriction: null,
      trackingCount: 1,
      upstreamBranches: [],
    },
  ],
};
const review: PushPreview = {
  token: "server-owned-review",
  remote: "origin",
  url: "https://example.invalid/repo.git",
  sourceBranch: "main",
  sourceHash: "a".repeat(40),
  targetBranch: "main",
  targetHash: "b".repeat(40),
  ahead: 1,
  behind: 0,
  relation: "ahead",
  commits: [{ hash: "a".repeat(40), subject: "Mejorar el grafo" }],
  canPush: true,
  setUpstream: false,
};
function mount(onResult?: (result: OperationResult) => void) {
  const onUpdated = vi.fn(async () => true),
    onLock = vi.fn();
  render(
    <PushPanel
      active
      repoId="repo"
      repository={{ name: "Proyecto original", path: "/fixture/original" }}
      onResult={onResult}
      onLock={onLock}
      onUpdated={onUpdated}
    />,
  );
  return { onUpdated, onLock };
}
async function clickReview() {
  const button = await screen.findByRole("button", { name: "Revisar push" });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
  await userEvent.click(button);
  await screen.findByRole("button", { name: "Confirmar publicación" });
}
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (c) => {
    if (c === "read_remotes" || c === "authorize_remote_operations")
      return structuredClone(state);
    if (c === "read_push_options")
      return { branches: ["main", "feature/graph"], current: "main" };
    if (c === "preview_push") return structuredClone(review);
    if (c === "publish_push")
      return {
        state: structuredClone(state),
        status: "confirmed",
        message: "Push confirmado",
        warning: null,
      };
    throw new Error(c);
  });
});
it.each([
  ["confirmed", "Push completado"],
  ["unchanged", "Destino al día"],
  ["uncertain", "Push sin confirmar"],
] as const)(
  "informa el resultado %s sin deducir éxito del texto",
  async (status, title) => {
    const fallback = api.getMockImplementation()!;
    api.mockImplementation(async (command, args) =>
      command === "publish_push"
        ? { status, message: "Git terminó", warning: null, state }
        : fallback(command, args),
    );
    const onResult = vi.fn();
    mount(onResult);
    await clickReview();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar publicación" }),
    );
    await waitFor(() =>
      expect(onResult).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status,
          title,
          repository: "Proyecto original",
          path: "/fixture/original",
          destination: "main → origin/main",
        }),
      ),
    );
    expect(onResult.mock.calls[0][0].status).toBe("progress");
    expect(onResult.mock.calls[0][0].id).toBe(onResult.mock.lastCall![0].id);
    if (status === "unchanged")
      expect(onResult.mock.lastCall![0].message).toContain(
        "no se publicaron commits nuevos",
      );
    if (status === "uncertain")
      expect(onResult.mock.lastCall![0].message).toContain(
        "Comprueba el destino",
      );
  },
);
it("conserva publicación confirmada si falla el refresco y no reintenta", async () => {
  const onResult = vi.fn();
  const { onUpdated } = mount(onResult);
  onUpdated.mockResolvedValue(false);
  await clickReview();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar publicación" }),
  );
  await waitFor(() =>
    expect(onResult).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "warning",
        title: "Push completado",
        warning: expect.stringContaining("no repitas el push"),
      }),
    ),
  );
  expect(
    api.mock.calls.filter(([command]) => command === "publish_push"),
  ).toHaveLength(1);
});
it("un error al publicar deja un resultado sin confirmar con contexto y sin reintento", async () => {
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) => {
    if (command === "publish_push")
      throw { code: "PUSH_UNCERTAIN", message: "La conexión se interrumpió" };
    return fallback(command, args);
  });
  const onResult = vi.fn();
  mount(onResult);
  await clickReview();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar publicación" }),
  );
  await waitFor(() =>
    expect(onResult).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "uncertain",
        title: "Push sin confirmar",
        message: "La conexión se interrumpió",
      }),
    ),
  );
  expect(
    api.mock.calls.filter(([command]) => command === "publish_push"),
  ).toHaveLength(1);
});
afterEach(cleanup);
it("distingue una revisión caducada de un push con resultado incierto", async () => {
  const fallback = api.getMockImplementation()!;
  api.mockImplementation(async (command, args) => {
    if (command === "publish_push")
      throw { code: "PUSH_REVIEW", message: "Revisión caducada" };
    return fallback(command, args);
  });
  const onResult = vi.fn();
  mount(onResult);
  await clickReview();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar publicación" }),
  );
  await waitFor(() =>
    expect(onResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "error", title: "Push no iniciado" }),
    ),
  );
});
it("only reads local configuration on entry", async () => {
  mount();
  await screen.findByRole("option", { name: "main" });
  expect(
    api.mock.calls.every(([c]) =>
      ["read_remotes", "read_push_options"].includes(c),
    ),
  ).toBe(true);
});
it("reviews the selected branch and destination without publishing", async () => {
  mount();
  await clickReview();
  expect(api).toHaveBeenCalledWith("preview_push", {
    id: "repo",
    token: "remote-state",
    remote: "origin",
    sourceBranch: "main",
    targetBranch: "main",
    setUpstream: false,
  });
  expect(api.mock.calls.some(([c]) => c === "publish_push")).toBe(false);
  expect(screen.getByText("Mejorar el grafo")).toBeTruthy();
});
it("publishes only after confirmation using a backend review token", async () => {
  const { onUpdated } = mount();
  await clickReview();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar publicación" }),
  );
  await screen.findByText("Push confirmado");
  expect(api).toHaveBeenCalledWith("publish_push", {
    id: "repo",
    previewToken: "server-owned-review",
  });
  expect(onUpdated).toHaveBeenCalledOnce();
  expect(
    screen.queryByRole("button", { name: "Confirmar publicación" }),
  ).toBeNull();
});
it("invalidates review when the destination branch changes", async () => {
  mount();
  await clickReview();
  await userEvent.type(screen.getByLabelText("Rama de destino"), "-new");
  expect(
    screen.queryByRole("button", { name: "Confirmar publicación" }),
  ).toBeNull();
  expect(api.mock.calls.some(([c]) => c === "publish_push")).toBe(false);
});
it("shows divergence and disables confirmation", async () => {
  api.mockImplementation(async (c) =>
    c === "read_remotes"
      ? structuredClone(state)
      : c === "read_push_options"
        ? { branches: ["main"], current: "main" }
        : { ...review, relation: "diverged", behind: 2, canPush: false },
  );
  mount();
  await clickReview();
  expect(screen.getByText("Las ramas han divergido")).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Confirmar publicación",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("requires trust before querying a publication destination", async () => {
  api.mockImplementation(async (c) =>
    c === "read_remotes"
      ? { ...state, trusted: false }
      : { branches: ["main"], current: "main" },
  );
  mount();
  await screen.findByRole("button", { name: "Autorizar operaciones" });
  expect(
    (screen.getByRole("button", { name: "Revisar push" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(api.mock.calls.some(([c]) => c === "preview_push")).toBe(false);
});
it("includes an explicit upstream request in review", async () => {
  mount();
  await screen.findByRole("option", { name: "main" });
  await userEvent.click(
    screen.getByLabelText(
      "Establecer seguimiento de esta rama hacia el destino",
    ),
  );
  await clickReview();
  expect(api).toHaveBeenCalledWith(
    "preview_push",
    expect.objectContaining({ setUpstream: true }),
  );
});
it("does not offer upstream when fetch and push destinations differ", async () => {
  api.mockImplementation(async (c) =>
    c === "read_remotes"
      ? {
          ...state,
          remotes: [
            {
              ...state.remotes[0],
              pushUrls: ["https://other.invalid/repo.git"],
            },
          ],
        }
      : { branches: ["main"], current: "main" },
  );
  mount();
  await screen.findByRole("option", { name: "main" });
  expect(
    (
      screen.getByLabelText(
        "Establecer seguimiento de esta rama hacia el destino",
      ) as HTMLInputElement
    ).disabled,
  ).toBe(true);
});
it("a rejected push consumes review and preserves branch input", async () => {
  api.mockImplementation(async (c) => {
    if (c === "publish_push")
      throw { message: "Destino cambiado; vuelve a revisar" };
    if (c === "read_remotes") return structuredClone(state);
    if (c === "read_push_options")
      return { branches: ["main"], current: "main" };
    return structuredClone(review);
  });
  mount();
  await clickReview();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar publicación" }),
  );
  await screen.findByText("Destino cambiado; vuelve a revisar");
  expect(
    screen.queryByRole("button", { name: "Confirmar publicación" }),
  ).toBeNull();
  expect(
    (screen.getByLabelText("Rama de destino") as HTMLInputElement).value,
  ).toBe("main");
  expect(api.mock.calls.filter(([c]) => c === "publish_push")).toHaveLength(1);
});
it("separates successful push from an upstream warning", async () => {
  api.mockImplementation(async (c) =>
    c === "read_remotes"
      ? structuredClone(state)
      : c === "read_push_options"
        ? { branches: ["main"], current: "main" }
        : c === "preview_push"
          ? structuredClone(review)
          : {
              state: structuredClone(state),
              status: "confirmed",
              message: "Push confirmado",
              warning: "Seguimiento local incompleto; no repitas el push",
            },
  );
  mount();
  await clickReview();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar publicación" }),
  );
  await screen.findByText("Push confirmado");
  expect(screen.getByRole("alert").textContent).toContain(
    "Seguimiento local incompleto",
  );
});
