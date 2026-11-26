import {
  Suspense,
  lazy,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  Commit,
  CommitDiff,
  CommitFile,
  CommitFiles,
  EnvironmentStatus,
  GitRef,
  HistoryPage,
  ImageDiff,
  RepoChangedEvent,
  Snapshot,
  UndoOutcome,
  UndoPlan,
  UndoState,
  WorktreeItem,
  WorktreeSummary,
  WorktreesState,
} from "./types";
import "./themes.css";
import "./App.css";
import "./workspace.css";
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_SNAPSHOT_PREFERENCES,
  THEMES,
  applyAppearance,
  isGraphPaletteId,
  isGraphStyleId,
  isThemeId,
  loadCachedAppearance,
  resolveGraphColors,
  type AppSettings,
  type ExternalAppsState,
  type ExternalPreferences,
  type GraphPaletteId,
  type GraphStyleId,
  type SnapshotPreferences,
  type ThemeId,
} from "./themes";
import OpenExternalMenu from "./OpenExternalMenu";
import AuthorAvatar from "./AuthorAvatar";
import type { RepositoryLibrary, HistoryPreferences } from "./library";
import ChangesPanel from "./ChangesPanel";
import OperationNotice, { type OperationResult } from "./OperationNotice";
import CommandBar from "./CommandBar";
import DiffViewer, { DiffModeControl } from "./DiffViewer";

const RemotesPanel = lazy(() => import("./RemotesPanel"));
const PushPanel = lazy(() => import("./PushPanel"));
const PullPanel = lazy(() => import("./PullPanel"));
const BranchesPanel = lazy(() => import("./BranchesPanel"));
import ImageDiffViewer, { isImageAssetPath } from "./ImageDiffViewer";
import TrustDialog from "./TrustDialog";
import type { ReplayTarget } from "./ReplayDialog";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";
import CommandPalette, { type PaletteCommand } from "./CommandPalette";

const AppearanceDialog = lazy(() => import("./AppearanceDialog"));
const BlameDialog = lazy(() => import("./BlameDialog"));
const CompareDialog = lazy(() => import("./CompareDialog"));
const EnvironmentDialog = lazy(() => import("./EnvironmentDialog"));
const FileHistoryDialog = lazy(() => import("./FileHistoryDialog"));
const LibraryDialog = lazy(() => import("./LibraryDialog"));
const InitializeDialog = lazy(() => import("./InitializeDialog"));
const LfsSubmodulesDialog = lazy(() => import("./LfsSubmodulesDialog"));
const SnapshotsDialog = lazy(() => import("./SnapshotsDialog"));
const UndoDialog = lazy(() => import("./UndoDialog"));
const StashDialog = lazy(() => import("./StashDialog"));
const WorktreeDialog = lazy(() => import("./WorktreeDialog"));
const ConflictRestoreDialog = lazy(() => import("./ConflictRestoreDialog"));
const ReplayDialog = lazy(() => import("./ReplayDialog"));
const SearchDialog = lazy(() => import("./SearchDialog"));
const TagDialog = lazy(() => import("./TagDialog"));
const TagPublishDialog = lazy(() => import("./TagPublishDialog"));
const ActivityDialog = lazy(() => import("./ActivityDialog"));
const ShortcutsDialog = lazy(() => import("./ShortcutsDialog"));
import { buildTributaryItems } from "./historyGroups";
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
function formatRelativeCommitDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return formatCommitDate(value);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffHours < 1) return "hace un momento";
  if (diffDays === 0) return `hace ${diffHours} h`;
  if (diffDays === 1) return "ayer";
  if (diffDays < 7) return `hace ${diffDays} días`;
  return formatCommitDate(value);
}
const COMPACT_ROW_HEIGHT = 42;
const TRIBUTARY_ROW_HEIGHT = 52;
const DEFAULT_REFS_COL_WIDTH = 176;
const MIN_REFS_COL_WIDTH = 120;
const MAX_REFS_COL_WIDTH = 280;
const TRIBUTARY_GROUP_HEIGHT = 28;
const short = (s: string) => s.slice(0, 8);
const refName = (s: string) => s.replace(/^refs\/(heads|remotes|tags)\//, "");
function errorText(error: unknown): string {
  if (typeof error === "object" && error && "message" in error)
    return String(error.message);
  return "No se pudo completar la lectura. Vuelve a intentarlo.";
}
function LocalDeviceIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2 2.5A1 1 0 0 1 3 1.5h6a1 1 0 0 1 1 1V7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2.5Zm1.2.2v4.1h5.6V2.7H3.2ZM1 9.2h10l-.7 1.3H1.7L1 9.2Z"
      />
    </svg>
  );
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
type RepoView =
  "history" | "changes" | "remotes" | "push" | "branches" | "pull";

const MAX_OPEN_TABS = 12;

interface TabEntry {
  snapshot: Snapshot;
  view: RepoView;
  lastSyncView: "remotes" | "pull" | "push";
  selected: string | null;
  historyScope: string;
  query: string;
  inspectorOpen: boolean;
  inspectorSize: number;
  authorWidth: number;
  showAuthor: boolean;
  showDate: boolean;
  showHash: boolean;
  refsWidth: number;
  preferencesRepo: string | null;
  branchPreselect: string | null;
  wip: WorktreeSummary | null;
  worktrees: WorktreesState | null;
}

function defaultTabEntry(snapshot: Snapshot): TabEntry {
  return {
    snapshot,
    view: "history",
    lastSyncView: "remotes",
    selected: null,
    historyScope: "all",
    query: "",
    inspectorOpen: true,
    inspectorSize: 38,
    authorWidth: 160,
    showAuthor: true,
    showDate: true,
    showHash: false,
    refsWidth: DEFAULT_REFS_COL_WIDTH,
    preferencesRepo: null,
    branchPreselect: null,
    wip: null,
    worktrees: null,
  };
}

