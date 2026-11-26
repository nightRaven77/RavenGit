import AuthorAvatar from "./AuthorAvatar";
import GraphCell from "./GraphCell";
import {
  LocalDeviceIcon,
  RefBadgeIcon,
  formatCommitDate,
  formatRelativeCommitDate,
  refName,
  short,
} from "./appHelpers";
import type { GraphRow } from "./graph";
import type { ThroughLane } from "./historyGroups";
import type { GraphStyleId } from "./themes";
import type { Commit, GitRef, PullRequestItem, WorktreeSummary } from "./types";

export interface CommitRowProps {
  commit: Commit;
  index: number;
  row: GraphRow;
  style?: React.CSSProperties;
  commitsLength: number;
  graphWidth: number;
  activeRowHeight: number;
  graphColors: readonly string[];
  graphStyle: GraphStyleId;
  isTributary: boolean;
  historyColumns: string;
  selected: string | null;
  active: Commit | null;
  compareAnchor: Commit | null;
  repoHead: string | null;
  repoBranch: string | null;
  repoRefs: readonly GitRef[];
  pullRequestsByBranch?: ReadonlyMap<string, PullRequestItem>;
  showAuthor: boolean;
  showDate: boolean;
  showHash: boolean;
  onClearCompareAnchor: () => void;
  onOpenOrderedComparison: (first: Commit, second: Commit) => void;
  onSelectCommit: (hash: string) => void;
  onOpenContextMenu: (commit: Commit, x: number, y: number) => void;
  onOpenPullRequests?: () => void;
  onStepCommit: (nextIndex: number) => void;
}

