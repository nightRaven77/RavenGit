import { useEffect, useMemo, useState } from "react";
import { LockClosedIcon, OpenInNewWindowIcon } from "@radix-ui/react-icons";
import {
  AnimBranchIcon,
  AnimChangesIcon,
  AnimHistoryIcon,
  AnimRemoteIcon,
  AnimSearchIcon,
  AnimSyncIcon,
  AnimTagIcon,
  AnimToolsIcon,
  AnimWorktreeIcon,
} from "./AnimatedIcons";
import { refName, type RepoView } from "./appHelpers";
import type {
  GitRef,
  Snapshot,
  UndoState,
  WorktreeItem,
  WorktreeSummary,
} from "./types";

export interface SidebarProps {
  repo: Snapshot | null;
  tabs: readonly { snapshot: Snapshot }[];
  view: RepoView;
  lastSyncView: "remotes" | "pull" | "push";
  syncing: boolean;
  commitsCount: number;
  wip: WorktreeSummary | null;
  branches: GitRef[];
  remotes: GitRef[];
  tags: GitRef[];
  worktrees: WorktreeItem[];
  busy: boolean;
  loadingMore: boolean;
  writing: boolean;
  undoBusy: boolean;
  undoState: UndoState | null;
  simpleMode?: boolean;
  onToggleSimpleMode?: () => void;
  onOpenLibrary: () => void;
  onCreateRepo: (mode: "initialize" | "clone") => void;
  onSelectView: (view: RepoView) => void;
  onGoSync: (view: "remotes" | "pull" | "push") => void;
  onOpenRestore: () => void;
  onOpenTagTarget: (hash: string) => void;
  onOpenTagPublication: () => void;
  onOpenReplay: () => void;
  onOpenWorktrees: () => void;
  onOpenActivity: () => void;
  onOpenAppearance: () => void;
  onOpenSnapshots: () => void;
  onOpenLfsSubmodules: () => void;
  onOpenPullRequests?: () => void;
  prCount?: number;
  onOpenUndo: (direction: "undo" | "redo") => void;
  onOpenEnvironment: () => void;
  onOpenShortcuts: () => void;
  onOpenQuickGuide?: () => void;
  onJumpToHash: (hash: string) => void;
  onOpenRefContextMenu: (refItem: GitRef, x: number, y: number) => void;
  onOpenRepositoryPath: (path: string) => void;
  onOpenWorktreeContextMenu: (wt: WorktreeItem, x: number, y: number) => void;
}

