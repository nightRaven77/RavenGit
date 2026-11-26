import type { GraphRow } from "./graph";
import type { Commit } from "./types";

export type TemporalBucket = "today" | "week" | "earlier";

export const TEMPORAL_BUCKET_LABELS: Record<TemporalBucket, string> = {
  today: "Hoy",
  week: "Esta semana",
  earlier: "Anterior",
};

const BUCKET_STAGE: Record<TemporalBucket, number> = {
  today: 0,
  week: 1,
  earlier: 2,
};

const DAY_MS = 86_400_000;

/** Classifies a commit ISO date into local relative temporal buckets. */
export function classifyCommitBucket(
  isoDate: string | undefined,
  nowMs = Date.now(),
): TemporalBucket {
  if (!isoDate) return "earlier";
  const commitMs = new Date(isoDate).getTime();
  if (Number.isNaN(commitMs)) return "earlier";
  const now = new Date(nowMs);
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  if (commitMs >= startOfToday) return "today";
  if (commitMs >= startOfToday - 6 * DAY_MS) return "week";
  return "earlier";
}

export interface ThroughLane {
  lane: number;
  color: number;
}

export type HistoryRowItem =
  | {
      kind: "group";
      id: string;
      bucket: TemporalBucket;
      label: string;
      isFirst: boolean;
      throughLanes: ThroughLane[];
    }
  | {
      kind: "commit";
      commitIndex: number;
    };

/** Builds monotonically grouped Tributary rows while preserving vertical graph rails across separators. */
export function buildTributaryItems(
  commits: readonly Commit[],
  rows: readonly GraphRow[],
  nowMs = Date.now(),
): { items: HistoryRowItem[]; commitToItemIndex: number[] } {
  const items: HistoryRowItem[] = [];
  const commitToItemIndex: number[] = new Array(commits.length);
  let maxStage = -1;

  for (let i = 0; i < commits.length; i++) {
    const bucket = classifyCommitBucket(commits[i].date, nowMs);
    const stage = BUCKET_STAGE[bucket];
    if (stage > maxStage) {
      maxStage = stage;
      const throughLanes: ThroughLane[] = [];
      if (i > 0) {
        const seen = new Set<number>();
        for (const seg of rows[i]?.segments ?? []) {
          if (
            (seg.kind === "incoming" || seg.kind === "through") &&
            !seen.has(seg.from)
          ) {
            seen.add(seg.from);
            throughLanes.push({ lane: seg.from, color: seg.color });
          }
        }
      }
      items.push({
        kind: "group",
        id: `${bucket}-${i}`,
        bucket,
        label: TEMPORAL_BUCKET_LABELS[bucket],
        isFirst: items.length === 0,
        throughLanes,
      });
    }
    commitToItemIndex[i] = items.length;
    items.push({ kind: "commit", commitIndex: i });
  }

  return { items, commitToItemIndex };
}