export function CommitRow({
  commit: c,
  index,
  row,
  style,
  commitsLength,
  graphWidth,
  activeRowHeight,
  graphColors,
  graphStyle,
  isTributary,
  historyColumns,
  selected,
  active,
  compareAnchor,
  repoHead,
  repoBranch,
  repoRefs,
  pullRequestsByBranch,
  showAuthor,
  showDate,
  showHash,
  onClearCompareAnchor,
  onOpenOrderedComparison,
  onSelectCommit,
  onOpenContextMenu,
  onOpenPullRequests,
  onStepCommit,
}: CommitRowProps) {
  const rowColor =
    graphColors[row.color % graphColors.length] ?? graphColors[0] ?? "#52b7ff";
  const isHead = c.hash === repoHead;
  const refs = repoRefs.filter((r) => r.hash === c.hash);
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
  const matchingPrs: PullRequestItem[] = [];
  if (pullRequestsByBranch && pullRequestsByBranch.size > 0) {
    const seenPrNumbers = new Set<number>();
    for (const r of refs) {
      if (r.kind !== "branch") continue;
      const pr = pullRequestsByBranch.get(refName(r.name));
      if (pr && !seenPrNumbers.has(pr.number)) {
        seenPrNumbers.add(pr.number);
        matchingPrs.push(pr);
      }
    }
  }
  const renderPrPill = (pr: PullRequestItem) => (
    <span
      key={`pr-${pr.number}`}
      role="button"
      tabIndex={0}
      className="ref ref-pr"
      title={`#${pr.number}: ${pr.title}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpenPullRequests?.();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onOpenPullRequests?.();
        }
      }}
    >
      #{pr.number}
    </span>
  );
  const renderRefBadge = (r: GitRef) => {
    const shortRef = refName(r.name);
    const isCurrentBranch = r.kind === "branch" && shortRef === repoBranch;
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
  const showDetachedHeadPill = isHead && (!isTributary || !repoBranch);

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
          onClearCompareAnchor();
          onOpenOrderedComparison(active, c);
          return;
        }
        if (compareAnchor && compareAnchor.hash !== c.hash) {
          const anchor = compareAnchor;
          onClearCompareAnchor();
          onOpenOrderedComparison(anchor, c);
          return;
        }
        onSelectCommit(c.hash);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenContextMenu(c, event.clientX, event.clientY);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const next = Math.max(
            0,
            Math.min(
              commitsLength - 1,
              index + (e.key === "ArrowDown" ? 1 : -1),
            ),
          );
          onStepCommit(next);
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
          {matchingPrs.slice(0, 1).map(renderPrPill)}
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
            {matchingPrs.map(renderPrPill)}
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
}

export interface WipRowProps {
  wip: WorktreeSummary;
  wipX: number;
  wipColor: string;
  isTributary: boolean;
  writing: boolean;
  graphWidth: number;
  activeRowHeight: number;
  historyMinWidth: number;
  historyColumns: string;
  onOpenChanges: () => void;
}

export function WipRow({
  wip,
  wipX,
  wipColor,
  isTributary,
  writing,
  graphWidth,
  activeRowHeight,
  historyMinWidth,
  historyColumns,
  onOpenChanges,
}: WipRowProps) {
  return (
    <button
      type="button"
      className={`wip-row${isTributary ? " tributary" : ""}`}
      disabled={writing}
      onClick={onOpenChanges}
      aria-label={`Cambios sin commitear (${wip.total}) — Ir a Cambios`}
      style={{
        minWidth: historyMinWidth,
        ...(isTributary ? { gridTemplateColumns: historyColumns } : {}),
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
            x1={wipX}
            y1={isTributary ? 33 : 24}
            x2={wipX}
            y2={activeRowHeight}
            stroke={wipColor}
            strokeWidth={isTributary ? 2.6 : 2}
            strokeDasharray="3 3"
          />
          <circle
            cx={wipX}
            cy={isTributary ? 22 : 18}
            r={isTributary ? 10 : 5.5}
            fill="var(--bg-canvas)"
            stroke={wipColor}
            strokeWidth={isTributary ? 2.4 : 2}
            strokeDasharray={isTributary ? "3 2.5" : undefined}
          />
        </svg>
      </span>
      <span className="wip-main">
        <span className="wip-title">Cambios sin commitear (WIP)</span>
        <span className="wip-badges">
          {wip.staged > 0 && (
            <span className="wip-badge staged">{wip.staged} preparados</span>
          )}
          {wip.unstaged > 0 && (
            <span className="wip-badge unstaged">
              {wip.unstaged} sin preparar
            </span>
          )}
          {wip.untracked > 0 && (
            <span className="wip-badge untracked">{wip.untracked} nuevos</span>
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
  );
}

export interface HistoryTimeSeparatorProps {
  id: string;
  label: string;
  isFirst: boolean;
  throughLanes: ThroughLane[];
  style: React.CSSProperties;
  historyColumns: string;
  graphWidth: number;
  groupHeight: number;
  graphColors: readonly string[];
  wipMarker: { x: number; color: string } | null;
}

export function HistoryTimeSeparator({
  id,
  label,
  isFirst,
  throughLanes,
  style,
  historyColumns,
  graphWidth,
  groupHeight,
  graphColors,
  wipMarker,
}: HistoryTimeSeparatorProps) {
  return (
    <div
      className="history-time-separator"
      role="separator"
      aria-label={label}
      style={{
        ...style,
        gridTemplateColumns: historyColumns,
      }}
    >
      <span className="history-time-refs-spacer" aria-hidden="true" />
      <span
        className="history-time-graph"
        style={{ width: graphWidth }}
        aria-hidden="true"
      >
        <svg width={graphWidth} height={groupHeight}>
          {isFirst && wipMarker && (
            <line
              x1={wipMarker.x}
              y1={0}
              x2={wipMarker.x}
              y2={groupHeight}
              stroke={wipMarker.color}
              strokeWidth={2.6}
              strokeDasharray="3 3"
            />
          )}
          {throughLanes.map((tl) => {
            const x = 26 + tl.lane * 34;
            const stroke =
              graphColors[tl.color % graphColors.length] ??
              graphColors[0] ??
              "#52b7ff";
            return (
              <line
                key={`sep-lane-${id}-${tl.lane}`}
                x1={x}
                y1={0}
                x2={x}
                y2={groupHeight}
                stroke={stroke}
                strokeWidth={2.5}
                strokeOpacity={0.92}
              />
            );
          })}
        </svg>
      </span>
      <span className="history-time-label">{label}</span>
    </div>
  );
}