export default function Sidebar({
  repo,
  tabs,
  view,
  lastSyncView,
  syncing,
  commitsCount,
  wip,
  branches,
  remotes,
  tags,
  worktrees,
  busy,
  loadingMore,
  writing,
  undoBusy,
  undoState,
  simpleMode = false,
  onToggleSimpleMode,
  onOpenLibrary,
  onCreateRepo,
  onSelectView,
  onGoSync,
  onOpenRestore,
  onOpenTagTarget,
  onOpenTagPublication,
  onOpenReplay,
  onOpenWorktrees,
  onOpenActivity,
  onOpenAppearance,
  onOpenSnapshots,
  onOpenLfsSubmodules,
  onOpenPullRequests,
  prCount = 0,
  onOpenUndo,
  onOpenEnvironment,
  onOpenShortcuts,
  onOpenQuickGuide,
  onJumpToHash,
  onOpenRefContextMenu,
  onOpenRepositoryPath,
  onOpenWorktreeContextMenu,
}: SidebarProps) {
  const [refFilter, setRefFilter] = useState("");
  useEffect(() => {
    setRefFilter("");
  }, [repo?.id]);

  const normalizedFilter = useMemo(
    () =>
      refFilter
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase(),
    [refFilter],
  );
  const hasFilter = normalizedFilter.length > 0;
  const matchesText = (value: string) =>
    !hasFilter ||
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .includes(normalizedFilter);

  const filteredBranches = useMemo(
    () => branches.filter((r) => matchesText(refName(r.name))),
    [branches, normalizedFilter],
  );
  const filteredRemotes = useMemo(
    () => remotes.filter((r) => matchesText(refName(r.name))),
    [remotes, normalizedFilter],
  );
  const filteredTags = useMemo(
    () => tags.filter((r) => matchesText(refName(r.name))),
    [tags, normalizedFilter],
  );
  const filteredWorktrees = useMemo(
    () =>
      worktrees.filter(
        (wt) =>
          matchesText(wt.name) ||
          (wt.branch ? matchesText(wt.branch) : false) ||
          matchesText(wt.path),
      ),
    [worktrees, normalizedFilter],
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-repo-controls">
        <button
          className="library-launcher"
          onClick={onOpenLibrary}
          disabled={busy || loadingMore || writing}
        >
          Repositorios <span aria-hidden="true">▾</span>
        </button>
        <div className="sidebar-quick-create">
          <button
            className="button sidebar-create"
            disabled={busy || loadingMore || writing}
            onClick={() => onCreateRepo("initialize")}
          >
            Nuevo repositorio…
          </button>
          <button
            className="button sidebar-create"
            disabled={busy || loadingMore || writing}
            onClick={() => onCreateRepo("clone")}
          >
            Clonar repositorio…
          </button>
        </div>
      </div>
      <div className="section-label">ESPACIO LOCAL</div>
      <div className="workspace-name">
        <OpenInNewWindowIcon />
        <span>{repo?.name ?? "Tu primer repositorio"}</span>
      </div>
      {repo && (
        <div className="repo-path" title={repo.path}>
          {repo.path}
        </div>
      )}
      <nav className="repo-navigation" aria-label="Vistas del repositorio">
        <button
          disabled={!repo || writing}
          aria-current={view === "changes" ? "page" : undefined}
          className={view === "changes" ? "nav-active" : "nav-button"}
          onClick={() => onSelectView("changes")}
        >
          <AnimChangesIcon width={14} height={14} />
          Cambios
          {wip?.trusted && wip.total > 0 && <span>{wip.total}</span>}
        </button>
        <button
          disabled={writing}
          aria-current={view === "history" ? "page" : undefined}
          className={view === "history" ? "nav-active" : "nav-button"}
          onClick={() => onSelectView("history")}
        >
          <AnimHistoryIcon width={14} height={14} />
          Historial<span>{commitsCount || "—"}</span>
        </button>
        <button
          disabled={!repo || writing}
          aria-current={syncing ? "page" : undefined}
          className={syncing ? "nav-active" : "nav-button"}
          onClick={() => onGoSync(lastSyncView)}
        >
          <AnimSyncIcon width={14} height={14} />
          Sincronizar
        </button>
      </nav>
      {simpleMode ? (
        <div className="sidebar-simple-actions">
          {repo && undoState?.canUndo && (
            <button
              className="nav-button"
              disabled={writing || undoBusy}
              onClick={() => onOpenUndo("undo")}
            >
              Deshacer operación…
            </button>
          )}
          <button className="nav-button" onClick={onOpenShortcuts}>
            Atajos de teclado…
          </button>
          {onOpenQuickGuide && (
            <button className="nav-button" onClick={onOpenQuickGuide}>
              Guía rápida…
            </button>
          )}
          {onToggleSimpleMode && (
            <button className="nav-button" onClick={onToggleSimpleMode}>
              Cambiar a Modo Completo
            </button>
          )}
        </div>
      ) : (
        <details
          className="workspace-tools"
          open={view === "branches" || undefined}
        >
          <summary>
            <AnimToolsIcon width={13} height={13} />
            Herramientas
          </summary>
          <nav
            className="repo-navigation"
            aria-label="Herramientas del repositorio"
          >
            <button
              className="nav-button"
              disabled={!repo || writing}
              onClick={(event) => {
                event.currentTarget.focus();
                onOpenRestore();
              }}
            >
              Recuperar respaldo de conflicto…
            </button>
            <button
              className="nav-button"
              disabled={!repo?.head || writing}
              onClick={() => repo?.head && onOpenTagTarget(repo.head)}
            >
              Crear etiqueta…
            </button>
            <button
              className="nav-button"
              disabled={!repo || writing}
              onClick={onOpenTagPublication}
            >
              Publicar etiqueta…
            </button>
            <button
              className="nav-button"
              disabled={!repo || writing}
              onClick={onOpenReplay}
            >
              Operaciones de commit
            </button>
            <button
              disabled={!repo || writing}
              aria-current={view === "branches" ? "page" : undefined}
              className={view === "branches" ? "nav-active" : "nav-button"}
              onClick={() => onSelectView("branches")}
            >
              Ramas
            </button>
            <button
              className="nav-button"
              disabled={!repo || writing}
              onClick={onOpenWorktrees}
            >
              Worktrees…
            </button>
            <button
              className="nav-button"
              disabled={writing}
              onClick={onOpenActivity}
            >
              Actividad y diagnóstico…
            </button>
            <button
              className="nav-button"
              disabled={writing}
              onClick={onOpenAppearance}
            >
              Apariencia y colores…
            </button>
            <button
              className="nav-button"
              disabled={!repo || writing}
              onClick={onOpenSnapshots}
            >
              Snapshots locales…
            </button>
            <button
              className="nav-button"
              disabled={!repo || writing}
              onClick={onOpenLfsSubmodules}
            >
              Git LFS y Submódulos…
            </button>
            {onOpenPullRequests && (
              <button
                className="nav-button"
                disabled={!repo || writing}
                onClick={onOpenPullRequests}
              >
                Pull Requests / MRs…
                {prCount > 0 && <span>{prCount}</span>}
              </button>
            )}
            <button
              className="nav-button"
              disabled={!repo || writing || undoBusy || !undoState?.canUndo}
              title={
                undoState?.nextUndo
                  ? `${undoState.nextUndo.label} (⌘Z)`
                  : "Sin operaciones recientes para deshacer"
              }
              onClick={() => onOpenUndo("undo")}
            >
              Deshacer operación…
            </button>
            <button
              className="nav-button"
              disabled={!repo || writing || undoBusy || !undoState?.canRedo}
              title={
                undoState?.nextRedo
                  ? `${undoState.nextRedo.label} (⇧⌘Z)`
                  : "Sin operaciones para rehacer"
              }
              onClick={() => onOpenUndo("redo")}
            >
              Rehacer operación…
            </button>
            <button
              className="nav-button"
              disabled={writing}
              onClick={onOpenEnvironment}
            >
              Entorno y motor Git…
            </button>
            <button className="nav-button" onClick={onOpenShortcuts}>
              Atajos de teclado…
            </button>
            {onOpenQuickGuide && (
              <button className="nav-button" onClick={onOpenQuickGuide}>
                Guía rápida…
              </button>
            )}
          </nav>
        </details>
      )}
      {repo && (
        <div className="sidebar-filter">
          <AnimSearchIcon width={13} height={13} />
          <input
            type="text"
            value={refFilter}
            aria-label="Filtrar ramas y referencias"
            placeholder="Filtrar ramas, tags…"
            onChange={(event) => setRefFilter(event.target.value)}
          />
          {refFilter && (
            <button
              type="button"
              className="sidebar-filter-clear"
              aria-label="Limpiar filtro lateral"
              onClick={() => setRefFilter("")}
            >
              ×
            </button>
          )}
        </div>
      )}
      <div className="sidebar-sections">
        {(simpleMode
          ? [
              {
                label: "RAMAS LOCALES",
                refs: filteredBranches,
                Icon: AnimBranchIcon,
              },
            ]
          : [
              {
                label: "RAMAS LOCALES",
                refs: filteredBranches,
                Icon: AnimBranchIcon,
              },
              {
                label: "REFERENCIAS REMOTAS",
                refs: filteredRemotes,
                Icon: AnimRemoteIcon,
              },
              {
                label: "ETIQUETAS",
                refs: filteredTags,
                Icon: AnimTagIcon,
              },
            ]
        ).map((group) => {
          const renderRefButton = (r: GitRef, prefix?: string) => {
            const shortName = refName(r.name);
            const leaf = prefix
              ? shortName.slice(prefix.length + 1)
              : shortName;
            return (
              <button
                className="branch-button"
                disabled={writing}
                key={r.name}
                onClick={() => onJumpToHash(r.hash)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onOpenRefContextMenu(r, event.clientX, event.clientY);
                }}
                title={`Localizar ${shortName} en el historial; no cambia la rama activa`}
              >
                <span className={`branch-dot ${r.kind}`} />
                <span className="truncate">
                  {prefix ? (
                    <>
                      <span className="branch-prefix">{prefix}/</span>
                      {leaf}
                    </>
                  ) : (
                    shortName
                  )}
                </span>
                {shortName === repo?.branch && (
                  <span className="current-indicator">actual</span>
                )}
              </button>
            );
          };
          const renderLocalBranches = () => {
            const root: GitRef[] = [];
            const folders = new Map<string, GitRef[]>();
            for (const ref of group.refs) {
              const name = refName(ref.name);
              const slash = name.indexOf("/");
              if (slash > 0) {
                const prefix = name.slice(0, slash);
                const bucket = folders.get(prefix);
                if (bucket) bucket.push(ref);
                else folders.set(prefix, [ref]);
              } else {
                root.push(ref);
              }
            }
            return (
              <>
                {root.map((r) => renderRefButton(r))}
                {[...folders.entries()].map(([prefix, items]) => (
                  <details key={prefix} className="branch-folder" open>
                    <summary className="branch-folder-summary">
                      {prefix}
                      <span>{items.length}</span>
                    </summary>
                    <div className="branch-folder-items">
                      {items.map((r) => renderRefButton(r, prefix))}
                    </div>
                  </details>
                ))}
              </>
            );
          };
          const GroupIcon = group.Icon;
          return (
            <details
              key={group.label}
              open={
                group.label === "RAMAS LOCALES" ||
                (hasFilter && group.refs.length > 0)
              }
            >
              <summary>
                <span className="sidebar-summary-label">
                  <GroupIcon width={12} height={12} />
                  {group.label}
                </span>
                <span>{group.refs.length}</span>
              </summary>
              {group.refs.length ? (
                group.label === "RAMAS LOCALES" ? (
                  renderLocalBranches()
                ) : (
                  group.refs.map((r) => renderRefButton(r))
                )
              ) : (
                <p className="sidebar-empty">
                  {repo
                    ? hasFilter
                      ? "Sin coincidencias"
                      : "Sin referencias"
                    : "Abre un repositorio"}
                </p>
              )}
            </details>
          );
        })}
        {!simpleMode && (
          <details
            open={
              worktrees.length > 1 ||
              (hasFilter && filteredWorktrees.length > 0)
            }
          >
            <summary>
              <span className="sidebar-summary-label">
                <AnimWorktreeIcon width={12} height={12} />
                WORKTREES
              </span>
              <span>{filteredWorktrees.length}</span>
            </summary>
            {repo ? (
              <>
                {filteredWorktrees.length > 0 ? (
                  filteredWorktrees.map((wt) => {
                    const isOpenTab = tabs.some(
                      (tab) => tab.snapshot.path === wt.path,
                    );
                    const subtitle = wt.branch
                      ? wt.branch
                      : wt.bare
                        ? "bare"
                        : wt.detached
                          ? "HEAD separado"
                          : "sin rama";
                    return (
                      <button
                        key={wt.path}
                        type="button"
                        className={`branch-button worktree-item ${wt.current ? "current" : ""}`}
                        disabled={writing || wt.current || wt.prunable}
                        title={`${wt.path} · ${subtitle}${wt.locked ? " (bloqueado)" : ""}${wt.prunable ? " (obsoleto)" : ""}`}
                        onClick={() => {
                          if (!wt.current && !wt.prunable) {
                            onOpenRepositoryPath(wt.path);
                          }
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          onOpenWorktreeContextMenu(
                            wt,
                            event.clientX,
                            event.clientY,
                          );
                        }}
                      >
                        <span
                          className={`branch-dot ${wt.prunable ? "other" : wt.current ? "branch" : "remote"}`}
                        />
                        <span className="truncate">{wt.name}</span>
                        <span className="worktree-side-meta">
                          {wt.current
                            ? "actual"
                            : wt.locked
                              ? "bloq."
                              : wt.prunable
                                ? "obsoleto"
                                : isOpenTab
                                  ? "abierto"
                                  : subtitle}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="sidebar-empty">Sin coincidencias</p>
                )}
                <div className="sidebar-worktree-actions">
                  <button
                    type="button"
                    className="nav-button"
                    disabled={writing}
                    onClick={onOpenWorktrees}
                  >
                    Nuevo worktree…
                  </button>
                  <button
                    type="button"
                    className="nav-button"
                    disabled={writing}
                    onClick={onOpenWorktrees}
                  >
                    Gestionar…
                  </button>
                </div>
              </>
            ) : (
              <p className="sidebar-empty">Abre un repositorio</p>
            )}
          </details>
        )}
      </div>
      <div className="sidebar-foot">
        <LockClosedIcon />
        <p>Control local. Conexiones sólo cuando las solicitas.</p>
      </div>
    </aside>
  );
}
