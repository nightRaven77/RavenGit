import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  CheckIcon,
  ChevronDownIcon,
  CodeIcon,
  DesktopIcon,
  FileIcon,
} from "@radix-ui/react-icons";
import type {
  ExternalAppsState,
  ExternalKind,
  ExternalPreferences,
  OpenExternalOutcome,
} from "./themes";

interface Props {
  repoId: string;
  disabled: boolean;
  apps: ExternalAppsState | null;
  onReloadApps: () => Promise<void>;
  onSavePreferences: (prefs: ExternalPreferences) => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

function errorText(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }
  return "No se pudo abrir la aplicación externa.";
}

function deriveEditorName(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, "");
  const segment = normalized.split(/[\\/]/).pop() ?? "";
  const stripped = segment.replace(/\.(app|exe|cmd|bat)$/i, "").trim();
  return stripped || "Editor personalizado";
}

export default function OpenExternalMenu({
  repoId,
  disabled,
  apps,
  onReloadApps,
  onSavePreferences,
  onNotice,
  onError,
}: Props) {
  const [openMenu, setOpenMenu] = useState<"editor" | "terminal" | null>(null);
  const [launching, setLaunching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const editors = apps?.editors ?? [];
  const terminals = apps?.terminals ?? [];
  const explorerName = apps?.explorer.name ?? "Explorador de archivos";
  const preferences: ExternalPreferences = apps?.preferences ?? {
    preferredEditorId: null,
    preferredTerminalId: null,
    customEditorPath: null,
    customEditorName: null,
  };

  const activeEditor =
    editors.find((item) => item.id === preferences.preferredEditorId) ??
    editors[0] ??
    null;
  const activeTerminal =
    terminals.find((item) => item.id === preferences.preferredTerminalId) ??
    terminals[0] ??
    null;

  useEffect(() => {
    if (!openMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpenMenu(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [openMenu]);

  useEffect(() => {
    setOpenMenu(null);
  }, [repoId]);

  const busy = disabled || launching;

  async function launch(kind: ExternalKind, appId?: string) {
    if (busy) return;
    setLaunching(true);
    try {
      const outcome = await invoke<OpenExternalOutcome>("open_in_external", {
        id: repoId,
        kind,
        appId: appId ?? null,
      });
      onNotice(outcome.message);
    } catch (error) {
      onError(errorText(error));
    } finally {
      setLaunching(false);
    }
  }

  async function chooseEditor(editorId: string) {
    setOpenMenu(null);
    try {
      await onSavePreferences({
        ...preferences,
        preferredEditorId: editorId,
      });
      await launch("editor", editorId);
    } catch (error) {
      onError(errorText(error));
    }
  }

  async function chooseCustomEditor() {
    if (busy) return;
    setOpenMenu(null);
    try {
      const picked = await open({
        directory: false,
        multiple: false,
        title: "Seleccionar editor o aplicación",
      });
      if (typeof picked !== "string" || !picked.trim()) return;
      const customEditorName = deriveEditorName(picked);
      await onSavePreferences({
        ...preferences,
        preferredEditorId: "custom",
        customEditorPath: picked,
        customEditorName,
      });
      await onReloadApps();
      await launch("editor", "custom");
    } catch (error) {
      onError(errorText(error));
    }
  }

  async function chooseTerminal(terminalId: string) {
    setOpenMenu(null);
    try {
      await onSavePreferences({
        ...preferences,
        preferredTerminalId: terminalId,
      });
      await launch("terminal", terminalId);
    } catch (error) {
      onError(errorText(error));
    }
  }

  return (
    <div
      ref={containerRef}
      className="external-toolbar"
      role="group"
      aria-label="Abrir repositorio en aplicación externa"
    >
      <div className="external-item">
        <div className="external-split">
          <button
            type="button"
            className="external-btn"
            disabled={busy}
            aria-label={
              activeEditor
                ? `Abrir en editor: ${activeEditor.name}`
                : "Elegir editor"
            }
            title={
              activeEditor
                ? `Abrir repositorio en ${activeEditor.name}`
                : "Elegir editor instalado en el equipo"
            }
            onClick={() => {
              if (activeEditor) void launch("editor", activeEditor.id);
              else setOpenMenu((m) => (m === "editor" ? null : "editor"));
            }}
          >
            <CodeIcon aria-hidden="true" />
            <span className="truncate external-editor-label">
              {activeEditor ? activeEditor.name : "Elegir editor…"}
            </span>
          </button>
          <button
            type="button"
            className="external-toggle"
            disabled={busy}
            aria-label="Seleccionar editor"
            aria-expanded={openMenu === "editor"}
            aria-haspopup="menu"
            title="Cambiar editor predeterminado"
            onClick={() =>
              setOpenMenu((m) => (m === "editor" ? null : "editor"))
            }
          >
            <ChevronDownIcon aria-hidden="true" />
          </button>
        </div>
        {openMenu === "editor" && (
          <div
            className="external-menu external-dropdown"
            role="menu"
            aria-label="Editores"
          >
            {editors.length > 0 ? (
              editors.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={item.id === activeEditor?.id}
                  className="external-menu-item"
                  disabled={busy}
                  onClick={() => void chooseEditor(item.id)}
                >
                  <span className="truncate">{item.name}</span>
                  {item.id === activeEditor?.id && (
                    <CheckIcon aria-hidden="true" />
                  )}
                </button>
              ))
            ) : (
              <p className="sidebar-empty">
                No se detectó ningún editor automático.
              </p>
            )}
            <button
              type="button"
              role="menuitem"
              className="external-menu-item external-menu-custom"
              disabled={busy}
              onClick={() => void chooseCustomEditor()}
            >
              <span>Elegir otro editor…</span>
            </button>
          </div>
        )}
      </div>

      <div className="external-item">
        <div className="external-split">
          <button
            type="button"
            className="external-btn"
            disabled={busy}
            aria-label={
              activeTerminal
                ? `Abrir en terminal: ${activeTerminal.name}`
                : "Abrir en terminal"
            }
            title={
              activeTerminal
                ? `Abrir carpeta en ${activeTerminal.name}`
                : "Abrir carpeta en terminal"
            }
            onClick={() => void launch("terminal", activeTerminal?.id)}
          >
            <DesktopIcon aria-hidden="true" />
            <span className="truncate external-compact-label">
              {activeTerminal ? activeTerminal.name : "Terminal"}
            </span>
          </button>
          {terminals.length > 1 && (
            <button
              type="button"
              className="external-toggle"
              disabled={busy}
              aria-label="Seleccionar terminal"
              aria-expanded={openMenu === "terminal"}
              aria-haspopup="menu"
              title="Cambiar terminal predeterminada"
              onClick={() =>
                setOpenMenu((m) => (m === "terminal" ? null : "terminal"))
              }
            >
              <ChevronDownIcon aria-hidden="true" />
            </button>
          )}
        </div>
        {openMenu === "terminal" && (
          <div
            className="external-menu external-dropdown"
            role="menu"
            aria-label="Terminales"
          >
            {terminals.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={item.id === activeTerminal?.id}
                className="external-menu-item"
                disabled={busy}
                onClick={() => void chooseTerminal(item.id)}
              >
                <span className="truncate">{item.name}</span>
                {item.id === activeTerminal?.id && (
                  <CheckIcon aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="external-item">
        <button
          type="button"
          className="external-btn external-btn-single"
          disabled={busy}
          aria-label="Abrir en explorador de archivos"
          title={`Abrir carpeta del repositorio en ${explorerName}`}
          onClick={() => void launch("explorer")}
        >
          <FileIcon aria-hidden="true" />
          <span className="truncate external-compact-label">
            {explorerName}
          </span>
        </button>
      </div>
    </div>
  );
}