function App() {
  const [theme, setTheme] = useState<ThemeId>(
    () => loadCachedAppearance().theme,
  );
  const [graphPalette, setGraphPalette] = useState<GraphPaletteId>(
    () => loadCachedAppearance().graphPalette,
  );
  const [graphStyle, setGraphStyle] = useState<GraphStyleId>(
    () => loadCachedAppearance().graphStyle,
  );
  const [externalPreferences, setExternalPreferences] =
    useState<ExternalPreferences>(DEFAULT_APP_SETTINGS.external);
  const [externalApps, setExternalApps] = useState<ExternalAppsState | null>(
    null,
  );
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [tabs, setTabs] = useState<TabEntry[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const tabsRef = useRef<TabEntry[]>([]);
  const activeTabIdRef = useRef<string | null>(null);
  const tabsTouchedRef = useRef(false);
  const snapshotsTouchedRef = useRef(false);
  const graphStyleTouchedRef = useRef(false);
  const startupRestoredRef = useRef(false);
  const lastFocusRefreshRef = useRef(0);
  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;
  const activeTab = useMemo(
    () => tabs.find((item) => item.snapshot.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );
  const repo = activeTab?.snapshot ?? null;
  const wip = activeTab?.wip ?? null;
  const worktrees = activeTab?.worktrees?.worktrees ?? [];
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [preferencesRepo, setPreferencesRepo] = useState<string | null>(null);
  const [preferenceSave, setPreferenceSave] = useState<
    "pending" | "saved" | "failed"
  >("saved");
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [view, setView] = useState<RepoView>("history");
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
  const [worktreeOpen, setWorktreeOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [trustPromptRepoId, setTrustPromptRepoId] = useState<string | null>(
    null,
  );
  const dismissedTrustIdsRef = useRef<Set<string>>(new Set());
  const [searchDialogMode, setSearchDialogMode] = useState<
    "history" | "code" | null
  >(null);
  const [externalCommit, setExternalCommit] = useState<Commit | null>(null);
  const [fileHistoryTarget, setFileHistoryTarget] = useState<{
    path: string;
    revision: string | null;
  } | null>(null);
  const [blameTarget, setBlameTarget] = useState<{
    path: string;
    revision: string | null;
  } | null>(null);
  const [comparePair, setComparePair] = useState<{
    base: Commit;
    target: Commit;
  } | null>(null);
  const [compareAnchor, setCompareAnchor] = useState<Commit | null>(null);
  const [envStatus, setEnvStatus] = useState<EnvironmentStatus | null>(null);
  const [envChecking, setEnvChecking] = useState(false);
  const [envDialogOpen, setEnvDialogOpen] = useState(false);
  const [snapshotPrefs, setSnapshotPrefs] = useState<SnapshotPreferences>(
    DEFAULT_SNAPSHOT_PREFERENCES,
  );
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [lfsSubmodulesOpen, setLfsSubmodulesOpen] = useState(false);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [undoPlan, setUndoPlan] = useState<UndoPlan | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoError, setUndoError] = useState("");
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
  const [commitImageDiff, setCommitImageDiff] = useState<ImageDiff | null>(
    null,
  );
  const [preferTextForImage, setPreferTextForImage] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
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
  const [draggingSplit, setDraggingSplit] = useState(false);
  const [authorWidth, setAuthorWidth] = useState(160);
  const [showAuthor, setShowAuthor] = useState(true);
  const [showHash, setShowHash] = useState(false);
  const [showDate, setShowDate] = useState(true);
  const [refsWidth, setRefsWidth] = useState(DEFAULT_REFS_COL_WIDTH);
  const [draggingRefsCol, setDraggingRefsCol] = useState(false);
  const request = useRef(0),
    filesRequest = useRef(0),
    diffRequest = useRef(0),
    imageDiffRequest = useRef(0);
  const mainShellRef = useRef<HTMLElement>(null);
  const splitResizeCleanup = useRef<(() => void) | null>(null);
  const refsResizeCleanup = useRef<(() => void) | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const restoreSelectionPosition = useRef(false);
  const tableHeading = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const writingRef = useRef(writing);
  const historyScopeRef = useRef(historyScope);
  writingRef.current = writing;
  historyScopeRef.current = historyScope;
  const commits = repo?.page.commits ?? [];
  const isTributary = graphStyle === "tributary";
  const activeRowHeight = isTributary
    ? TRIBUTARY_ROW_HEIGHT
    : COMPACT_ROW_HEIGHT;
  const rows = useMemo(() => layoutGraph(commits), [commits]);
  const graphWidth = useMemo(
    () => graphPixelWidth(rows, graphStyle),
    [rows, graphStyle],
  );
  const graphColors = useMemo(
    () => resolveGraphColors(graphPalette, theme),
    [graphPalette, theme],
  );
  useEffect(() => {
    applyAppearance(theme, graphPalette, graphStyle);
  }, [theme, graphPalette, graphStyle]);
  useEffect(
    () => () => {
      splitResizeCleanup.current?.();
      refsResizeCleanup.current?.();
    },
    [],
  );
  function startRefsResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    refsResizeCleanup.current?.();
    setDraggingRefsCol(true);
    const startX = event.clientX;
    const startWidth = refsWidth;
    const move = (ev: PointerEvent) => {
      const nextWidth = Math.round(startWidth + (ev.clientX - startX));
      setRefsWidth(
        Math.max(MIN_REFS_COL_WIDTH, Math.min(MAX_REFS_COL_WIDTH, nextWidth)),
      );
    };
    const stop = () => {
      setDraggingRefsCol(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      refsResizeCleanup.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    refsResizeCleanup.current = stop;
  }
  function startInspectorResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    splitResizeCleanup.current?.();
    setDraggingSplit(true);
    const move = (ev: PointerEvent) => {
      const rect = mainShellRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const pct = Math.round(((rect.right - ev.clientX) / rect.width) * 100);
      setInspectorSize(Math.max(30, Math.min(60, pct)));
    };
    const stop = () => {
      setDraggingSplit(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      splitResizeCleanup.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    splitResizeCleanup.current = stop;
  }
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    void invoke<AppSettings>("read_app_settings")
      .then((loaded) => {
        if (!active || !loaded) return;
        const resolvedTheme = isThemeId(loaded.theme) ? loaded.theme : theme;
        const resolvedPalette = isGraphPaletteId(loaded.graphPalette)
          ? loaded.graphPalette
          : graphPalette;
        const resolvedExternal = loaded.external ?? externalPreferences;
        const resolvedSnapshots = loaded.snapshots ?? snapshotPrefs;
        const resolvedStyle = isGraphStyleId(loaded.graphStyle)
          ? loaded.graphStyle
          : graphStyle;
        if (isThemeId(loaded.theme)) setTheme(loaded.theme);
        if (isGraphPaletteId(loaded.graphPalette))
          setGraphPalette(loaded.graphPalette);
        if (isGraphStyleId(loaded.graphStyle)) {
          graphStyleTouchedRef.current = true;
          setGraphStyle(loaded.graphStyle);
        }
        if (loaded.external) setExternalPreferences(loaded.external);
        if (loaded.snapshots) {
          snapshotsTouchedRef.current = true;
          setSnapshotPrefs(loaded.snapshots);
        }
        if (
          !startupRestoredRef.current &&
          Array.isArray(loaded.openTabs) &&
          loaded.openTabs.length > 0
        ) {
          startupRestoredRef.current = true;
          void restoreStartupTabs(
            loaded.openTabs,
            loaded.activeTab ?? null,
            resolvedTheme,
            resolvedPalette,
            resolvedExternal,
            resolvedSnapshots,
            resolvedStyle,
          );
        }
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
  function buildSettingsPayload(
    nextTheme: ThemeId,
    nextPalette: GraphPaletteId,
    nextExternal: ExternalPreferences,
    tabList: TabEntry[],
    currentId: string | null,
    nextSnapshots = snapshotPrefs,
    nextStyle = graphStyle,
  ): AppSettings {
    const payload: AppSettings = {
      version: 1,
      theme: nextTheme,
      graphPalette: nextPalette,
      external: nextExternal,
    };
    if (graphStyleTouchedRef.current) {
      payload.graphStyle = nextStyle;
    }
    if (snapshotsTouchedRef.current) {
      payload.snapshots = nextSnapshots;
    }
    if (tabList.length > 0 || tabsTouchedRef.current) {
      payload.openTabs = tabList.map((item) => item.snapshot.path);
      payload.activeTab =
        tabList.find((item) => item.snapshot.id === currentId)?.snapshot.path ??
        null;
    }
    return payload;
  }
  function persistTabState(
    nextTabs: TabEntry[],
    nextActiveId: string | null,
    overrideTheme = theme,
    overridePalette = graphPalette,
    overrideExternal = externalPreferences,
    overrideSnapshots = snapshotPrefs,
    overrideStyle = graphStyle,
  ) {
    if (!isTauri()) return;
    void persistSettings(
      buildSettingsPayload(
        overrideTheme,
        overridePalette,
        overrideExternal,
        nextTabs,
        nextActiveId,
        overrideSnapshots,
        overrideStyle,
      ),
    ).catch(() => {});
  }
  function snapshotCurrentUi(list: TabEntry[], currentId: string | null) {
    if (!currentId) return list;
    return list.map((item) =>
      item.snapshot.id === currentId
        ? {
            ...item,
            view,
            lastSyncView,
            selected,
            historyScope,
            query,
            inspectorOpen,
            inspectorSize,
            authorWidth,
            showAuthor,
            showDate,
            showHash,
            refsWidth,
            preferencesRepo,
            branchPreselect,
          }
        : item,
    );
  }
  function resetTransientInspectorState() {
    setSelectedFile(null);
    setCommitFiles(null);
    setDiff(null);
    setCommitImageDiff(null);
    setPreferTextForImage(false);
    setDiffError("");
    setParentIndex(0);
    setContextMenu(null);
    setPaletteOpen(false);
    setShortcutsOpen(false);
    setStashOpen(false);
    setRestoreOpen(false);
    setReplay(undefined);
    setTagTarget(null);
    setTagPublication(undefined);
    setSearchDialogMode(null);
    setExternalCommit(null);
    setFileHistoryTarget(null);
    setBlameTarget(null);
    setComparePair(null);
    setCompareAnchor(null);
    setSnapshotsOpen(false);
    setLfsSubmodulesOpen(false);
    setUndoPlan(null);
    setUndoError("");
  }
  function applyTabUi(tab: TabEntry | null) {
    resetTransientInspectorState();
    setError("");
    setNotice("");
    if (!tab) {
      setView("history");
      setLastSyncView("remotes");
      setSelected(null);
      setHistoryScope("all");
      setQuery("");
      setInspectorOpen(true);
      setInspectorSize(38);
      setAuthorWidth(160);
      setShowAuthor(true);
      setShowDate(true);
      setShowHash(false);
      setRefsWidth(DEFAULT_REFS_COL_WIDTH);
      setPreferencesRepo(null);
      setBranchPreselect(null);
      return;
    }
    restoreSelectionPosition.current = !!tab.selected;
    setView(tab.view);
    setLastSyncView(tab.lastSyncView);
    setSelected(tab.selected);
    setHistoryScope(tab.historyScope);
    setQuery(tab.query);
    setInspectorOpen(tab.inspectorOpen);
    setInspectorSize(tab.inspectorSize);
    setAuthorWidth(tab.authorWidth);
    setShowAuthor(tab.showAuthor);
    setShowDate(tab.showDate);
    setShowHash(tab.showHash);
    setRefsWidth(tab.refsWidth);
    setPreferencesRepo(tab.preferencesRepo);
    setBranchPreselect(tab.branchPreselect);
  }
  async function refreshWip(targetId: string) {
    if (!isTauri()) return;
    try {
      const summary = await invoke<WorktreeSummary>("read_worktree_summary", {
        id: targetId,
      });
      setTabs((list) => {
        const nextList = list.map((item) =>
          item.snapshot.id === targetId ? { ...item, wip: summary } : item,
        );
        tabsRef.current = nextList;
        return nextList;
      });
    } catch {
      // Silencioso: no interrumpir la sesión si falla la lectura rápida de estado.
    }
  }
  async function refreshWorktrees(targetId: string) {
    if (!isTauri()) return;
    try {
      const wtState = await invoke<WorktreesState>("read_worktrees", {
        id: targetId,
      });
      setTabs((list) => {
        const nextList = list.map((item) =>
          item.snapshot.id === targetId
            ? { ...item, worktrees: wtState }
            : item,
        );
        tabsRef.current = nextList;
        return nextList;
      });
    } catch {
      // Silencioso: no interrumpir si la lectura de worktrees falla puntualmente.
    }
  }
  async function refreshTabBackground(targetId: string, scope: string) {
    if (!isTauri()) return;
    try {
      let effectiveScope = scope;
      let next: Snapshot;
      try {
        next = await invoke<Snapshot>("refresh_repository", {
          id: targetId,
          scope: effectiveScope,
        });
      } catch (err) {
        const code =
          typeof err === "object" && err && "code" in err
            ? String((err as { code?: unknown }).code)
            : "";
        if (code === "INVALID_SCOPE" && effectiveScope !== "all") {
          effectiveScope = "all";
          next = await invoke<Snapshot>("refresh_repository", {
            id: targetId,
            scope: "all",
          });
        } else {
          return;
        }
      }
      setTabs((list) => {
        const nextList = list.map((item) =>
          item.snapshot.id === targetId
            ? { ...item, snapshot: next, historyScope: effectiveScope }
            : item,
        );
        tabsRef.current = nextList;
        return nextList;
      });
      if (activeTabIdRef.current === targetId) {
        setHistoryScope(effectiveScope);
        setSelected((current) =>
          next.page.commits.some((c) => c.hash === current)
            ? current
            : ((next.page.commits.some((c) => c.hash === next.head)
                ? next.head
                : null) ??
              next.page.commits[0]?.hash ??
              null),
        );
        setParentIndex(0);
        setChangesRevision((value) => value + 1);
      }
    } catch {
      // Silencioso al refrescar pestaña al cambiar el foco.
    }
  }
  async function recheckEnvironment(autoOpenIfMissing = false) {
    if (!isTauri()) return;
    setEnvChecking(true);
    try {
      const status = await invoke<EnvironmentStatus>("check_git_environment");
      setEnvStatus(status);
      if (autoOpenIfMissing && !status.gitAvailable) {
        setEnvDialogOpen(true);
      }
    } catch {
      // Silencioso si el comando de entorno no está disponible en mocks antiguos.
    } finally {
      setEnvChecking(false);
    }
  }
  useEffect(() => {
    void recheckEnvironment(true);
  }, []);
  async function refreshUndoState(targetId: string) {
    if (!isTauri()) return;
    try {
      const next = await invoke<UndoState>("read_undo_state", { id: targetId });
      if (activeTabIdRef.current === targetId && next) {
        setUndoState(next);
      }
    } catch {
      // Silencioso cuando un entorno de prueba no implementa el historial de undo.
    }
  }
  useEffect(() => {
    if (!activeTabId) {
      setUndoState(null);
      return;
    }
    void refreshUndoState(activeTabId);
  }, [activeTabId]);
  async function openUndoPreview(direction: "undo" | "redo") {
    if (!repo || writing || undoBusy) return;
    setUndoBusy(true);
    setUndoError("");
    try {
      const plan = await invoke<UndoPlan>("preview_undo", {
        id: repo.id,
        direction,
      });
      setUndoPlan(plan);
    } catch (reason) {
      const code =
        typeof reason === "object" && reason && "code" in reason
          ? String((reason as { code?: unknown }).code)
          : "";
      if (code === "NO_UNDO" || code === "NO_REDO") {
        setNotice(errorText(reason));
      } else {
        setError(errorText(reason));
      }
    } finally {
      setUndoBusy(false);
    }
  }
  async function confirmUndoPlan() {
    if (!repo || !undoPlan || undoBusy) return;
    setUndoBusy(true);
    setUndoError("");
    setWriting(true);
    try {
      const outcome = await invoke<UndoOutcome>("confirm_undo", {
        id: repo.id,
        token: undoPlan.token,
      });
      setUndoState(outcome.state);
      setUndoPlan(null);
      setNotice(outcome.message);
      await refresh();
    } catch (reason) {
      setUndoError(errorText(reason));
    } finally {
      setWriting(false);
      setUndoBusy(false);
    }
  }
  async function saveSnapshotPreferences(nextSnapshots: SnapshotPreferences) {
    snapshotsTouchedRef.current = true;
    setSnapshotPrefs(nextSnapshots);
    await persistSettings(
      buildSettingsPayload(
        theme,
        graphPalette,
        externalPreferences,
        tabsRef.current,
        activeTabIdRef.current,
        nextSnapshots,
      ),
    );
  }
  useEffect(() => {
    if (
      !isTauri() ||
      !repo ||
      !repo.trusted ||
      !snapshotPrefs.autoEnabled ||
      (wip?.total ?? 0) <= 0
    ) {
      return;
    }
    const intervalMs = Math.max(1, snapshotPrefs.intervalMinutes) * 60_000;
    const targetRepoId = repo.id;
    const timer = window.setInterval(() => {
      if (writingRef.current || activeTabIdRef.current !== targetRepoId) return;
      void invoke("create_snapshot", {
        id: targetRepoId,
        label: null,
        trigger: "auto",
      }).catch(() => {});
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [
    repo?.id,
    repo?.trusted,
    snapshotPrefs.autoEnabled,
    snapshotPrefs.intervalMinutes,
    wip?.total,
  ]);
  function activateTab(nextId: string) {
    if (nextId === activeTabIdRef.current || writing || busy || loadingMore)
      return;
    const target = tabsRef.current.find((item) => item.snapshot.id === nextId);
    if (!target) return;
    const persisted = snapshotCurrentUi(
      tabsRef.current,
      activeTabIdRef.current,
    );
    tabsTouchedRef.current = true;
    tabsRef.current = persisted;
    activeTabIdRef.current = nextId;
    setTabs(persisted);
    setActiveTabId(nextId);
    applyTabUi(target);
    persistTabState(persisted, nextId);
    if (isTauri()) {
      void refreshWip(nextId);
      void refreshWorktrees(nextId);
      void refreshTabBackground(nextId, target.historyScope);
    }
  }
  function updateRepoTrust(targetId: string, nextTrusted: boolean) {
    if (nextTrusted) {
      dismissedTrustIdsRef.current.delete(targetId);
    }
    setTabs((list) => {
      const nextList = list.map((item) =>
        item.snapshot.id === targetId
          ? { ...item, snapshot: { ...item.snapshot, trusted: nextTrusted } }
          : item,
      );
      tabsRef.current = nextList;
      return nextList;
    });
    if (activeTabIdRef.current === targetId) {
      setChangesRevision((value) => value + 1);
    }
    void refreshWip(targetId);
    void refreshWorktrees(targetId);
  }
  async function closeTab(targetId: string) {
    if (writing || busy || loadingMore) return;
    const currentTabs = tabsRef.current;
    const index = currentTabs.findIndex(
      (item) => item.snapshot.id === targetId,
    );
    if (index < 0) return;
    try {
      await invoke("close_repository", { id: targetId });
    } catch (reason) {
      setError(errorText(reason));
      return;
    }
    const remaining = currentTabs.filter(
      (item) => item.snapshot.id !== targetId,
    );
    const closingActive = targetId === activeTabIdRef.current;
    const nextActive = closingActive
      ? (remaining[Math.min(index, remaining.length - 1)] ?? null)
      : (remaining.find(
          (item) => item.snapshot.id === activeTabIdRef.current,
        ) ?? null);
    const nextActiveId = nextActive?.snapshot.id ?? null;
    dismissedTrustIdsRef.current.delete(targetId);
    setTrustPromptRepoId((current) => (current === targetId ? null : current));
    tabsTouchedRef.current = true;
    tabsRef.current = remaining;
    activeTabIdRef.current = nextActiveId;
    setTabs(remaining);
    setActiveTabId(nextActiveId);
    if (closingActive) {
      applyTabUi(nextActive);
    }
    persistTabState(remaining, nextActiveId);
  }
  function reorderTabs(fromId: string, toId: string) {
    if (fromId === toId || writing || busy || loadingMore) return;
    const list = [...tabsRef.current];
    const fromIdx = list.findIndex((item) => item.snapshot.id === fromId);
    const toIdx = list.findIndex((item) => item.snapshot.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    tabsTouchedRef.current = true;
    tabsRef.current = list;
    setTabs(list);
    persistTabState(list, activeTabIdRef.current);
  }
  async function restoreStartupTabs(
    paths: string[],
    preferredPath: string | null,
    resolvedTheme: ThemeId,
    resolvedPalette: GraphPaletteId,
    resolvedExternal: ExternalPreferences,
    resolvedSnapshots: SnapshotPreferences,
    resolvedStyle: GraphStyleId,
  ) {
    const openedList: TabEntry[] = [];
    const failedPaths: string[] = [];
    for (const targetPath of paths.slice(0, MAX_OPEN_TABS)) {
      if (tabsRef.current.some((item) => item.snapshot.path === targetPath)) {
        continue;
      }
      try {
        let next = await invoke<Snapshot>("open_repository", {
          path: targetPath,
        });
        let saved: HistoryPreferences | undefined;
        let remembered = false;
        try {
          const library = await invoke<RepositoryLibrary>(
            "remember_repository",
            { id: next.id },
          );
          saved = library.repositories.find(
            (entry) => entry.path === next.path,
          )?.preferences;
          remembered = true;
        } catch {
          // Optional library metadata failure should not prevent restoring the tab.
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
            }
          } else {
            restoredScope = "all";
          }
        }
        const entry = defaultTabEntry(next);
        entry.historyScope = restoredScope;
        entry.inspectorOpen = saved?.inspectorOpen ?? true;
        entry.inspectorSize = saved?.inspectorSize ?? 38;
        entry.authorWidth = saved?.authorWidth ?? 160;
        entry.showAuthor = saved?.showAuthor ?? true;
        entry.showDate = saved?.showDate ?? true;
        entry.showHash = saved?.showHash ?? false;
        entry.refsWidth = saved?.refsWidth ?? DEFAULT_REFS_COL_WIDTH;
        entry.query = saved?.query ?? "";
        entry.preferencesRepo = remembered ? next.id : null;
        entry.selected =
          (next.page.commits.some((c) => c.hash === saved?.selectedCommit)
            ? saved!.selectedCommit
            : null) ??
          (next.page.commits.some((c) => c.hash === next.head)
            ? next.head
            : null) ??
          next.page.commits[0]?.hash ??
          null;
        openedList.push(entry);
      } catch {
        failedPaths.push(targetPath);
      }
    }
    if (!openedList.length) {
      if (failedPaths.length) {
        setNotice(
          "No se pudieron restaurar las pestañas anteriores porque sus carpetas no están disponibles.",
        );
      }
      return;
    }
    const merged = [...tabsRef.current];
    for (const entry of openedList) {
      if (!merged.some((item) => item.snapshot.id === entry.snapshot.id)) {
        merged.push(entry);
      }
    }
    const target =
      merged.find((item) => item.snapshot.path === preferredPath) ??
      openedList[0];
    tabsTouchedRef.current = true;
    tabsRef.current = merged;
    activeTabIdRef.current = target.snapshot.id;
    setTabs(merged);
    setActiveTabId(target.snapshot.id);
    applyTabUi(target);
    persistTabState(
      merged,
      target.snapshot.id,
      resolvedTheme,
      resolvedPalette,
      resolvedExternal,
      resolvedSnapshots,
      resolvedStyle,
    );
    void refreshWip(target.snapshot.id);
    void refreshWorktrees(target.snapshot.id);
    if (failedPaths.length) {
      setNotice(
        `No se restauraron ${failedPaths.length} pestañas porque sus rutas ya no están disponibles.`,
      );
    }
  }
  function changeAppearance(nextTheme: ThemeId, nextPalette: GraphPaletteId) {
    setTheme(nextTheme);
    setGraphPalette(nextPalette);
    applyAppearance(nextTheme, nextPalette, graphStyle);
    void persistSettings(
      buildSettingsPayload(
        nextTheme,
        nextPalette,
        externalPreferences,
        tabsRef.current,
        activeTabIdRef.current,
      ),
    ).catch((reason) =>
      setNotice(
        `No se pudo guardar la apariencia en disco: ${errorText(reason)}`,
      ),
    );
  }
  function changeGraphStyle(nextStyle: GraphStyleId) {
    graphStyleTouchedRef.current = true;
    setGraphStyle(nextStyle);
    applyAppearance(theme, graphPalette, nextStyle);
    void persistSettings(
      buildSettingsPayload(
        theme,
        graphPalette,
        externalPreferences,
        tabsRef.current,
        activeTabIdRef.current,
        snapshotPrefs,
        nextStyle,
      ),
    ).catch((reason) =>
      setNotice(
        `No se pudo guardar el estilo del grafo en disco: ${errorText(reason)}`,
      ),
    );
  }
  async function saveExternalPreferences(nextExternal: ExternalPreferences) {
    setExternalPreferences(nextExternal);
    setExternalApps((current) =>
      current ? { ...current, preferences: nextExternal } : current,
    );
    await persistSettings(
      buildSettingsPayload(
        theme,
        graphPalette,
        nextExternal,
        tabsRef.current,
        activeTabIdRef.current,
      ),
    );
    await reloadExternalApps();
  }
  const historyColumns = isTributary
    ? `${refsWidth}px ${graphWidth}px minmax(260px,1fr)${showAuthor ? ` ${authorWidth}px` : ""}${showDate ? " 108px" : ""}${showHash ? " 80px" : ""}`
    : `${graphWidth}px minmax(240px,1fr)${showAuthor ? ` ${authorWidth}px` : ""}${showDate ? " 90px" : ""}${showHash ? " 80px" : ""}`;
  const historyMinWidth = isTributary
    ? refsWidth +
      graphWidth +
      260 +
      (showAuthor ? authorWidth : 0) +
      (showDate ? 108 : 0) +
      (showHash ? 80 : 0)
    : graphWidth +
      240 +
      (showAuthor ? authorWidth : 0) +
      (showDate ? 90 : 0) +
      (showHash ? 80 : 0);
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
  const tributaryLayout = useMemo(
    () => (isTributary && !query ? buildTributaryItems(commits, rows) : null),
    [isTributary, query, commits, rows],
  );
  const wipMarker = useMemo(() => {
    if (!wip?.trusted || wip.total <= 0) return null;
    const headIdx = Math.max(
      0,
      commits.findIndex((c) => c.hash === repo?.head),
    );
    const lane = rows[headIdx]?.lane ?? 0;
    const x = isTributary
      ? 26 + lane * 34
      : graphWidth > 20
        ? 16
        : Math.floor(graphWidth / 2);
    const color = isTributary
      ? (graphColors[(rows[headIdx]?.color ?? 0) % graphColors.length] ??
        "var(--accent-text)")
      : "var(--accent-text)";
    return { x, color };
  }, [wip, commits, repo?.head, rows, isTributary, graphWidth, graphColors]);
  const virtual = useVirtualizer({
    count: query
      ? visible.length
      : tributaryLayout
        ? tributaryLayout.items.length
        : commits.length,
    getItemKey: (index) => {
      if (query) return `search-${commits[visible[index]].hash}`;
      if (tributaryLayout) {
        const entry = tributaryLayout.items[index];
        return entry?.kind === "group"
          ? `group-${entry.id}`
          : commits[entry.commitIndex].hash;
      }
      return commits[index].hash;
    },
    getScrollElement: () => scroll.current,
    estimateSize: (index) => {
      if (query) return 64;
      if (tributaryLayout && typeof index === "number") {
        return tributaryLayout.items[index]?.kind === "group"
          ? TRIBUTARY_GROUP_HEIGHT
          : TRIBUTARY_ROW_HEIGHT;
      }
      return activeRowHeight;
    },
    overscan: 12,
  });
  useEffect(() => {
    virtual.measure?.();
  }, [activeRowHeight, tributaryLayout, virtual]);
  function scrollToCommitIndex(
    commitIndex: number,
    align: "auto" | "center" = "auto",
  ) {
    const itemIndex =
      !query && tributaryLayout
        ? (tributaryLayout.commitToItemIndex[commitIndex] ?? commitIndex)
        : commitIndex;
    virtual.scrollToIndex(itemIndex, { align });
  }
  const active =
    commits.find((c) => c.hash === selected) ??
    (externalCommit?.hash === selected ? externalCommit : null);
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
      scrollToCommitIndex(index, "center");
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
      showAuthor,
      showDate,
      showHash,
      refsWidth,
      scope: historyScope,
      query,
      selectedCommit: selected || null,
    };
  }
  async function openRepositoryPath(path: string) {
    const existing = tabsRef.current.find(
      (item) => item.snapshot.path === path,
    );
    if (existing) {
      if (existing.snapshot.id !== activeTabIdRef.current) {
        activateTab(existing.snapshot.id);
      }
      return true;
    }
    return choose(path);
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
      const existing = tabsRef.current.find(
        (item) =>
          item.snapshot.id === next.id || item.snapshot.path === next.path,
      );
      if (!existing && tabsRef.current.length >= MAX_OPEN_TABS) {
        void invoke("close_repository", { id: next.id }).catch(() => {});
        setNotice(
          `Ya hay ${MAX_OPEN_TABS} pestañas abiertas. Cierra una antes de abrir otro repositorio.`,
        );
        return false;
      }
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
      const selectedHash =
        (next.page.commits.some((c) => c.hash === saved?.selectedCommit)
          ? saved!.selectedCommit
          : null) ??
        (next.page.commits.some((c) => c.hash === next.head)
          ? next.head
          : null) ??
        next.page.commits[0]?.hash ??
        "";
      const nextEntry: TabEntry = {
        ...(existing ?? defaultTabEntry(next)),
        snapshot: next,
        historyScope: restoredScope,
        inspectorOpen: saved?.inspectorOpen ?? existing?.inspectorOpen ?? true,
        inspectorSize: saved?.inspectorSize ?? existing?.inspectorSize ?? 38,
        authorWidth: saved?.authorWidth ?? existing?.authorWidth ?? 160,
        showAuthor: saved?.showAuthor ?? existing?.showAuthor ?? true,
        showDate: saved?.showDate ?? existing?.showDate ?? true,
        showHash: saved?.showHash ?? existing?.showHash ?? false,
        refsWidth:
          saved?.refsWidth ?? existing?.refsWidth ?? DEFAULT_REFS_COL_WIDTH,
        query: saved?.query ?? existing?.query ?? "",
        selected: selectedHash,
        preferencesRepo: remembered ? next.id : null,
        branchPreselect: null,
      };
      const updatedList = snapshotCurrentUi(
        tabsRef.current,
        activeTabIdRef.current,
      );
      const nextTabs = existing
        ? updatedList.map((item) =>
            item.snapshot.id === nextEntry.snapshot.id ||
            item.snapshot.path === nextEntry.snapshot.path
              ? nextEntry
              : item,
          )
        : [...updatedList, nextEntry];
      tabsTouchedRef.current = true;
      tabsRef.current = nextTabs;
      activeTabIdRef.current = next.id;
      setTabs(nextTabs);
      setActiveTabId(next.id);
      resetTransientInspectorState();
      restoreSelectionPosition.current = !!saved?.selectedCommit;
      setView(nextEntry.view);
      setLastSyncView(nextEntry.lastSyncView);
      setBranchPreselect(null);
      setHistoryScope(restoredScope);
      setInspectorOpen(nextEntry.inspectorOpen);
      setInspectorSize(nextEntry.inspectorSize);
      setAuthorWidth(nextEntry.authorWidth);
      setShowAuthor(nextEntry.showAuthor);
      setShowDate(nextEntry.showDate);
      setShowHash(nextEntry.showHash);
      setRefsWidth(nextEntry.refsWidth);
      select(selectedHash);
      setQuery(nextEntry.query);
      setPreferencesRepo(remembered ? next.id : null);
      scroll.current?.scrollTo({ top: 0, left: 0 });
      persistTabState(nextTabs, next.id);
      void refreshWip(next.id);
      void refreshWorktrees(next.id);
      void refreshUndoState(next.id);
      if (
        next.trusted === false &&
        !dismissedTrustIdsRef.current.has(next.id)
      ) {
        setTrustPromptRepoId(next.id);
      }
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
    showAuthor,
    showDate,
    showHash,
    refsWidth,
    historyScope,
    query,
    selected,
  ]);
  async function refresh(
    nextScope = historyScope,
    resetPosition = false,
    locateHead = false,
    silent = false,
  ) {
    if (!repo) return false;
    const targetId = repo.id;
    const token = ++request.current;
    if (!silent) {
      setBusy(true);
      setError("");
      setNotice("");
    }
    try {
      let effectiveScope = nextScope;
      let next: Snapshot;
      try {
        next = await invoke<Snapshot>("refresh_repository", {
          id: targetId,
          scope: effectiveScope,
        });
      } catch (err) {
        const code =
          typeof err === "object" && err && "code" in err
            ? String((err as { code?: unknown }).code)
            : "";
        if (code === "INVALID_SCOPE" && effectiveScope !== "all") {
          effectiveScope = "all";
          next = await invoke<Snapshot>("refresh_repository", {
            id: targetId,
            scope: "all",
          });
        } else {
          throw err;
        }
      }
      if (token !== request.current) return false;
      setTabs((list) =>
        list.map((item) =>
          item.snapshot.id === targetId
            ? { ...item, snapshot: next, historyScope: effectiveScope }
            : item,
        ),
      );
      if (activeTabIdRef.current === targetId) {
        setHistoryScope(effectiveScope);
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
        setChangesRevision((value) => value + 1);
      }
      void refreshWip(targetId);
      void refreshWorktrees(targetId);
      void refreshUndoState(targetId);
      return true;
    } catch (e) {
      if (!silent && token === request.current) setError(errorText(e));
      return false;
    } finally {
      if (!silent && token === request.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!isTauri()) return;
    void invoke("watch_repository", { id: activeTabId ?? null }).catch(
      () => {},
    );
  }, [activeTabId]);
  useEffect(() => {
    if (!isTauri()) return;
    return () => {
      void invoke("watch_repository", { id: null }).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<RepoChangedEvent>("ravengit://repo-changed", ({ payload }) => {
      if (disposed || !payload || payload.id !== activeTabIdRef.current) return;
      if (writingRef.current) return;
      if (payload.kind === "worktree") {
        void refreshWip(payload.id);
        setChangesRevision((value) => value + 1);
      } else {
        void refreshTabBackground(payload.id, historyScopeRef.current);
        void refreshWip(payload.id);
        void refreshWorktrees(payload.id);
        void refreshUndoState(payload.id);
      }
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    if (view === "history" && activeTabId && isTauri()) {
      void refreshWip(activeTabId);
    }
  }, [view, activeTabId]);
  useEffect(() => {
    if (!isTauri()) return;
    const onFocus = () => {
      if (!activeTabIdRef.current || writing || busy || loadingMore) return;
      const now = Date.now();
      if (now - lastFocusRefreshRef.current < 1500) return;
      lastFocusRefreshRef.current = now;
      void refresh(historyScope, false, false, true);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [repo?.id, historyScope, writing, busy, loadingMore]);
  async function more() {
    if (!repo || repo.page.nextOffset === null) return;
    const targetId = repo.id;
    const token = request.current;
    setLoadingMore(true);
    setError("");
    try {
      const page = await invoke<HistoryPage>("read_history", {
        id: targetId,
        offset: repo.page.nextOffset,
        generation: repo.page.generation,
        scope: historyScope,
      });
      if (token !== request.current) return;
      setTabs((list) =>
        list.map((item) =>
          item.snapshot.id === targetId
            ? {
                ...item,
                snapshot: {
                  ...item.snapshot,
                  page: {
                    ...page,
                    commits: [...item.snapshot.page.commits, ...page.commits],
                  },
                },
              }
            : item,
        ),
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
    const token = ++imageDiffRequest.current;
    setCommitImageDiff(null);
    setPreferTextForImage(false);
    if (
      !repo ||
      !selected ||
      !selectedFile ||
      !isImageAssetPath(selectedFile.path) ||
      view !== "history" ||
      !inspectorOpen
    ) {
      return;
    }
    invoke<ImageDiff>("read_image_diff", {
      id: repo.id,
      source: {
        kind: "commit",
        hash: selected,
        parentIndex,
        path: selectedFile.path,
        oldPath: selectedFile.oldPath ?? null,
      },
    })
      .then((value) => {
        if (token === imageDiffRequest.current) setCommitImageDiff(value);
      })
      .catch(() => {
        if (token === imageDiffRequest.current) setCommitImageDiff(null);
      });
    return () => {
      imageDiffRequest.current++;
    };
  }, [
    repo?.id,
    selected,
    parentIndex,
    selectedFile?.path,
    selectedFile?.oldPath,
    view,
    inspectorOpen,
  ]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const hasModalDialog = !!document.querySelector("dialog[open]");
      const target = e.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (
        e.key === "?" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !inEditable
      ) {
        if (shortcutsOpen) {
          e.preventDefault();
          setShortcutsOpen(false);
          return;
        }
        if (hasModalDialog || paletteOpen) return;
        e.preventDefault();
        setContextMenu(null);
        setShortcutsOpen(true);
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      const lower = e.key.toLowerCase();

      if (lower === "k") {
        if (hasModalDialog && !paletteOpen) return;
        e.preventDefault();
        setContextMenu(null);
        if (!writing) setPaletteOpen((open) => !open);
        return;
      }
      if (hasModalDialog || paletteOpen) return;

      if (e.key === "Tab" && e.ctrlKey && !e.metaKey && !e.altKey) {
        if (tabsRef.current.length > 1 && !writing && !busy && !loadingMore) {
          e.preventDefault();
          const idx = tabsRef.current.findIndex(
            (item) => item.snapshot.id === activeTabIdRef.current,
          );
          const step = e.shiftKey ? -1 : 1;
          const nextIdx =
            (Math.max(0, idx) + step + tabsRef.current.length) %
            tabsRef.current.length;
          activateTab(tabsRef.current[nextIdx].snapshot.id);
        }
        return;
      }

      if (lower === "o" || lower === "t") {
        e.preventDefault();
        if (!busy && !loadingMore && !writing) void choose();
      } else if (lower === "w") {
        if (!activeTabIdRef.current) return;
        e.preventDefault();
        if (!busy && !loadingMore && !writing) {
          void closeTab(activeTabIdRef.current);
        }
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
        if (e.shiftKey) {
          setSearchDialogMode("history");
        } else {
          setView("history");
          requestAnimationFrame(() => searchInput.current?.focus());
        }
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
      } else if (!inEditable && repo && !writing) {
        if (lower === "z" && !e.shiftKey) {
          e.preventDefault();
          void openUndoPreview("undo");
        } else if (
          (lower === "z" && e.shiftKey) ||
          (lower === "y" && !e.shiftKey)
        ) {
          e.preventDefault();
          void openUndoPreview("redo");
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
        ...(active && active.hash !== commit.hash
          ? [
              {
                id: "compare-with-active",
                label: `Comparar con seleccionado (${short(active.hash)})…`,
                separatorBefore: true,
                onSelect: () => openOrderedComparison(active, commit),
              },
            ]
          : []),
        {
          id: "compare-anchor",
          label: "Marcar para comparar con otro commit…",
          onSelect: () => setCompareAnchor(commit),
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
  function openWorktreeContextMenu(wt: WorktreeItem, x: number, y: number) {
    if (!repo) return;
    const launchWt = (kind: "editor" | "terminal" | "explorer") => {
      void invoke<{ message: string }>("open_worktree_external", {
        id: repo.id,
        path: wt.path,
        kind,
      })
        .then((res) => setNotice(res.message))
        .catch((reason) => setError(errorText(reason)));
    };
    setContextMenu({
      x,
      y,
      label: `Acciones del worktree ${wt.name}`,
      items: [
        {
          id: "wt-tab",
          label: "Abrir en pestaña",
          disabled: writing || wt.current || wt.prunable,
          onSelect: () => void openRepositoryPath(wt.path),
        },
        {
          id: "wt-editor",
          label: "Abrir en editor",
          disabled: writing || wt.prunable,
          onSelect: () => launchWt("editor"),
        },
        {
          id: "wt-terminal",
          label: "Abrir en terminal",
          disabled: writing || wt.prunable,
          onSelect: () => launchWt("terminal"),
        },
        {
          id: "wt-explorer",
          label: "Mostrar en carpeta",
          disabled: writing || wt.prunable,
          onSelect: () => launchWt("explorer"),
        },
        {
          id: "wt-manage",
          label: "Gestionar worktrees…",
          separatorBefore: true,
          disabled: writing,
          onSelect: () => setWorktreeOpen(true),
        },
      ],
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
        id: "search-deep",
        category: "Historial",
        label: "Búsqueda profunda en todo el historial…",
        shortcut: "⌘⇧F",
        disabled: !repo || writing,
        onSelect: () => setSearchDialogMode("history"),
      },
      {
        id: "search-code",
        category: "Historial",
        label: "Buscar texto o símbolo en código (-S / -G)…",
        disabled: !repo || writing,
        onSelect: () => setSearchDialogMode("code"),
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
        id: "worktrees",
        category: "Git",
        label: "Worktrees…",
        disabled: !repo || writing,
        onSelect: () => setWorktreeOpen(true),
      },
      {
        id: "authorize-repo",
        category: "Git",
        label: "Autorizar repositorio actual…",
        disabled: !repo || repo.trusted !== false || writing,
        onSelect: () => {
          if (repo) setTrustPromptRepoId(repo.id);
        },
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
        id: "new-tab-repo",
        category: "Pestañas",
        label: "Abrir repositorio en nueva pestaña…",
        shortcut: "⌘T",
        disabled: busy || loadingMore || writing,
        onSelect: () => void choose(),
      },
      {
        id: "close-tab-repo",
        category: "Pestañas",
        label: "Cerrar pestaña actual",
        shortcut: "⌘W",
        disabled: !activeTabId || busy || loadingMore || writing,
        onSelect: () => {
          if (activeTabId) void closeTab(activeTabId);
        },
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
      {
        id: "snapshots",
        category: "Seguridad",
        label: "Snapshots locales…",
        disabled: !repo || writing,
        onSelect: () => setSnapshotsOpen(true),
      },
      {
        id: "lfs-submodules",
        category: "Repositorio",
        label: "Git LFS y Submódulos…",
        disabled: !repo || writing,
        onSelect: () => setLfsSubmodulesOpen(true),
      },
      {
        id: "undo-op",
        category: "Seguridad",
        label: undoState?.nextUndo
          ? `Deshacer última operación (${undoState.nextUndo.label})`
          : "Deshacer última operación",
        shortcut: "⌘Z",
        disabled: !repo || writing || undoBusy || !undoState?.canUndo,
        onSelect: () => void openUndoPreview("undo"),
      },
      {
        id: "redo-op",
        category: "Seguridad",
        label: undoState?.nextRedo
          ? `Rehacer operación (${undoState.nextRedo.label})`
          : "Rehacer operación",
        shortcut: "⇧⌘Z",
        disabled: !repo || writing || undoBusy || !undoState?.canRedo,
        onSelect: () => void openUndoPreview("redo"),
      },
      {
        id: "environment",
        category: "Aplicación",
        label: "Entorno y motor Git…",
        disabled: writing,
        onSelect: () => setEnvDialogOpen(true),
      },
      {
        id: "shortcuts",
        category: "Aplicación",
        label: "Atajos de teclado…",
        shortcut: "?",
        keywords: ["keyboard", "teclas", "ayuda", "cheatsheet"],
        onSelect: () => setShortcutsOpen(true),
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
      undoState,
      undoBusy,
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
    scrollToCommitIndex(index, "center");
  }
  function jumpToSearchedCommit(commit: Commit) {
    setView("history");
    setInspectorOpen(true);
    setExternalCommit(commit);
    const index = commits.findIndex((c) => c.hash === commit.hash);
    if (index >= 0) {
      setQuery("");
      select(commit.hash);
      scrollToCommitIndex(index, "center");
    } else {
      select(commit.hash);
      setNotice(
        `Inspeccionando ${short(commit.hash)} desde búsqueda profunda (fuera de los primeros ${commits.length} commits cargados).`,
      );
    }
  }
  async function jumpToCommitHash(targetHash: string) {
    const localMatch = commits.find((c) => c.hash === targetHash);
    if (localMatch) {
      jump(localMatch.hash);
      return;
    }
    if (!repo) return;
    try {
      const res = await invoke<{ commits: Commit[] }>("search_history", {
        id: repo.id,
        query: { hash: targetHash, scope: "all", limit: 1 },
      });
      const found = res.commits[0];
      if (found) {
        jumpToSearchedCommit(found);
      } else {
        setNotice(
          `No se encontró el commit ${short(targetHash)} en el historial local.`,
        );
      }
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  function openOrderedComparison(first: Commit, second: Commit) {
    const firstIdx = commits.findIndex((c) => c.hash === first.hash);
    const secondIdx = commits.findIndex((c) => c.hash === second.hash);
    if (firstIdx >= 0 && secondIdx >= 0 && firstIdx < secondIdx) {
      setComparePair({ base: second, target: first });
    } else {
      setComparePair({ base: first, target: second });
    }
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
    const collapsedRemoteNames = new Set<string>();
    if (isTributary) {
      for (const r of refs) {
        if (r.kind !== "branch") continue;
        const shortBranch = refName(r.name);
        for (const other of refs) {
          if (
            other.kind === "remote" &&
            refName(other.name).endsWith(`/${shortBranch}`)
          ) {
            collapsedRemoteNames.add(other.name);
          }
        }
      }
    }
    const displayRefs = isTributary
      ? refs.filter((r) => !collapsedRemoteNames.has(r.name))
      : refs;
    const renderRefBadge = (r: GitRef) => {
      const shortRef = refName(r.name);
      const isCurrentBranch = r.kind === "branch" && shortRef === repo?.branch;
      const syncedRemotes =
        r.kind === "branch"
          ? refs.filter(
              (other) =>
                other.kind === "remote" &&
                refName(other.name).endsWith(`/${shortRef}`),
            )
          : [];
      const syncedRemote = syncedRemotes.length > 0;
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
              ? `${r.name} (sincronizada con ${syncedRemotes.map((rem) => refName(rem.name)).join(", ")})`
              : r.name
          }
        >
          {isTributary && isCurrentBranch ? (
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4.6 8.9 2.1 6.4l.9-.9 1.6 1.6L9 2.7l.9.9-5.3 5.3Z"
              />
            </svg>
          ) : (
            <RefBadgeIcon kind={r.kind} />
          )}
          <span>{shortRef}</span>
          {isTributary &&
            r.kind === "branch" &&
            (syncedRemote ? (
              <span
                className="ref-dual-sync"
                aria-label="Local y remoto sincronizados"
              >
                <LocalDeviceIcon />
                <RefBadgeIcon kind="remote" />
              </span>
            ) : (
              <span className="ref-local-only" aria-hidden="true">
                <LocalDeviceIcon />
              </span>
            ))}
          {syncedRemote && !isTributary && (
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
    };
    const visibleTributaryRefs = isTributary
      ? displayRefs.slice(0, 2)
      : displayRefs;
    const extraTributaryCount = isTributary
      ? Math.max(0, displayRefs.length - visibleTributaryRefs.length)
      : 0;
    const showDetachedHeadPill = isHead && (!isTributary || !repo?.branch);
    return (
      <button
        key={c.hash}
        type="button"
        className={`commit-row${isTributary ? " tributary" : ""}${selected === c.hash ? " selected" : ""}`}
        style={
          {
            ...style,
            gridTemplateColumns: historyColumns,
            "--row-lane-color": rowColor,
          } as React.CSSProperties
        }
        onClick={(event) => {
          if (event.shiftKey && active && active.hash !== c.hash) {
            setCompareAnchor(null);
            openOrderedComparison(active, c);
            return;
          }
          if (compareAnchor && compareAnchor.hash !== c.hash) {
            const anchor = compareAnchor;
            setCompareAnchor(null);
            openOrderedComparison(anchor, c);
            return;
          }
          select(c.hash);
        }}
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
            scrollToCommitIndex(next, "auto");
          }
        }}
        aria-pressed={selected === c.hash}
        aria-label={`${c.subject}. ${c.author}. Commit ${short(c.hash)}. ${c.parents.length} padres.`}
      >
        {isTributary && (
          <span
            className="commit-refs-col"
            title={refs.map((r) => refName(r.name)).join(", ") || undefined}
          >
            {showDetachedHeadPill && (
              <span className="ref head">
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <circle cx="6" cy="6" r="3.2" fill="currentColor" />
                </svg>
                HEAD
              </span>
            )}
            {visibleTributaryRefs.map(renderRefBadge)}
            {extraTributaryCount > 0 && (
              <span className="ref ref-more">+{extraTributaryCount}</span>
            )}
          </span>
        )}
        <GraphCell
          row={row}
          width={graphWidth}
          rowHeight={activeRowHeight}
          colors={graphColors}
          isHead={isHead}
          hasRefs={hasRefs}
          style={graphStyle}
          authorName={c.author}
          refSide={isTributary ? "left" : "right"}
        />
        <span className="commit-subject">
          {!isTributary && (
            <span className="inline-refs">
              {showDetachedHeadPill && (
                <span className="ref head">
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <circle cx="6" cy="6" r="3.2" fill="currentColor" />
                  </svg>
                  HEAD
                </span>
              )}
              {displayRefs.map(renderRefBadge)}
            </span>
          )}
          <span className="truncate">{c.subject || "(sin mensaje)"}</span>
        </span>
        {showAuthor && (
          <span className="history-author" title={c.author}>
            <AuthorAvatar name={c.author} />
            <span className="truncate">{c.author || "Autor desconocido"}</span>
          </span>
        )}
        {showDate && (
          <time
            className="history-date"
            dateTime={c.date}
            title={`${formatCommitDate(c.date)} · ${c.date}`}
          >
            {isTributary
              ? formatRelativeCommitDate(c.date)
              : formatCommitDate(c.date)}
          </time>
        )}
        {showHash && <code className="hash">{short(c.hash)}</code>}
      </button>
    );
  };
  return (
    <main
      ref={mainShellRef}
      className="app-shell workspace-shell"
      data-history={view === "history"}
      data-inspector={inspectorOpen}
      style={{ "--inspector-size": `${inspectorSize}%` } as React.CSSProperties}
    >
      <Suspense fallback={null}>
        {libraryOpen && (
          <LibraryDialog
            onLock={setWriting}
            onDeleted={(path) => {
              const currentTabs = tabsRef.current;
              const remaining = currentTabs.filter(
                (item) => item.snapshot.path !== path,
              );
              if (remaining.length !== currentTabs.length) {
                const removedActive = activeTab?.snapshot.path === path;
                const nextActive = removedActive
                  ? (remaining[remaining.length - 1] ?? null)
                  : (remaining.find(
                      (item) => item.snapshot.id === activeTabIdRef.current,
                    ) ?? null);
                const nextActiveId = nextActive?.snapshot.id ?? null;
                tabsTouchedRef.current = true;
                tabsRef.current = remaining;
                activeTabIdRef.current = nextActiveId;
                setTabs(remaining);
                setActiveTabId(nextActiveId);
                if (removedActive) applyTabUi(nextActive);
                persistTabState(remaining, nextActiveId);
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
            graphStyle={graphStyle}
            onChange={changeAppearance}
            onChangeGraphStyle={changeGraphStyle}
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
        {repo && worktreeOpen && (
          <WorktreeDialog
            key={`worktrees:${repo.id}`}
            repoId={repo.id}
            repoPath={repo.path}
            repoName={repo.name}
            openTabPaths={tabs.map((item) => item.snapshot.path)}
            onClose={() => setWorktreeOpen(false)}
            onLock={setWriting}
            onUpdated={() => refresh()}
            onOpenInTab={(targetPath) => openRepositoryPath(targetPath)}
            onAuthorize={() => setTrustPromptRepoId(repo.id)}
          />
        )}
        {envDialogOpen && (
          <EnvironmentDialog
            status={envStatus}
            checking={envChecking}
            onRecheck={() => recheckEnvironment(false)}
            onClose={() => setEnvDialogOpen(false)}
          />
        )}
        {repo && snapshotsOpen && (
          <SnapshotsDialog
            key={`snapshots:${repo.id}`}
            repoId={repo.id}
            repoName={repo.name}
            trusted={repo.trusted !== false}
            preferences={snapshotPrefs}
            onSavePreferences={saveSnapshotPreferences}
            onAuthorize={() => {
              setSnapshotsOpen(false);
              setTrustPromptRepoId(repo.id);
            }}
            onRestored={async () => {
              await refresh();
            }}
            onLock={setWriting}
            onClose={() => setSnapshotsOpen(false)}
          />
        )}
        {repo && lfsSubmodulesOpen && (
          <LfsSubmodulesDialog
            key={`lfs-sub:${repo.id}`}
            repoId={repo.id}
            repoName={repo.name}
            trusted={repo.trusted !== false}
            onAuthorize={() => {
              setLfsSubmodulesOpen(false);
              setTrustPromptRepoId(repo.id);
            }}
            onUpdated={async () => {
              await refresh();
            }}
            onLock={setWriting}
            onClose={() => setLfsSubmodulesOpen(false)}
          />
        )}
        {repo && undoPlan && (
          <UndoDialog
            key={`undo:${undoPlan.token}`}
            plan={undoPlan}
            undoCount={undoState?.undoCount ?? 0}
            redoCount={undoState?.redoCount ?? 0}
            busy={undoBusy}
            error={undoError}
            onConfirm={confirmUndoPlan}
            onClose={() => {
              setUndoPlan(null);
              setUndoError("");
            }}
          />
        )}
        {repo && trustPromptRepoId === repo.id && (
          <TrustDialog
            key={`trust:${repo.id}`}
            repoId={repo.id}
            repoName={repo.name}
            repoPath={repo.path}
            onAuthorized={() => {
              updateRepoTrust(repo.id, true);
              setTrustPromptRepoId(null);
              setNotice(
                "Repositorio autorizado. Operaciones locales habilitadas.",
              );
            }}
            onReadOnly={() => {
              dismissedTrustIdsRef.current.add(repo.id);
              setTrustPromptRepoId(null);
            }}
            onLock={setWriting}
          />
        )}
        {repo && searchDialogMode && (
          <SearchDialog
            key={`search:${repo.id}:${searchDialogMode}`}
            repoId={repo.id}
            repoName={repo.name}
            currentScope={historyScope}
            branches={branches.map((ref) => ref.name)}
            initialMode={searchDialogMode}
            initialQuery={query}
            onClose={() => setSearchDialogMode(null)}
            onJumpToCommit={jumpToSearchedCommit}
          />
        )}
        {repo && fileHistoryTarget && (
          <FileHistoryDialog
            key={`fh:${repo.id}:${fileHistoryTarget.path}:${fileHistoryTarget.revision ?? "HEAD"}`}
            repoId={repo.id}
            path={fileHistoryTarget.path}
            revision={fileHistoryTarget.revision}
            onClose={() => setFileHistoryTarget(null)}
            onJumpToCommit={jumpToSearchedCommit}
            onOpenBlame={(targetPath, commitHash) =>
              setBlameTarget({ path: targetPath, revision: commitHash })
            }
          />
        )}
        {repo && blameTarget && (
          <BlameDialog
            key={`blame:${repo.id}:${blameTarget.path}:${blameTarget.revision ?? "HEAD"}`}
            repoId={repo.id}
            path={blameTarget.path}
            revision={blameTarget.revision}
            onClose={() => setBlameTarget(null)}
            onJumpToCommitHash={(targetHash) =>
              void jumpToCommitHash(targetHash)
            }
            onOpenHistory={(targetPath, rev) =>
              setFileHistoryTarget({ path: targetPath, revision: rev ?? null })
            }
          />
        )}
        {repo && comparePair && (
          <CompareDialog
            key={`cmp:${repo.id}:${comparePair.base.hash}:${comparePair.target.hash}`}
            repoId={repo.id}
            base={comparePair.base}
            target={comparePair.target}
            onClose={() => setComparePair(null)}
            onSwap={() =>
              setComparePair((pair) =>
                pair ? { base: pair.target, target: pair.base } : null,
              )
            }
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
        {shortcutsOpen && (
          <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />
        )}
      </Suspense>
      <div className="app-header">
        <a className="skip-navigation" href={`#${view}-content`}>
          Saltar al contenido
        </a>
        <CommandBar
          repo={repo}
          tabs={tabs.map((item) => ({
            id: item.snapshot.id,
            name: item.snapshot.name,
            path: item.snapshot.path,
            branch: item.snapshot.branch,
            dirtyCount: item.wip?.trusted ? item.wip.total : undefined,
          }))}
          activeTabId={activeTabId}
          onSelectTab={activateTab}
          onCloseTab={(id) => void closeTab(id)}
          onReorderTabs={reorderTabs}
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
          {envStatus && !envStatus.gitAvailable && !envDialogOpen && (
            <div className="banner warning env-missing-banner" role="status">
              <span>
                Git CLI no detectado en el equipo. Algunas operaciones locales y
                remotas requieren Git base.
              </span>
              <button
                type="button"
                className="button"
                onClick={() => setEnvDialogOpen(true)}
              >
                Ver guía de instalación…
              </button>
            </div>
          )}
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
        <div className="sidebar-repo-controls">
          <button
            className="library-launcher"
            onClick={() => setLibraryOpen(true)}
            disabled={busy || loadingMore || writing}
          >
            Repositorios <span aria-hidden="true">▾</span>
          </button>
          <div className="sidebar-quick-create">
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
            onClick={() => setView("changes")}
          >
            <FileTextIcon />
            Cambios
            {wip?.trusted && wip.total > 0 && <span>{wip.total}</span>}
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
              disabled={!repo || writing}
              onClick={() => setWorktreeOpen(true)}
            >
              Worktrees…
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
            <button
              className="nav-button"
              disabled={!repo || writing}
              onClick={() => setSnapshotsOpen(true)}
            >
              Snapshots locales…
            </button>
            <button
              className="nav-button"
              disabled={!repo || writing}
              onClick={() => setLfsSubmodulesOpen(true)}
            >
              Git LFS y Submódulos…
            </button>
            <button
              className="nav-button"
              disabled={!repo || writing || undoBusy || !undoState?.canUndo}
              title={
                undoState?.nextUndo
                  ? `${undoState.nextUndo.label} (⌘Z)`
                  : "Sin operaciones recientes para deshacer"
              }
              onClick={() => void openUndoPreview("undo")}
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
              onClick={() => void openUndoPreview("redo")}
            >
              Rehacer operación…
            </button>
            <button
              className="nav-button"
              disabled={writing}
              onClick={() => setEnvDialogOpen(true)}
            >
              Entorno y motor Git…
            </button>
            <button
              className="nav-button"
              onClick={() => setShortcutsOpen(true)}
            >
              Atajos de teclado…
            </button>
          </nav>
        </details>
        <div className="sidebar-sections">
          {[
            { label: "RAMAS LOCALES", refs: branches },
            { label: "REFERENCIAS REMOTAS", refs: remotes },
            { label: "ETIQUETAS", refs: tags },
          ].map((group) => {
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
                  onClick={() => jump(r.hash)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    openRefContextMenu(r, event.clientX, event.clientY);
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
            return (
              <details key={group.label} open={group.label === "RAMAS LOCALES"}>
                <summary>
                  {group.label}
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
                    {repo ? "Sin referencias" : "Abre un repositorio"}
                  </p>
                )}
              </details>
            );
          })}
          <details open={worktrees.length > 1}>
            <summary>
              WORKTREES
              <span>{worktrees.length}</span>
            </summary>
            {repo ? (
              <>
                {worktrees.map((wt: WorktreeItem) => {
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
                          void openRepositoryPath(wt.path);
                        }
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        openWorktreeContextMenu(
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
                })}
                <div className="sidebar-worktree-actions">
                  <button
                    type="button"
                    className="nav-button"
                    disabled={writing}
                    onClick={() => setWorktreeOpen(true)}
                  >
                    Nuevo worktree…
                  </button>
                  <button
                    type="button"
                    className="nav-button"
                    disabled={writing}
                    onClick={() => setWorktreeOpen(true)}
                  >
                    Gestionar…
                  </button>
                </div>
              </>
            ) : (
              <p className="sidebar-empty">Abre un repositorio</p>
            )}
          </details>
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
          onTrustChange={(allowed) => updateRepoTrust(repo.id, allowed)}
          onFileHistory={(targetPath) =>
            setFileHistoryTarget({
              path: targetPath,
              revision: repo.head ?? null,
            })
          }
          onFileBlame={(targetPath) =>
            setBlameTarget({
              path: targetPath,
              revision: repo.head ?? null,
            })
          }
        />
      )}
      {repo && (
        <Suspense fallback={null}>
          <RemotesPanel
            key={`remotes-${repo.id}`}
            active={view === "remotes"}
            repoId={repo.id}
            onLock={setWriting}
            onUpdated={refresh}
          />
          <PushPanel
            key={`push-${repo.id}`}
            repository={{ name: repo.name, path: repo.path }}
            onResult={(result) => rememberResult(result, "push", repo.id)}
            active={view === "push"}
            repoId={repo.id}
            onLock={setWriting}
            onUpdated={refresh}
          />
          <PullPanel
            key={`pull-${repo.id}`}
            active={view === "pull"}
            repoId={repo.id}
            onLock={setWriting}
            onUpdated={refresh}
            onBranches={() => setView("branches")}
          />
          <BranchesPanel
            key={`branches-${repo.id}`}
            active={view === "branches"}
            repoId={repo.id}
            initialBranch={branchPreselect}
            onLock={setWriting}
            onUpdated={refresh}
          />
        </Suspense>
      )}
      <section
        id="history-content"
        tabIndex={-1}
        hidden={!!repo && view !== "history"}
        className="history-panel"
        aria-label="Historial del repositorio"
        style={{ "--refs-col-width": `${refsWidth}px` } as React.CSSProperties}
      >
        <div className="history-toolbar">
          <h1 className="sr-only">Historial</h1>
          {repo && (
            <div className="history-navigation">
              <label className="sr-only" htmlFor="history-scope">
                Mostrar
              </label>
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
                  if (commits.some((c) => c.hash === repo.head))
                    jump(repo.head!);
                  else void refresh("HEAD", true, true);
                }}
              >
                Ir a HEAD
              </button>
              {busy && (
                <span className="history-busy-badge" role="status">
                  Leyendo historial…
                </span>
              )}
            </div>
          )}
          <div className="searchbar history-search-inline">
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
              placeholder="Buscar mensaje, autor o hash…"
              disabled={!repo}
            />
            {query && (
              <button
                aria-label="Limpiar búsqueda"
                onClick={() => setQuery("")}
              >
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
          <button
            type="button"
            className="button history-deep-search-btn"
            disabled={!repo || writing}
            onClick={() => setSearchDialogMode("history")}
            title="Buscar en todo el historial y en código fuente (⌘⇧F)"
          >
            Búsqueda avanzada…
          </button>
          <div className="history-controls">
            <details className="history-options">
              <summary>Vista</summary>
              <div className="history-options-body">
                <label>
                  <input
                    type="checkbox"
                    checked={showAuthor}
                    onChange={(e) => setShowAuthor(e.target.checked)}
                  />
                  Autor
                </label>
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
                    disabled={!showAuthor}
                    value={authorWidth}
                    onChange={(e) => setAuthorWidth(Number(e.target.value))}
                  />
                </label>
                {isTributary && (
                  <label>
                    Ancho de Rama / Tag · {refsWidth} px
                    <input
                      aria-label="Ancho de Rama / Tag"
                      type="range"
                      min={MIN_REFS_COL_WIDTH}
                      max={MAX_REFS_COL_WIDTH}
                      step="8"
                      value={refsWidth}
                      onChange={(e) => setRefsWidth(Number(e.target.value))}
                    />
                  </label>
                )}
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
        {repo && compareAnchor && (
          <div className="banner notice compare-anchor-banner" role="status">
            <span>
              Comparando desde <code>{short(compareAnchor.hash)}</code>: haz
              clic en otro commit (o usa <code>Shift+Click</code>) para ver el
              diff de rango.
            </span>
            <button
              type="button"
              className="button"
              onClick={() => setCompareAnchor(null)}
            >
              Cancelar
            </button>
          </div>
        )}
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
              {isTributary ? (
                <>
                  <span className="heading-refs-col">
                    Rama / Tag
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Redimensionar columna Rama / Tag"
                      aria-valuemin={MIN_REFS_COL_WIDTH}
                      aria-valuemax={MAX_REFS_COL_WIDTH}
                      aria-valuenow={refsWidth}
                      tabIndex={0}
                      className={`col-resizer${draggingRefsCol ? " active" : ""}`}
                      onPointerDown={startRefsResize}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          setRefsWidth((w) =>
                            Math.max(MIN_REFS_COL_WIDTH, w - 8),
                          );
                        } else if (e.key === "ArrowRight") {
                          e.preventDefault();
                          setRefsWidth((w) =>
                            Math.min(MAX_REFS_COL_WIDTH, w + 8),
                          );
                        }
                      }}
                    />
                  </span>
                  <span>Grafo</span>
                  <span>Mensaje</span>
                </>
              ) : (
                <>
                  <span>Grafo</span>
                  <span>Mensaje y referencias</span>
                </>
              )}
              {showAuthor && <span>Autor</span>}
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
            const el = event.currentTarget;
            if (tableHeading.current)
              tableHeading.current.style.transform = `translateX(-${el.scrollLeft}px)`;
            if (
              !query &&
              view === "history" &&
              repo &&
              repo.page.nextOffset !== null &&
              !loadingMore &&
              !busy &&
              el.clientHeight > 0 &&
              el.scrollTop > 0 &&
              el.scrollTop + el.clientHeight >= el.scrollHeight - 240
            ) {
              void more();
            }
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
            <>
              {wip?.trusted && wip.total > 0 && wipMarker && (
                <button
                  type="button"
                  className={`wip-row${isTributary ? " tributary" : ""}`}
                  disabled={writing}
                  onClick={() => setView("changes")}
                  aria-label={`Cambios sin commitear (${wip.total}) — Ir a Cambios`}
                  style={{
                    minWidth: historyMinWidth,
                    ...(isTributary
                      ? { gridTemplateColumns: historyColumns }
                      : {}),
                  }}
                >
                  {isTributary && (
                    <span className="wip-refs-col">
                      <span className="wip-left-pill">WIP</span>
                    </span>
                  )}
                  <span
                    className="wip-graph-cell"
                    style={{ width: graphWidth }}
                    aria-hidden="true"
                  >
                    <svg width={graphWidth} height={activeRowHeight}>
                      <line
                        x1={wipMarker.x}
                        y1={isTributary ? 33 : 24}
                        x2={wipMarker.x}
                        y2={activeRowHeight}
                        stroke={wipMarker.color}
                        strokeWidth={isTributary ? 2.6 : 2}
                        strokeDasharray="3 3"
                      />
                      <circle
                        cx={wipMarker.x}
                        cy={isTributary ? 22 : 18}
                        r={isTributary ? 10 : 5.5}
                        fill="var(--bg-canvas)"
                        stroke={wipMarker.color}
                        strokeWidth={isTributary ? 2.4 : 2}
                        strokeDasharray={isTributary ? "3 2.5" : undefined}
                      />
                    </svg>
                  </span>
                  <span className="wip-main">
                    <span className="wip-title">
                      Cambios sin commitear (WIP)
                    </span>
                    <span className="wip-badges">
                      {wip.staged > 0 && (
                        <span className="wip-badge staged">
                          {wip.staged} preparados
                        </span>
                      )}
                      {wip.unstaged > 0 && (
                        <span className="wip-badge unstaged">
                          {wip.unstaged} sin preparar
                        </span>
                      )}
                      {wip.untracked > 0 && (
                        <span className="wip-badge untracked">
                          {wip.untracked} nuevos
                        </span>
                      )}
                      {wip.conflicts > 0 && (
                        <span className="wip-badge conflict">
                          {wip.conflicts} conflictos
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="wip-cta">Ir a Cambios →</span>
                </button>
              )}
              <div
                className="virtual-list"
                style={{
                  height: virtual.getTotalSize(),
                  minWidth: historyMinWidth,
                }}
              >
                {virtual.getVirtualItems().map((item) => {
                  const posStyle: React.CSSProperties = {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: item.size,
                    transform: `translateY(${item.start}px)`,
                  };
                  if (tributaryLayout) {
                    const entry = tributaryLayout.items[item.index];
                    if (!entry) return null;
                    if (entry.kind === "group") {
                      return (
                        <div
                          key={entry.id}
                          className="history-time-separator"
                          role="separator"
                          aria-label={entry.label}
                          style={{
                            ...posStyle,
                            gridTemplateColumns: historyColumns,
                          }}
                        >
                          <span
                            className="history-time-refs-spacer"
                            aria-hidden="true"
                          />
                          <span
                            className="history-time-graph"
                            style={{ width: graphWidth }}
                            aria-hidden="true"
                          >
                            <svg
                              width={graphWidth}
                              height={TRIBUTARY_GROUP_HEIGHT}
                            >
                              {entry.isFirst && wipMarker && (
                                <line
                                  x1={wipMarker.x}
                                  y1={0}
                                  x2={wipMarker.x}
                                  y2={TRIBUTARY_GROUP_HEIGHT}
                                  stroke={wipMarker.color}
                                  strokeWidth={2.6}
                                  strokeDasharray="3 3"
                                />
                              )}
                              {entry.throughLanes.map((tl) => {
                                const x = 26 + tl.lane * 34;
                                const stroke =
                                  graphColors[tl.color % graphColors.length] ??
                                  graphColors[0] ??
                                  "#52b7ff";
                                return (
                                  <line
                                    key={`sep-lane-${entry.id}-${tl.lane}`}
                                    x1={x}
                                    y1={0}
                                    x2={x}
                                    y2={TRIBUTARY_GROUP_HEIGHT}
                                    stroke={stroke}
                                    strokeWidth={2.5}
                                    strokeOpacity={0.92}
                                  />
                                );
                              })}
                            </svg>
                          </span>
                          <span className="history-time-label">
                            {entry.label}
                          </span>
                        </div>
                      );
                    }
                    return commitRow(entry.commitIndex, posStyle);
                  }
                  return commitRow(item.index, posStyle);
                })}
              </div>
            </>
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
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar panel de detalle"
          aria-valuemin={30}
          aria-valuemax={60}
          aria-valuenow={inspectorSize}
          tabIndex={0}
          className={`inspector-resizer${draggingSplit ? " active" : ""}`}
          onPointerDown={startInspectorResize}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              setInspectorSize((v) => Math.min(60, v + 2));
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              setInspectorSize((v) => Math.max(30, v - 2));
            }
          }}
        />
        <div className="inspector-heading">
          <FileTextIcon />
          <h2>Detalle del commit</h2>
          {active && (
            <button
              type="button"
              className="inspector-hash-pill"
              title="Copiar hash completo del commit"
              aria-label={`Copiar hash completo ${short(active.hash)}`}
              onClick={() => copyText(active.hash, "Hash copiado")}
            >
              <code>{short(active.hash)}</code>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M4 1.5h5.5A1.5 1.5 0 0 1 11 3v5.5H9.8V3a.3.3 0 0 0-.3-.3H4V1.5Zm-1.5 2A1.5 1.5 0 0 0 1 5v5.5A1.5 1.5 0 0 0 2.5 12H8a1.5 1.5 0 0 0 1.5-1.5V5A1.5 1.5 0 0 0 8 3.5H2.5Zm0 1.2H8a.3.3 0 0 1 .3.3v5.5a.3.3 0 0 1-.3.3H2.5a.3.3 0 0 1-.3-.3V5a.3.3 0 0 1 .3-.3Z"
                />
              </svg>
            </button>
          )}
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
                        <li
                          key={`${file.status}:${file.path}`}
                          className="commit-file-item"
                        >
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
                          <div className="commit-file-tools">
                            <button
                              type="button"
                              className="button commit-file-tool"
                              aria-label="Historial del archivo"
                              title={`Ver historial de ${file.path}`}
                              disabled={writing}
                              onClick={() =>
                                setFileHistoryTarget({
                                  path: file.path,
                                  revision: active.hash,
                                })
                              }
                            >
                              Historial
                            </button>
                            <button
                              type="button"
                              className="button commit-file-tool"
                              aria-label="Blame del archivo"
                              title={`Ver blame de ${file.path}`}
                              disabled={
                                writing || file.status === "D" || file.binary
                              }
                              onClick={() =>
                                setBlameTarget({
                                  path: file.path,
                                  revision: active.hash,
                                })
                              }
                            >
                              Blame
                            </button>
                          </div>
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
              ) : selectedFile &&
                isImageAssetPath(selectedFile.path) &&
                commitImageDiff &&
                !preferTextForImage ? (
                <ImageDiffViewer
                  diff={commitImageDiff}
                  onToggleText={
                    commitImageDiff.mime === "image/svg+xml" && diff?.text
                      ? () => setPreferTextForImage(true)
                      : undefined
                  }
                  toggleTextLabel="Ver diff de texto"
                />
              ) : diff?.text ? (
                <>
                  {selectedFile &&
                    isImageAssetPath(selectedFile.path) &&
                    commitImageDiff && (
                      <div className="image-diff-switch-row">
                        <button
                          type="button"
                          className="button"
                          onClick={() => setPreferTextForImage(false)}
                        >
                          Ver diff visual
                        </button>
                      </div>
                    )}
                  <DiffViewer
                    text={diff.text}
                    filePath={selectedFile?.path}
                    ignoreWhitespace={commitIgnoreWhitespace}
                    onIgnoreWhitespaceChange={setCommitIgnoreWhitespace}
                    contextLines={commitContextLines}
                    onContextLinesChange={setCommitContextLines}
                  />
                </>
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
          {repo && repo.trusted === false && (
            <button
              type="button"
              className="status-trust-btn"
              disabled={writing || busy}
              onClick={() => setTrustPromptRepoId(repo.id)}
            >
              Solo lectura · Autorizar…
            </button>
          )}
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
