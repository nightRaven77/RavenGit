import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowRightIcon,
  CommitIcon,
  ExclamationTriangleIcon,
  FileTextIcon,
  OpenInNewWindowIcon,
  MagnifyingGlassIcon,
  LockClosedIcon,
} from "@radix-ui/react-icons";
import { layoutGraph, graphPixelWidth } from "./graph";
import GraphCell from "./GraphCell";
import type {
  CommitDiff,
  CommitFile,
  CommitFiles,
  GitRef,
  HistoryPage,
  Snapshot,
} from "./types";
import "./themes.css";
import "./App.css";
import "./workspace.css";
import {
  DEFAULT_APP_SETTINGS,
  THEMES,
  applyAppearance,
  isGraphPaletteId,
  isThemeId,
  loadCachedAppearance,
  resolveGraphColors,
  type AppSettings,
  type ExternalAppsState,
  type ExternalPreferences,
  type GraphPaletteId,
  type ThemeId,
} from "./themes";
import OpenExternalMenu from "./OpenExternalMenu";
import AppearanceDialog from "./AppearanceDialog";
import AuthorAvatar from "./AuthorAvatar";
import LibraryDialog from "./LibraryDialog";
import InitializeDialog from "./InitializeDialog";
import type { RepositoryLibrary, HistoryPreferences } from "./library";
import ChangesPanel from "./ChangesPanel";
import RemotesPanel from "./RemotesPanel";
import PushPanel from "./PushPanel";
import OperationNotice, { type OperationResult } from "./OperationNotice";
import PullPanel from "./PullPanel";
import CommandBar from "./CommandBar";
import BranchesPanel from "./BranchesPanel";
import DiffViewer, { DiffModeControl } from "./DiffViewer";
import StashDialog from "./StashDialog";
import ConflictRestoreDialog from "./ConflictRestoreDialog";
import ReplayDialog, { type ReplayTarget } from "./ReplayDialog";
import TagDialog from "./TagDialog";
import TagPublishDialog from "./TagPublishDialog";
import ActivityDialog from "./ActivityDialog";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";
import CommandPalette, { type PaletteCommand } from "./CommandPalette";
import {
  operationEvent,
  type OperationKey,
  type OperationReport,
  type OperationStatus,
} from "./operations";
function formatCommitDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin fecha"
    : date.toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}
