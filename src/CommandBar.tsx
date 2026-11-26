import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  DownloadIcon,
  ReloadIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  Share2Icon,
  ArchiveIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  QuestionMarkCircledIcon,
} from "@radix-ui/react-icons";
import type { Snapshot } from "./types";

export interface RepoTabItem {
  id: string;
  name: string;
  path: string;
  branch: string | null;
  dirtyCount?: number;
  busy?: boolean;
}

type Props = {
  repo: Pick<Snapshot, "name" | "path" | "branch" | "head"> | null;
  locked: boolean;
  onOpen: () => void;
  onRefresh: () => void;
  onChanges: () => void;
  onFetch: () => void;
  onPush: () => void;
  onPull: () => void;
  onBranches: () => void;
  onSearch: () => void;
  onStash: () => void;
  onLibrary?: () => void;
  onAppearance?: () => void;
  onCommandPalette?: () => void;
  onQuickGuide?: () => void;
  simpleMode?: boolean;
  onToggleSimpleMode?: () => void;
  themeSwatches?: readonly string[];
  externalSlot?: ReactNode;
  tabs?: RepoTabItem[];
  activeTabId?: string | null;
  onSelectTab?: (id: string) => void;
  onCloseTab?: (id: string) => void;
  onReorderTabs?: (fromId: string, toId: string) => void;
};

type Action = {
  label: string;
  icon: ComponentType;
  description: string;
  run?: () => void;
  needsRepo?: boolean;
  group: number;
  accent?: boolean;
};

