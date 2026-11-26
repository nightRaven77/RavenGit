import type { Snapshot, WorktreeSummary, WorktreesState } from "./types";

export const COMPACT_ROW_HEIGHT = 42;
export const TRIBUTARY_ROW_HEIGHT = 52;
export const DEFAULT_REFS_COL_WIDTH = 176;
export const MIN_REFS_COL_WIDTH = 120;
export const MAX_REFS_COL_WIDTH = 280;
export const TRIBUTARY_GROUP_HEIGHT = 28;
export const MAX_OPEN_TABS = 12;

export type RepoView =
  "history" | "changes" | "remotes" | "push" | "branches" | "pull";

export interface TabEntry {
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

export function defaultTabEntry(snapshot: Snapshot): TabEntry {
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

export function formatCommitDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin fecha"
    : date.toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

export function formatRelativeCommitDate(value: string): string {
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

export const short = (s: string): string => s.slice(0, 8);

export const refName = (s: string): string =>
  s.replace(/^refs\/(heads|remotes|tags)\//, "");

export function errorText(error: unknown): string {
  if (typeof error === "object" && error && "message" in error)
    return String(error.message);
  return "No se pudo completar la lectura. Vuelve a intentarlo.";
}

export function LocalDeviceIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2 2.5A1 1 0 0 1 3 1.5h6a1 1 0 0 1 1 1V7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2.5Zm1.2.2v4.1h5.6V2.7H3.2ZM1 9.2h10l-.7 1.3H1.7L1 9.2Z"
      />
    </svg>
  );
}

export function RefBadgeIcon({
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