const rowHeight = 42;
const short = (s: string) => s.slice(0, 8);
const refName = (s: string) => s.replace(/^refs\/(heads|remotes|tags)\//, "");
function errorText(error: unknown): string {
  if (typeof error === "object" && error && "message" in error)
    return String(error.message);
  return "No se pudo completar la lectura. Vuelve a intentarlo.";
}
function RefBadgeIcon({
  kind,
}: {
  kind: "branch" | "remote" | "tag" | "other";
}) {
  if (kind === "remote") {
    return (
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path
          fill="currentColor"
          d="M3.6 9.5h5a2.1 2.1 0 0 0 .3-4.18A2.8 2.8 0 0 0 3.5 4.7a2.3 2.3 0 0 0 .1 4.8Z"
        />
      </svg>
    );
  }
  if (kind === "tag") {
    return (
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path
          fill="currentColor"
          d="M1.8 2.3A.8.8 0 0 1 2.6 1.5h3.1l4.4 4.4a.8.8 0 0 1 0 1.1L7 10.1a.8.8 0 0 1-1.1 0L1.5 5.7V2.6a.8.8 0 0 1 .3-.3Zm2 1.8a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        d="M3.5 2.5v7M8.5 3.5c0 2.5-5 1.8-5 4.2"
      />
      <circle cx="3.5" cy="2.4" r="1.2" fill="currentColor" />
      <circle cx="8.5" cy="2.8" r="1.2" fill="currentColor" />
      <circle cx="3.5" cy="9.6" r="1.2" fill="currentColor" />
    </svg>
  );
}
function App() {
  const [theme, setTheme] = useState<ThemeId>(
    () => loadCachedAppearance().theme,
  );
  const [graphPalette, setGraphPalette] = useState<GraphPaletteId>(
    () => loadCachedAppearance().graphPalette,
  );
  const [externalPreferences, setExternalPreferences] =
    useState<ExternalPreferences>(DEFAULT_APP_SETTINGS.external);
  const [externalApps, setExternalApps] = useState<ExternalAppsState | null>(
    null,
  );
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [repo, setRepo] = useState<Snapshot | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [preferencesRepo, setPreferencesRepo] = useState<string | null>(null);
  const [preferenceSave, setPreferenceSave] = useState<
    "pending" | "saved" | "failed"
  >("saved");
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [view, setView] = useState<
    "history" | "changes" | "remotes" | "push" | "branches" | "pull"
  >("history");
  const [lastSyncView, setLastSyncView] = useState<"remotes" | "pull" | "push">(
    "remotes",
  );
  const syncing = ["remotes", "pull", "push"].includes(view);
  function goSync(next: "remotes" | "pull" | "push") {
    setLastSyncView(next);
    setView(next);
  }
  const [writing, setWriting] = useState(false);
  const [creation, setCreation] = useState<"initialize" | "clone" | null>(null);
  const [tagTarget, setTagTarget] = useState<string | null>(null);
  const [tagPublication, setTagPublication] = useState<
    string | null | undefined
  >(undefined);
  const [operationResults, setOperationResults] = useState<OperationResult[]>(
    [],
  );
  const [activityOpen, setActivityOpen] = useState(false);
  const [stashOpen, setStashOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [changesRevision, setChangesRevision] = useState(0);
  const [replay, setReplay] = useState<ReplayTarget | null | undefined>(
    undefined,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [parentIndex, setParentIndex] = useState(0);
  const [commitFiles, setCommitFiles] = useState<CommitFile[] | null>(null);
  const [filesBusy, setFilesBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<CommitFile | null>(null);
  const [commitIgnoreWhitespace, setCommitIgnoreWhitespace] = useState(false);
  const [commitContextLines, setCommitContextLines] = useState(3);
  const [diff, setDiff] = useState<CommitDiff | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [branchPreselect, setBranchPreselect] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    label: string;
    items: ContextMenuItem[];
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [loadingMore, setLoadingMore] = useState(false),
    [diffBusy, setDiffBusy] = useState(false);
  const [error, setError] = useState(""),
    [diffError, setDiffError] = useState(""),
    [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const filtering = query !== deferredQuery;
  const [historyScope, setHistoryScope] = useState("all");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorSize, setInspectorSize] = useState(38);
  const [authorWidth, setAuthorWidth] = useState(160);
  const [showHash, setShowHash] = useState(false);
  const [showDate, setShowDate] = useState(true);
  const request = useRef(0),
    filesRequest = useRef(0),
    diffRequest = useRef(0);
  const scroll = useRef<HTMLDivElement>(null);
  const restoreSelectionPosition = useRef(false);
  const tableHeading = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const commits = repo?.page.commits ?? [];
  const rows = useMemo(() => layoutGraph(commits), [commits]);
  const graphWidth = useMemo(() => graphPixelWidth(rows), [rows]);
  const graphColors = useMemo(
    () => resolveGraphColors(graphPalette, theme),
    [graphPalette, theme],
  );
  useEffect(() => {
    applyAppearance(theme, graphPalette);
  }, [theme, graphPalette]);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    void invoke<AppSettings>("read_app_settings")
      .then((loaded) => {
        if (!active || !loaded) return;
        if (isThemeId(loaded.theme)) setTheme(loaded.theme);
        if (isGraphPaletteId(loaded.graphPalette))
          setGraphPalette(loaded.graphPalette);
        if (loaded.external) setExternalPreferences(loaded.external);
      })
      .catch(() => {});
    void invoke<ExternalAppsState>("read_external_apps")
      .then((detected) => {
        if (active && detected) setExternalApps(detected);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  async function reloadExternalApps() {
    if (!isTauri()) return;
    const detected = await invoke<ExternalAppsState>("read_external_apps");
    if (detected) setExternalApps(detected);
  }
  async function persistSettings(next: AppSettings) {
    if (!isTauri()) return;
    await invoke<AppSettings>("save_app_settings", { settings: next });
  }
  function changeAppearance(nextTheme: ThemeId, nextPalette: GraphPaletteId) {
    setTheme(nextTheme);
    setGraphPalette(nextPalette);
    applyAppearance(nextTheme, nextPalette);
    void persistSettings({
      version: 1,
      theme: nextTheme,
      graphPalette: nextPalette,
      external: externalPreferences,
    }).catch((reason) =>
      setNotice(
        `No se pudo guardar la apariencia en disco: ${errorText(reason)}`,
      ),
    );
  }
  async function saveExternalPreferences(nextExternal: ExternalPreferences) {
    setExternalPreferences(nextExternal);
    setExternalApps((current) =>
      current ? { ...current, preferences: nextExternal } : current,
    );
    await persistSettings({
      version: 1,
      theme,
      graphPalette,
      external: nextExternal,
    });
    await reloadExternalApps();
  }
  const historyColumns = `${graphWidth}px minmax(240px,1fr) ${authorWidth}px${showDate ? " 90px" : ""}${showHash ? " 80px" : ""}`;
  const historyMinWidth =
    graphWidth + 240 + authorWidth + (showDate ? 90 : 0) + (showHash ? 80 : 0);
  const searchIndex = useMemo(
    () =>
      commits.map((commit) =>
        `${commit.hash} ${commit.subject} ${commit.author}`.toLocaleLowerCase(),
      ),
    [commits],
  );
  const normalizedQuery = deferredQuery.toLocaleLowerCase();

  function rememberResult(
    result: OperationResult,
    operation: OperationKey,
    repoId: string | undefined,
  ) {
    setOperationResults((current) => [
      result,
      ...current.filter((item) => item.id !== result.id),
    ]);
    if (result.status === "progress") return;
    const status: Exclude<OperationStatus, "progress"> =
      result.status === "confirmed" ||
      result.status === "unchanged" ||
      result.status === "warning" ||
      result.status === "uncertain"
        ? result.status
        : "error";
    void invoke("record_activity", {
      id: repoId ?? null,
      input: { operation, status },
    }).catch(() =>
      setNotice(
        "La operación terminó, pero no se pudo guardar en Actividad. Git no se modificó por este fallo.",
      ),
    );
  }

  useEffect(() => {
    const receive = (event: Event) => {
      const report = (event as CustomEvent<OperationReport>).detail;
      if (!report) return;
      const current = repo && report.repoId === repo.id;
      rememberResult(
        {
          id: report.id,
          status: report.status,
          title: report.title,
          repository: current ? repo.name : "Repositorio local",
          path: current ? repo.path : "",
          destination: report.destination ?? "Operación local",
          message: report.message,
          warning: report.warning,
        },
        report.operation,
        report.repoId,
      );
    };
    window.addEventListener(operationEvent, receive);
    return () => window.removeEventListener(operationEvent, receive);
  }, [repo]);
  const visible = useMemo(
    () =>
      normalizedQuery
        ? searchIndex.flatMap((text, index) =>
            text.includes(normalizedQuery) ? [index] : [],
          )
        : [],
    [searchIndex, normalizedQuery],
  );
  const virtual = useVirtualizer({
    count: query ? visible.length : commits.length,
    getItemKey: (index) =>
      query ? `search-${commits[visible[index]].hash}` : commits[index].hash,
    getScrollElement: () => scroll.current,
    estimateSize: () => (query ? 64 : rowHeight),
    overscan: 12,
  });
  const active = commits.find((c) => c.hash === selected);
  const branches = repo?.refs.filter((r) => r.kind === "branch") ?? [];
  const remotes = repo?.refs.filter((r) => r.kind === "remote") ?? [];
  const tags = repo?.refs.filter((r) => r.kind === "tag") ?? [];
  useEffect(() => {
    if (!restoreSelectionPosition.current || view !== "history" || !repo)
      return;
    if (query) {
      restoreSelectionPosition.current = false;
      return;
    }
    const index = repo.page.commits.findIndex(
      (commit) => commit.hash === selected,
    );
    if (index < 0) return;
    const frame = requestAnimationFrame(() => {
      restoreSelectionPosition.current = false;
      virtual.scrollToIndex(index, { align: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [repo?.id, view, preferencesRepo]);
  function select(hash: string) {
    setSelected(hash);
    setParentIndex(0);
    setSelectedFile(null);
  }
  function currentPreferences(): HistoryPreferences {
    return {
      inspectorOpen,
      inspectorSize,
      authorWidth,
      showDate,
      showHash,
      scope: historyScope,
      query,
      selectedCommit: selected || null,
    };
  }
  async function choose(knownPath?: string) {
    if (!isTauri()) {
      setError(
        "Abre la aplicación de escritorio para seleccionar un repositorio. Esta vista de navegador no tiene acceso a Git.",
      );
      return false;
    }
    const token = ++request.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const path =
        knownPath ??
        (await open({
          directory: true,
          multiple: false,
          title: "Abrir repositorio Git",
        }));
      if (!path) return false;
      if (repo && preferencesRepo === repo.id) {
        try {
          await invoke("save_history_preferences", {
            id: repo.id,
            preferences: currentPreferences(),
          });
        } catch (reason) {
          if (token === request.current)
            setNotice(
              `No se guardaron las preferencias anteriores: ${errorText(reason)}`,
            );
        }
      }
      setPreferencesRepo(null);
      let next = await invoke<Snapshot>("open_repository", { path });
      let saved: HistoryPreferences | undefined;
      let remembered = false;
      try {
        const library = await invoke<RepositoryLibrary>("remember_repository", {
          id: next.id,
        });
        saved = library.repositories.find(
          (entry) => entry.path === next.path,
        )?.preferences;
        remembered = true;
      } catch (reason) {
        if (token === request.current)
          setNotice(
            `El repositorio se abrió, pero no se guardará en la biblioteca: ${errorText(reason)}`,
          );
      }
      let restoredScope = saved?.scope ?? "all";
      if (restoredScope !== "all") {
        const available =
          restoredScope === "HEAD"
            ? !!next.head
            : next.refs.some((ref) => ref.name === restoredScope);
        if (available) {
          try {
            next = await invoke<Snapshot>("refresh_repository", {
              id: next.id,
              scope: restoredScope,
            });
          } catch {
            restoredScope = "all";
            if (token === request.current)
              setNotice(
                "No se pudo restaurar el filtro guardado. Se muestra Todas las referencias.",
              );
          }
        } else {
          restoredScope = "all";
          if (token === request.current)
            setNotice(
              "La referencia guardada ya no existe. Se muestra Todas las referencias.",
            );
        }
      }
      if (token !== request.current) return false;
      if (
        saved?.selectedCommit &&
        !next.page.commits.some((c) => c.hash === saved.selectedCommit)
      )
        setNotice(
          "La selección guardada está fuera de los primeros 200 commits. Se seleccionó un commit disponible.",
        );
      restoreSelectionPosition.current = !!saved?.selectedCommit;
      setTagTarget(null);
      setTagPublication(undefined);
      setSelectedFile(null);
      setCommitFiles(null);
      setBranchPreselect(null);
      setContextMenu(null);
      setRepo(next);
      setHistoryScope(restoredScope);
      setInspectorOpen(saved?.inspectorOpen ?? true);
      setInspectorSize(saved?.inspectorSize ?? 38);
      setAuthorWidth(saved?.authorWidth ?? 160);
      setShowDate(saved?.showDate ?? true);
      setShowHash(saved?.showHash ?? false);
      select(
        (next.page.commits.some((c) => c.hash === saved?.selectedCommit)
          ? saved!.selectedCommit
          : null) ??
          (next.page.commits.some((c) => c.hash === next.head)
            ? next.head
            : null) ??
          next.page.commits[0]?.hash ??
          "",
      );
      setQuery(saved?.query ?? "");
      setPreferencesRepo(remembered ? next.id : null);
      scroll.current?.scrollTo({ top: 0, left: 0 });
      return true;
    } catch (e) {
      if (token === request.current) {
        setError(errorText(e));
        setPreferencesRepo(preferencesRepo);
      }
      return false;
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!repo || preferencesRepo !== repo.id) return;
    let active = true;
    setPreferenceSave("pending");
    const timer = setTimeout(() => {
      void invoke("save_history_preferences", {
        id: repo.id,
        preferences: currentPreferences(),
      })
        .then(() => {
          if (active) setPreferenceSave("saved");
        })
        .catch((reason) => {
          if (active) {
            setPreferenceSave("failed");
            setNotice(`No se guardaron las preferencias: ${errorText(reason)}`);
          }
        });
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    repo?.id,
    preferencesRepo,
    saveAttempt,
    inspectorOpen,
    inspectorSize,
    authorWidth,
    showDate,
    showHash,
    historyScope,
    query,
    selected,
  ]);
  async function refresh(
    nextScope = historyScope,
    resetPosition = false,
    locateHead = false,
  ) {
    if (!repo) return false;
    const token = ++request.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await invoke<Snapshot>("refresh_repository", {
        id: repo.id,
        scope: nextScope,
      });
      if (token !== request.current) return false;
      setRepo(next);
      setHistoryScope(nextScope);
      if (resetPosition) {
        setQuery("");
        scroll.current?.scrollTo({ top: 0, left: 0 });
      }
      setSelected((current) =>
        locateHead && next.page.commits.some((c) => c.hash === next.head)
          ? next.head
          : next.page.commits.some((c) => c.hash === current)
            ? current
            : ((next.page.commits.some((c) => c.hash === next.head)
                ? next.head
                : null) ??
              next.page.commits[0]?.hash ??
              null),
      );
      setParentIndex(0);
      return true;
    } catch (e) {
      if (token === request.current) setError(errorText(e));
      return false;
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  async function more() {
    if (!repo || repo.page.nextOffset === null) return;
    const token = request.current;
    setLoadingMore(true);
    setError("");
    try {
      const page = await invoke<HistoryPage>("read_history", {
        id: repo.id,
        offset: repo.page.nextOffset,
        generation: repo.page.generation,
        scope: historyScope,
      });
      if (token !== request.current) return;
      setRepo((current) =>
        current?.id === repo.id
          ? {
              ...current,
              page: {
                ...page,
                commits: [...current.page.commits, ...page.commits],
              },
            }
          : current,
      );
    } catch (e) {
      if (token === request.current) setError(errorText(e));
    } finally {
      setLoadingMore(false);
    }
  }
  useEffect(() => {
    const token = ++filesRequest.current;
    setCommitFiles(null);
    if (!repo || !selected || view !== "history" || !inspectorOpen) {
      setFilesBusy(false);
      return;
    }
    setFilesBusy(true);
    invoke<CommitFiles>("read_commit_files", {
      id: repo.id,
      hash: selected,
      parentIndex,
    })
      .then((value) => {
        if (token !== filesRequest.current) return;
        setCommitFiles(value.files);
        setSelectedFile((current) =>
          current
            ? (value.files.find((item) => item.path === current.path) ?? null)
            : null,
        );
      })
      .catch(() => {
        if (token === filesRequest.current) setCommitFiles(null);
      })
      .finally(() => {
        if (token === filesRequest.current) setFilesBusy(false);
      });
    return () => {
      filesRequest.current++;
    };
  }, [
    repo?.id,
    repo?.page.generation,
    selected,
    parentIndex,
    view,
    inspectorOpen,
  ]);
  useEffect(() => {
    const token = ++diffRequest.current;
    setDiff(null);
    setDiffError("");
    if (!repo || !selected || view !== "history" || !inspectorOpen) {
      setDiffBusy(false);
      return;
    }
    setDiffBusy(true);
    const payload: Record<string, unknown> = {
      id: repo.id,
      hash: selected,
      parentIndex,
    };
    if (selectedFile) {
      payload.path = selectedFile.path;
      if (selectedFile.oldPath) payload.oldPath = selectedFile.oldPath;
    }
    if (commitIgnoreWhitespace) payload.ignoreWhitespace = true;
    if (commitContextLines !== 3) payload.contextLines = commitContextLines;
    invoke<CommitDiff>("read_commit_diff", payload)
      .then((value) => {
        if (token === diffRequest.current) setDiff(value);
      })
      .catch((e) => {
        if (token === diffRequest.current) setDiffError(errorText(e));
      })
      .finally(() => {
        if (token === diffRequest.current) setDiffBusy(false);
      });
    return () => {
      diffRequest.current++;
    };
  }, [
    repo?.id,
    repo?.page.generation,
    selected,
    parentIndex,
    selectedFile?.path,
    selectedFile?.oldPath,
    commitIgnoreWhitespace,
    commitContextLines,
    view,
    inspectorOpen,
  ]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      const lower = e.key.toLowerCase();
      const hasModalDialog = !!document.querySelector("dialog[open]");
      const target = e.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (lower === "k") {
        if (hasModalDialog && !paletteOpen) return;
        e.preventDefault();
        setContextMenu(null);
        if (!writing) setPaletteOpen((open) => !open);
        return;
      }
      if (hasModalDialog || paletteOpen) return;

      if (lower === "o") {
        e.preventDefault();
        if (!busy && !loadingMore && !writing) void choose();
      } else if (e.key === ",") {
        e.preventDefault();
        if (!writing) setAppearanceOpen(true);
      } else if (lower === "r") {
        if (!repo) return;
        e.preventDefault();
        if (!busy && !loadingMore && !writing) void refresh();
      } else if (lower === "f") {
        if (!repo) return;
        e.preventDefault();
        setView("history");
        requestAnimationFrame(() => searchInput.current?.focus());
      } else if (
        !inEditable &&
        (e.key === "1" || e.key === "2" || e.key === "3")
      ) {
        if (e.key === "1" && repo && !writing) {
          e.preventDefault();
          setView("changes");
        } else if (e.key === "2" && !writing) {
          e.preventDefault();
          setView("history");
        } else if (e.key === "3" && repo && !writing) {
          e.preventDefault();
          goSync(lastSyncView);
        }
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function copyText(value: string, label: string) {
    if (!navigator.clipboard?.writeText) {
      setNotice(`${label}: ${value}`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => setNotice(`${label}: ${value}`))
      .catch(() => setError("No se pudo copiar al portapapeles."));
  }
  function openCommitContextMenu(
    commit: Snapshot["page"]["commits"][number],
    x: number,
    y: number,
  ) {
    setContextMenu({
      x,
      y,
      label: `Acciones del commit ${short(commit.hash)}`,
      items: [
        {
          id: "inspect",
          label: "Abrir detalle en inspector",
          onSelect: () => {
            setView("history");
            setInspectorOpen(true);
            select(commit.hash);
          },
        },
        {
          id: "tag",
          label: "Etiquetar commit…",
          disabled: writing,
          onSelect: () => setTagTarget(commit.hash),
        },
        {
          id: "cherry-pick",
          label: "Cherry-pick…",
          disabled: writing,
          onSelect: () =>
            setReplay({ kind: "cherryPick", commit: commit.hash }),
        },
        {
          id: "revert",
          label: "Revertir commit…",
          disabled: writing,
          onSelect: () => setReplay({ kind: "revert", commit: commit.hash }),
        },
        {
          id: "parent",
          label: "Ir al padre 1",
          separatorBefore: true,
          disabled: commit.parents.length === 0,
          onSelect: () => {
            if (commit.parents[0]) jump(commit.parents[0]);
          },
        },
        {
          id: "copy-hash",
          label: "Copiar hash completo",
          separatorBefore: true,
          onSelect: () => copyText(commit.hash, "Hash copiado"),
        },
        {
          id: "copy-short",
          label: `Copiar hash corto (${short(commit.hash)})`,
          onSelect: () => copyText(short(commit.hash), "Hash corto copiado"),
        },
        {
          id: "branches",
          label: "Gestionar ramas…",
          separatorBefore: true,
          disabled: writing,
          onSelect: () => setView("branches"),
        },
      ],
    });
  }
  function openRefContextMenu(refItem: GitRef, x: number, y: number) {
    const label = refName(refItem.name);
    const items: ContextMenuItem[] = [
      {
        id: "locate",
        label: "Localizar en historial",
        onSelect: () => jump(refItem.hash),
      },
    ];
    if (refItem.kind === "branch" || refItem.kind === "remote") {
      items.push({
        id: "filter",
        label: `Filtrar historial por ${label}`,
        disabled: busy || loadingMore || writing,
        onSelect: () => void refresh(refItem.name, true),
      });
    }
    if (refItem.kind === "branch") {
      items.push({
        id: "manage",
        label: "Gestionar en Ramas…",
        disabled: writing,
        onSelect: () => {
          setBranchPreselect(label);
          setView("branches");
        },
      });
    }
    items.push({
      id: "copy-ref",
      label: "Copiar nombre de referencia",
      separatorBefore: true,
      onSelect: () => copyText(label, "Referencia copiada"),
    });
    setContextMenu({
      x,
      y,
      label: `Acciones de ${label}`,
      items,
    });
  }
  const launchExternal = (kind: "editor" | "terminal" | "explorer") => {
    if (!repo) return;
    const appId =
      kind === "editor"
        ? (externalApps?.preferences.preferredEditorId ??
          externalApps?.editors[0]?.id ??
          null)
        : kind === "terminal"
          ? (externalApps?.preferences.preferredTerminalId ??
            externalApps?.terminals[0]?.id ??
            null)
          : null;
    void invoke<{ message: string }>("open_in_external", {
      id: repo.id,
      kind,
      appId,
    })
      .then((res) => setNotice(res.message))
      .catch((reason) => setError(errorText(reason)));
  };
  const paletteCommands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: "view-changes",
        category: "Navegación",
        label: "Ir a Cambios locales",
        shortcut: "⌘1",
        disabled: !repo || writing,
        onSelect: () => setView("changes"),
      },
      {
        id: "view-history",
        category: "Navegación",
        label: "Ir a Historial y grafo",
        shortcut: "⌘2",
        disabled: writing,
        onSelect: () => setView("history"),
      },
      {
        id: "view-branches",
        category: "Navegación",
        label: "Ir a Ramas, Merge y Rebase",
        disabled: !repo || writing,
        onSelect: () => setView("branches"),
      },
      {
        id: "view-remotes",
        category: "Navegación",
        label: "Ir a Remotos y Fetch",
        shortcut: "⌘3",
        disabled: !repo || writing,
        onSelect: () => goSync("remotes"),
      },
      {
        id: "view-pull",
        category: "Navegación",
        label: "Ir a Pull",
        disabled: !repo || writing,
        onSelect: () => goSync("pull"),
      },
      {
        id: "view-push",
        category: "Navegación",
        label: "Ir a Publicar (Push)",
        disabled: !repo || writing,
        onSelect: () => goSync("push"),
      },
      {
        id: "toggle-inspector",
        category: "Navegación",
        label: inspectorOpen
          ? "Ocultar detalle del commit"
          : "Mostrar detalle del commit",
        disabled: view !== "history",
        onSelect: () => setInspectorOpen((open) => !open),
      },
      {
        id: "search-history",
        category: "Historial",
        label: "Buscar en commits cargados",
        shortcut: "⌘F",
        disabled: !repo,
        onSelect: () => {
          setView("history");
          requestAnimationFrame(() => searchInput.current?.focus());
        },
      },
      {
        id: "refresh-repo",
        category: "Git",
        label: "Actualizar historial y referencias",
        shortcut: "⌘R",
        disabled: !repo || busy || loadingMore || writing,
        onSelect: () => void refresh(),
      },
      {
        id: "stash",
        category: "Git",
        label: "Abrir Stash",
        disabled: !repo || writing,
        onSelect: () => setStashOpen(true),
      },
      {
        id: "tag-head",
        category: "Git",
        label: "Etiquetar commit seleccionado o HEAD",
        disabled: !repo || !(selected ?? repo.head) || writing,
        onSelect: () => {
          const target = selected ?? repo?.head;
          if (target) setTagTarget(target);
        },
      },
      {
        id: "replay",
        category: "Git",
        label: "Operaciones de commit (Cherry-pick / Revert)",
        disabled: !repo || writing,
        onSelect: () => setReplay(null),
      },
      {
        id: "open-editor",
        category: "Abrir en",
        label: "Abrir repositorio en editor",
        disabled: !repo || writing,
        onSelect: () => launchExternal("editor"),
      },
      {
        id: "open-terminal",
        category: "Abrir en",
        label: "Abrir repositorio en terminal",
        disabled: !repo || writing,
        onSelect: () => launchExternal("terminal"),
      },
      {
        id: "open-explorer",
        category: "Abrir en",
        label: "Abrir repositorio en explorador de archivos",
        disabled: !repo || writing,
        onSelect: () => launchExternal("explorer"),
      },
      {
        id: "open-repo",
        category: "Aplicación",
        label: "Abrir repositorio local…",
        shortcut: "⌘O",
        disabled: busy || loadingMore || writing,
        onSelect: () => void choose(),
      },
      {
        id: "library",
        category: "Aplicación",
        label: "Biblioteca de repositorios…",
        disabled: busy || loadingMore || writing,
        onSelect: () => setLibraryOpen(true),
      },
      {
        id: "appearance",
        category: "Aplicación",
        label: "Apariencia y colores…",
        shortcut: "⌘,",
        disabled: writing,
        onSelect: () => setAppearanceOpen(true),
      },
      {
        id: "activity",
        category: "Aplicación",
        label: "Actividad y diagnóstico…",
        disabled: writing,
        onSelect: () => setActivityOpen(true),
      },
    ],
    [
      repo,
      writing,
      busy,
      loadingMore,
      inspectorOpen,
      view,
      lastSyncView,
      selected,
      externalApps,
    ],
  );
  function jump(hash: string) {
    const index = commits.findIndex((c) => c.hash === hash);
    if (index < 0) {
      setNotice(
        "Este commit está fuera de la ventana cargada. Carga más historial para localizarlo.",
      );
      return;
    }
    setView("history");
    setQuery("");
    select(hash);
    virtual.scrollToIndex(index, { align: "center" });
  }
  const commitRow = (index: number, style?: React.CSSProperties) => {
    const c = commits[index];
    const row = rows[index];
    const rowColor =
      graphColors[row.color % graphColors.length] ??
      graphColors[0] ??
      "#52b7ff";
    const isHead = c.hash === repo?.head;
    const refs = repo?.refs.filter((r) => r.hash === c.hash) ?? [];
    const hasRefs = refs.length > 0;
    return (
      <button
        key={c.hash}
        type="button"
        className={`commit-row ${selected === c.hash ? "selected" : ""}`}
        style={
          {
            ...style,
            gridTemplateColumns: historyColumns,
            "--row-lane-color": rowColor,
          } as React.CSSProperties
        }
        onClick={() => select(c.hash)}
        onContextMenu={(event) => {
          event.preventDefault();
          openCommitContextMenu(c, event.clientX, event.clientY);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const next = Math.max(
              0,
              Math.min(
                commits.length - 1,
                index + (e.key === "ArrowDown" ? 1 : -1),
              ),
            );
            select(commits[next].hash);
            virtual.scrollToIndex(next, { align: "auto" });
          }
        }}
        aria-pressed={selected === c.hash}
        aria-label={`${c.subject}. ${c.author}. Commit ${short(c.hash)}. ${c.parents.length} padres.`}
      >
        <GraphCell
          row={row}
          width={graphWidth}
          colors={graphColors}
          isHead={isHead}
          hasRefs={hasRefs}
        />
        <span className="commit-subject">
          <span className="inline-refs">
            {isHead && (
              <span className="ref head">
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <circle cx="6" cy="6" r="3.2" fill="currentColor" />
                </svg>
                HEAD
              </span>
            )}
            {refs.map((r) => {
              const shortRef = refName(r.name);
              const isCurrentBranch =
                r.kind === "branch" && shortRef === repo?.branch;
              const syncedRemote =
                r.kind === "branch" &&
                refs.some(
                  (other) =>
                    other.kind === "remote" &&
                    refName(other.name).endsWith(`/${shortRef}`),
                );
              return (
                <span
                  className={`ref ${r.kind}${isCurrentBranch ? " ref-current" : ""}`}
                  style={
                    r.kind === "branch"
                      ? ({ "--pill-color": rowColor } as React.CSSProperties)
                      : undefined
                  }
                  key={r.name}
                  title={
                    syncedRemote
                      ? `${r.name} (sincronizada con remoto)`
                      : r.name
                  }
                >
                  <RefBadgeIcon kind={r.kind} />
                  <span>{shortRef}</span>
                  {syncedRemote && (
                    <span
                      className="ref-sync-badge"
                      aria-hidden="true"
                      title="Sincronizada con remoto"
                    >
                      <svg viewBox="0 0 12 12" aria-hidden="true">
                        <path
                          fill="currentColor"
                          d="M4.6 8.9 2.1 6.4l.9-.9 1.6 1.6L9 2.7l.9.9-5.3 5.3Z"
                        />
                      </svg>
                    </span>
                  )}
                </span>
              );
            })}
          </span>
          <span className="truncate">{c.subject || "(sin mensaje)"}</span>
        </span>
        <span className="history-author" title={c.author}>
          <AuthorAvatar name={c.author} />
          <span className="truncate">{c.author || "Autor desconocido"}</span>
        </span>
        {showDate && (
          <time className="history-date" dateTime={c.date} title={c.date}>
            {formatCommitDate(c.date)}
          </time>
        )}
        {showHash && <code className="hash">{short(c.hash)}</code>}
      </button>
    );
  };
  return (
    <main
      className="app-shell workspace-shell"
      data-history={view === "history"}
      data-inspector={inspectorOpen}
      style={{ "--inspector-size": `${inspectorSize}%` } as React.CSSProperties}
    >
      {libraryOpen && (
        <LibraryDialog
          onLock={setWriting}
          onDeleted={(path) => {
            if (path === repo?.path) {
              setRepo(null);
              setPreferencesRepo(null);
              setSelected(null);
              setSelectedFile(null);
              setCommitFiles(null);
              setDiff(null);
              setBranchPreselect(null);
              setContextMenu(null);
              setPaletteOpen(false);
              setView("history");
              setStashOpen(false);
              setReplay(undefined);
              setTagTarget(null);
              setTagPublication(undefined);
            }
            setNotice(
              "Carpeta movida a la Papelera del sistema. No se eliminó el repositorio remoto.",
            );
          }}
          currentPath={repo?.path}
          onOpen={choose}
          onClose={() => setLibraryOpen(false)}
          onForgot={(path) => {
            if (path === repo?.path) setPreferencesRepo(null);
          }}
        />
      )}
      {activityOpen && (
        <ActivityDialog onClose={() => setActivityOpen(false)} />
      )}
      {appearanceOpen && (
        <AppearanceDialog
          theme={theme}
          graphPalette={graphPalette}
          onChange={changeAppearance}
          onClose={() => setAppearanceOpen(false)}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          commands={paletteCommands}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label={contextMenu.label}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
      {repo && tagTarget && (
        <TagDialog
          key={`tag-${repo.id}`}
          repoId={repo.id}
          commit={tagTarget}
          head={repo.head}
          onPublish={(name) => {
            setTagTarget(null);
            setTagPublication(name);
          }}
          onClose={() => setTagTarget(null)}
          onLock={setWriting}
          onUpdated={refresh}
        />
      )}
      {repo && tagPublication !== undefined && (
        <TagPublishDialog
          key={`tag-publish-${repo.id}`}
          repoId={repo.id}
          initialTag={tagPublication ?? undefined}
          onClose={() => setTagPublication(undefined)}
          onLock={setWriting}
          onUpdated={refresh}
        />
      )}
      {creation && (
        <InitializeDialog
          key={`creation:${creation}`}
          mode={creation}
          onClose={() => setCreation(null)}
          onLock={setWriting}
          onOpen={choose}
        />
      )}
      {repo && restoreOpen && (
        <ConflictRestoreDialog
          key={`restore:${repo.id}`}
          repoId={repo.id}
          onClose={() => {
            setRestoreOpen(false);
            setChangesRevision((value) => value + 1);
          }}
          onLock={setWriting}
          onUpdated={refresh}
        />
      )}
      {repo && stashOpen && (
        <StashDialog
          key={`stash:${repo.id}`}
          repoId={repo.id}
          onClose={() => setStashOpen(false)}
          onLock={setWriting}
          onUpdated={refresh}
        />
      )}
      {repo && replay !== undefined && (
        <ReplayDialog
          key={`replay:${repo.id}`}
          repoId={repo.id}
          initial={replay ?? undefined}
          onClose={() => setReplay(undefined)}
          onLock={setWriting}
          onUpdated={refresh}
        />
      )}
      <div className="app-header">
        <a className="skip-navigation" href={`#${view}-content`}>
          Saltar al contenido
        </a>
        <CommandBar
          repo={repo}
          locked={busy || loadingMore || writing}
          onOpen={() => void choose()}
          onRefresh={() => void refresh()}
          onChanges={() => setView("changes")}
          onFetch={() => goSync("remotes")}
          onPush={() => goSync("push")}
          onPull={() => goSync("pull")}
          onStash={() => setStashOpen(true)}
          onBranches={() => setView("branches")}
          onSearch={() => {
            setView("history");
            requestAnimationFrame(() => searchInput.current?.focus());
          }}
          onLibrary={() => setLibraryOpen(true)}
          onAppearance={() => setAppearanceOpen(true)}
          onCommandPalette={() => setPaletteOpen(true)}
          themeSwatches={THEMES.find(
            (item) => item.id === theme,
          )?.swatches.slice(1, 4)}
          externalSlot={
            repo ? (
              <OpenExternalMenu
                repoId={repo.id}
                disabled={busy || loadingMore || writing}
                apps={externalApps}
                onReloadApps={reloadExternalApps}
                onSavePreferences={saveExternalPreferences}
                onNotice={setNotice}
                onError={setError}
              />
            ) : null
          }
        />
        {syncing && (
          <nav className="sync-navigation" aria-label="Sincronización">
            <span>Sincronizar</span>
            {(
              [
                ["remotes", "Remotos y Fetch"],
                ["pull", "Pull"],
                ["push", "Publicar"],
              ] as const
            ).map(([destination, label]) => (
              <button
                key={destination}
                disabled={writing}
                aria-current={view === destination ? "page" : undefined}
                onClick={() => goSync(destination)}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        <div className="global-notices" aria-label="Avisos del repositorio">
          {operationResults.length > 0 && (
            <section
              className="operation-results"
              aria-label="Resultados de operaciones"
              tabIndex={0}
            >
              {operationResults.map((result) => (
                <OperationNotice
                  key={result.id}
                  result={result}
                  onClose={() =>
                    setOperationResults((current) =>
                      current.filter((item) => item.id !== result.id),
                    )
                  }
                />
              ))}
            </section>
          )}
          {error && (
            <div className="banner error" role="alert">
              <ExclamationTriangleIcon />
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Cerrar error">
                ×
              </button>
            </div>
          )}
          {notice && (
            <div className="banner notice" role="status">
              {notice}
              <button onClick={() => setNotice("")} aria-label="Cerrar aviso">
                ×
              </button>
            </div>
          )}
        </div>
      </div>
      <aside className="sidebar">
        <button
          className="library-launcher"
          onClick={() => setLibraryOpen(true)}
          disabled={busy || loadingMore || writing}
        >
          Repositorios <span aria-hidden="true">▾</span>
        </button>
        <button
          className="button sidebar-create"
          disabled={busy || loadingMore || writing}
          onClick={() => setCreation("initialize")}
        >
          Nuevo repositorio…
        </button>
        <button
          className="button sidebar-create"
          disabled={busy || loadingMore || writing}
          onClick={() => setCreation("clone")}
        >
          Clonar repositorio…
        </button>
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
            onClick={() => setView("changes")}
          >
            <FileTextIcon />
            Cambios
          </button>
          <button
            disabled={writing}
            aria-current={view === "history" ? "page" : undefined}
            className={view === "history" ? "nav-active" : "nav-button"}
            onClick={() => setView("history")}
          >
            <CommitIcon />
            Historial<span>{commits.length || "—"}</span>
          </button>
          <button
            disabled={!repo || writing}
            aria-current={syncing ? "page" : undefined}
            className={syncing ? "nav-active" : "nav-button"}
            onClick={() => goSync(lastSyncView)}
          >
            <ArrowRightIcon />
            Sincronizar
          </button>
        </nav>
        <details
          className="workspace-tools"
          open={view === "branches" || undefined}
        >
          <summary>Herramientas</summary>
          <nav
            className="repo-navigation"
            aria-label="Herramientas del repositorio"
          >
            <button
              className="nav-button"
              disabled={!repo || writing}
              onClick={(event) => {
                event.currentTarget.focus();
                setRestoreOpen(true);
              }}
            >
              Recuperar respaldo de conflicto…
            </button>
            <button
              className="nav-button"
              disabled={!repo?.head || writing}
              onClick={() => repo?.head && setTagTarget(repo.head)}
            >
              Crear etiqueta…
            </button>
            <button
              className="nav-button"
              disabled={!repo || writing}
              onClick={() => setTagPublication(null)}
            >
              Publicar etiqueta…
            </button>
            <button
              className="nav-button"
              disabled={!repo || writing}
              onClick={() => setReplay(null)}
            >
              Operaciones de commit
            </button>
            <button
              disabled={!repo || writing}
              aria-current={view === "branches" ? "page" : undefined}
              className={view === "branches" ? "nav-active" : "nav-button"}
              onClick={() => setView("branches")}
            >
              Ramas
            </button>
            <button
              className="nav-button"
              disabled={writing}
              onClick={() => setActivityOpen(true)}
            >
              Actividad y diagnóstico…
            </button>
            <button
              className="nav-button"
              disabled={writing}
              onClick={() => setAppearanceOpen(true)}
            >
              Apariencia y colores…
            </button>
          </nav>
        </details>
        <div className="sidebar-sections">
          {[
            { label: "RAMAS LOCALES", refs: branches },
            { label: "REFERENCIAS REMOTAS", refs: remotes },
            { label: "ETIQUETAS", refs: tags },
          ].map((group) => (
            <details key={group.label} open={group.label === "RAMAS LOCALES"}>
              <summary>
                {group.label}
                <span>{group.refs.length}</span>
              </summary>
              {group.refs.length ? (
                group.refs.map((r) => (
                  <button
                    className="branch-button"
                    disabled={writing}
                    key={r.name}
                    onClick={() => jump(r.hash)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openRefContextMenu(r, event.clientX, event.clientY);
                    }}
                    title={`Localizar ${refName(r.name)} en el historial; no cambia la rama activa`}
                  >
                    <span className={`branch-dot ${r.kind}`} />
                    <span className="truncate">{refName(r.name)}</span>
                    {refName(r.name) === repo?.branch && (
                      <span className="current-indicator">actual</span>
                    )}
                  </button>
                ))
              ) : (
                <p className="sidebar-empty">
                  {repo ? "Sin referencias" : "Abre un repositorio"}
                </p>
              )}
            </details>
          ))}
        </div>
        <div className="sidebar-foot">
          <LockClosedIcon />
          <p>Control local. Conexiones sólo cuando las solicitas.</p>
        </div>
      </aside>
      {repo && (
        <ChangesPanel
          key={repo.id}
          refreshKey={changesRevision}
          active={view === "changes"}
          repoId={repo.id}
          onLock={setWriting}
          onCommitted={refresh}
          onBranches={() => setView("branches")}
        />
      )}
      {repo && (
        <RemotesPanel
          key={`remotes-${repo.id}`}
          active={view === "remotes"}
          repoId={repo.id}
          onLock={setWriting}
          onUpdated={refresh}
        />
      )}
      {repo && (
        <PushPanel
          key={`push-${repo.id}`}
          repository={{ name: repo.name, path: repo.path }}
          onResult={(result) => rememberResult(result, "push", repo.id)}
          active={view === "push"}
          repoId={repo.id}
          onLock={setWriting}
          onUpdated={refresh}
        />
      )}
      {repo && (
        <PullPanel
          key={`pull-${repo.id}`}
          active={view === "pull"}
          repoId={repo.id}
          onLock={setWriting}
          onUpdated={refresh}
          onBranches={() => setView("branches")}
        />
      )}
      {repo && (
        <BranchesPanel
          key={`branches-${repo.id}`}
          active={view === "branches"}
          repoId={repo.id}
          initialBranch={branchPreselect}
          onLock={setWriting}
          onUpdated={refresh}
        />
      )}
      <section
        id="history-content"
        tabIndex={-1}
        hidden={!!repo && view !== "history"}
        className="history-panel"
        aria-label="Historial del repositorio"
      >
        <div className="panel-heading">
          <div>
            <div className="eyebrow">HISTORIAL</div>
            <h1>Historial</h1>
          </div>
          <div className="history-controls">
            <details className="history-options">
              <summary>Vista</summary>
              <div className="history-options-body">
                <label>
                  <input
                    type="checkbox"
                    checked={showDate}
                    onChange={(e) => setShowDate(e.target.checked)}
                  />
                  Fecha
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={showHash}
                    onChange={(e) => setShowHash(e.target.checked)}
                  />
                  Hash del commit
                </label>
                <label>
                  Ancho de autor · {authorWidth} px
                  <input
                    aria-label="Ancho de autor"
                    type="range"
                    min="120"
                    max="240"
                    step="10"
                    value={authorWidth}
                    onChange={(e) => setAuthorWidth(Number(e.target.value))}
                  />
                </label>
                <label>
                  Ancho del inspector · {inspectorSize} %
                  <input
                    aria-label="Ancho del inspector"
                    type="range"
                    min="30"
                    max="60"
                    step="2"
                    value={inspectorSize}
                    onChange={(e) => setInspectorSize(Number(e.target.value))}
                  />
                </label>
              </div>
            </details>
            <button
              className="button"
              aria-expanded={inspectorOpen}
              aria-controls="commit-inspector"
              onClick={() => setInspectorOpen(!inspectorOpen)}
            >
              {inspectorOpen ? "Ocultar detalle" : "Mostrar detalle"}
            </button>
          </div>
        </div>
        {repo?.head && !repo.branch && (
          <div className="banner warning">
            HEAD separado: estás inspeccionando un commit sin una rama activa.
          </div>
        )}
        {repo?.shallow && (
          <div className="banner warning">
            Repositorio shallow: Git sólo dispone de una parte del historial.
          </div>
        )}
        {repo && (
          <div className="history-navigation">
            <label htmlFor="history-scope">Mostrar</label>
            <select
              id="history-scope"
              title="Leer la ascendencia de una referencia sin cambiar de rama ni contactar remotos"
              value={historyScope}
              disabled={busy || loadingMore || writing}
              onChange={(e) => void refresh(e.target.value, true)}
            >
              <option value="all">Todas las referencias</option>
              <option value="HEAD" disabled={!repo.head}>
                Rama actual / HEAD
              </option>
              <optgroup label="Ramas locales">
                {branches.map((ref) => (
                  <option key={ref.name} value={ref.name}>
                    {refName(ref.name)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Ramas remotas">
                {remotes.map((ref) => (
                  <option key={ref.name} value={ref.name}>
                    {refName(ref.name)}
                  </option>
                ))}
              </optgroup>
            </select>
            <button
              className="button"
              disabled={!repo.head || busy || loadingMore || writing}
              title="Localizar HEAD; si no está cargado, abrir su historial"
              onClick={() => {
                if (commits.some((c) => c.hash === repo.head)) jump(repo.head!);
                else void refresh("HEAD", true, true);
              }}
            >
              Ir a HEAD
            </button>
            {busy && <span role="status">Leyendo historial…</span>}
          </div>
        )}
        <div className="searchbar">
          <MagnifyingGlassIcon />
          <label className="sr-only" htmlFor="history-search">
            Buscar en commits cargados
          </label>
          <input
            ref={searchInput}
            id="history-search"
            maxLength={500}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              scroll.current?.scrollTo({ top: 0 });
            }}
            placeholder="Buscar mensaje, autor o hash en lo cargado"
            disabled={!repo}
          />
          {query && (
            <button aria-label="Limpiar búsqueda" onClick={() => setQuery("")}>
              ×
            </button>
          )}
          <span role="status" aria-live="polite" aria-atomic="true">
            {filtering
              ? "Filtrando…"
              : query
                ? `${visible.length} coincidencias`
                : `${commits.length} cargados`}
          </span>
        </div>
        {repo && !query && (
          <div className="history-table-header">
            <div
              ref={tableHeading}
              className="table-heading"
              style={{
                gridTemplateColumns: historyColumns,
                minWidth: historyMinWidth,
              }}
            >
              <span>Grafo</span>
              <span>Mensaje y referencias</span>
              <span>Autor</span>
              {showDate && <span>Fecha</span>}
              {showHash && <span>Commit</span>}
            </div>
          </div>
        )}
        <div
          className="history-scroll"
          ref={scroll}
          aria-busy={busy || filtering}
          onScroll={(event) => {
            if (tableHeading.current)
              tableHeading.current.style.transform = `translateX(-${event.currentTarget.scrollLeft}px)`;
          }}
        >
          {busy && !repo ? (
            <div className="skeleton-list" aria-label="Leyendo historial">
              {Array.from({ length: 8 }, (_, i) => (
                <div className="skeleton-row" key={i} />
              ))}
            </div>
          ) : !repo ? (
            <div className="empty-state">
              <span className="empty-icon">
                <CommitIcon width="28" height="28" />
              </span>
              <div className="eyebrow">CADA RAMA TIENE UNA HISTORIA</div>
              <h2>Empieza por tu repositorio.</h2>
              <p>
                Explora sus ramas, sigue los merges y revisa cada cambio desde
                un mismo lugar.
              </p>
              <button
                className="button primary"
                onClick={() => void choose()}
                disabled={busy}
              >
                <OpenInNewWindowIcon />
                Abrir repositorio local
              </button>
              <span className="empty-note">
                Sin cuentas. Sin conexión. Datos reales de Git.
              </span>
              {!isTauri() && (
                <p className="browser-note">
                  Vista de navegador · abre RavenGit de escritorio para leer
                  Git.
                </p>
              )}
            </div>
          ) : commits.length === 0 ? (
            <div className="empty-state">
              <CommitIcon />
              <h2>Este repositorio aún no tiene commits.</h2>
              <p>
                Cuando exista un primer commit, su historial aparecerá aquí.
              </p>
            </div>
          ) : query ? (
            <div className="search-results">
              {visible.length ? (
                <div
                  className="virtual-list"
                  style={{ height: virtual.getTotalSize() }}
                >
                  {virtual.getVirtualItems().map((item) => {
                    const index = visible[item.index];
                    const commit = commits[index];
                    return (
                      <button
                        key={commit.hash}
                        className={`search-result ${selected === commit.hash ? "selected" : ""}`}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: item.size,
                          transform: `translateY(${item.start}px)`,
                        }}
                        data-search-index={item.index}
                        aria-pressed={selected === commit.hash}
                        title={`${commit.subject}\n${commit.author}\n${commit.hash}`}
                        onClick={() => select(commit.hash)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          openCommitContextMenu(
                            commit,
                            event.clientX,
                            event.clientY,
                          );
                        }}
                        onKeyDown={(event) => {
                          if (
                            !["ArrowDown", "ArrowUp", "Home", "End"].includes(
                              event.key,
                            )
                          )
                            return;
                          event.preventDefault();
                          const next =
                            event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? visible.length - 1
                                : Math.max(
                                    0,
                                    Math.min(
                                      visible.length - 1,
                                      item.index +
                                        (event.key === "ArrowDown" ? 1 : -1),
                                    ),
                                  );
                          select(commits[visible[next]].hash);
                          virtual.scrollToIndex(next, { align: "auto" });
                          requestAnimationFrame(() =>
                            scroll.current
                              ?.querySelector<HTMLButtonElement>(
                                `[data-search-index="${next}"]`,
                              )
                              ?.focus(),
                          );
                        }}
                      >
                        <code>{short(commit.hash)}</code>
                        <span>{commit.subject}</span>
                        <small>{commit.author}</small>
                      </button>
                    );
                  })}
                </div>
              ) : filtering ? (
                <p className="search-note" role="status">
                  Filtrando commits cargados…
                </p>
              ) : (
                <div className="empty-state">
                  <h2>Sin coincidencias.</h2>
                  <button className="button" onClick={() => setQuery("")}>
                    Limpiar búsqueda
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              className="virtual-list"
              style={{
                height: virtual.getTotalSize(),
                minWidth: historyMinWidth,
              }}
            >
              {virtual.getVirtualItems().map((item) =>
                commitRow(item.index, {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }),
              )}
            </div>
          )}
        </div>
        {repo && (
          <div className="history-bottom">
            <span>
              {query
                ? "Resultados locales · sólo commits cargados. Flechas, Inicio y Fin para navegar."
                : "Las líneas continúan hacia padres fuera de la ventana."}
            </span>
            {repo.page.nextOffset !== null ? (
              <button
                className="button"
                onClick={more}
                disabled={loadingMore || busy}
              >
                {loadingMore ? "Cargando…" : "Cargar 200 más"}
              </button>
            ) : (
              <span className="end-label">
                {repo.shallow
                  ? "Límite del historial disponible"
                  : "Fin del historial disponible"}
              </span>
            )}
          </div>
        )}
      </section>
      <aside
        id="commit-inspector"
        hidden={(!!repo && view !== "history") || !inspectorOpen}
        className="inspector history-inspector"
        aria-label="Detalle del commit"
      >
        <div className="inspector-heading">
          <FileTextIcon />
          <h2>Detalle del commit</h2>
          <div
            className="commit-step-navigation"
            role="group"
            aria-label="Navegar por commits cargados"
          >
            <button
              className="button"
              aria-label="Commit anterior en la lista"
              title="Commit anterior en la lista (orden topológico)"
              disabled={!active || commits.indexOf(active) === 0}
              onClick={() =>
                active && jump(commits[commits.indexOf(active) - 1].hash)
              }
            >
              ↑
            </button>
            <button
              className="button"
              aria-label="Commit siguiente en la lista"
              title="Commit siguiente en la lista (orden topológico)"
              disabled={
                !active || commits.indexOf(active) === commits.length - 1
              }
              onClick={() =>
                active && jump(commits[commits.indexOf(active) + 1].hash)
              }
            >
              ↓
            </button>
          </div>
        </div>
        {active ? (
          <>
            <div className="commit-meta">
              <h2>{active.subject || "(sin mensaje)"}</h2>
              <div className="commit-actions">
                <button
                  className="button"
                  disabled={writing}
                  onClick={() => setTagTarget(active.hash)}
                >
                  Etiquetar commit…
                </button>
                <button
                  className="button"
                  disabled={writing}
                  onClick={() =>
                    setReplay({ kind: "cherryPick", commit: active.hash })
                  }
                >
                  Cherry-pick
                </button>
                <button
                  className="button"
                  disabled={writing}
                  onClick={() =>
                    setReplay({ kind: "revert", commit: active.hash })
                  }
                >
                  Revertir commit
                </button>
              </div>
              <div className="selected-author">
                <AuthorAvatar name={active.author} />
                <span>{active.author || "Autor desconocido"}</span>
                <time dateTime={active.date}>
                  {formatCommitDate(active.date)}
                </time>
              </div>
              <details className="commit-details" key={active.hash}>
                <summary>Más detalles</summary>
                <dl>
                  <dt>Autor</dt>
                  <dd>{active.author}</dd>
                  <dt>Fecha</dt>
                  <dd>{new Date(active.date).toLocaleString("es-MX")}</dd>
                  <dt>Hash</dt>
                  <dd className="full-hash">{active.hash}</dd>
                  <dt>Padres</dt>
                  <dd>
                    {active.parents.length
                      ? active.parents.map((p) => (
                          <button
                            key={p}
                            className="parent-link"
                            onClick={() => jump(p)}
                            title={p}
                          >
                            {short(p)} <ArrowRightIcon />
                          </button>
                        ))
                      : "Commit raíz"}
                  </dd>
                </dl>
              </details>
            </div>
            {active.parents.length > 0 && (
              <nav
                className="commit-parent-navigation"
                aria-label="Navegar por padres"
              >
                {active.parents.map((parent, index) => (
                  <button
                    className="button"
                    key={parent}
                    title={parent}
                    onClick={() => jump(parent)}
                  >
                    Ir al padre {index + 1}
                  </button>
                ))}
              </nav>
            )}
            {(filesBusy || (commitFiles && commitFiles.length > 0)) && (
              <section
                className="commit-files"
                aria-label="Archivos del commit"
                aria-busy={filesBusy}
              >
                <div className="commit-files-header">
                  <span>
                    Archivos modificados ({commitFiles?.length ?? "…"})
                  </span>
                  {commitFiles && commitFiles.length > 0 && (
                    <span className="commit-files-totals">
                      <span className="stat-add">
                        +
                        {commitFiles.reduce(
                          (acc, item) => acc + (item.additions ?? 0),
                          0,
                        )}
                      </span>{" "}
                      <span className="stat-del">
                        −
                        {commitFiles.reduce(
                          (acc, item) => acc + (item.deletions ?? 0),
                          0,
                        )}
                      </span>
                    </span>
                  )}
                  {selectedFile && (
                    <button
                      type="button"
                      className="button commit-files-reset"
                      onClick={() => setSelectedFile(null)}
                    >
                      Ver todos
                    </button>
                  )}
                </div>
                {commitFiles && commitFiles.length > 0 && (
                  <ul className="commit-files-list">
                    {commitFiles.map((file) => {
                      const activeFile = selectedFile?.path === file.path;
                      return (
                        <li key={`${file.status}:${file.path}`}>
                          <button
                            type="button"
                            className={`commit-file-row${activeFile ? " selected" : ""}`}
                            aria-pressed={activeFile}
                            onClick={() =>
                              setSelectedFile((current) =>
                                current?.path === file.path ? null : file,
                              )
                            }
                            title={
                              file.oldPath
                                ? `${file.oldPath} → ${file.path}`
                                : file.path
                            }
                          >
                            <span
                              className={`commit-file-status status-${file.status}`}
                            >
                              {file.status}
                            </span>
                            <span className="truncate">
                              {file.oldPath
                                ? `${file.oldPath} → ${file.path}`
                                : file.path}
                            </span>
                            <span className="commit-file-stats">
                              {file.binary ? (
                                "bin"
                              ) : (
                                <>
                                  <span className="stat-add">
                                    +{file.additions ?? 0}
                                  </span>
                                  <span className="stat-del">
                                    −{file.deletions ?? 0}
                                  </span>
                                </>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
            <div className="diff-toolbar">
              <span>
                {selectedFile ? selectedFile.path : "Diff del commit"}
              </span>
              {active.parents.length > 1 ? (
                <label>
                  Contra padre{" "}
                  <select
                    value={parentIndex}
                    onChange={(e) => {
                      setParentIndex(Number(e.target.value));
                      setSelectedFile(null);
                    }}
                  >
                    {active.parents.map((p, i) => (
                      <option key={p} value={i}>
                        {i + 1} · {short(p)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <code>
                  {active.parents[0] ? short(active.parents[0]) : "árbol vacío"}{" "}
                  → {short(active.hash)}
                </code>
              )}
            </div>
            <div className="diff-body" aria-busy={diffBusy}>
              {diffBusy ? (
                <div className="skeleton-list" aria-label="Leyendo diff">
                  <div className="skeleton-row" />
                  <div className="skeleton-row" />
                  <div className="skeleton-row" />
                </div>
              ) : diffError ? (
                <>
                  <div className="banner error" role="alert">
                    {diffError}
                  </div>
                  {!selectedFile && commitFiles && commitFiles.length > 0 && (
                    <p className="partial-note">
                      Selecciona un archivo individual arriba para inspeccionar
                      su diff sin superar el límite de 2 MiB.
                    </p>
                  )}
                </>
              ) : diff?.text ? (
                <DiffViewer
                  text={diff.text}
                  filePath={selectedFile?.path}
                  ignoreWhitespace={commitIgnoreWhitespace}
                  onIgnoreWhitespaceChange={setCommitIgnoreWhitespace}
                  contextLines={commitContextLines}
                  onContextLinesChange={setCommitContextLines}
                />
              ) : (
                <>
                  {(commitIgnoreWhitespace || commitContextLines !== 3) && (
                    <DiffModeControl
                      mode="unified"
                      onChange={() => {}}
                      available={false}
                      ignoreWhitespace={commitIgnoreWhitespace}
                      onIgnoreWhitespaceChange={setCommitIgnoreWhitespace}
                      contextLines={commitContextLines}
                      onContextLinesChange={setCommitContextLines}
                    />
                  )}
                  <div className="diff-empty">
                    Sin diferencias de contenido contra este padre.
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="inspector-empty">
            <CommitIcon width="24" height="24" />
            <h3>El contexto, a un clic.</h3>
            <p>Selecciona un commit para ver su autor, sus padres y el diff.</p>
          </div>
        )}
      </aside>
      <footer className="statusbar">
        <span>
          <span className="status-dot" />
          {busy || loadingMore
            ? "Leyendo repositorio…"
            : repo
              ? "Repositorio local conectado"
              : "Listo para abrir un repositorio"}
        </span>
        <span>
          {writing
            ? "Operación Git en curso…"
            : "Cambios · Historial · Sincronizar"}
        </span>
        <span>
          {repo && preferencesRepo === repo.id ? (
            <>
              {preferenceSave === "pending" ? (
                "Guardando preferencias…"
              ) : preferenceSave === "saved" ? (
                "Preferencias guardadas"
              ) : (
                <button onClick={() => setSaveAttempt((value) => value + 1)}>
                  Reintentar guardar preferencias
                </button>
              )}
            </>
          ) : (
            <>
              <CommitIcon /> Git local · Sin publicación automática
            </>
          )}
        </span>
      </footer>
    </main>
  );
}
export default App;