export default function CommandBar({
  repo,
  locked,
  onOpen,
  onRefresh,
  onFetch,
  onPush,
  onPull,
  onBranches,
  onStash,
  onSearch,
  onLibrary,
  onAppearance,
  onCommandPalette,
  onQuickGuide,
  simpleMode = false,
  onToggleSimpleMode,
  themeSwatches,
  externalSlot,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
}: Props) {
  const [hint, setHint] = useState("");
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHint("");
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, []);

  const actions: Action[] = [
    {
      label: "Fetch",
      icon: ArrowDownIcon,
      description: "Abrir Remotos para elegir el destino y confirmar Fetch",
      run: onFetch,
      needsRepo: true,
      group: 1,
    },
    {
      label: "Pull",
      icon: DownloadIcon,
      description:
        "Abrir Pull para revisar el upstream, confirmar Fetch e integrar con merge",
      run: onPull,
      needsRepo: true,
      group: 1,
    },
    {
      label: "Push",
      icon: ArrowUpIcon,
      description:
        "Abrir Publicar para revisar remoto, ramas y commits antes de enviar",
      run: onPush,
      needsRepo: true,
      group: 1,
      accent: true,
    },
    {
      label: "Rama",
      icon: Share2Icon,
      description: "Crear, cambiar o renombrar ramas locales",
      run: onBranches,
      needsRepo: true,
      group: 2,
    },
    {
      label: "Stash",
      icon: ArchiveIcon,
      description:
        "Guardar cambios temporalmente o restaurar un stash conservando su entrada",
      run: onStash,
      needsRepo: true,
      group: 2,
    },
    {
      label: "Buscar",
      icon: MagnifyingGlassIcon,
      description: "Buscar mensaje, autor o hash en el historial cargado",
      run: onSearch,
      needsRepo: true,
      group: 3,
    },
    {
      label: "Actualizar",
      icon: ReloadIcon,
      description:
        "Releer historial y referencias locales; no contacta con servidores",
      run: onRefresh,
      needsRepo: true,
      group: 3,
    },
  ];
  const visibleActions = simpleMode
    ? actions.filter((action) =>
        ["Fetch", "Pull", "Push", "Rama", "Actualizar"].includes(action.label),
      )
    : actions;

  const openDescription = locked
    ? "Hay una operación en curso. Espera a que termine."
    : "Abrir un repositorio local";
  const branchText =
    repo?.branch ?? (repo?.head ? "HEAD separado" : "Sin commits");

  return (
    <header className="topbar command-bar" onMouseLeave={() => setHint("")}>
      <div className="header-tabstrip">
        <div className="command-brand">
          <img
            className="brand-icon"
            src="/ravengit.svg"
            alt=""
            width="20"
            height="20"
            aria-hidden="true"
          />
          <strong>RavenGit</strong>
        </div>
        <div className="repo-tabs-bar">
          <div
            className="repo-tabs"
            role="tablist"
            aria-label="Repositorios abiertos"
          >
            {tabs && tabs.length > 0 ? (
              tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                return (
                  <div
                    key={tab.id}
                    className={`repo-tab-wrap${isActive ? " active" : ""}${
                      dragOverTabId === tab.id && draggedTabId !== tab.id
                        ? " drag-over"
                        : ""
                    }`}
                    onDragOver={(event) => {
                      if (!onReorderTabs || locked || !draggedTabId) return;
                      event.preventDefault();
                      setDragOverTabId(tab.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverTabId === tab.id) setDragOverTabId(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceId =
                        draggedTabId ||
                        event.dataTransfer.getData("text/plain");
                      setDraggedTabId(null);
                      setDragOverTabId(null);
                      if (
                        !locked &&
                        sourceId &&
                        sourceId !== tab.id &&
                        onReorderTabs
                      ) {
                        onReorderTabs(sourceId, tab.id);
                      }
                    }}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`repo-tab${isActive ? " active" : ""}`}
                      disabled={locked}
                      title={`${tab.path}${tab.branch ? ` · ${tab.branch}` : ""}`}
                      draggable={!locked && !!onReorderTabs}
                      onDragStart={(event) => {
                        if (locked || !onReorderTabs) return;
                        setDraggedTabId(tab.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", tab.id);
                      }}
                      onDragEnd={() => {
                        setDraggedTabId(null);
                        setDragOverTabId(null);
                      }}
                      onClick={() => {
                        if (!locked) onSelectTab?.(tab.id);
                      }}
                      onAuxClick={(event) => {
                        if (event.button === 1 && !locked) {
                          event.preventDefault();
                          onCloseTab?.(tab.id);
                        }
                      }}
                    >
                      <svg
                        className="repo-tab-icon"
                        viewBox="0 0 16 16"
                        width="13"
                        height="13"
                        aria-hidden="true"
                      >
                        <path
                          fill="currentColor"
                          d="M1.75 2.5A1.75 1.75 0 0 1 3.5.75h3.1c.46 0 .9.18 1.24.51l.65.65c.1.1.24.16.38.16h3.63a1.75 1.75 0 0 1 1.75 1.75v7.93a1.75 1.75 0 0 1-1.75 1.75h-9a1.75 1.75 0 0 1-1.75-1.75V2.5Zm1.75-.25a.25.25 0 0 0-.25.25v9.25c0 .14.11.25.25.25h9a.25.25 0 0 0 .25-.25V3.82a.25.25 0 0 0-.25-.25H8.87a1.75 1.75 0 0 1-1.24-.51l-.65-.65a.25.25 0 0 0-.18-.07H3.5Z"
                        />
                      </svg>
                      <strong className="truncate">{tab.name}</strong>
                      {typeof tab.dirtyCount === "number" &&
                        tab.dirtyCount > 0 && (
                          <span
                            className="repo-tab-dirty"
                            aria-label={`${tab.dirtyCount} cambios`}
                          >
                            {tab.dirtyCount}
                          </span>
                        )}
                    </button>
                    {onCloseTab && (
                      <button
                        type="button"
                        className="repo-tab-close"
                        disabled={locked}
                        aria-label={`Cerrar ${tab.name}`}
                        title={`Cerrar ${tab.name} (⌘W / Ctrl+W)`}
                        onClick={() => {
                          if (!locked) onCloseTab(tab.id);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <div
                className="repo-tab active"
                role="tab"
                aria-selected="true"
                title={repo?.path ?? "Sin repositorio abierto"}
              >
                <svg
                  className="repo-tab-icon"
                  viewBox="0 0 16 16"
                  width="13"
                  height="13"
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M1.75 2.5A1.75 1.75 0 0 1 3.5.75h3.1c.46 0 .9.18 1.24.51l.65.65c.1.1.24.16.38.16h3.63a1.75 1.75 0 0 1 1.75 1.75v7.93a1.75 1.75 0 0 1-1.75 1.75h-9a1.75 1.75 0 0 1-1.75-1.75V2.5Zm1.75-.25a.25.25 0 0 0-.25.25v9.25c0 .14.11.25.25.25h9a.25.25 0 0 0 .25-.25V3.82a.25.25 0 0 0-.25-.25H8.87a1.75 1.75 0 0 1-1.24-.51l-.65-.65a.25.25 0 0 0-.18-.07H3.5Z"
                  />
                </svg>
                <strong className="truncate">
                  {repo?.name ?? "Sin repositorio"}
                </strong>
              </div>
            )}
          </div>
          <button
            type="button"
            className="repo-tab-add"
            disabled={locked}
            aria-label="Abrir"
            title={openDescription}
            aria-describedby={
              hint === openDescription ? "command-help" : undefined
            }
            onFocus={() => setHint(openDescription)}
            onBlur={() => setHint("")}
            onMouseEnter={() => setHint(openDescription)}
            onClick={() => {
              if (!locked) onOpen();
            }}
          >
            <PlusIcon aria-hidden="true" />
          </button>
        </div>
        {(onLibrary ||
          onAppearance ||
          onCommandPalette ||
          onQuickGuide ||
          onToggleSimpleMode) && (
          <div className="header-utilities">
            {onToggleSimpleMode && (
              <button
                type="button"
                className={`header-mode-btn${simpleMode ? " active" : ""}`}
                disabled={locked}
                aria-pressed={!!simpleMode}
                aria-label={
                  simpleMode ? "Modo Simple activo" : "Activar Modo Simple"
                }
                title={
                  simpleMode
                    ? "Modo Simple activo: pulsa para volver a Modo Completo"
                    : "Modo Simple: oculta herramientas avanzadas para enfocarte en cambios, commits y sincronización"
                }
                onClick={() => {
                  if (!locked) onToggleSimpleMode();
                }}
              >
                {simpleMode ? "Simple" : "Completo"}
              </button>
            )}
            {onCommandPalette && (
              <button
                type="button"
                className="header-kbd-btn"
                disabled={locked}
                aria-label="Paleta de comandos"
                title="Abrir paleta de comandos (⌘K / Ctrl+K)"
                onClick={() => {
                  if (!locked) onCommandPalette();
                }}
              >
                <kbd>⌘K</kbd>
              </button>
            )}
            {onAppearance && (
              <button
                type="button"
                className="header-appearance-btn"
                disabled={locked}
                aria-label="Apariencia"
                title="Ajustes de apariencia y colores"
                onClick={() => {
                  if (!locked) onAppearance();
                }}
              >
                <svg
                  viewBox="0 0 16 16"
                  width="13"
                  height="13"
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M8 1.5a6.5 6.5 0 1 0 0 13 1.4 1.4 0 0 0 1.3-1.9c-.2-.5-.1-1 .3-1.3.4-.3.9-.3 1.4-.3H12a2.5 2.5 0 0 0 2.5-2.5C14.5 4.4 11.6 1.5 8 1.5Zm-3 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm2-3a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm3.5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
                  />
                </svg>
                <span className="header-appearance-label">Apariencia</span>
                {themeSwatches && themeSwatches.length > 0 && (
                  <span className="appearance-swatches" aria-hidden="true">
                    {themeSwatches.map((hex) => (
                      <span
                        key={hex}
                        className="appearance-swatch-dot"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </span>
                )}
              </button>
            )}
            {onLibrary && (
              <button
                type="button"
                className="header-icon-btn"
                disabled={locked}
                aria-label="Biblioteca de repositorios"
                title="Biblioteca de repositorios"
                onClick={() => {
                  if (!locked) onLibrary();
                }}
              >
                <svg
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M2.25 2.5A1.25 1.25 0 0 1 3.5 1.25H7a1.5 1.5 0 0 1 1 .38 1.5 1.5 0 0 1 1-.38h3.5a1.25 1.25 0 0 1 1.25 1.25v9.75a1.25 1.25 0 0 1-1.25 1.25H9a1.25 1.25 0 0 0-1 .5 1.25 1.25 0 0 0-1-.5H3.5a1.25 1.25 0 0 1-1.25-1.25V2.5Zm1.5 0v9.5H7c.35 0 .68.12.95.33V2.75A.5.5 0 0 0 7.45 2.5H3.75Zm5.55 9.83c.27-.21.6-.33.95-.33h2.25V2.5H9.8a.5.5 0 0 0-.5.25v9.58Z"
                  />
                </svg>
              </button>
            )}
            {onQuickGuide && (
              <button
                type="button"
                className="header-icon-btn"
                disabled={locked}
                aria-label="Guía rápida de RavenGit"
                title="Guía rápida de RavenGit"
                onClick={() => {
                  if (!locked) onQuickGuide();
                }}
              >
                <QuestionMarkCircledIcon aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="header-toolbar">
        <div className="toolbar-left">
          <div
            className="toolbar-branch"
            title={repo?.branch ?? repo?.head ?? "Sin commits"}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path
                fill="currentColor"
                d="M5 3.25a1.75 1.75 0 1 1-1 1.58V9.2a1.75 1.75 0 1 1-1.5 0V4.83A1.75 1.75 0 0 1 5 3.25Zm6 0a1.75 1.75 0 1 1-1 1.58v1.02A2.9 2.9 0 0 1 7.1 8.75H5.5a1.4 1.4 0 0 0-1.4 1.4v.02a1.75 1.75 0 1 1-1.6 0v-.02A2.9 2.9 0 0 1 5.4 7.25h1.7a1.4 1.4 0 0 0 1.4-1.4V4.83A1.75 1.75 0 0 1 11 3.25Z"
              />
            </svg>
            <span className="truncate">{branchText}</span>
          </div>
        </div>

        <div
          className="toolbar-center command-strip"
          role="group"
          aria-label="Comandos Git básicos"
        >
          {visibleActions.map((action, index) => {
            const unavailable = !action.run || !!(action.needsRepo && !repo);
            const description = locked
              ? "Hay una operación en curso. Espera a que termine."
              : !action.run
                ? action.description
                : action.needsRepo && !repo
                  ? "Abre un repositorio para utilizar esta acción."
                  : action.description;
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                className={`command-action ${action.accent ? "command-accent" : ""} ${index > 0 && action.group !== visibleActions[index - 1].group ? "command-group-start" : ""}`}
                disabled={locked}
                aria-disabled={unavailable || locked}
                aria-label={action.label}
                title={description}
                aria-describedby={
                  hint === description ? "command-help" : undefined
                }
                onFocus={() => setHint(description)}
                onBlur={() => setHint("")}
                onMouseEnter={() => setHint(description)}
                onClick={() => {
                  if (!unavailable && !locked) action.run?.();
                }}
              >
                <Icon />
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>

        <div className="toolbar-right">{externalSlot}</div>
      </div>

      {hint && (
        <div id="command-help" className="command-help" role="tooltip">
          {hint}
        </div>
      )}
    </header>
  );
}
