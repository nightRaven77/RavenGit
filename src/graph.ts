import type { Commit } from "./types";

export interface Segment {
  from: number;
  to: number;
  kind: "through" | "incoming" | "parent";
  target: string;
  color: number;
}

export interface GraphRow {
  lane: number;
  color: number;
  isMerge: boolean;
  isRoot: boolean;
  segments: Segment[];
  width: number;
}

export function layoutGraph(commits: Commit[]): GraphRow[] {
  const lanes: (string | null)[] = [];
  const laneColors: (number | null)[] = [];
  let nextColor = 0;

  return commits.map((commit) => {
    const before = [...lanes];
    const beforeColors = [...laneColors];

    let lane = lanes.indexOf(commit.hash);
    let color: number;
    if (lane === -1) {
      lane = lanes.indexOf(null);
      if (lane === -1) lane = lanes.length;
      color = nextColor++;
    } else {
      color = laneColors[lane] ?? nextColor++;
    }

    lanes[lane] = null;
    laneColors[lane] = null;

    const parents: { lane: number; hash: string; color: number }[] = [];
    commit.parents.forEach((hash, parentIndex) => {
      let target = lanes.indexOf(hash);
      let targetColor: number;
      if (target === -1) {
        target = lanes.indexOf(null);
        if (target === -1) target = lanes.length;
        lanes[target] = hash;
        targetColor = parentIndex === 0 ? color : nextColor++;
        laneColors[target] = targetColor;
      } else {
        targetColor =
          laneColors[target] ?? (parentIndex === 0 ? color : nextColor++);
        laneColors[target] = targetColor;
      }
      parents.push({ lane: target, hash, color: targetColor });
    });

    const segments: Segment[] = [];
    before.forEach((hash, index) => {
      const segColor = beforeColors[index] ?? color;
      if (hash === commit.hash) {
        segments.push({
          from: index,
          to: lane,
          kind: "incoming",
          target: hash,
          color: segColor,
        });
      } else if (hash) {
        segments.push({
          from: index,
          to: lanes.indexOf(hash),
          kind: "through",
          target: hash,
          color: segColor,
        });
      }
    });

    parents.forEach((parent, parentIndex) =>
      segments.push({
        from: lane,
        to: parent.lane,
        kind: "parent",
        target: parent.hash,
        color: parentIndex === 0 ? color : parent.color,
      }),
    );

    const width = Math.max(before.length, lanes.length, lane + 1);
    while (lanes.length && lanes[lanes.length - 1] === null) {
      lanes.pop();
      laneColors.pop();
    }

    return {
      lane,
      color,
      isMerge: commit.parents.length > 1,
      isRoot: commit.parents.length === 0,
      segments,
      width,
    };
  });
}

export function graphPixelWidth(
  rows: readonly Pick<GraphRow, "width">[],
): number {
  let width = 92;
  for (const row of rows) width = Math.max(width, row.width * 20 + 28);
  return width;
}
