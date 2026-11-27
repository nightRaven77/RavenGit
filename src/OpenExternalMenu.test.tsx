// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import OpenExternalMenu from "./OpenExternalMenu";
import type { ExternalAppsState } from "./themes";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const api = vi.mocked(invoke);
const dialogOpen = vi.mocked(open);

const baseApps: ExternalAppsState = {
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
      command: "/System/Applications/Utilities/Terminal.app",
      custom: false,
    },
    {
      id: "iterm2",
      name: "iTerm2",
      kind: "terminal",
      command: "/Applications/iTerm.app",
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

beforeEach(() => {
  api.mockReset();
  dialogOpen.mockReset();
  api.mockImplementation(async (_command, args) => {
    const payload = args as { kind: string; appId?: string | null };
    return {
      appId: payload.appId ?? payload.kind,
      appName:
        payload.appId === "vscode"
          ? "Visual Studio Code"
          : payload.appId === "iterm2"
            ? "iTerm2"
            : payload.appId === "custom"
              ? "Zed"
              : payload.kind === "explorer"
                ? "Finder"
                : payload.kind === "terminal"
                  ? "Terminal"
                  : "Antigravity IDE",
      kind: payload.kind,
      message: `Abierto en ${payload.appId ?? payload.kind}`,
    };
  });
});

afterEach(cleanup);

it("muestra las tres opciones y abre editor, terminal y explorador en un clic", async () => {
  const onNotice = vi.fn();
  const onError = vi.fn();
  render(
    <OpenExternalMenu
      repoId="repo-1"
      disabled={false}
      apps={baseApps}
      onReloadApps={vi.fn().mockResolvedValue(undefined)}
      onSavePreferences={vi.fn().mockResolvedValue(undefined)}
      onNotice={onNotice}
      onError={onError}
    />,
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Abrir en editor: Antigravity IDE" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Abrir en terminal: Terminal" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Abrir en explorador de archivos" }),
  );

  expect(api).toHaveBeenCalledWith("open_in_external", {
    id: "repo-1",
    kind: "editor",
    appId: "antigravity",
  });
  expect(api).toHaveBeenCalledWith("open_in_external", {
    id: "repo-1",
    kind: "terminal",
    appId: "terminal",
  });
  expect(api).toHaveBeenCalledWith("open_in_external", {
    id: "repo-1",
    kind: "explorer",
    appId: null,
  });
  expect(onNotice).toHaveBeenCalledTimes(3);
  expect(onError).not.toHaveBeenCalled();
});

it("permite cambiar entre editores detectados y elegir otro editor personalizado", async () => {
  const onSavePreferences = vi.fn().mockResolvedValue(undefined);
  const onReloadApps = vi.fn().mockResolvedValue(undefined);
  dialogOpen.mockResolvedValue("/Applications/Zed.app");

  render(
    <OpenExternalMenu
      repoId="repo-1"
      disabled={false}
      apps={baseApps}
      onReloadApps={onReloadApps}
      onSavePreferences={onSavePreferences}
      onNotice={vi.fn()}
      onError={vi.fn()}
    />,
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Seleccionar editor" }),
  );
  await userEvent.click(
    screen.getByRole("menuitemradio", { name: "Visual Studio Code" }),
  );

  expect(onSavePreferences).toHaveBeenCalledWith({
    ...baseApps.preferences,
    preferredEditorId: "vscode",
  });
  expect(api).toHaveBeenCalledWith("open_in_external", {
    id: "repo-1",
    kind: "editor",
    appId: "vscode",
  });

  await userEvent.click(
    screen.getByRole("button", { name: "Seleccionar editor" }),
  );
  await userEvent.click(
    screen.getByRole("menuitem", { name: "Elegir otro editor…" }),
  );

  expect(onSavePreferences).toHaveBeenCalledWith({
    ...baseApps.preferences,
    preferredEditorId: "custom",
    customEditorPath: "/Applications/Zed.app",
    customEditorName: "Zed",
  });
  expect(onReloadApps).toHaveBeenCalledOnce();
  expect(api).toHaveBeenCalledWith("open_in_external", {
    id: "repo-1",
    kind: "editor",
    appId: "custom",
  });
});

it("permite cambiar la terminal preferida y reporta errores al fallar el lanzamiento", async () => {
  const onSavePreferences = vi.fn().mockResolvedValue(undefined);
  const onError = vi.fn();

  render(
    <OpenExternalMenu
      repoId="repo-1"
      disabled={false}
      apps={baseApps}
      onReloadApps={vi.fn().mockResolvedValue(undefined)}
      onSavePreferences={onSavePreferences}
      onNotice={vi.fn()}
      onError={onError}
    />,
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Seleccionar terminal" }),
  );
  await userEvent.click(screen.getByRole("menuitemradio", { name: "iTerm2" }));

  expect(onSavePreferences).toHaveBeenCalledWith({
    ...baseApps.preferences,
    preferredTerminalId: "iterm2",
  });
  expect(api).toHaveBeenCalledWith("open_in_external", {
    id: "repo-1",
    kind: "terminal",
    appId: "iterm2",
  });

  api.mockRejectedValueOnce({ message: "La carpeta ya no existe." });
  await userEvent.click(
    screen.getByRole("button", { name: "Abrir en explorador de archivos" }),
  );
  expect(onError).toHaveBeenCalledWith("La carpeta ya no existe.");
});
